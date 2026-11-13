import os
import re
import time
import asyncio
import logging
from pathlib import Path

from dotenv import load_dotenv

# Carrega o .env da pasta backend/ (um nível acima de app/), não importa de onde o uvicorn foi iniciado.
# Em produção (Render, Railway, etc.) o arquivo não existe e as variáveis vêm do painel da plataforma.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session
import jwt
import random
from fastapi.middleware.cors import CORSMiddleware
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
import httpx

from . import models, schemas, security
from .database import engine, SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("noctis")
# O httpx loga as URLs das requisições em nível INFO. Silenciamos para não vazar credenciais nos logs.
logging.getLogger("httpx").setLevel(logging.WARNING)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="NOCTIS API",
    description="Backend para o Game Tracker NOCTIS",
    version="1.0.0"
)

# ==========================================
# CORS
# ==========================================
_default_origins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
allowed_origins = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except Exception:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception

    return user


@app.get("/")
def root():
    return {"status": "online", "message": "Banco de dados e servidor online!"}


# ==========================================
# PROXY PARA A API DA IGDB (Twitch)
# ==========================================
TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
IGDB_BASE = "https://api.igdb.com/v4"
IGDB_IMAGE_BASE = "https://images.igdb.com/igdb/image/upload"
IGDB_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
IGDB_MAX_ATTEMPTS = 3

GAME_FIELDS = (
    "name, cover.image_id, total_rating, total_rating_count, first_release_date, "
    "genres.name, platforms.name, involved_companies.developer, "
    "involved_companies.company.name, summary"
)

# --- Cache em memória (fresco por 5 min; cópia antiga até 24h se a IGDB falhar) ---
CACHE_TTL_SECONDS = 300
STALE_TTL_SECONDS = 24 * 3600
_cache: dict = {}


def _cache_get(key, allow_stale: bool = False):
    item = _cache.get(key)
    if not item:
        return None
    stored_at, data = item
    age = time.time() - stored_at
    if age <= CACHE_TTL_SECONDS:
        return data
    if allow_stale and age <= STALE_TTL_SECONDS:
        return data
    return None


def _cache_set(key, data):
    if len(_cache) > 500:
        _cache.clear()
    _cache[key] = (time.time(), data)


# --- Token da Twitch (client credentials), renovado automaticamente ---
_token = {"value": None, "expires_at": 0.0}
_token_lock = asyncio.Lock()


async def _get_igdb_token(force: bool = False) -> str:
    client_id = os.getenv("TWITCH_CLIENT_ID")
    client_secret = os.getenv("TWITCH_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=500,
            detail="TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET não configurados no backend."
        )

    async with _token_lock:
        if not force and _token["value"] and time.time() < _token["expires_at"] - 60:
            return _token["value"]

        try:
            async with httpx.AsyncClient(timeout=IGDB_TIMEOUT) as client:
                # credenciais vão no corpo (data=), não na URL
                resp = await client.post(TWITCH_TOKEN_URL, data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "grant_type": "client_credentials",
                })
        except httpx.RequestError as exc:
            logger.exception("Falha ao contatar a Twitch")
            raise HTTPException(status_code=502, detail=f"Erro ao contatar a Twitch: {exc!r}")

        if resp.status_code != 200:
            logger.error("Twitch recusou o token (%s): %s", resp.status_code, resp.text[:200])
            if resp.status_code in (400, 401, 403):
                raise HTTPException(
                    status_code=500,
                    detail="Credenciais da Twitch inválidas. Confira TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET."
                )
            raise HTTPException(status_code=503, detail="A Twitch está instável no momento.")

        body = resp.json()
        _token["value"] = body["access_token"]
        _token["expires_at"] = time.time() + int(body.get("expires_in", 3600))
        return _token["value"]


