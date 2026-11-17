// Fundo cósmico: aurora (roxo, rosa e azul), estrelas, mini galáxia, poeira estelar,
// buraco negro com disco de acreção e estrelas cadentes. O desenho está em cosmosEngine.js.
import { useEffect, useRef } from 'react';
import { createCosmos } from './cosmosEngine';

export default function StarfieldBackground({ hole, galaxy, companion, nebula }) {
  const mainRef = useRef(null);
  const auroraRef = useRef(null);

  useEffect(() => {
    let raf = 0;
    let engine = null;
    let resizeTimer = 0;
    let last = 0;
    const start = performance.now();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const build = () => {
      if (!mainRef.current || !auroraRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // limita para não pesar
      engine = createCosmos({
        canvas: mainRef.current,
        aurora: auroraRef.current,
        width: window.innerWidth,
        height: window.innerHeight,
        dpr,
        ...(hole ? { hole } : {}),
        ...(galaxy ? { galaxy } : {}),
        ...(companion ? { companion } : {}),
        ...(nebula ? { nebula } : {}),
      });
      if (reduced) engine.render(9); // quadro único, sem movimento
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return; // ~30 quadros por segundo bastam para movimentos lentos
      last = now;
      engine.render((now - start) / 1000);
    };

    build();
    if (!reduced) raf = requestAnimationFrame(loop);

    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(build, 200);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fill = { position: 'absolute', inset: 0, width: '100%', height: '100%' };
  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      {/* aurora em baixa resolução: ao ser ampliada fica naturalmente suave */}
      <canvas ref={auroraRef} style={fill} />
      <canvas ref={mainRef} style={fill} />
    </div>
  );
}