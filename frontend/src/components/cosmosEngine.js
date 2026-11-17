//   1) AURORA: cortinas de luz roxa, rosa e azul ondulando (canvas pequeno, ampliado = desfoque suave)
//   2) estrelas: camada fixa + estrelas que cintilam
//   3) mini galáxia espiral girando devagar
//   4) poeira estelar à deriva
//   5) buraco negro com disco de acreção e anel de luz
//   6) estrelas cadentes

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// paleta do disco / galáxia: quente no centro -> rosa -> violeta -> azul
const PALETTE = [
  [0.0, [255, 244, 250]],
  [0.25, [255, 150, 215]],
  [0.55, [170, 100, 255]],
  [1.0, [70, 135, 255]],
];
const colorAt = (u) => {
  for (let i = 1; i < PALETTE.length; i++) {
    if (u <= PALETTE[i][0]) {
      const [u0, c0] = PALETTE[i - 1];
      const [u1, c1] = PALETTE[i];
      const f = (u - u0) / (u1 - u0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
    }
  }
  return PALETTE[PALETTE.length - 1][1];
};

export function createCosmos({
  canvas, aurora, width: W, height: H, dpr = 1, makeCanvas,
  hole = { x: 0.88, y: 0.82 }, galaxy = { x: 0.84, y: 0.17 },
  companion = { x: 0.1, y: 0.2 }, nebula: nebulaPos = { x: 0.15, y: 0.7 },
}) {
  const mk = makeCanvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  const small = W < 700;
  const area = (W * H) / (1280 * 720);
  const unit = Math.min(W, H);

  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');

  const lw = Math.ceil(W / 8);
  const lh = Math.ceil(H / 8);
  aurora.width = lw;
  aurora.height = lh;
  const actx = aurora.getContext('2d');

  // ---------- sprites ----------
  const makeDot = (rgb) => {
    const c = mk(32, 32);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, `rgba(255,255,255,1)`);
    gr.addColorStop(0.2, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.9)`);
    gr.addColorStop(0.55, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.22)`);
    gr.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    return c;
  };
  const BUCKETS = 14;
  const ramp = Array.from({ length: BUCKETS }, (_, i) => makeDot(colorAt(i / (BUCKETS - 1))));
  const dotWhite = makeDot([235, 225, 255]);
  const dotPink = makeDot([255, 150, 215]);
  const dotBlue = makeDot([130, 175, 255]);
  const dotViolet = makeDot([175, 120, 255]);

  // ---------- AURORA ----------
  const ribbons = [
    { rgb: [150, 80, 255], base: 0.30, amp: 0.07, f1: 1.6, s1: 0.020, f2: 4.1, s2: -0.032, h: 0.26, a: 0.32 },
    { rgb: [255, 90, 190], base: 0.45, amp: 0.06, f1: 1.2, s1: -0.016, f2: 3.4, s2: 0.026, h: 0.20, a: 0.22 },
    { rgb: [70, 140, 255], base: 0.60, amp: 0.08, f1: 2.1, s1: 0.014, f2: 5.0, s2: -0.024, h: 0.22, a: 0.26 },
  ].map((r, k) => {
    const c = mk(2, 64);
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, `rgba(${r.rgb},0)`);
    gr.addColorStop(0.7, `rgba(${r.rgb},0.55)`);
    gr.addColorStop(0.9, `rgba(${r.rgb},1)`);
    gr.addColorStop(1, `rgba(${r.rgb},0.1)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 2, 64);
    return { ...r, k, sprite: c };
  });

  const drawAurora = (t) => {
    actx.clearRect(0, 0, lw, lh);
    actx.globalCompositeOperation = 'lighter';
    for (const r of ribbons) {
      for (let x = 0; x < lw; x++) {
        const u = x / lw;
        const wave = Math.sin(u * r.f1 * TAU + t * r.s1 * TAU) * r.amp + Math.sin(u * r.f2 * TAU + t * r.s2 * TAU) * r.amp * 0.45;
        const ray = 0.55 + 0.45 * Math.sin(u * 38 + t * 0.7 + r.k) * Math.sin(u * 17 - t * 0.4 + r.k * 2);
        const y = (r.base + wave) * lh;
        const height = r.h * lh * (0.7 + 0.5 * ray);
        const edge = Math.pow(Math.sin(Math.PI * u), 0.6);
        actx.globalAlpha = r.a * (0.4 + 0.6 * ray) * (0.8 + 0.2 * Math.sin(t * 0.25 + r.k)) * edge;
        actx.drawImage(r.sprite, x, y - height, 1.6, height);
      }
    }
    actx.globalAlpha = 1;
    actx.globalCompositeOperation = 'source-over';
  };

  // ---------- estrelas ----------
  const starLayer = mk(Math.round(W * dpr), Math.round(H * dpr));
  {
    const g = starLayer.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(230 * area);
    for (let i = 0; i < n; i++) {
      const r = Math.random() < 0.88 ? rand(0.35, 0.9) : rand(0.9, 1.5);
      const tint = Math.random();
      g.fillStyle = tint < 0.7 ? `rgba(240,235,255,${rand(0.25, 0.8)})` : tint < 0.88 ? `rgba(170,200,255,${rand(0.3, 0.8)})` : `rgba(255,190,230,${rand(0.3, 0.7)})`;
      g.beginPath();
      g.arc(rand(0, W), rand(0, H), r, 0, TAU);
      g.fill();
    }
  }
  const twinkles = Array.from({ length: Math.round(70 * area) }, () => ({
    x: rand(0, W), y: rand(0, H), s: rand(2.5, 6),
    spr: [dotWhite, dotWhite, dotBlue, dotPink][Math.floor(Math.random() * 4)],
    sp: rand(0.6, 2.2), ph: rand(0, TAU), a: rand(0.35, 0.9),
  }));

  // ---------- galáxias espirais ----------
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  const makeGalaxy = (R, { arms = 2, wind = 3.0, stars = 2400 } = {}) => {
    const size = Math.ceil(R * 2.4);
    const c = mk(size, size);
    const g = c.getContext('2d');
    const m = size / 2;
    const bucket = (u) => ramp[Math.min(BUCKETS - 1, Math.floor(clamp01(u) * (BUCKETS - 1)))];
    const armPoint = (a, u, off = 0) => {
      const r = u * R;
      const th = (a / arms) * TAU + wind * Math.log(1 + r / (R * 0.14)) + off;
      return [m + Math.cos(th) * r, m + Math.sin(th) * r];
    };
    g.globalCompositeOperation = 'lighter';

    // halo
    const halo = g.createRadialGradient(m, m, 0, m, m, R * 1.15);
    halo.addColorStop(0, 'rgba(190,120,255,0.34)');
    halo.addColorStop(0.45, 'rgba(120,100,255,0.16)');
    halo.addColorStop(1, 'rgba(80,120,255,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, size, size);

    // faixas suaves que desenham os braços de forma contínua
    for (let a = 0; a < arms; a++) {
      for (let k = 0; k < 220; k++) {
        const u = 0.05 + (0.95 * k) / 220;
        const [x, y] = armPoint(a, u);
        const sz = R * (0.36 - 0.2 * u);
        const fade = clamp01((u - 0.05) / 0.3);
        g.globalAlpha = 0.17 * (1 - u * 0.5) * fade;
        g.drawImage(bucket(u * 0.95), x - sz / 2, y - sz / 2, sz, sz);
        const wide = R * (0.62 - 0.3 * u);
        g.globalAlpha = 0.045 * (1 - u * 0.4) * fade;
        g.drawImage(bucket(u * 0.9), x - wide / 2, y - wide / 2, wide, wide);
      }
    }
    // estrelas nos braços
    for (let i = 0; i < stars; i++) {
      const u = Math.pow(Math.random(), 0.75);
      const [x0, y0] = armPoint(i % arms, u, rand(-1, 1) * 0.3 * (1 - u * 0.45));
      const spread = R * 0.055 * (0.6 + u);
      const sz = rand(1.3, 3.4);
      g.globalAlpha = rand(0.3, 0.9) * (1 - u * 0.35) * (0.25 + 0.75 * clamp01(u / 0.3));
      g.drawImage(Math.random() < 0.18 ? dotBlue : bucket(u * 0.9), x0 + gauss() * spread - sz / 2, y0 + gauss() * spread - sz / 2, sz, sz);
    }
    // regiões de formação de estrelas (nós rosados)
    for (let i = 0; i < 46; i++) {
      const [x, y] = armPoint(i % arms, rand(0.25, 0.95), rand(-0.05, 0.05));
      const sz = rand(6, 14);
      g.globalAlpha = rand(0.6, 1);
      g.drawImage(dotPink, x - sz / 2, y - sz / 2, sz, sz);
    }
    // bojo central brilhante
    const bulge = g.createRadialGradient(m, m, 0, m, m, R * 0.42);
    bulge.addColorStop(0, 'rgba(255,236,218,0.6)');
    bulge.addColorStop(0.22, 'rgba(255,190,212,0.38)');
    bulge.addColorStop(0.6, 'rgba(255,150,205,0.18)');
    bulge.addColorStop(1, 'rgba(170,110,255,0)');
    g.globalAlpha = 1;
    g.fillStyle = bulge;
    g.fillRect(0, 0, size, size);

    return { sprite: c, size };
  };

  const gR = unit * (small ? 0.2 : 0.19);
  const galMain = makeGalaxy(gR, { arms: 2, wind: 3.1, stars: small ? 2000 : 3600 });
  const galSmall = makeGalaxy(unit * (small ? 0.14 : 0.13), { arms: 2, wind: 2.6, stars: small ? 1200 : 2000 });
  const gx = W * galaxy.x;
  const gy = H * galaxy.y;
  const kx = W * companion.x;
  const ky = H * companion.y;

  const drawGalaxy = (gal, x, y, rot, flat, spin, alpha) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flat);
    ctx.rotate(spin);
    ctx.globalAlpha = alpha;
    ctx.drawImage(gal.sprite, -gal.size / 2, -gal.size / 2);
    ctx.restore();
  };

  // ---------- nebulosa colorida (lado esquerdo) ----------
  const nSize = Math.ceil(unit * (small ? 0.8 : 0.8));
  const nebulaSprite = mk(nSize, nSize);
  {
    const g = nebulaSprite.getContext('2d');
    const cols = [dotPink, dotViolet, dotBlue, dotPink, dotViolet];
    g.globalCompositeOperation = 'lighter';
    const onPillar = () => {
      const u = Math.random();
      return {
        u,
        x: nSize * (0.5 + 0.2 * Math.sin(u * 3.4 + 0.4)) + rand(-1, 1) * nSize * 0.2 * (1 - u * 0.5),
        y: nSize * (0.94 - 0.86 * u) + rand(-1, 1) * nSize * 0.06,
      };
    };
    for (let i = 0; i < 200; i++) {
      const p = onPillar();
      const sz = nSize * rand(0.1, 0.3) * (1 - p.u * 0.35);
      g.globalAlpha = rand(0.08, 0.2);
      g.drawImage(cols[Math.floor(Math.random() * cols.length)], p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    for (let i = 0; i < 70; i++) {            // nuvens soltas em volta
      const a = rand(0, TAU);
      const r = nSize * rand(0.05, 0.42);
      const sz = nSize * rand(0.12, 0.3);
      g.globalAlpha = rand(0.05, 0.11);
      g.drawImage(cols[Math.floor(Math.random() * cols.length)], nSize / 2 + Math.cos(a) * r - sz / 2, nSize / 2 + Math.sin(a) * r - sz / 2, sz, sz);
    }
    g.globalCompositeOperation = 'destination-out'; // fios de poeira escura
    for (let i = 0; i < 60; i++) {
      const p = onPillar();
      const sz = nSize * rand(0.03, 0.09);
      g.globalAlpha = rand(0.1, 0.25);
      g.drawImage(dotWhite, p.x + rand(-1, 1) * nSize * 0.05 - sz / 2, p.y - sz / 2, sz, sz);
    }
    g.globalCompositeOperation = 'lighter'; // estrelas jovens dentro da nuvem
    for (let i = 0; i < 110; i++) {
      const p = onPillar();
      const sz = rand(2, 6);
      g.globalAlpha = rand(0.5, 0.95);
      g.drawImage(Math.random() < 0.5 ? dotWhite : dotBlue, p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
  }
  const nx = W * nebulaPos.x;
  const ny = H * nebulaPos.y;

  // ---------- estrelas brilhantes com raios ----------
  const brights = [[0.06, 0.46, 26], [0.31, 0.08, 20], [0.2, 0.93, 22], [0.04, 0.9, 16], [0.62, 0.04, 18]].map(([fx, fy, sz], i) => ({
    x: W * fx, y: H * fy, s: sz * Math.max(0.7, unit / 720), ph: i * 1.7,
  }));
  const drawBright = (b, t) => {
    const k = 0.72 + 0.28 * Math.sin(t * 0.9 + b.ph);
    const gs = b.s * 1.6 * k;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(dotWhite, b.x - gs / 2, b.y - gs / 2, gs, gs);
    const len = b.s * 2.6 * k;
    for (const [dx, dy, f] of [[1, 0, 1], [0, 1, 0.8]]) {
      const g = ctx.createLinearGradient(b.x - dx * len * f, b.y - dy * len * f, b.x + dx * len * f, b.y + dy * len * f);
      g.addColorStop(0, 'rgba(190,170,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(190,170,255,0)');
      ctx.globalAlpha = 0.6 * k;
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(b.x - dx * len * f, b.y - dy * len * f);
      ctx.lineTo(b.x + dx * len * f, b.y + dy * len * f);
      ctx.stroke();
    }
  };

  // ---------- poeira estelar ----------
  const dust = Array.from({ length: Math.round((small ? 50 : 95) * area) }, () => ({
    x: rand(0, W), y: rand(0, H), s: rand(5, 16),
    spr: [dotPink, dotBlue, dotViolet][Math.floor(Math.random() * 3)],
    vx: rand(-6, 6), vy: rand(-4, 4), ph: rand(0, TAU), sp: rand(0.3, 1.1), a: rand(0.05, 0.17),
  }));

  // ---------- buraco negro ----------
  const hx = W * hole.x;
  const hy = H * hole.y;
  const rh = unit * (small ? 0.09 : 0.07);
  const diskIn = rh * 1.7;
  const diskOut = rh * 4.6;
  const tilt = 0.27;
  const phi = -0.2;
  const cphi = Math.cos(phi);
  const sphi = Math.sin(phi);
  const diskN = small ? 700 : 1500;
  const disk = Array.from({ length: diskN }, () => {
    const r = diskIn + (diskOut - diskIn) * Math.pow(Math.random(), 1.5);
    const u = (r - diskIn) / (diskOut - diskIn);
    return {
      r, a: rand(0, TAU), w: 0.85 * Math.pow(diskIn / r, 1.5),
      bucket: Math.min(BUCKETS - 1, Math.floor(Math.pow(u, 0.8) * (BUCKETS - 1))),
      s: rand(2.4, 5) * (1 - u * 0.4), al: rand(0.45, 0.95),
    };
  });
  const halo = Array.from({ length: small ? 160 : 320 }, () => {
    const upper = Math.random() < 0.82;
    return {
      th: upper ? rand(Math.PI, TAU) : rand(0, Math.PI),
      rho: rh * (1.1 + 0.85 * Math.pow(Math.random(), 2.2)) * (upper ? 1 : 0.75),
      bucket: Math.floor(rand(0, 6)), s: rand(2, 4.2), al: upper ? rand(0.35, 0.8) : rand(0.15, 0.4),
    };
  });

  const drawDisk = (t, back) => {
    for (const p of disk) {
      const ang = p.a + p.w * t;
      const sn = Math.sin(ang);
      if ((sn < 0) !== back) continue;
      const ex = Math.cos(ang) * p.r;
      const ey = sn * p.r * tilt;
      const x = hx + ex * cphi - ey * sphi;
      const y = hy + ex * sphi + ey * cphi;
      const beam = 0.6 + 0.4 * (-Math.cos(ang)); // lado que se aproxima brilha mais
      ctx.globalAlpha = Math.min(1, p.al * beam);
      ctx.drawImage(ramp[p.bucket], x - p.s / 2, y - p.s / 2, p.s, p.s);
    }
  };

  const drawBand = (front) => {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(phi);
    if (front) {
      // só a metade de baixo, e só sobre o horizonte
      ctx.beginPath();
      ctx.arc(0, 0, rh * 1.4, 0, Math.PI);
      ctx.closePath();
      ctx.clip();
    }
    ctx.scale(1, tilt);
    const g = ctx.createRadialGradient(0, 0, diskIn, 0, 0, diskOut);
    g.addColorStop(0, 'rgba(255,235,250,0.9)');
    g.addColorStop(0.18, 'rgba(255,140,210,0.62)');
    g.addColorStop(0.5, 'rgba(160,100,255,0.32)');
    g.addColorStop(1, 'rgba(70,130,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, diskOut, 0, TAU);
    ctx.arc(0, 0, diskIn, 0, TAU, true);
    ctx.fill();
    ctx.restore();
  };

  const drawBlackHole = (t) => {
    ctx.globalCompositeOperation = 'lighter';
    // brilho largo atrás de tudo
    const glow = ctx.createRadialGradient(hx, hy, rh * 0.8, hx, hy, diskOut * 1.5);
    glow.addColorStop(0, 'rgba(190,110,255,0.30)');
    glow.addColorStop(0.35, 'rgba(255,100,190,0.10)');
    glow.addColorStop(1, 'rgba(80,120,255,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = glow;
    ctx.fillRect(hx - diskOut * 1.6, hy - diskOut * 1.6, diskOut * 3.2, diskOut * 3.2);

    drawBand(false);
    drawDisk(t, true); // metade de trás do disco

    // imagem "dobrada" do disco em volta do horizonte
    for (const p of halo) {
      const flow = 0.6 + 0.4 * Math.sin(3 * p.th - t * 1.3);
      const x = hx + Math.cos(p.th) * p.rho;
      const y = hy + Math.sin(p.th) * p.rho * 0.92;
      ctx.globalAlpha = p.al * flow;
      ctx.drawImage(ramp[p.bucket], x - p.s / 2, y - p.s / 2, p.s, p.s);
    }

    // horizonte de eventos (preto) com borda suave
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const eh = ctx.createRadialGradient(hx, hy, rh * 0.82, hx, hy, rh * 1.3);
    eh.addColorStop(0, 'rgba(0,0,0,1)');
    eh.addColorStop(0.7, 'rgba(0,0,0,1)');
    eh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eh;
    ctx.beginPath();
    ctx.arc(hx, hy, rh * 1.3, 0, TAU);
    ctx.fill();

    // anel de fótons (fino) e arco de luz dobrado pela gravidade
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const lens = ctx.createLinearGradient(hx - rh * 1.6, 0, hx + rh * 1.6, 0);
    lens.addColorStop(0, 'rgba(255,225,245,1)');
    lens.addColorStop(0.5, 'rgba(255,140,215,0.9)');
    lens.addColorStop(1, 'rgba(150,100,255,0.7)');
    ctx.strokeStyle = lens;
    const arc = (radius, from, to, width, alpha) => {
      ctx.globalAlpha = alpha * (0.9 + 0.1 * Math.sin(t * 1.5));
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(hx, hy, radius, from, to);
      ctx.stroke();
    };
    arc(rh * 1.3, Math.PI * 1.04, Math.PI * 1.96, rh * 0.5, 0.16);   // brilho largo em cima
    arc(rh * 1.2, Math.PI * 1.08, Math.PI * 1.92, rh * 0.2, 0.42);   // arco principal
    arc(rh * 1.15, Math.PI * 0.12, Math.PI * 0.88, rh * 0.12, 0.2);  // arco fraco embaixo
    arc(rh * 1.03, 0, TAU, rh * 0.035, 0.55);                        // anel de fótons

    drawBand(true);
    drawDisk(t, false); // metade da frente do disco, por cima do horizonte
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  // ---------- estrelas cadentes ----------
  let shooters = [];
  let nextShot = 2.5;
  const spawnShot = () => {
    const ang = rand(0.45, 0.8); // descendo para a direita
    const sp = rand(550, 850) * Math.max(0.7, W / 1280);
    shooters.push({
      x: rand(-0.05, 0.7) * W, y: rand(-0.05, 0.35) * H,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      len: rand(120, 230), life: 0, max: rand(0.9, 1.5), pink: Math.random() < 0.35,
    });
  };

  // ---------- quadro ----------
  let lastT = 0;
  const render = (t) => {
    let dt = t - lastT;
    if (dt < 0 || dt > 0.2) dt = 0;
    lastT = t;

    drawAurora(t);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.globalAlpha = 1;
    ctx.drawImage(starLayer, 0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    for (const s of twinkles) {
      ctx.globalAlpha = s.a * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)));
      ctx.drawImage(s.spr, s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
    }

    // nebulosa (esquerda): respira devagar
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(Math.sin(t * 0.05) * 0.05);
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 0.3);
    ctx.drawImage(nebulaSprite, -nSize / 2, -nSize / 2);
    ctx.restore();

    // galáxias girando devagar
    drawGalaxy(galMain, gx, gy, -0.4, 0.6, t * 0.022, 0.95);
    drawGalaxy(galSmall, kx, ky, -0.9, 0.42, t * 0.03, 0.9);

    // estrelas brilhantes
    for (const b of brights) drawBright(b, t);

    // poeira
    for (const d of dust) {
      d.x += (d.vx + Math.sin(t * 0.2 + d.ph) * 3) * dt;
      d.y += (d.vy + Math.cos(t * 0.17 + d.ph) * 2) * dt;
      if (d.x < -20) d.x = W + 20; else if (d.x > W + 20) d.x = -20;
      if (d.y < -20) d.y = H + 20; else if (d.y > H + 20) d.y = -20;
      ctx.globalAlpha = d.a * (0.6 + 0.4 * Math.sin(t * d.sp + d.ph));
      ctx.drawImage(d.spr, d.x - d.s / 2, d.y - d.s / 2, d.s, d.s);
    }

    drawBlackHole(t);

    // cadentes
    if (t > nextShot) { spawnShot(); nextShot = t + rand(3.5, 8); }
    ctx.globalCompositeOperation = 'lighter';
    shooters = shooters.filter((s) => {
      s.life += dt;
      if (s.life > s.max) return false;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const f = Math.sin(Math.PI * clamp01(s.life / s.max));
      const mag = Math.hypot(s.vx, s.vy);
      const tx = s.x - (s.vx / mag) * s.len;
      const ty = s.y - (s.vy / mag) * s.len;
      const g = ctx.createLinearGradient(tx, ty, s.x, s.y);
      const rgb = s.pink ? '255,170,225' : '215,200,255';
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(1, `rgba(255,255,255,${0.9 * f})`);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.globalAlpha = f;
      ctx.drawImage(dotWhite, s.x - 5, s.y - 5, 10, 10);
      return true;
    });

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  return { render };
}