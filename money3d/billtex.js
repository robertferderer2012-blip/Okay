// Procedural $100-bill style textures drawn on 2D canvases.
// All shapes are drawn from code (no scanned images), engraving-style.

export const BW = 2048, BH = 868; // 156 x 66 mm aspect

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SERIF = '"Liberation Serif", "FreeSerif", "DejaVu Serif", serif';
const INK = '#26302a';
const GREENGRAY = '#5f6f5c';

function paper(ctx, W, H, seed) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#dde2d0');
  g.addColorStop(0.45, '#e9e7d6');
  g.addColorStop(0.75, '#ead9c4');
  g.addColorStop(1, '#dfe1cf');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const r = rng(seed);
  // paper grain
  for (let i = 0; i < 26000; i++) {
    const x = r() * W, y = r() * H;
    const a = r() * 0.06;
    ctx.fillStyle = r() < 0.5 ? `rgba(80,90,70,${a})` : `rgba(255,255,245,${a * 1.4})`;
    ctx.fillRect(x, y, 2, 2);
  }
  // red & blue security fibres
  for (let i = 0; i < 140; i++) {
    const x = r() * W, y = r() * H, a = r() * Math.PI, l = 6 + r() * 14;
    ctx.strokeStyle = r() < 0.5 ? 'rgba(190,40,50,0.55)' : 'rgba(40,70,190,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 3, y + Math.sin(a) * l * 0.5 - 3, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
}

function microWaves(ctx, W, H, color, step = 7, amp = 6, freq = 0.012) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let y = -amp; y < H + amp; y += step) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const yy = y + Math.sin(x * freq + y * 0.05) * amp;
      x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

// spirograph-like guilloche rosette
function rosette(ctx, cx, cy, R, color, lw = 1.1, n = 3, k = 0.62, petals = 18) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  for (let j = 0; j < n; j++) {
    const rr = R * (1 - j * 0.16);
    ctx.beginPath();
    for (let i = 0; i <= 1440; i++) {
      const t = (i / 1440) * Math.PI * 2;
      const r = rr * (k + (1 - k) * (0.5 + 0.5 * Math.cos(petals * t + j)));
      const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
}

function guillocheBand(ctx, x0, y0, w, h, color, lines = 9) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const horiz = w > h;
  for (let j = 0; j < lines; j++) {
    ctx.beginPath();
    const L = horiz ? w : h, A = (horiz ? h : w) * 0.45;
    for (let i = 0; i <= L; i += 3) {
      const p = Math.sin(i * 0.045 + j * 0.7) * A * Math.cos(i * 0.011 + j);
      const x = horiz ? x0 + i : x0 + w / 2 + p;
      const y = horiz ? y0 + h / 2 + p : y0 + i;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function border(ctx, W, H, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, W - 44, H - 44);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(34, 34, W - 68, H - 68);
  guillocheBand(ctx, 36, 36, W - 72, 26, color, 6);
  guillocheBand(ctx, 36, H - 62, W - 72, 26, color, 6);
  guillocheBand(ctx, 36, 36, 26, H - 72, color, 6);
  guillocheBand(ctx, W - 62, 36, 26, H - 72, color, 6);
}

function hundred(ctx, x, y, size, fill, align = 'left', stroke = null) {
  ctx.font = `bold ${size}px ${SERIF}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = fill;
  ctx.fillText('100', x, y);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1.5, size / 60);
    ctx.strokeText('100', x, y);
  }
}

function seal(ctx, cx, cy, R, color, letter) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, 0, Math.PI * 2); ctx.stroke();
  // saw-tooth ring
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86);
    ctx.lineTo(cx + Math.cos(a + 0.035) * R * 0.98, cy + Math.sin(a + 0.035) * R * 0.98);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.stroke();
  // ring lettering as small ticks / glyph blocks
  ctx.font = `bold ${Math.round(R * 0.16)}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const txt = letter ? 'FEDERAL RESERVE SYSTEM • ' : 'THE DEPARTMENT OF THE TREASURY • ';
  for (let i = 0; i < txt.length; i++) {
    const a = -Math.PI / 2 + (i / txt.length) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * R * 0.71, cy + Math.sin(a) * R * 0.71);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(txt[i], 0, 0);
    ctx.restore();
  }
  if (letter) {
    ctx.font = `bold ${Math.round(R * 0.62)}px ${SERIF}`;
    ctx.fillText(letter, cx, cy + R * 0.04);
  } else {
    // scales + key emblem
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.35, cy - R * 0.12); ctx.lineTo(cx + R * 0.35, cy - R * 0.12);
    ctx.moveTo(cx, cy - R * 0.32); ctx.lineTo(cx, cy + R * 0.3);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - R * 0.25, cy + R * 0.02, R * 0.12, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + R * 0.25, cy + R * 0.02, R * 0.12, 0, Math.PI); ctx.stroke();
    ctx.fillRect(cx - R * 0.3, cy + R * 0.28, R * 0.6, R * 0.06);
  }
  ctx.restore();
}

