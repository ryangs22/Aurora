// Logo "AURORA" da barra lateral, com estrelas que cintilam dentro da própria caixa do logo.
// É memorizado (memo) e não recebe props que mudam: a animação só reinicia se o logo for
// desmontado (sair da conta ou fechar o site), nunca por ações dentro do app.
import { memo } from 'react';

// Todas as posições ficam DENTRO da caixa do logo (0%–100%), em tamanhos pequenos.
const STARS = [
  { left: '4%',  top: '20%', size: 0.34, delay: '0s' },    // ponta superior do 1°A
  { left: '20%', top: '82%',  size: 0.42, delay: '0.7s' }, // ponta inferior do 1°A
  { left: '34%', top: '13%', size: 0.26, delay: '0.7s' },  // sob o U
  { left: '25%', top: '47%', size: 0.26, delay: '2.9s' },  // dentro do U
  { left: '52%', top: '80%', size: 0.30, delay: '1.7s' },  // ponta inferior do 1°R
  { left: '35%', top: '24%', size: 0.20, delay: '1.7s' },  // ponta Superior do 1°R
  { left: '57%', top: '47%', size: 0.40, delay: '2.1s' },  // dentro do O
  { left: '69%', top: '24%', size: 0.37, delay: '2.5s' },  // ponta superior do 2°R
  { left: '85%', top: '80%', size: 0.30, delay: '2.9s' },  // ponta inferior do 2°R
  { left: '85%', top: '20%', size: 0.30, delay: '3.1s' },  // ponta superior do 1°A
  { left: '99%', top: '82%', size: 0.45, delay: '3.5s' },  // ponta superior do 2°A
];

function Sparkle({ size, delay, left, top }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="aurora-sparkle"
      style={{ left, top, width: `${size}em`, height: `${size}em`, animationDelay: delay }}
    >
      <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" fill="#fff" />
    </svg>
  );
}

function AuroraLogo({ className = '', text = 'AURORA', weight = 400 }) {
  return (
    <span
      className={`aurora-logo relative inline-block font-logo ${className}`}
      style={{ fontWeight: weight, padding: '0.12em 0.08em' }}
    >
      <style>{`
        .aurora-logo { filter: drop-shadow(0 0 10px rgba(170,110,255,.4)); }
        .aurora-logo .aurora-text {
          background: linear-gradient(180deg, #fff 0%, #efe6ff 55%, #b9a2ec 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .aurora-sparkle {
          position: absolute; transform: translate(-50%, -50%);
          filter: drop-shadow(0 0 3px #d9c2ff) drop-shadow(0 0 7px #a56bff);
          animation: aurora-twinkle 3.6s ease-in-out infinite; opacity: 0;
        }
        @keyframes aurora-twinkle {
          0%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(.3) rotate(0deg); }
          50%      { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(45deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .aurora-sparkle { animation: none; opacity: .8; transform: translate(-50%, -50%); }
        }
      `}</style>
      <span className="aurora-text select-none">{text}</span>
      {STARS.map((s, i) => <Sparkle key={i} {...s} />)}
    </span>
  );
}

export default memo(AuroraLogo);