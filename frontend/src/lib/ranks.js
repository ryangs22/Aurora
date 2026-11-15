// src/lib/ranks.js
// Níveis (por quantidade de jogos na biblioteca) e títulos (por quantidade de jogos avaliados).
// Fica num arquivo só para o Perfil e a barra lateral usarem exatamente a mesma regra.
import {
  Star, Trophy, Award, Zap, Settings, Shield, Gem, Hexagon, Compass, Leaf, Flame,
  Sparkles, BookOpen, Gamepad2, Crown, Swords, Wand2, Infinity as InfinityIcon
} from 'lucide-react';

export const LIB_RANKS = [
  { name: 'Ferro', min: 0, max: 0, color: '#94a3b8', icon: Settings },
  { name: 'Bronze', min: 1, max: 2, color: '#cd7f32', icon: Shield },
  { name: 'Prata', min: 3, max: 5, color: '#cbd5e1', icon: Award },
  { name: 'Ouro', min: 6, max: 9, color: '#fbbf24', icon: Trophy },
  { name: 'Platina', min: 10, max: 14, color: '#6fe0f1', icon: Gem },
  { name: 'Diamante', min: 15, max: 19, color: '#60a5fa', icon: Hexagon },
  { name: 'Safira', min: 20, max: 29, color: '#3b82f6', icon: Compass },
  { name: 'Esmeralda', min: 30, max: 44, color: '#10b981', icon: Leaf },
  { name: 'Rubi', min: 45, max: 59, color: '#ef4444', icon: Flame },
  { name: 'Quartzo', min: 60, max: Infinity, color: '#d946ef', icon: Sparkles },
];

export const RATING_TITLES = [
  { name: 'Aprendiz', min: 0, max: 0, color: '#94a3b8', icon: BookOpen },
  { name: 'Gamer', min: 1, max: 2, color: '#3b82f6', icon: Gamepad2 },
  { name: 'Super-Humano', min: 3, max: 5, color: '#10b981', icon: Zap },
  { name: 'Mestre', min: 6, max: 9, color: '#f59e0b', icon: Trophy },
  { name: 'Grão-Mestre', min: 10, max: 14, color: '#ea580c', icon: Crown },
  { name: 'Imperador', min: 15, max: 19, color: '#c026d3', icon: Swords },
  { name: 'Semideus', min: 20, max: 29, color: '#06b6d4', icon: Star },
  { name: 'Feiticeiro', min: 30, max: 44, color: '#8b5cf6', icon: Wand2 },
  { name: 'Celestial', min: 45, max: 59, color: '#f472b6', icon: Sparkles },
  { name: 'Estrela Aúrea', min: 60, max: Infinity, color: '#ffffff', icon: InfinityIcon },
];

export function getRank(list, count) {
  return list.find(r => count >= r.min && count <= r.max) || list[0];
}

export function getNextRank(list, count) {
  const idx = list.findIndex(r => count >= r.min && count <= r.max);
  return idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
}

// Porcentagem de progresso até o próximo nível (0-100)
export function getProgress(rank, nextRank, count) {
  if (!nextRank) return 100;
  return Math.min(100, Math.round(((count - rank.min) / (nextRank.min - rank.min)) * 100));
}