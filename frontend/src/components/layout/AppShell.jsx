import { useState, useMemo } from 'react';
import { Search, Library, ListMusic, User, TrendingUp, LogOut, Menu, X, Sparkles, Zap, Award } from 'lucide-react';
import StarfieldBackground from '../StarfieldBackground';
import AuroraLogo from './AuroraLogo';
import { LIB_RANKS, RATING_TITLES, getRank, getNextRank, getProgress } from '../../lib/ranks';

const NAV_ITEMS = [
  { id: 'search', label: 'Explorar', icon: Search },
  { id: 'library', label: 'Biblioteca', icon: Library },
  { id: 'lists', label: 'Listas', icon: ListMusic },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'profile', label: 'Perfil', icon: User },
];

// Tag (com caixa) + barra de progresso logo abaixo
function RankTag({ rank, nextRank, count, prefix = '', icon: Icon }) {
  const pct = getProgress(rank, nextRank, count);
  return (
    <div>
      <div
        className="px-2.5 py-1.5 rounded-lg border flex items-center justify-between text-[10px] font-black uppercase tracking-widest"
        style={{ borderColor: `${rank.color}30`, background: `${rank.color}10`, color: rank.color }}
      >
        <span className="flex items-center gap-1.5"><Icon className="w-3 h-3" />{prefix}{rank.name}</span>
        <span className="text-white/30 font-bold">{nextRank ? `${count}/${nextRank.min}` : 'Máx'}</span>
      </div>
      <div className="h-1 mt-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${rank.color}cc, ${(nextRank || rank).color})` }}
        />
      </div>
    </div>
  );
}

export default function AppShell({ user, library, onLogout, currentPage, onNavigate, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Mesmos cálculos do Perfil (jogos na biblioteca, jogos avaliados)
  const stats = useMemo(() => {
    const entries = Object.values(library || {}).filter(g => g && g.status);
    const genreCount = {};
    entries.forEach(g => {
      const data = g.game || g.gameInfo || g;
      (Array.isArray(data.genres) ? data.genres : []).forEach(x => {
        if (x && typeof x === 'string' && x !== 'N/A') genreCount[x] = (genreCount[x] || 0) + 1;
      });
    });
    const sorted = Object.entries(genreCount).sort((a, b) => b[1] - a[1]);
    return {
      libCount: entries.length,
      ratedCount: entries.filter(g => Number(g.rating) > 0).length,
      hours: Math.round(entries.reduce((sum, g) => sum + (parseFloat(g.hoursPlayed) || 0), 0)),
      favGenre: sorted[0]?.[0] || '—',
      leastGenre: sorted.length > 1 ? sorted[sorted.length - 1][0] : '—',
    };
  }, [library]);

  const libRank = getRank(LIB_RANKS, stats.libCount);
  const libNext = getNextRank(LIB_RANKS, stats.libCount);
  const title = getRank(RATING_TITLES, stats.ratedCount);
  const titleNext = getNextRank(RATING_TITLES, stats.ratedCount);

  const NavLink = ({ item }) => {
    const Icon = item.icon;
    const active = currentPage === item.id;
    return (
      <button
        onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
        className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${active
          ? 'bg-purple-600/25 text-purple-300 border border-purple-500/30'
          : 'text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span>{item.label}</span>
      </button>
    );
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full p-4 overflow-y-auto">
      <div className="flex items-center gap-2.5 mb-8 px-2">
        <Sparkles className="w-5 h-5 text-purple-400" />
        <AuroraLogo className="text-2xl tracking-[0.12em]" />
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(item => <NavLink key={item.id} item={item} />)}
      </nav>

      {/* Cartão do usuário: ocupa o rodapé da barra com informações úteis */}
      <div className="mt-auto pt-4">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
          <button
            onClick={() => { onNavigate('profile'); setMobileOpen(false); }}
            className="flex items-center gap-3 w-full text-left group"
            title="Abrir perfil"
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-purple-200 text-base font-bold flex-shrink-0 overflow-hidden bg-purple-600/40"
              style={{ border: `2px solid ${libRank.color}66` }}
            >
              {user?.avatar && user.avatar.length > 10 ? (
                <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{user?.name ? user.name[0].toUpperCase() : 'U'}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white/90 text-sm font-semibold truncate group-hover:text-purple-200 transition-colors">
                {user?.name || 'Explorador'}
              </p>
              {user?.email && (
                <p className="text-white/35 text-[11px] truncate" title={user.email}>{user.email}</p>
              )}
            </div>
          </button>

          <div className="mt-3 space-y-3">
            <RankTag rank={libRank} nextRank={libNext} count={stats.libCount} prefix="Nível " icon={Zap} />
            <RankTag rank={title} nextRank={titleNext} count={stats.ratedCount} icon={Award} />
          </div>

          <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
            {[
              { label: 'Gênero favorito', value: stats.favGenre },
              { label: 'Menos explorado', value: stats.leastGenre },
              { label: 'Tempo de voo', value: `${stats.hours}h` },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-white/30">{row.label}</span>
                <span className="text-white/75 font-semibold truncate">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-2 w-full mt-3 px-4 py-2 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-500/10 text-sm transition-all duration-200"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-black overflow-hidden">
      <StarfieldBackground />
      {/* Nebulosas */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        <div style={{ position: 'absolute', top: '-5%', left: '-10%', width: '70vw', height: '70vw', background: 'radial-gradient(ellipse at 40% 40%, rgba(140,60,255,0.55) 0%, rgba(100,50,220,0.35) 25%, rgba(60,90,210,0.18) 50%, transparent 72%)', filter: 'blur(60px)', borderRadius: '60% 40% 55% 45%', transform: 'rotate(-20deg)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: '65vw', height: '60vw', background: 'radial-gradient(ellipse at 55% 55%, rgba(100,50,230,0.5) 0%, rgba(70,110,230,0.3) 30%, rgba(110,60,200,0.14) 55%, transparent 72%)', filter: 'blur(55px)', borderRadius: '45% 60% 40% 55%', transform: 'rotate(15deg)' }} />
        <div style={{ position: 'absolute', top: '30%', left: '15%', width: '70vw', height: '40vw', background: 'radial-gradient(ellipse at 50% 50%, rgba(80,40,190,0.3) 0%, rgba(60,90,200,0.18) 40%, transparent 68%)', filter: 'blur(70px)', borderRadius: '50%' }} />
      </div>
      <div className="fixed inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/60 pointer-events-none" style={{ zIndex: 2 }} />

      {/* Sidebar Desktop */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-60 flex-col z-[60]"
        style={{ background: 'rgba(8,4,20,0.75)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <Sidebar />
      </aside>

      {/* Mobile header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-3"
        style={{ background: 'rgba(8,4,20,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <AuroraLogo className="text-xl tracking-[0.12em]" />
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white/60 hover:text-white p-2 -mr-1 touch-manipulation">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 z-[80]"
            style={{ background: 'rgba(8,4,20,0.95)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="md:ml-60 relative z-10 min-h-screen pt-16 md:pt-0">
        {children}
      </main>
    </div>
  );
}