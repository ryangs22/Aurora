// Motor da animação do título (canvas puro, sem dependências).
// Linha do tempo:
//   1) estrelas orbitam em volta do título
//   2) cada letra de AURORA é formada, uma por vez, pelas estrelas que saem da órbita
//   3) logo depois, o subtítulo (GAME TRACKER) é formado do mesmo jeito, em tom azulado
//   4) as letras acendem; brilhos aparecem nas pontas de AURORA
//   5) estrelas cadentes viajam de uma letra para outra e explodem em brilho ao chegar
// O mouse/dedo afasta as estrelas das letras, e elas voltam sozinhas ao lugar.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeInOutSine = (p) => -(Math.cos(Math.PI * p) - 1) / 2;
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// Linha do tempo (segundos)
const T0 = 0.9;
const STAGGER = 0.5;           // intervalo entre as letras do título
const LAUNCH_SPREAD = 0.35;
const SUB_STAGGER = 0.11;      // intervalo entre as letras do subtítulo
const FLARE_DUR = 0.95;

const PALETTES = {
  title: {
    stops: ['#ffffff', '#efe6ff', '#b9a2ec'],
    shadow: 'rgba(170,110,255,0.65)',
    glow: [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(238,224,255,0.85)'], [0.45, 'rgba(170,110,255,0.35)'], [1, 'rgba(120,60,230,0)']],
  },
  sub: {
    stops: ['#e6f3ff', '#aecbff', '#8aa6f2'],
    shadow: 'rgba(100,150,255,0.6)',
    glow: [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(214,234,255,0.85)'], [0.45, 'rgba(110,160,255,0.35)'], [1, 'rgba(60,110,230,0)']],
  },
};

export function createAuroraEngine({
  canvas, width: W, fontFamily, weight = 400, text = 'AURORA',
  subtitle = '', subFontFamily = 'sans-serif', subWeight = 500,
  dpr = 1, speed = 1, makeCanvas,
}) {
  const mk = makeCanvas || ((w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  });
  const probe = mk(8, 8).getContext('2d');
  const setFont = (c, size, family, w) => { c.font = `${w} ${size}px ${family}`; };

  // ---------- medidas ----------
  const tChars = [...text];
  const sChars = [...subtitle];
  const BASE = 100;
  const T_TRACK = 0.16;
  const S_TRACK = 0.42;

  setFont(probe, BASE, fontFamily, weight);
  const baseTotal = sum(tChars.map((ch) => probe.measureText(ch).width)) + T_TRACK * BASE * (tChars.length - 1);
  const fontSize = (BASE * W * 0.76) / baseTotal;

  const layoutLine = (chars, size, family, w, track) => {
    setFont(probe, size, family, w);
    const widths = chars.map((ch) => probe.measureText(ch).width);
    const spacing = size * track;
    const whole = probe.measureText(chars.join(''));
    return {
      widths, spacing,
      total: sum(widths) + spacing * (chars.length - 1),
      asc: whole.actualBoundingBoxAscent || size * 0.75,
      desc: whole.actualBoundingBoxDescent || size * 0.1,
    };
  };

  const T = layoutLine(tChars, fontSize, fontFamily, weight, T_TRACK);
  let subSize = fontSize * 0.24;
  let S = null;
  if (sChars.length) {
    S = layoutLine(sChars, subSize, subFontFamily, subWeight, S_TRACK);
    const maxW = W * 0.68;
    if (S.total > maxW) {
      subSize *= maxW / S.total;
      S = layoutLine(sChars, subSize, subFontFamily, subWeight, S_TRACK);
    }
  }

  // layout vertical: título, pouco espaço, subtítulo
  const padTop = fontSize * 0.34;
  const padBottom = fontSize * 0.3;
  const lineGap = fontSize * 0.1;
  const titleBase = padTop + T.asc;
  const subBase = S ? padTop + T.asc + T.desc + lineGap + S.asc : 0;
  const H = Math.ceil((S ? subBase + S.desc : titleBase + T.desc) + padBottom);

  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');

  // ---------- sprites de brilho (um por paleta) ----------
  const makeGlow = (stops) => {
    const c = mk(64, 64);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  };
  const glowTitle = makeGlow(PALETTES.title.glow);
  const glowSub = makeGlow(PALETTES.sub.glow);

  // ---------- glifos (cada letra) ----------
  const glyphs = [];
  const addLine = (chars, L, size, family, w, baseline, kind) => {
    let cursor = (W - L.total) / 2;
    let k = 0;
    chars.forEach((ch, i) => {
      if (ch.trim()) {
        glyphs.push({ ch, kind, k: k++, x: cursor, width: L.widths[i], baseline, size, family, weight: w, asc: L.asc, desc: L.desc });
      }
      cursor += L.widths[i] + L.spacing;
    });
  };
  addLine(tChars, T, fontSize, fontFamily, weight, titleBase, 'title');
  if (S) addLine(sChars, S, subSize, subFontFamily, subWeight, subBase, 'sub');
  const nTitle = glyphs.filter((g) => g.kind === 'title').length;
  const nSub = glyphs.length - nTitle;

  // tempos de cada letra
  const subStart = T0 + (nTitle - 1) * STAGGER + 0.55;
  glyphs.forEach((g) => {
    if (g.kind === 'title') {
      g.launchBase = T0 + g.k * STAGGER;
      g.spread = LAUNCH_SPREAD; g.flight = [1.1, 1.6];
      g.revealAt = g.launchBase + 1.35; g.revealDur = 0.7;
    } else {
      g.launchBase = subStart + g.k * SUB_STAGGER;
      g.spread = 0.25; g.flight = [0.9, 1.3];
      g.revealAt = g.launchBase + 1.0; g.revealDur = 0.6;
    }
  });
  const T_FORM = Math.max(...glyphs.map((g) => g.revealAt + g.revealDur));

  // amostragem dos pontos + sprite de cada letra (só na caixa da letra)
  glyphs.forEach((g) => {
    const pal = PALETTES[g.kind];
    const m = g.size * 0.55;
    g.sx = Math.floor(g.x - m);
    g.sy = Math.floor(g.baseline - g.asc - m);
    g.sw = Math.ceil(g.width + 2 * m);
    g.sh = Math.ceil(g.asc + g.desc + 2 * m);
    const ox = g.x - g.sx;
    const oy = g.baseline - g.sy;

    // pontos
    const off = mk(g.sw, g.sh);
    const o = off.getContext('2d');
    setFont(o, g.size, g.family, g.weight);
    o.fillStyle = '#fff';
    o.textBaseline = 'alphabetic';
    o.fillText(g.ch, ox, oy);
    const data = o.getImageData(0, 0, g.sw, g.sh).data;
    const gap = g.kind === 'title' ? Math.max(2.4, g.size / 27) : Math.max(1.5, g.size / 16);
    g.pts = [];
    for (let y = gap / 2; y < g.sh; y += gap) {
      for (let x = gap / 2; x < g.sw; x += gap) {
        const ix = Math.min(g.sw - 1, Math.max(0, Math.floor(x + rand(-gap * 0.3, gap * 0.3))));
        const iy = Math.min(g.sh - 1, Math.max(0, Math.floor(y + rand(-gap * 0.3, gap * 0.3))));
        if (data[(iy * g.sw + ix) * 4 + 3] > 110) g.pts.push({ x: g.sx + ix, y: g.sy + iy });
      }
    }

    // sprite com degradê + brilho
    const sp = mk(Math.round(g.sw * dpr), Math.round(g.sh * dpr));
    const s = sp.getContext('2d');
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    setFont(s, g.size, g.family, g.weight);
    s.textBaseline = 'alphabetic';
    const gr = s.createLinearGradient(0, m, 0, m + g.asc + g.desc);
    gr.addColorStop(0, pal.stops[0]);
    gr.addColorStop(0.55, pal.stops[1]);
    gr.addColorStop(1, pal.stops[2]);
    s.fillStyle = gr;
    s.shadowColor = pal.shadow;
    s.shadowBlur = (g.kind === 'title' ? g.size * 0.22 : g.size * 0.5) * dpr;
    s.fillText(g.ch, ox, oy);
    g.sprite = sp;
  });

  // ---------- pontas das letras do título (onde nascem os brilhos) ----------
  const tips = glyphs.slice(0, nTitle).map((g) => {
    const pts = g.pts;
    if (!pts.length) return [];
    const by = (fn) => pts.reduce((best, p) => (fn(p) < fn(best) ? p : best), pts[0]);
    const out = [];
    [by((p) => p.y), by((p) => -p.y), by((p) => p.x), by((p) => -p.x)].forEach((c) => {
      if (out.every((o2) => Math.hypot(o2.x - c.x, o2.y - c.y) > fontSize * 0.3)) {
        out.push({ x: c.x, y: c.y, flareAt: -99, nextAt: 0 });
      }
    });
    return out;
  });

  // ---------- partículas ----------
  const cx = W / 2;
  const cy = H / 2;
  const tilt = -0.18;
  const baseR = Math.min(1.8, Math.max(0.9, fontSize / 70));

  const makeOrbit = (big) => {
    const r = big ? rand(0.85, 1.15) : rand(0.5, 1);
    return { a0: rand(0, TAU), w: rand(0.22, 0.55) * (big ? 0.7 : 1), rx: W * 0.45 * r, ry: H * 0.4 * r };
  };

  const parts = [];
  glyphs.forEach((g, gi) => {
    g.pts.forEach((pt) => {
      parts.push({
        letter: gi, tx: pt.x, ty: pt.y, ...makeOrbit(false),
        launch: g.launchBase + rand(0, g.spread),
        dur: rand(g.flight[0], g.flight[1]),
        curve: rand(-1, 1) * fontSize * 0.5,
        r: baseR * (g.kind === 'title' ? rand(0.7, 1.3) : rand(0.45, 0.8)),
        glow: g.kind === 'title' ? glowTitle : glowSub,
        tw: rand(1.5, 4), ph: rand(0, TAU), ox: 0, oy: 0, vx: 0, vy: 0,
      });
    });
  });
  for (let k = 0; k < 70; k++) {
    parts.push({
      letter: -1, tx: 0, ty: 0, ...makeOrbit(true), launch: Infinity, dur: 1, curve: 0,
      r: baseR * rand(0.6, 1.2), glow: k % 4 === 0 ? glowSub : glowTitle,
      tw: rand(1, 3), ph: rand(0, TAU), ox: 0, oy: 0, vx: 0, vy: 0,
    });
  }

  const orbit = (p, t) => {
    const a = p.a0 + p.w * t;
    const ex = Math.cos(a) * p.rx;
    const ey = Math.sin(a) * p.ry;
    return [cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)];
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
    const room = Math.max(2, Math.min(x, W - x, y, H - y) - 2); // nunca passa da borda
    const L = Math.min(fontSize * 0.42 * scale * k, room);
    ctx.globalAlpha = Math.min(1, k * 1.2);
    const s = L * 1.1;
    ctx.drawImage(glowTitle, x - s / 2, y - s / 2, s, s);
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

  const drawLetter = (g, rev) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = rev;
    ctx.drawImage(g.sprite, g.sx, g.sy, g.sw, g.sh);
  };

  const startComet = (t) => {
    const idx = tips.map((a, i) => (a.length ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return;
    const i = idx[Math.floor(Math.random() * idx.length)];
    let j = i;
    while (j === i) j = idx[Math.floor(Math.random() * idx.length)];
    const A = tips[i][Math.floor(Math.random() * tips[i].length)];
    const B = tips[j][Math.floor(Math.random() * tips[j].length)];
    const dist = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const nx = -(B.y - A.y) / dist;
    const ny = (B.x - A.x) / dist;
    const bend = rand(-0.4, 0.4) * dist;
    comets.push({
      A, B, start: t, dur: rand(0.8, 1.25),
      cx: (A.x + B.x) / 2 + nx * bend, cy: (A.y + B.y) / 2 + ny * bend - fontSize * 0.45,
    });
    A.flareAt = t;
  };

  const cometPoint = (c, u) => {
    const v = 1 - u;
    return [v * v * c.A.x + 2 * v * u * c.cx + u * u * c.B.x, v * v * c.A.y + 2 * v * u * c.cy + u * u * c.B.y];
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
    const rev = glyphs.map((g) => easeOutCubic(clamp01((t - g.revealAt) / g.revealDur)));
    glyphs.forEach((g, i) => { if (rev[i] > 0.001) drawLetter(g, rev[i]); });

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
      ctx.drawImage(p.glow, x - s / 2, y - s / 2, s, s);
    }

    // 3) brilhos nas pontas das letras do título
    tips.forEach((arr, i) => {
      arr.forEach((tp) => {
        if (tp.nextAt === 0) tp.nextAt = glyphs[i].revealAt + rand(0.3, 1.4);
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
        ctx.drawImage(glowTitle, px - s / 2, py - s / 2, s, s);
      }
      const [hx, hy] = cometPoint(c, u);
      ctx.globalAlpha = 1;
      const hs = fontSize * 0.3;
      ctx.drawImage(glowTitle, hx - hs / 2, hy - hs / 2, hs, hs);
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
      ctx.globalAlpha = 1 - s.life / s.max;
      const sz = baseR * 4.2;
      ctx.drawImage(glowTitle, s.x - sz / 2, s.y - sz / 2, sz, sz);
      return true;
    });

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  // versão estática (para quem prefere menos movimento)
  const renderStatic = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    glyphs.forEach((g) => drawLetter(g, 1));
    ctx.globalCompositeOperation = 'lighter';
    tips.forEach((arr) => { if (arr[0]) drawFlare(arr[0].x, arr[0].y, 0.7, 0.8); });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  return { height: H, width: W, fontSize, render, renderStatic, reset };
}