async def _igdb_post(endpoint: str, query: str):
    """POST na IGDB (corpo = consulta Apicalypse) com retry em falhas temporárias."""
    client_id = os.getenv("TWITCH_CLIENT_ID")
    last_error = "erro desconhecido"
    refreshed_token = False

    for attempt in range(1, IGDB_MAX_ATTEMPTS + 1):
        token = await _get_igdb_token()
        headers = {
            "Client-ID": client_id,
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=IGDB_TIMEOUT) as client:
                resp = await client.post(f"{IGDB_BASE}/{endpoint}", headers=headers, content=query)
        except httpx.TimeoutException:
            last_error = "timeout"
            logger.warning("IGDB timeout (tentativa %s/%s)", attempt, IGDB_MAX_ATTEMPTS)
        except httpx.RequestError as exc:
            last_error = f"falha de conexão: {exc!r}"
            logger.warning("IGDB conexão falhou (tentativa %s/%s): %r", attempt, IGDB_MAX_ATTEMPTS, exc)
        else:
            if resp.status_code == 200:
                try:
                    return resp.json()
                except ValueError:
                    last_error = "resposta inválida (não é JSON)"
            elif resp.status_code == 401 and not refreshed_token:
                # token expirou/revogado: renova uma vez e tenta de novo
                refreshed_token = True
                await _get_igdb_token(force=True)
                continue
            elif resp.status_code in (429,) or resp.status_code >= 500:
                last_error = f"IGDB respondeu {resp.status_code}"
                logger.warning("IGDB %s (tentativa %s/%s)", resp.status_code, attempt, IGDB_MAX_ATTEMPTS)
            else:
                logger.error("IGDB respondeu %s: %s | consulta: %s", resp.status_code, resp.text[:300], query)
                raise HTTPException(status_code=502, detail=f"Erro ao consultar a IGDB ({resp.status_code}).")

        if attempt < IGDB_MAX_ATTEMPTS:
            await asyncio.sleep(1.0 * attempt)

    logger.error("IGDB indisponível após %s tentativas: %s", IGDB_MAX_ATTEMPTS, last_error)
    raise HTTPException(status_code=503, detail="A IGDB está instável no momento. Tente novamente em instantes.")


async def _cached_igdb_post(endpoint: str, query: str):
    key = (endpoint, query)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        data = await _igdb_post(endpoint, query)
    except HTTPException as exc:
        if exc.status_code >= 500:
            stale = _cache_get(key, allow_stale=True)
            if stale is not None:
                logger.info("Servindo cópia antiga do cache (IGDB indisponível)")
                return stale
        raise
    _cache_set(key, data)
    return data


# --- Conversão IGDB -> formato que o frontend já usa ---
GENRE_MAP = {
    "Role-playing (RPG)": "RPG",
    "Hack and slash/Beat 'em up": "Action",
    "Platform": "Platformer",
    "Point-and-click": "Adventure",
    "Real Time Strategy (RTS)": "Strategy",
    "Turn-based strategy (TBS)": "Strategy",
    "Tactical": "Strategy",
    "Sport": "Sports",
    "Simulator": "Simulation",
    "Card & Board Game": "Board Games",
    "Quiz/Trivia": "Educational",
    "Visual Novel": "Adventure",
    "Music": "Casual",
}


def _platform_family(name: str) -> str:
    n = name.lower()
    if "playstation" in n or n.startswith("ps") or "psp" in n or "vita" in n:
        return "PlayStation"
    if "xbox" in n:
        return "Xbox"
    if "windows" in n or n == "pc" or "dos" in n:
        return "PC"
    if "mac" in n:
        return "Apple Macintosh"
    if "linux" in n:
        return "Linux"
    if n == "ios":
        return "iOS"
    if "android" in n:
        return "Android"
    if any(k in n for k in ("nintendo", "switch", "wii", "game boy", "gameboy", "famicom", "snes", "n64")):
        return "Nintendo"
    if any(k in n for k in ("sega", "dreamcast", "genesis", "mega drive", "saturn")):
        return "SEGA"
    if "web" in n or "browser" in n:
        return "Web"
    return name


def _unique(items):
    seen, out = set(), []
    for i in items:
        if i and i not in seen:
            seen.add(i)
            out.append(i)
    return out


def _normalize_game(g: dict) -> dict:
    image_id = (g.get("cover") or {}).get("image_id")
    cover = f"{IGDB_IMAGE_BASE}/t_cover_big_2x/{image_id}.jpg" if image_id else None

    ts = g.get("first_release_date")
    released = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d") if ts else None

    total = g.get("total_rating")
    rating = round(total / 20, 2) if total else 0  # 0-100 da IGDB -> 0-5 (escala que o app já usa)

    genres = _unique([GENRE_MAP.get(x.get("name"), x.get("name")) for x in g.get("genres", [])])
    platforms = _unique([_platform_family(x.get("name", "")) for x in g.get("platforms", [])])

    companies = g.get("involved_companies", [])
    developer = next(
        (c["company"]["name"] for c in companies if c.get("developer") and c.get("company")),
        None
    ) or "Desenvolvedora Desconhecida"

    return {
        "id": str(g["id"]),
        "title": g.get("name", "Sem título"),
        "cover": cover,
        "rating": rating,
        "ratingCount": g.get("total_rating_count", 0),
        "released": released,
        "releaseYear": released[:4] if released else "N/A",
        "genres": genres,
        "platforms": platforms,
        "developer": developer,
        "description": g.get("summary", ""),
    }


