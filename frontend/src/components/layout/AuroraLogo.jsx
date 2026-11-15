// Título "AURORA" com estrelas que cintilam como se fizessem parte das letras.
// A fonte vem da classe "font-logo" (tailwind.config.js).

const STARS = [
  { left: '4%',  top: '-22%', size: 0.55, delay: '0s' },    // ponta do A
  { left: '47%', top: '-30%', size: 0.75, delay: '0.9s' },  // acima do centro
  { left: '97%', top: '4%',   size: 0.45, delay: '1.7s' },  // fim do último A
  { left: '27%', top: '96%',  size: 0.35, delay: '2.4s' },  // sob o U
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

export default function AuroraLogo({ className = '', text = 'AURORA', weight = 400 }) {
  return (
    <span className={`aurora-logo relative inline-block font-logo ${className}`} style={{ fontWeight: weight }}>
      <style>{`
        .aurora-logo { filter: drop-shadow(0 0 14px rgba(170,110,255,.45)); }
        .aurora-logo .aurora-text {
          background: linear-gradient(180deg, #fff 0%, #efe6ff 55%, #b9a2ec 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .aurora-sparkle {
          position: absolute; transform: translate(-50%, -50%);
          filter: drop-shadow(0 0 4px #d9c2ff) drop-shadow(0 0 10px #a56bff);
          animation: aurora-twinkle 3.2s ease-in-out infinite; opacity: 0;
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