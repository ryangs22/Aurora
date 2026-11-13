// Serviço de jogos do Aurora. Os dados vêm da IGDB, através do proxy do nosso backend
// (as credenciais da Twitch/IGDB ficam só no servidor).

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// Placeholder embutido (não depende de nenhum site externo)
const NO_COVER = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400">' +
  '<rect width="100%" height="100%" fill="#1a1530"/>' +
  '<text x="50%" y="50%" fill="#8b7fb8" font-family="sans-serif" font-size="20" ' +
  'text-anchor="middle" dominant-baseline="middle">Sem capa</text></svg>'
)}`;

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

// O backend já devolve os jogos no formato do app; aqui só garantimos os valores padrão.
const formatGameInfo = (game) => ({
  id: String(game.id),
  title: game.title,
  cover: game.cover || NO_COVER,
  rating: game.rating ?? 0, // nota da comunidade na escala 0-5
  released: game.released,
  releaseYear: game.releaseYear || 'N/A',
  genres: game.genres || [],
  platforms: game.platforms || [],
  developer: game.developer || 'Desenvolvedora Desconhecida',
  description: game.description || '',
});

// Requisição central: verifica response.ok e mostra o erro real no console.
const requestApi = async (path) => {
  const response = await fetch(`${API_BASE_URL}/api/games${path}`);

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      detail = await response.text();
    }
    const error = new Error(`API respondeu ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
};

export const getGameDetails = async (id) => {
  try {
    const data = await requestApi(`/${encodeURIComponent(id)}`);
    return formatGameInfo(data);
  } catch (error) {
    console.error('Erro ao buscar detalhes do jogo:', error);
    return null;
  }
};

export const getTopRatedGames = async () => {
  const { now, tenYearsAgo } = getDates();
  try {
    const data = await requestApi(
      `?sort=rating&date_from=${tenYearsAgo}&date_to=${now}&min_votes=50&page_size=5`
    );
    return (data.results || []).map(formatGameInfo);
  } catch (error) {
    console.error('Erro ao buscar jogos mais bem avaliados:', error);
    return [];
  }
};

export const getTrendingGames = async () => {
  const { now, yearAgo } = getDates();
  try {
    const data = await requestApi(
      `?sort=popular&date_from=${yearAgo}&date_to=${now}&page_size=40`
    );
    return (data.results || []).map(formatGameInfo);
  } catch (error) {
    console.error('Erro ao buscar jogos em alta:', error);
    return [];
  }
};

export const getExploreGames = async () => {
  const buildPath = (page) => `?sort=popular&min_rating=80&min_votes=20&page=${page}&page_size=40`;
  const randomPage = Math.floor(Math.random() * 15) + 1;

  try {
    const data = await requestApi(buildPath(randomPage));
    const results = (data.results || []).map(formatGameInfo);
    if (results.length > 0 || randomPage === 1) return results;
    // página sorteada veio vazia: volta para a primeira
    const fallback = await requestApi(buildPath(1));
    return (fallback.results || []).map(formatGameInfo);
  } catch (error) {
    console.error(`Erro ao buscar jogos (página ${randomPage}):`, error);
    if (randomPage !== 1) {
      try {
        const data = await requestApi(buildPath(1));
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
    const data = await requestApi(`?search=${encodeURIComponent(query)}&page_size=40`);
    return (data.results || []).map(formatGameInfo);
  } catch (error) {
    console.error('Erro ao pesquisar jogos:', error);
    return [];
  }
};