def _to_unix(date_str: str, end_of_day: bool = False) -> int:
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Data inválida: {date_str} (use AAAA-MM-DD)")
    if end_of_day:
        d = d + timedelta(days=1) - timedelta(seconds=1)
    return int(d.timestamp())


SORT_OPTIONS = {
    "popular": "total_rating_count desc",
    "rating": "total_rating desc",
    "newest": "first_release_date desc",
}


def _clean_term(text: str) -> str:
    """Remove caracteres que quebrariam a consulta Apicalypse."""
    return re.sub(r'[\\"*]', " ", text).strip()


def _build_query(where=None, sort_clause=None, search_text=None, limit=40, offset=0) -> str:
    parts = []
    if search_text:
        parts.append(f'search "{search_text}";')
    parts.append(f"fields {GAME_FIELDS};")
    if where:
        parts.append("where " + " & ".join(where) + ";")
    if sort_clause:
        parts.append(f"sort {sort_clause};")
    parts.append(f"limit {limit};")
    parts.append(f"offset {offset};")
    return " ".join(parts)


@app.get("/api/games")
async def list_games(
    search: str = None,
    sort: str = "popular",           # popular | rating | newest
    date_from: str = None,           # AAAA-MM-DD
    date_to: str = None,             # AAAA-MM-DD
    min_rating: int = None,          # 0-100 (escala da IGDB)
    min_votes: int = None,           # mínimo de avaliações (evita jogos obscuros com nota alta)
    page: int = Query(1, ge=1, le=100),
    page_size: int = Query(40, ge=1, le=50),
):
    if sort not in SORT_OPTIONS:
        raise HTTPException(status_code=400, detail=f"sort deve ser um de: {', '.join(SORT_OPTIONS)}")

    # Fora DLCs/expansões e edições alternativas
    where = ["parent_game = null", "version_parent = null"]

    if date_from:
        where.append(f"first_release_date >= {_to_unix(date_from)}")
    if date_to:
        where.append(f"first_release_date <= {_to_unix(date_to, end_of_day=True)}")
    if min_rating is not None:
        where.append(f"total_rating >= {int(min_rating)}")
    if min_votes is not None:
        where.append(f"total_rating_count >= {int(min_votes)}")

    offset = (page - 1) * page_size
    clean_search = _clean_term(search)[:100] if search else ""

    # ---------- BUSCA POR TEXTO ----------
    # A busca nativa da IGDB ("search") só casa palavras inteiras: "assass" não acha nada.
    # 2 soluções para contornar isso, combinadas:
    #  A) "contém": cada palavra digitada precisa estar no nome (aceita pedaço, ex: "assass", "cre"),
    #     ordenada por popularidade;
    #  B) busca nativa por relevância (cobre casos como "assassins" -> "Assassin’s", erros leves etc.).
    if clean_search:
        words = [w for w in clean_search.split() if w][:5]
        contains = [f'name ~ *"{w}"*' for w in words]

        query_a = _build_query(
            where + contains + ["total_rating_count != null"],
            sort_clause=SORT_OPTIONS["popular"],
            limit=page_size, offset=offset,
        )
        tasks = [_cached_igdb_post("games", query_a)]
        if page == 1:
            query_b = _build_query(where, search_text=clean_search, limit=page_size, offset=0)
            tasks.append(_cached_igdb_post("games", query_b))

        outcomes = await asyncio.gather(*tasks, return_exceptions=True)

        merged, seen, errors = [], set(), []
        for outcome in outcomes:
            if isinstance(outcome, Exception):
                errors.append(outcome)
                continue
            for game in outcome:
                if game["id"] not in seen:
                    seen.add(game["id"])
                    merged.append(game)

        if not merged and errors:
            raise errors[0]

        results = [_normalize_game(g) for g in merged[:page_size]]
        return {"results": results, "count": len(results)}

    # ---------- LISTAGENS (explorar, trending, top) ----------
    if sort == "rating":
        where.append("total_rating != null")
    elif sort == "popular":
        where.append("total_rating_count != null")
    elif sort == "newest":
        where.append("first_release_date != null")
        where.append(f"first_release_date <= {int(time.time())}")

    query = _build_query(where, sort_clause=SORT_OPTIONS[sort], limit=page_size, offset=offset)
    raw = await _cached_igdb_post("games", query)
    results = [_normalize_game(g) for g in raw]
    return {"results": results, "count": len(results)}


