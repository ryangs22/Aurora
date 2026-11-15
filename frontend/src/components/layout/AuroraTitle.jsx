// Título animado da tela de login. A animação em si está em auroraTitleEngine.js.
// OBS: Quem usa "reduzir movimento" no sistema vê o título parado, só com os brilhos.
import { useEffect, useRef, useState } from 'react';
import { createAuroraEngine } from './auroraTitleEngine';

export default function AuroraTitle({ text = 'AURORA', maxWidth = 720, className = '' }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const probeRef = useRef(null);
  const controls = useRef({ replay: () => {}, setPointer: () => {} });
  const [height, setHeight] = useState(Math.round(maxWidth * 0.34));

  useEffect(() => {
    let raf = 0;
    let engine = null;
    let ro = null;
    let cancelled = false;
    let startTime = performance.now();
    let pointer = null;
    let lastWidth = 0;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let speed = 1;
    try {
      if (sessionStorage.getItem('aurora_intro_seen')) speed = 1.8;
      sessionStorage.setItem('aurora_intro_seen', '1');
    } catch { /* sem sessionStorage, segue normal */ }

    const build = () => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const width = Math.floor(wrap.clientWidth);
      if (width < 50 || Math.abs(width - lastWidth) < 2) return;
      lastWidth = width;

      const family = getComputedStyle(probeRef.current).fontFamily;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      engine = createAuroraEngine({ canvas, width, fontFamily: family, text, dpr, speed });
      canvas.style.width = `${engine.width}px`;
      canvas.style.height = `${engine.height}px`;
      setHeight(engine.height);
      if (reduced) engine.renderStatic();
    };

    const loop = (now) => {
      if (engine && !reduced) engine.render((now - startTime) / 1000, pointer);
      raf = requestAnimationFrame(loop);
    };

    controls.current = {
      replay: () => { startTime = performance.now(); engine?.reset(); },
      setPointer: (p) => { pointer = p; },
    };

    (async () => {
      try {
        const family = getComputedStyle(probeRef.current).fontFamily;
        await document.fonts.load(`400 100px ${family}`, text);
        await document.fonts.ready;
      } catch { /* usa a fonte reserva */ }
      if (cancelled) return;
      startTime = performance.now();
      build();
      ro = new ResizeObserver(build);
      ro.observe(wrapRef.current);
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [text]);

  const handleMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    controls.current.setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={wrapRef}
      className={`relative mx-auto w-full cursor-pointer select-none ${className}`}
      style={{ maxWidth, height }}
      onPointerMove={handleMove}
      onPointerLeave={() => controls.current.setPointer(null)}
      onClick={() => controls.current.replay()}
    >
      <h1 className="sr-only">{text}</h1>
      {/* elemento invisível só para ler a fonte definida em font-logo (tailwind.config.js) */}
      <span ref={probeRef} className="font-logo absolute opacity-0 pointer-events-none" aria-hidden="true">A</span>
      <canvas ref={canvasRef} aria-hidden="true" className="mx-auto block" />
    </div>
  );
}