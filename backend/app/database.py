import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Carrega as variáveis do arquivo .env para a memória
load_dotenv()

# Puxa a URL do banco de dados do .env
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# O SQLite exige o check_same_thread, mas o PostgreSQL não aceita esse argumento.
# Essa lógica já deixa o terreno pronto para a nossa migração.
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()