@app.get("/api/games/{game_id}")
async def game_details(game_id: str):
    if not game_id.isdigit():
        raise HTTPException(status_code=400, detail="ID de jogo inválido.")

    query = f"fields {GAME_FIELDS}; where id = {int(game_id)}; limit 1;"
    raw = await _cached_igdb_post("games", query)
    if not raw:
        raise HTTPException(status_code=404, detail="Jogo não encontrado na IGDB.")
    return _normalize_game(raw[0])


# ==========================================
# ROTA DE CADASTRO
# ==========================================
@app.post("/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Este e-mail já está em uso. Tente fazer login!")

    hashed_pwd = security.get_password_hash(user.password)

    new_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_pwd
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


# ==========================================
# ROTA DE LOGIN
# ==========================================
@app.post("/login", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()

    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = security.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


# ==========================================
# ROTA PROTEGIDA (Perfil do Usuário Logado)
# ==========================================
@app.get("/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user


# ==========================================
# ROTA PROTEGIDA (Atualizar Perfil)
# ==========================================
@app.put("/users/me", response_model=schemas.UserResponse)
def update_user_me(
    user_update: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user_update.username is not None:
        current_user.username = user_update.username

    if user_update.email is not None:
        email_existente = db.query(models.User).filter(models.User.email == user_update.email).first()
        if email_existente and email_existente.id != current_user.id:
            raise HTTPException(status_code=400, detail="Este e-mail já está em uso.")
        current_user.email = user_update.email

    if user_update.avatar is not None:
        current_user.avatar = user_update.avatar

    if user_update.password:
        current_user.hashed_password = security.get_password_hash(user_update.password)

    db.commit()
    db.refresh(current_user)
    return current_user


# ==========================================
# FUNÇÃO DE ENVIO DE E-MAIL
# ==========================================
def send_recovery_email(to_email: str, code: str):
    sender_email = os.getenv("SENDER_EMAIL")
    sender_password = os.getenv("SENDER_PASSWORD")

    if not sender_email or not sender_password:
        print("Erro: Credenciais de e-mail não encontradas no arquivo .env!")
        return False

    msg = MIMEMultipart()
    msg['From'] = f"NOCTIS <{sender_email}>"
    msg['To'] = to_email
    msg['Subject'] = "NOCTIS - Código de Recuperação de Senha"

    body = f"""
Olá, Explorador(a)!

Você solicitou a redefinição de senha da sua conta no universo NOCTIS.

Seu código de verificação é: {code}

Este código expira em 15 minutos. Se você não solicitou isso, pode ignorar este e-mail.
"""

    msg.attach(MIMEText(body, 'plain'))

    try:
        server = smtplib.SMTP('smtp.gmail.com', 587, timeout=15)
        server.starttls()
        server.login(sender_email, sender_password)
        server.send_message(msg)
        server.quit()
        print(f"E-mail enviado com sucesso para {to_email}")
        return True
    except Exception as e:
        print(f"Erro ao enviar o e-mail: {e}")
        return False


# ==========================================
# ROTAS DE RECUPERAÇÃO DE SENHA
# ==========================================

@app.post("/password-recovery/request")
def request_password_recovery(recovery: schemas.PasswordRecoveryRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == recovery.email).first()

    if not user:
        return {"message": "Se o email estiver cadastrado, um código foi enviado."}

    db.query(models.RecoveryCode).filter(models.RecoveryCode.email == recovery.email).delete()

    code = str(random.randint(100000, 999999))
    expiration_time = datetime.utcnow() + timedelta(minutes=15)

    new_recovery = models.RecoveryCode(
        email=recovery.email,
        code=code,
        expires_at=expiration_time.isoformat()
    )
    db.add(new_recovery)
    db.commit()

    email_enviado = send_recovery_email(to_email=recovery.email, code=code)

    if not email_enviado:
        db.delete(new_recovery)
        db.commit()
        raise HTTPException(status_code=500, detail="Erro no servidor de e-mail. Tente novamente mais tarde.")

    return {"message": "Código de recuperação gerado."}


@app.post("/password-recovery/reset")
def reset_password(reset_data: schemas.PasswordReset, db: Session = Depends(get_db)):
    recovery_entry = db.query(models.RecoveryCode).filter(
        models.RecoveryCode.email == reset_data.email,
        models.RecoveryCode.code == reset_data.code
    ).first()

    if not recovery_entry:
        raise HTTPException(status_code=400, detail="Código inválido.")

    expires_at = datetime.fromisoformat(recovery_entry.expires_at)
    if datetime.utcnow() > expires_at:
        db.delete(recovery_entry)
        db.commit()
        raise HTTPException(status_code=400, detail="Este código expirou. Solicite um novo.")

    user = db.query(models.User).filter(models.User.email == reset_data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    user.hashed_password = security.get_password_hash(reset_data.new_password)

    db.delete(recovery_entry)
    db.commit()

    return {"message": "Senha redefinida com sucesso!"}


# ==========================================
# ROTAS DA BIBLIOTECA (UserGame)
# ==========================================

@app.post("/biblioteca", response_model=schemas.UserGameResponse)
def adicionar_ou_atualizar_jogo(
    game_data: schemas.UserGameCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    jogo_existente = db.query(models.UserGame).filter(
        models.UserGame.user_id == current_user.id,
        models.UserGame.game_id == game_data.game_id
    ).first()

    if jogo_existente:
        jogo_existente.status_principal = game_data.status_principal
        if game_data.titulo:
            jogo_existente.titulo = game_data.titulo
        if game_data.capa:
            jogo_existente.capa = game_data.capa
        if game_data.dados_jogo:
            jogo_existente.dados_jogo = game_data.dados_jogo
        jogo_existente.favorito = game_data.favorito
        jogo_existente.horas_jogadas = game_data.horas_jogadas
        jogo_existente.nota_geral = game_data.nota_geral
        jogo_existente.comentario = game_data.comentario
        jogo_existente.criterios = game_data.criterios
        jogo_existente.conquistas = game_data.conquistas
        jogo_existente.conquistas_personalizadas = game_data.conquistas_personalizadas

        db.commit()
        db.refresh(jogo_existente)
        return jogo_existente
    else:
        novo_jogo = models.UserGame(
            user_id=current_user.id,
            game_id=game_data.game_id,
            titulo=game_data.titulo,
            capa=game_data.capa,
            dados_jogo=game_data.dados_jogo,
            status_principal=game_data.status_principal,
            favorito=game_data.favorito,
            horas_jogadas=game_data.horas_jogadas,
            nota_geral=game_data.nota_geral,
            comentario=game_data.comentario,
            criterios=game_data.criterios,
            conquistas=game_data.conquistas,
            conquistas_personalizadas=game_data.conquistas_personalizadas
        )
        db.add(novo_jogo)
        db.commit()
        db.refresh(novo_jogo)
        return novo_jogo


@app.get("/biblioteca", response_model=list[schemas.UserGameResponse])
def listar_minha_biblioteca(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    meus_jogos = db.query(models.UserGame).filter(models.UserGame.user_id == current_user.id).all()
    return meus_jogos


@app.delete("/biblioteca/{game_id}")
def remover_da_biblioteca(
    game_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    jogo_na_biblioteca = db.query(models.UserGame).filter(
        models.UserGame.user_id == current_user.id,
        models.UserGame.game_id == game_id
    ).first()

    if not jogo_na_biblioteca:
        raise HTTPException(
            status_code=404,
            detail="Este jogo não está na sua biblioteca."
        )

    db.delete(jogo_na_biblioteca)
    db.commit()
    return {"message": "Jogo removido da galáxia com sucesso!"}


# ==========================================
# ROTAS DE LISTAS PERSONALIZADAS
# ==========================================

@app.get("/listas", response_model=list[schemas.ListaResponse])
def get_listas(user=Depends(get_current_user), db: Session = Depends(get_db)):
    listas = db.query(models.Lista).filter(models.Lista.user_id == user.id).all()
    return listas


@app.post("/listas")
def save_lista(lista_data: schemas.ListaCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    lista_existente = db.query(models.Lista).filter(
        models.Lista.list_id == lista_data.list_id,
        models.Lista.user_id == user.id
    ).first()

    if lista_existente:
        lista_existente.nome = lista_data.nome
        lista_existente.descricao = lista_data.descricao
        lista_existente.jogos = lista_data.jogos
    else:
        nova_lista = models.Lista(
            user_id=user.id,
            list_id=lista_data.list_id,
            nome=lista_data.nome,
            descricao=lista_data.descricao,
            jogos=lista_data.jogos,
            criado_em=lista_data.criado_em
        )
        db.add(nova_lista)

    db.commit()
    return {"message": "Lista salva com sucesso!"}


@app.delete("/listas/{list_id}")
def delete_lista(list_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    lista = db.query(models.Lista).filter(
        models.Lista.list_id == list_id,
        models.Lista.user_id == user.id
    ).first()

    if lista:
        db.delete(lista)
        db.commit()
        return {"message": "Lista deletada com sucesso!"}

    raise HTTPException(status_code=404, detail="Lista não encontrada")