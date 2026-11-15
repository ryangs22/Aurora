// Motor da animação do título. Segue a lógica da animação (Linha do tempo):
//   1) estrelas orbitam em volta do título
//   2) cada letra é formada, uma por vez, pelas estrelas que saem da órbita
//   3) a letra "acende" (texto com degradê + brilho)
//   4) brilhos aparecem nas pontas das letras
//   5) estrelas cadentes viajam de uma letra para outra e explodem em brilho ao chegar
// O mouse/dedo afasta as estrelas das letras, e elas voltam sozinhas ao lugar.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeInOutSine = (p) => -(Math.cos(Math.PI * p) - 1) / 2;

// Linha do tempo (segundos)
const T0 = 0.9;            // tempo orbitando antes da primeira letra
const STAGGER = 0.5;       // intervalo entre o início de cada letra
const LAUNCH_SPREAD = 0.35;
const FLIGHT_MIN = 1.1;
const FLIGHT_MAX = 1.6;
const REVEAL_AT = 1.35;    // quando a letra começa a acender, depois do seu início
const REVEAL_DUR = 0.7;
const FLARE_DUR = 0.95;

export function createAuroraEngine({
  canvas, width: W, fontFamily, weight = 400, text = 'AURORA', dpr = 1, speed = 1, makeCanvas,
}) {
  const mk = makeCanvas || ((w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  });

  // ---------- medidas ----------
  const chars = [...text];
  const n = chars.length;
  const probe = mk(8, 8).getContext('2d');
  const setFont = (ctx, size) => { ctx.font = `${weight} ${size}px ${fontFamily}`; };

  const BASE = 100;
  const TRACK = 0.16; // espaçamento entre letras (em "em")
  setFont(probe, BASE);
  const baseWidths = chars.map((ch) => probe.measureText(ch).width);
  const baseTotal = baseWidths.reduce((a, b) => a + b, 0) + TRACK * BASE * (n - 1);
  const fontSize = (BASE * W * 0.84) / baseTotal;

  setFont(probe, fontSize);
  const widths = chars.map((ch) => probe.measureText(ch).width);
  const spacing = fontSize * TRACK;
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (n - 1);
  const H = Math.ceil(fontSize * 2.4);
  const whole = probe.measureText(text);
  const asc = whole.actualBoundingBoxAscent || fontSize * 0.75;
  const desc = whole.actualBoundingBoxDescent || fontSize * 0.1;
  const baseline = H / 2 + (asc - desc) / 2;

  const lx = [];
  let cursor = (W - total) / 2;
  for (let i = 0; i < n; i++) { lx.push(cursor); cursor += widths[i] + spacing; }

  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');

  // ---------- sprite de brilho ----------
  const glow = mk(64, 64);
  {
    const g = glow.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(238,224,255,0.85)');
    gr.addColorStop(0.45, 'rgba(170,110,255,0.35)');
    gr.addColorStop(1, 'rgba(120,60,230,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }

  // ---------- amostragem: pontos que formam cada letra ----------
  const gap = Math.max(2.4, fontSize / 27);
  const letterPts = [];
  for (let i = 0; i < n; i++) {
    const off = mk(Math.ceil(W), H);
    const o = off.getContext('2d');
    setFont(o, fontSize);
    o.fillStyle = '#fff';
    o.textBaseline = 'alphabetic';
    o.fillText(chars[i], lx[i], baseline);
    const data = o.getImageData(0, 0, Math.ceil(W), H).data;
    const pts = [];
    for (let y = gap / 2; y < H; y += gap) {
      for (let x = gap / 2; x < W; x += gap) {
        const ix = Math.min(Math.ceil(W) - 1, Math.max(0, Math.floor(x + rand(-gap * 0.3, gap * 0.3))));
        const iy = Math.min(H - 1, Math.max(0, Math.floor(y + rand(-gap * 0.3, gap * 0.3))));
        if (data[(iy * Math.ceil(W) + ix) * 4 + 3] > 110) pts.push({ x: ix, y: iy });
      }
    }
    letterPts.push(pts);
  }

  // ---------- pontas das letras (onde nascem os brilhos) ----------
  const tips = letterPts.map((pts) => {
    if (!pts.length) return [];
    const by = (fn) => pts.reduce((best, p) => (fn(p) < fn(best) ? p : best), pts[0]);
    const cands = [by((p) => p.y), by((p) => -p.y), by((p) => p.x), by((p) => -p.x)];
    const out = [];
    cands.forEach((c) => {
      if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > fontSize * 0.3)) {
        out.push({ x: c.x, y: c.y, flareAt: -99, nextAt: 0 });
      }
    });
    return out;
  });

  // ---------- partículas ----------
  const cx = W / 2;
  const cy = H / 2;
  const tilt = -0.18;
  const particleR = Math.min(1.8, Math.max(0.9, fontSize / 70));
  const T_FORM = T0 + (n - 1) * STAGGER + LAUNCH_SPREAD + FLIGHT_MAX;
  const revealStart = chars.map((_, i) => T0 + i * STAGGER + REVEAL_AT);

  const makeOrbit = (big) => {
    const r = big ? rand(0.85, 1.15) : rand(0.5, 1);
    return {
      a0: rand(0, TAU), w: rand(0.22, 0.55) * (big ? 0.7 : 1),
      rx: W * 0.45 * r, ry: H * 0.34 * r,
    };
  };

  const parts = [];
  letterPts.forEach((pts, i) => {
    pts.forEach((pt) => {
      parts.push({
        letter: i, tx: pt.x, ty: pt.y,
        ...makeOrbit(false),
        launch: T0 + i * STAGGER + rand(0, LAUNCH_SPREAD),
        dur: rand(FLIGHT_MIN, FLIGHT_MAX),
        curve: rand(-1, 1) * fontSize * 0.6,
        r: particleR * rand(0.7, 1.3),
        tw: rand(1.5, 4), ph: rand(0, TAU),
        ox: 0, oy: 0, vx: 0, vy: 0,
      });
    });
  });
  // poeira de estrelas que continua orbitando o título o tempo todo
  for (let k = 0; k < 70; k++) {
    parts.push({
      letter: -1, tx: 0, ty: 0, ...makeOrbit(true), launch: Infinity, dur: 1, curve: 0,
      r: particleR * rand(0.6, 1.2), tw: rand(1, 3), ph: rand(0, TAU), ox: 0, oy: 0, vx: 0, vy: 0,
    });
  }

  const orbit = (p, t) => {
    const a = p.a0 + p.w * t;
    const ex = Math.cos(a) * p.rx;
    const ey = Math.sin(a) * p.ry;
    return [
      cx + ex * Math.cos(tilt) - ey * Math.sin(tilt),
      cy + ex * Math.sin(tilt) + ey * Math.cos(tilt),
    ];
  };

  // ---------- estado dinâmico ----------
  let comets = [];
  let sparks = [];
  let nextComet = T_FORM + 0.2;
  let lastT = 0;

  const reset = () => {
    comets = []; sparks = []; nextComet = T_FORM + 0.2; lastT = 0;
    tips.forEach((arr) => arr.forEach((tp) => { tp.flareAt = -99; tp.nextAt = 0; }));
    parts.forEach((p) => { p.ox = 0; p.oy = 0; p.vx = 0; p.vy = 0; });
  };

  const flareK = (t, tp) => {
    const age = t - tp.flareAt;
    if (age < 0 || age > FLARE_DUR) return 0;
    return Math.pow(Math.sin((Math.PI * age) / FLARE_DUR), 1.5);
  };

  const drawFlare = (x, y, k, scale = 1) => {
    if (k <= 0.01) return;
    const L = fontSize * 0.42 * scale * k;
    ctx.globalAlpha = Math.min(1, k * 1.2);
    const s = L * 1.1;
    ctx.drawImage(glow, x - s / 2, y - s / 2, s, s);
    const lw = Math.max(1, fontSize * 0.012);
    const ray = (dx, dy, len, alpha) => {
      const g = ctx.createLinearGradient(x - dx * len, y - dy * len, x + dx * len, y + dy * len);
      g.addColorStop(0, 'rgba(200,170,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(200,170,255,0)');
      ctx.globalAlpha = Math.min(1, k * 1.2) * alpha;
      ctx.strokeStyle = g;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x - dx * len, y - dy * len);
      ctx.lineTo(x + dx * len, y + dy * len);
      ctx.stroke();
    };
    ray(1, 0, L, 1);
    ray(0, 1, L, 1);
    ray(0.707, 0.707, L * 0.5, 0.55);
    ray(0.707, -0.707, L * 0.5, 0.55);
  };

  // Cada letra (com degradê e brilho) é desenhada uma vez só; depois é só colar com transparência.
  const sprites = chars.map((ch, i) => {
    const c = mk(Math.round(W * dpr), Math.round(H * dpr));
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    setFont(g, fontSize);
    g.textBaseline = 'alphabetic';
    const gr = g.createLinearGradient(0, H / 2 - fontSize * 0.6, 0, H / 2 + fontSize * 0.7);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.55, '#efe6ff');
    gr.addColorStop(1, '#b9a2ec');
    g.fillStyle = gr;
    g.shadowColor = 'rgba(170,110,255,0.65)';
    g.shadowBlur = fontSize * 0.22 * dpr;
    g.fillText(ch, lx[i], baseline);
    return c;
  });

  const drawLetter = (i, rev) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = rev;
    ctx.drawImage(sprites[i], 0, 0, W, H);
  };

  const startComet = (t) => {
    const lettersWithTips = tips.map((a, i) => (a.length ? i : -1)).filter((i) => i >= 0);
    if (lettersWithTips.length < 2) return;
    const i = lettersWithTips[Math.floor(Math.random() * lettersWithTips.length)];
    let j = i;
    while (j === i) j = lettersWithTips[Math.floor(Math.random() * lettersWithTips.length)];
    const A = tips[i][Math.floor(Math.random() * tips[i].length)];
    const B = tips[j][Math.floor(Math.random() * tips[j].length)];
    const midx = (A.x + B.x) / 2;
    const midy = (A.y + B.y) / 2;
    const dist = Math.hypot(B.x - A.x, B.y - A.y);
    const nx = -(B.y - A.y) / (dist || 1);
    const ny = (B.x - A.x) / (dist || 1);
    const bend = rand(-0.4, 0.4) * dist;
    comets.push({
      A, B, start: t, dur: rand(0.8, 1.25),
      cx: midx + nx * bend, cy: midy + ny * bend - fontSize * 0.45,
    });
    A.flareAt = t;
  };

  const cometPoint = (c, u) => {
    const v = 1 - u;
    return [
      v * v * c.A.x + 2 * v * u * c.cx + u * u * c.B.x,
      v * v * c.A.y + 2 * v * u * c.cy + u * u * c.B.y,
    ];
  };

  const burst = (x, y) => {
    for (let k = 0; k < 12; k++) {
      const a = rand(0, TAU);
      const sp = rand(20, 85) * (fontSize / 90);
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(0.5, 1) });
    }
  };

  // ---------- quadro ----------
  const render = (tRaw, pointer) => {
    const t = tRaw * speed;
    let dt = t - lastT;
    if (dt < 0 || dt > 0.1) dt = 0;
    lastT = t;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 1) letras acesas
    const rev = revealStart.map((s) => easeOutCubic(clamp01((t - s) / REVEAL_DUR)));
    for (let i = 0; i < n; i++) if (rev[i] > 0.001) drawLetter(i, rev[i]);

    // 2) estrelas
    ctx.globalCompositeOperation = 'lighter';
    const R = fontSize * 0.8;
    for (const p of parts) {
      let x; let y; let alpha; let rad = p.r;
      if (t < p.launch) {
        [x, y] = orbit(p, t);
        alpha = clamp01((t - 0.1) / 0.9) * (p.letter < 0 ? 0.55 : 0.9);
        if (p.letter < 0) alpha *= 0.7 + 0.3 * Math.sin(t * p.tw + p.ph);
      } else {
        const q = (t - p.launch) / p.dur;
        if (q < 1) {
          const e = easeOutCubic(q);
          const [sx, sy] = orbit(p, p.launch);
          const dx = p.tx - sx;
          const dy = p.ty - sy;
          const len = Math.hypot(dx, dy) || 1;
          const bend = Math.sin(Math.PI * e) * p.curve;
          x = sx + dx * e + (-dy / len) * bend;
          y = sy + dy * e + (dx / len) * bend;
          alpha = 1;
          rad = p.r * 1.35;
        } else {
          if (dt > 0) {
            p.vx += -140 * p.ox * dt;
            p.vy += -140 * p.oy * dt;
            if (pointer) {
              const ddx = p.tx + p.ox - pointer.x;
              const ddy = p.ty + p.oy - pointer.y;
              const d2 = ddx * ddx + ddy * ddy;
              if (d2 < R * R && d2 > 0.01) {
                const d = Math.sqrt(d2);
                const f = (1 - d / R) * (1 - d / R) * 1400 * dt;
                p.vx += (ddx / d) * f;
                p.vy += (ddy / d) * f;
              }
            }
            const damp = Math.exp(-7 * dt);
            p.vx *= damp; p.vy *= damp;
            p.ox += p.vx * dt; p.oy += p.vy * dt;
          }
          x = p.tx + p.ox;
          y = p.ty + p.oy;
          const tw = 0.55 + 0.45 * Math.sin(t * p.tw + p.ph);
          alpha = tw * (1 - 0.6 * (p.letter >= 0 ? rev[p.letter] : 0));
        }
      }
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;
      const s = rad * 5.2;
      ctx.drawImage(glow, x - s / 2, y - s / 2, s, s);
    }

    // 3) brilhos nas pontas (aparecem de tempos em tempos, depois que a letra acende)
    tips.forEach((arr, i) => {
      arr.forEach((tp) => {
        if (tp.nextAt === 0) tp.nextAt = revealStart[i] + rand(0.3, 1.4);
        if (t > tp.nextAt && rev[i] > 0.8) {
          tp.flareAt = t;
          tp.nextAt = t + rand(2.2, 5.5);
        }
        drawFlare(tp.x, tp.y, flareK(t, tp), 1);
      });
    });

    // 4) estrelas cadentes de uma letra para outra
    if (t > nextComet) {
      startComet(t);
      nextComet = t + rand(1.3, 2.6);
    }
    comets = comets.filter((c) => {
      const q = (t - c.start) / c.dur;
      if (q >= 1) {
        c.B.flareAt = t;
        burst(c.B.x, c.B.y);
        return false;
      }
      const u = easeInOutSine(q);
      for (let j = 0; j < 28; j++) {
        const uj = u - j * 0.014;
        if (uj < 0) break;
        const [px, py] = cometPoint(c, uj);
        const f = 1 - j / 28;
        const s = fontSize * (0.05 + 0.1 * f);
        ctx.globalAlpha = f * f * 0.9;
        ctx.drawImage(glow, px - s / 2, py - s / 2, s, s);
      }
      const [hx, hy] = cometPoint(c, u);
      ctx.globalAlpha = 1;
      const hs = fontSize * 0.3;
      ctx.drawImage(glow, hx - hs / 2, hy - hs / 2, hs, hs);
      if (Math.random() < 0.6) {
        sparks.push({ x: hx, y: hy, vx: rand(-14, 14), vy: rand(-14, 14), life: 0, max: rand(0.35, 0.7) });
      }
      return true;
    });

    // 5) faíscas
    sparks = sparks.filter((s) => {
      s.life += dt;
      if (s.life >= s.max) return false;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const a = 1 - s.life / s.max;
      ctx.globalAlpha = a;
      const sz = particleR * 4.2;
      ctx.drawImage(glow, s.x - sz / 2, s.y - sz / 2, sz, sz);
      return true;
    });

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  // versão estática 
  const renderStatic = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < n; i++) drawLetter(i, 1);
    ctx.globalCompositeOperation = 'lighter';
    tips.forEach((arr) => { if (arr[0]) drawFlare(arr[0].x, arr[0].y, 0.7, 0.8); });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  return { height: H, width: W, fontSize, render, renderStatic, reset };
}