// hatch lines inside current clip
function hatch(ctx, x0, y0, x1, y1, step, angle, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const L = Math.hypot(x1 - x0, y1 - y0);
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  for (let d = -L / 2; d < L / 2; d += step) {
    ctx.moveTo(-L / 2, d);
    ctx.lineTo(L / 2, d);
  }
  ctx.stroke();
  ctx.restore();
}

function portrait(ctx, cx, cy, s) {
  // oval vignette made of fine concentric lines
  ctx.save();
  for (let i = 0; i < 60; i++) {
    const f = 1 - i / 60;
    ctx.strokeStyle = `rgba(70,85,70,${0.05 + 0.18 * (1 - f)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.05, s * 0.78 * f + 4, s * 1.02 * f + 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const path = (fn) => { ctx.beginPath(); fn(); ctx.closePath(); };
  // --- coat / shoulders
  ctx.save();
  path(() => {
    ctx.moveTo(cx - s * 0.95, cy + s * 1.05);
    ctx.bezierCurveTo(cx - s * 0.9, cy + s * 0.55, cx - s * 0.55, cy + s * 0.38, cx - s * 0.22, cy + s * 0.34);
    ctx.lineTo(cx + s * 0.22, cy + s * 0.34);
    ctx.bezierCurveTo(cx + s * 0.55, cy + s * 0.38, cx + s * 0.9, cy + s * 0.55, cx + s * 0.95, cy + s * 1.05);
  });
  ctx.fillStyle = 'rgba(60,72,62,0.55)';
  ctx.fill();
  ctx.clip();
  hatch(ctx, cx - s, cy + s * 0.3, cx + s, cy + s * 1.1, 4, 0.5, 'rgba(20,28,22,0.55)', 1.4);
  hatch(ctx, cx - s, cy + s * 0.3, cx + s, cy + s * 1.1, 6, -0.7, 'rgba(120,135,120,0.25)', 1);
  ctx.restore();
  // shirt / cravat
  ctx.save();
  path(() => {
    ctx.moveTo(cx - s * 0.2, cy + s * 0.34);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.34);
    ctx.lineTo(cx + s * 0.08, cy + s * 0.85);
    ctx.lineTo(cx - s * 0.08, cy + s * 0.85);
  });
  ctx.fillStyle = '#d9dccd';
  ctx.fill();
  ctx.clip();
  hatch(ctx, cx - s * 0.3, cy + s * 0.3, cx + s * 0.3, cy + s * 0.9, 5, 1.2, 'rgba(60,70,60,0.5)', 1);
  ctx.restore();
  // --- hair (long, shoulder length)
  ctx.save();
  path(() => {
    ctx.moveTo(cx - s * 0.36, cy - s * 0.38);
    ctx.bezierCurveTo(cx - s * 0.55, cy - s * 0.1, cx - s * 0.5, cy + s * 0.3, cx - s * 0.32, cy + s * 0.42);
    ctx.lineTo(cx + s * 0.32, cy + s * 0.42);
    ctx.bezierCurveTo(cx + s * 0.5, cy + s * 0.3, cx + s * 0.55, cy - s * 0.1, cx + s * 0.36, cy - s * 0.38);
    ctx.bezierCurveTo(cx + s * 0.2, cy - s * 0.62, cx - s * 0.2, cy - s * 0.62, cx - s * 0.36, cy - s * 0.38);
  });
  ctx.fillStyle = 'rgba(95,105,95,0.85)';
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(25,32,28,0.6)';
  ctx.lineWidth = 1.3;
  for (let i = -24; i <= 24; i++) {
    const x = cx + i * s * 0.022;
    ctx.beginPath();
    ctx.moveTo(x, cy - s * 0.6);
    ctx.bezierCurveTo(x + i * 1.2, cy - s * 0.1, x + i * 2.2, cy + s * 0.1, x + i * 1.6, cy + s * 0.5);
    ctx.stroke();
  }
  ctx.restore();
  // --- face
  ctx.save();
  path(() => { ctx.ellipse(cx, cy - s * 0.12, s * 0.27, s * 0.36, 0, 0, Math.PI * 2); });
  const fg = ctx.createLinearGradient(cx - s * 0.3, 0, cx + s * 0.3, 0);
  fg.addColorStop(0, '#c9ccbb');
  fg.addColorStop(0.55, '#e4e3d4');
  fg.addColorStop(1, '#9fa694');
  ctx.fillStyle = fg;
  ctx.fill();
  ctx.clip();
  // engraved shading: curved lines following the face
  ctx.strokeStyle = 'rgba(40,52,44,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const y = cy - s * 0.5 + i * s * 0.022;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.3, y);
    ctx.quadraticCurveTo(cx, y + s * 0.06, cx + s * 0.3, y);
    ctx.stroke();
  }
  // right-side shadow
  hatch(ctx, cx + s * 0.08, cy - s * 0.5, cx + s * 0.3, cy + s * 0.25, 3.5, 0.9, 'rgba(30,40,34,0.45)', 1);
  ctx.restore();
  // features
  ctx.strokeStyle = 'rgba(25,32,28,0.85)';
  ctx.lineWidth = 2.2;
  const eye = (ex) => {
    ctx.beginPath();
    ctx.ellipse(ex, cy - s * 0.16, s * 0.05, s * 0.018, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(25,32,28,0.9)';
    ctx.beginPath(); ctx.arc(ex + s * 0.005, cy - s * 0.16, s * 0.013, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ex - s * 0.06, cy - s * 0.21); ctx.quadraticCurveTo(ex, cy - s * 0.235, ex + s * 0.06, cy - s * 0.21); ctx.stroke();
  };
  eye(cx - s * 0.105); eye(cx + s * 0.105);
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.01, cy - s * 0.15);
  ctx.quadraticCurveTo(cx + s * 0.04, cy - s * 0.02, cx - s * 0.03, cy + s * 0.0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.08, cy + s * 0.08);
  ctx.quadraticCurveTo(cx, cy + s * 0.105, cx + s * 0.08, cy + s * 0.08);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.17, cy + s * 0.01); ctx.quadraticCurveTo(cx - s * 0.12, cy + s * 0.1, cx - s * 0.1, cy + s * 0.14);
  ctx.moveTo(cx + s * 0.17, cy + s * 0.01); ctx.quadraticCurveTo(cx + s * 0.12, cy + s * 0.1, cx + s * 0.1, cy + s * 0.14);
  ctx.stroke();
}

function signature(ctx, x, y, w, seed) {
  const r = rng(seed);
  ctx.strokeStyle = 'rgba(25,30,28,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 1; i <= 14; i++) {
    const xx = x + (i / 14) * w;
    ctx.quadraticCurveTo(xx - w / 28, y - 18 - r() * 18, xx, y + (r() - 0.5) * 14);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - 10, y + 22); ctx.lineTo(x + w + 10, y + 22); ctx.stroke();
}

function bellIcon(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y + s * 0.45);
  ctx.bezierCurveTo(x - s * 0.45, y - s * 0.1, x - s * 0.3, y - s * 0.5, x, y - s * 0.5);
  ctx.bezierCurveTo(x + s * 0.3, y - s * 0.5, x + s * 0.45, y - s * 0.1, x + s * 0.5, y + s * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(x, y + s * 0.55, s * 0.1, 0, Math.PI * 2); ctx.fill();
}

function copperGrad(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#d9a24a');
  g.addColorStop(0.35, '#b8752c');
  g.addColorStop(0.6, '#7fae7a');
  g.addColorStop(1, '#c07b33');
  return g;
}

export function drawFront(canvas) {
  const W = (canvas.width = BW), H = (canvas.height = BH);
  const ctx = canvas.getContext('2d');
  paper(ctx, W, H, 11);
  // faint peach/blue tint fields like the modern note
  const tint = ctx.createRadialGradient(W * 0.62, H * 0.55, 10, W * 0.62, H * 0.55, W * 0.35);
  tint.addColorStop(0, 'rgba(240,170,120,0.22)');
  tint.addColorStop(1, 'rgba(240,170,120,0)');
  ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
  microWaves(ctx, W, H, 'rgba(90,110,95,0.10)');
  border(ctx, W, H, GREENGRAY);
  rosette(ctx, W * 0.17, H * 0.52, H * 0.27, 'rgba(80,100,85,0.35)', 1, 3, 0.55, 22);
  rosette(ctx, W * 0.9, H * 0.5, H * 0.28, 'rgba(80,100,85,0.18)', 1, 2, 0.6, 16);

  // watermark area (right): faint portrait
  ctx.save(); ctx.globalAlpha = 0.12; portrait(ctx, W * 0.9, H * 0.48, H * 0.22); ctx.restore();

  // headings
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `bold 34px ${SERIF}`;
  ctx.fillText('FEDERAL RESERVE NOTE', W * 0.5, H * 0.115);
  ctx.font = `bold 66px ${SERIF}`;
  ctx.fillText('THE UNITED STATES OF AMERICA', W * 0.5, H * 0.2);
  ctx.font = `bold 60px ${SERIF}`;
  ctx.fillText('ONE HUNDRED DOLLARS', W * 0.52, H * 0.925);
  ctx.font = `bold 20px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.fillText('THIS NOTE IS LEGAL TENDER', W * 0.08, H * 0.78);
  ctx.fillText('FOR ALL DEBTS, PUBLIC AND PRIVATE', W * 0.08, H * 0.81);

  // corner denominations
  hundred(ctx, 70, 205, 150, INK);
  hundred(ctx, 70, H - 75, 110, INK);
  hundred(ctx, W - 70, 190, 130, INK, 'right');
  hundred(ctx, W - 75, H - 70, 250, copperGrad(ctx, W - 520, H - 300, W - 75, H - 70), 'right', 'rgba(70,40,10,0.5)');

  // seals
  seal(ctx, W * 0.17, H * 0.52, 98, '#1e2420', 'B');
  seal(ctx, W * 0.77, H * 0.36, 78, '#2f7d45', null);

  // serials
  ctx.font = `bold 44px "DejaVu Sans Mono", monospace`;
  ctx.fillStyle = '#2f7d45';
  ctx.textAlign = 'left';
  ctx.fillText('LB 70356214 F', W * 0.07, H * 0.33);
  ctx.textAlign = 'right';
  ctx.fillText('LB 70356214 F', W * 0.93, H * 0.78);

  // blue security ribbon with bells and 100s
  const rx = W * 0.385, rw = 46;
  const rg = ctx.createLinearGradient(rx, 0, rx + rw, 0);
  rg.addColorStop(0, '#1f4fa8'); rg.addColorStop(0.5, '#4f86e0'); rg.addColorStop(1, '#1d4593');
  ctx.fillStyle = rg; ctx.fillRect(rx, 0, rw, H);
  for (let y = 30, i = 0; y < H; y += 62, i++) {
    if (i % 2) bellIcon(ctx, rx + rw / 2, y, 30, 'rgba(210,225,255,0.85)');
    else { ctx.font = `bold 22px ${SERIF}`; ctx.fillStyle = 'rgba(210,225,255,0.85)'; ctx.textAlign = 'center'; ctx.fillText('100', rx + rw / 2, y + 8); }
  }

  // portrait
  portrait(ctx, W * 0.535, H * 0.53, H * 0.42);
  ctx.font = `bold 26px ${SERIF}`; ctx.fillStyle = INK; ctx.textAlign = 'center';
  ctx.fillText('FRANKLIN', W * 0.535, H * 0.86);

  // inkwell with bell (copper -> green shift)
  const ix = W * 0.685, iy = H * 0.6;
  ctx.fillStyle = copperGrad(ctx, ix - 80, iy - 100, ix + 80, iy + 100);
  ctx.beginPath();
  ctx.moveTo(ix - 70, iy + 95); ctx.lineTo(ix + 70, iy + 95);
  ctx.quadraticCurveTo(ix + 92, iy + 10, ix + 52, iy - 45);
  ctx.lineTo(ix + 34, iy - 78); ctx.lineTo(ix - 34, iy - 78); ctx.lineTo(ix - 52, iy - 45);
  ctx.quadraticCurveTo(ix - 92, iy + 10, ix - 70, iy + 95);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,40,10,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  bellIcon(ctx, ix, iy + 15, 70, 'rgba(255,225,160,0.55)');

  signature(ctx, W * 0.27, H * 0.7, 150, 3);
  signature(ctx, W * 0.74, H * 0.74, 150, 9);
  return canvas;
}

export function drawBack(canvas) {
  const W = (canvas.width = BW), H = (canvas.height = BH);
  const ctx = canvas.getContext('2d');
  paper(ctx, W, H, 23);
  microWaves(ctx, W, H, 'rgba(90,110,95,0.10)', 7, 5, 0.017);
  border(ctx, W, H, GREENGRAY);
  ctx.fillStyle = INK; ctx.textAlign = 'center';
  ctx.font = `bold 58px ${SERIF}`;
  ctx.fillText('THE UNITED STATES OF AMERICA', W * 0.45, H * 0.17);
  ctx.font = `bold 40px ${SERIF}`;
  ctx.fillText('IN GOD WE TRUST', W * 0.45, H * 0.255);
  ctx.font = `bold 62px ${SERIF}`;
  ctx.fillText('ONE HUNDRED DOLLARS', W * 0.45, H * 0.93);

  // building (hall with clock tower)
  const bx = W * 0.45, by = H * 0.8;
  ctx.save();
  // sky lines
  ctx.beginPath(); ctx.rect(W * 0.2, H * 0.3, W * 0.5, H * 0.5); ctx.clip();
  for (let y = H * 0.3; y < by; y += 5) {
    ctx.strokeStyle = `rgba(70,90,75,${0.12 + 0.25 * ((y - H * 0.3) / (H * 0.5))})`;
    ctx.beginPath(); ctx.moveTo(W * 0.2, y); ctx.lineTo(W * 0.7, y); ctx.stroke();
  }
  ctx.restore();
  const body = (x0, y0, w, h, dark) => {
    ctx.fillStyle = dark; ctx.fillRect(x0, y0, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    hatch(ctx, x0, y0, x0 + w, y0 + h, 4, 0, 'rgba(15,22,18,0.35)', 1);
    ctx.restore();
  };
  body(bx - 380, by - 150, 760, 150, '#7b8a78');
  body(bx - 120, by - 230, 240, 230, '#6c7c69');
  body(bx - 60, by - 330, 120, 100, '#5e6e5c');
  body(bx - 40, by - 400, 80, 70, '#55654f');
  // spire
  ctx.fillStyle = '#4b5a49';
  ctx.beginPath(); ctx.moveTo(bx - 30, by - 400); ctx.lineTo(bx, by - 470); ctx.lineTo(bx + 30, by - 400); ctx.fill();
  // clock
  ctx.fillStyle = '#dfe0d0'; ctx.beginPath(); ctx.arc(bx, by - 280, 26, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx, by - 280); ctx.lineTo(bx, by - 298); ctx.moveTo(bx, by - 280); ctx.lineTo(bx + 12, by - 276); ctx.stroke();
  // windows
  ctx.fillStyle = '#273129';
  for (let row = 0; row < 2; row++)
    for (let i = -7; i <= 7; i++) {
      if (Math.abs(i) <= 1) continue;
      ctx.fillRect(bx + i * 48 - 12, by - 130 + row * 66, 24, 40);
    }
  for (let row = 0; row < 3; row++) ctx.fillRect(bx - 14, by - 215 + row * 62, 28, 42);
  // trees / ground
  ctx.fillStyle = 'rgba(40,55,42,0.85)';
  for (let i = 0; i < 26; i++) {
    const x = bx - 470 + i * 37;
    ctx.beginPath(); ctx.arc(x, by + 4, 26 + (i % 3) * 6, Math.PI, 0); ctx.fill();
  }
  ctx.fillStyle = INK; ctx.font = `bold 24px ${SERIF}`;
  ctx.fillText('INDEPENDENCE HALL', bx, by + 52);

  // big copper 100
  hundred(ctx, W - 80, H * 0.78, 360, copperGrad(ctx, W - 700, H * 0.3, W - 80, H * 0.8), 'right', 'rgba(70,40,10,0.45)');
  hundred(ctx, 70, 190, 130, INK);
  hundred(ctx, 70, H - 75, 110, INK);
  hundred(ctx, W - 70, 175, 110, INK, 'right');
  return canvas;
}

// side texture: stacked paper edges (repeat vertically)
export function drawEdge(canvas) {
  const W = (canvas.width = 512), H = (canvas.height = 256);
  const ctx = canvas.getContext('2d');
  const r = rng(77);
  for (let y = 0; y < H; y += 4) {
    const l = 200 + r() * 30;
    ctx.fillStyle = `rgb(${l - 12},${l - 4},${l - 26})`;
    ctx.fillRect(0, y, W, 3);
    ctx.fillStyle = `rgba(60,80,60,${0.35 + r() * 0.3})`;
    ctx.fillRect(0, y + 3, W, 1);
  }
  return canvas;
}

// $10,000 currency strap (mustard band)
export function drawStrap(canvas) {
  const W = (canvas.width = 1024), H = (canvas.height = 512);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#c99a2e'); g.addColorStop(0.5, '#e0b54a'); g.addColorStop(1, '#bf8f27');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(90,60,10,0.5)'; ctx.lineWidth = 6; ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.fillStyle = '#3a2808'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold 190px ${SERIF}`;
  ctx.fillText('$10,000', W / 2, H * 0.47);
  ctx.font = `bold 52px ${SERIF}`;
  ctx.fillText('$100  ×  100', W / 2, H * 0.82);
  return canvas;
}
