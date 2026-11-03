const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const getDates = () => {
  const now = new Date();
  const yearAgo = new Date();
  const tenYearsAgo = new Date();
  yearAgo.setFullYear(now.getFullYear() - 1);
  tenYearsAgo.setFullYear(now.getFullYear() - 10);

  const formatDate = (d) => d.toISOString().split('T')[0];
  return {
    now: formatDate(now),
    yearAgo: formatDate(yearAgo),
    tenYearsAgo: formatDate(tenYearsAgo)
  };
};

const formatGameInfo = (rawgGame) => {
  const genresList = rawgGame.genres ? rawgGame.genres.map(g => g.name) : [];

  const platformsArray = rawgGame.parent_platforms
    ? rawgGame.parent_platforms.map(p => p.platform.name)
    : [];

  return {
    id: rawgGame.id.toString(),
    title: rawgGame.name,
    cover: rawgGame.background_image || 'https://via.placeholder.com/300x400?text=Sem+Capa',
    rating: rawgGame.rating, // Nota da comunidade (ex: 4.47)
    released: rawgGame.released, // Data completa para o Modal usar
    releaseYear: rawgGame.released ? rawgGame.released.substring(0, 4) : 'N/A',
    genres: genresList,
    platforms: platformsArray,
    developer: rawgGame.developers ? rawgGame.developers[0]?.name : 'Desenvolvedora Desconhecida',
    description: rawgGame.description_raw || rawgGame.description || '',
  };
};

// ==========================================
// Função central de requisição ao proxy do backend
// - verifica response.ok
// - loga o erro real no console (antes ele era engolido)
// - lança erro para quem chamou decidir o que fazer
// ==========================================
const requestProxy = async (path) => {
  const url = `${API_BASE_URL}/api/games-proxy${path}`;
  const response = await fetch(url);

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      detail = await response.text();
    }
    const error = new Error(`Proxy respondeu ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
};

export const getGameDetails = async (id) => {
  try {
    const data = await requestProxy(`/${encodeURIComponent(id)}`);
    return formatGameInfo(data);
  } catch (error) {
    console.error('Erro ao buscar detalhes do jogo:', error);
    return null;
  }
};

export const getTopRatedGames = async () => {
  const { now, tenYearsAgo } = getDates();
  try {
    const data = await requestProxy(`?ordering=-metacritic&dates=${tenYearsAgo},${now}&page_size=5`);
    return (data.results || []).map(formatGameInfo);
  } catch (error) {
    console.error('Erro ao buscar jogos mais bem avaliados:', error);
    return [];
  }
};

export const getTrendingGames = async () => {
  const { now, yearAgo } = getDates();
  try {
    const data = await requestProxy(`?dates=${yearAgo},${now}&ordering=-added&page_size=40`);
    return (data.results || []).map(formatGameInfo);
  } catch (error) {
    console.error('Erro ao buscar jogos em alta:', error);
    return [];
  }
};

export const getExploreGames = async () => {
  const buildPath = (page) => `?metacritic=80,100&page=${page}&page_size=40`;
  const randomPage = Math.floor(Math.random() * 15) + 1;

  try {
    const data = await requestProxy(buildPath(randomPage));
    return (data.results || []).map(formatGameInfo);
  } catch (error) {
    console.error(`Erro ao buscar jogos (página ${randomPage}):`, error);

    // Se a página sorteada falhar (404 inexistente, 5xx da RAWG...), tenta a página 1 como fallback
    if (error.status >= 400) {
      try {
        const data = await requestProxy(buildPath(1));
        return (data.results || []).map(formatGameInfo);
      } catch (fallbackError) {
        console.error('Erro também na página 1:', fallbackError);
      }
    }
    return [];
  }
};

export const searchGames = async (query) => {
  if (!query) return [];
  try {
    const data = await requestProxy(`?search=${encodeURIComponent(query)}&page_size=40`);
    return (data.results || []).map(formatGameInfo);
  } catch (error) {
    console.error('Erro ao pesquisar jogos:', error);
    return [];
  }
};