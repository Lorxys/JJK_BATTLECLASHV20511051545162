// Bâtiments en pixel art isométrique avec 5 états de destruction prédéfinis :
// 0 intact, 1 fissures / vitres brisées, 2 façades arrachées, 3 étages supérieurs détachés, 4 ruines.
import { PB, C, shadeC, mixC, isoBox, inDiamond, OUTLINE } from './pixel.js';
import { hash2, makeRng } from '../util.js';

export const VARIANTS = {
  skytower: { s: 6, h: 250, style: 'glass', glass: '#8cc4ec', extra: 'antenna' },
  tower_glass6: { s: 6, h: 170, style: 'glass', glass: '#9ad0e6' },
  tower_glass5: { s: 5, h: 150, style: 'glass', glass: '#86b6e0' },
  tower_glass3: { s: 3, h: 110, style: 'glass', glass: '#a2cfe0' },
  office6: { s: 6, h: 120, style: 'office', wall: '#cfc8b8' },
  office3: { s: 3, h: 80, style: 'office', wall: '#c9c0ae' },
  office3b: { s: 3, h: 64, style: 'office', wall: '#d9ccb4' },
  office2: { s: 2, h: 44, style: 'office', wall: '#c4b6a2' },
  monument2: { s: 2, h: 14, style: 'monument' },
  house3a: { s: 3, h: 26, style: 'house', roofC: '#c4473a', wall: '#efe2c4' },
  house3b: { s: 3, h: 26, style: 'house', roofC: '#4a6fa8', wall: '#e9dcc0' },
  house3c: { s: 3, h: 24, style: 'house', roofC: '#4f8a5b', wall: '#f2e9d8' },
  apart4: { s: 4, h: 62, style: 'apart', wall: '#e6dccd' },
  apart4b: { s: 4, h: 50, style: 'apart', wall: '#d6dee6' },
  apart3: { s: 3, h: 44, style: 'apart', wall: '#efd9c4' },
  temple4: { s: 4, h: 22, style: 'temple', roofC: '#3f4b52', wall: '#7a3b2a' },
  warehouse6: { s: 6, h: 40, style: 'warehouse', wall: '#8d9aa3' },
  shed4: { s: 4, h: 32, style: 'warehouse', wall: '#a87a5e' },
  factory5: { s: 5, h: 46, style: 'factory', wall: '#a5553f', extra: 'chimney' },
  tank3: { s: 3, h: 40, style: 'tank', wall: '#d8d4cc' },
  crane2: { s: 2, h: 150, style: 'crane' },
  shop3a: { s: 3, h: 42, style: 'shop', wall: '#f2d6dc', neon: '#ff4fa0' },
  shop3b: { s: 3, h: 42, style: 'shop', wall: '#d6eef2', neon: '#3fd3ff' },
  shop3c: { s: 3, h: 38, style: 'shop', wall: '#f5e7c4', neon: '#ffb347' },
  shop4: { s: 4, h: 60, style: 'shop', wall: '#e0d4f0', neon: '#a26bff' },
  shop4b: { s: 4, h: 54, style: 'shop', wall: '#f0e0d0', neon: '#ff5a5a' },
  mall7: { s: 7, h: 80, style: 'mall', wall: '#efe7f2', neon: '#ff4fa0' },
  kiosk2: { s: 2, h: 16, style: 'house', roofC: '#d68a2e', wall: '#f4ead8' },
  gym3: { s: 3, h: 30, style: 'gym', wall: '#dcdcdc' },
  fountain2: { s: 2, h: 6, style: 'fountain' },
};

export function buildingHp(v) {
  const spec = VARIANTS[v];
  if (spec.style === 'crane') return 900;
  return Math.round(spec.s * spec.s * spec.h * 0.9 + 120);
}

const COL = {
  frame: C('#56677e'), frameD: C('#3f4c5e'), refl: C('#d6eefc'),
  win: C('#3f5f82'), winD: C('#2f4866'), lit: C('#f0d77c'), broken: C('#1d191b'),
  interior: C('#2d2523'), slab: C('#6b645c'), rebar: C('#8a4b2e'),
  roof: C('#8e8a84'), roofRim: C('#b3aea6'), roofD: C('#77736d'),
  rubble: [C('#8d877e'), C('#a39d93'), C('#6e6962'), C('#4a4541'), C('#b8b1a6')],
  steel: C('#e2b33a'), steelD: C('#9c7a22'), stone: C('#b9b2a6'), stoneD: C('#8f897f'),
  water: C('#4aa3d8'), waterL: C('#bfe6fa'), bronze: C('#6b5a3a'), bronzeL: C('#9a8256'),
};

// Glyphes pseudo-kanji 5x5 pour les enseignes.
function glyph(pb, x, y, seed, col) {
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const on = (j === 0 || i === 2 || hash2(i, j, seed) > 0.55) && !(j === 4 && i % 2);
    if (on) pb.set(x + i, y + j, col);
  }
}

// Ensemble de fissures déterministe (marches aléatoires) sur les faces.
function crackSet(seed, n, s, h) {
  const rng = makeRng(seed);
  const set = new Set();
  for (let k = 0; k < n; k++) {
    const face = rng() < 0.5 ? 'L' : 'R';
    let u = rng() * s * 16, v = rng() * h * 0.9;
    let a = -Math.PI / 2 + (rng() - 0.5);
    const L = 8 + rng() * 22;
    for (let i = 0; i < L; i++) {
      a += (rng() - 0.5) * 0.9;
      u += Math.cos(a); v -= Math.sin(a);
      set.add(face + (u | 0) + ',' + (v | 0));
      if (rng() < 0.15) set.add(face + ((u | 0) + 1) + ',' + (v | 0));
    }
  }
  return set;
}

// Fenêtres allumées la nuit (calque séparé, non assombri).
let glowPB = null, glowSrc = null, glowN = 0;
const GLOW = { warm: C('#ffd27a'), warmL: C('#ffe9b0'), cool: C('#cfe4ff'), amber: C('#e8a848') };
function addGlow(x, y, src, c) {
  if (!glowPB || x < 0 || y < 0 || x >= glowPB.w || y >= glowPB.h) return;
  glowPB.d[y * glowPB.w + x] = c; glowSrc[y * glowPB.w + x] = src; glowN++;
}

export function drawBuilding(key, state) {
  const spec = VARIANTS[key];
  const s = spec.s, H = spec.h;
  const padX = spec.style === 'crane' ? 44 : 2;
  const hip = spec.style === 'house' || spec.style === 'temple';
  const roofH = hip ? Math.round(s * (spec.style === 'temple' ? 7 : 6)) : 0;
  const extraTop = spec.extra === 'antenna' ? 40 : spec.extra === 'chimney' ? 30 : 8;
  const TOP = H + roofH + extraTop + 2;
  const w = s * 32 + padX * 2, h = TOP + s * 16 + 4;
  const pb = new PB(w, h);
  const gx = s * 16 + padX, gy = TOP;
  const rng = makeRng(key.length * 977 + state * 31 + s);

  if (state >= 4) {
    drawRubble(pb, spec, gx, gy, rng);
    pb.outline(OUTLINE);
    return { canvas: pb.toCanvas(), ox: gx, oy: gy };
  }
  glowPB = new PB(w, h); glowSrc = new Uint32Array(w * h); glowN = 0;
  if (spec.style === 'tank') drawTank(pb, spec, gx, gy, state, rng);
  else if (spec.style === 'crane') drawCrane(pb, spec, gx, gy, state);
  else if (spec.style === 'monument') drawMonument(pb, spec, gx, gy, state);
  else if (spec.style === 'fountain') drawFountain(pb, spec, gx, gy, state);
  else drawBox(pb, spec, key, gx, gy, state, rng, roofH);
  pb.outline(OUTLINE);
  // calque lumineux de nuit : ne garde que les fenêtres restées visibles (pas couvertes par le toit)
  let glow = null;
  if (glowN) {
    for (let i = 0; i < glowSrc.length; i++) if (glowSrc[i] && pb.d[i] !== glowSrc[i]) glowPB.d[i] = 0;
    glow = glowPB.toCanvas();
  }
  glowPB = glowSrc = null;
  return { canvas: pb.toCanvas(), ox: gx, oy: gy, glow };
}

function drawBox(pb, spec, key, gx, gy, state, rng, roofH) {
  const s = spec.s, H = spec.h;
  const fw = s * 16; // largeur d'une face à l'écran
  const wall = C(spec.wall || '#c9c3b6');
  const cracks = state >= 1 ? crackSet(key.length * 13 + state, (state >= 2 ? 7 : 3) * s, s, H) : null;
  const pBroken = [0, 0.25, 0.6, 0.75][state];
  // trous dans les façades (état 2+)
  const holes = [];
  if (state >= 2) {
    const n = 1 + Math.floor(s * 0.8);
    for (let i = 0; i < n; i++) holes.push({ f: rng() < 0.5 ? 'L' : 'R', u: rng() * fw, v: H * (0.25 + rng() * 0.6), r: 3 + rng() * (3 + s) });
  }
  // découpe des étages supérieurs (état 3)
  const cutBase = H * 0.52;
  const cut = (f, u) => cutBase + Math.sin(u * 0.35 + (f === 'L' ? 0 : 2)) * 4 + hash2(u >> 2, f === 'L' ? 1 : 2, 9) * 9;

  let isWin = false, isNeon = false, winId = 0;
  const pattern = (f, u, v) => {
    isWin = false; isNeon = false;
    const lit = f === 'R';
    const base = lit ? wall : shadeC(wall, 0.8);
    switch (spec.style) {
      case 'glass': {
        const g = C(spec.glass);
        const glass = lit ? g : shadeC(g, 0.78);
        if (v % 8 === 0) return lit ? COL.frame : COL.frameD;
        if (u % 8 === 0) return lit ? COL.frame : COL.frameD;
        isWin = true; winId = (u >> 3) * 97 + (v >> 3);
        const refl = (u + v * 0.6) % 37 < 3;
        return refl ? COL.refl : (hash2(u >> 3, v >> 3, 4) < 0.08 ? shadeC(glass, 0.85) : glass);
      }
      case 'office': case 'apart': {
        const fh = spec.style === 'apart' ? 12 : 10;
        const fv = v % fh, fu = u % 8;
        if (spec.style === 'apart' && fv === 1 && v > fh) return shadeC(base, 0.7); // balcons
        if (fv >= 4 && fv <= fh - 3 && fu >= 2 && fu <= 6 && v > 6) {
          isWin = true; winId = (u >> 3) * 131 + Math.floor(v / fh);
          return hash2(u >> 3, Math.floor(v / fh), 7) < 0.18 ? COL.lit : (lit ? COL.win : COL.winD);
        }
        if (v < 2) return shadeC(base, 0.7);
        return base;
      }
      case 'house': case 'temple': {
        if (spec.style === 'temple') {
          const plaster = lit ? C('#efe6d4') : C('#cfc4ae');
          if (u % 12 < 2 || v < 3 || v > H - 3) return base;
          return plaster;
        }
        if (v < 2) return shadeC(base, 0.75);
        if (f === 'R' && u >= fw / 2 - 3 && u < fw / 2 + 2 && v < 12) return C('#7a4b30'); // porte
        const fu = u % 12;
        if (v >= 9 && v <= 15 && fu >= 4 && fu <= 8) { isWin = true; winId = u >> 3; return fu === 6 || v === 12 ? C('#f4f0e6') : (lit ? COL.win : COL.winD); }
        return base;
      }
      case 'warehouse': {
        if (f === 'R' && u > fw * 0.3 && u < fw * 0.62 && v < H * 0.62) return v % 3 === 0 ? C('#6b7076') : C('#8a9096'); // rideau métallique
        if (v > H - 6 && v < H - 2 && u % 10 > 2) { isWin = true; winId = u >> 3; return lit ? COL.win : COL.winD; }
        return u % 3 === 0 ? shadeC(base, 0.85) : base;
      }
      case 'factory': {
        if (v % 5 === 0 || (u + (Math.floor(v / 5) % 2) * 4) % 8 === 0) return shadeC(base, 0.78);
        if (v > H - 16 && v < H - 6 && u % 10 > 2 && u % 10 < 8) { isWin = true; winId = u >> 3; return lit ? C('#c9d7de') : C('#9eadb6'); }
        return base;
      }
      case 'shop': case 'mall': {
        const big = spec.style === 'mall';
        const neon = C(spec.neon);
        if (v < 14) { // vitrine
          if (v < 2 || u % 14 === 0) return C('#4b4450');
          isWin = true; winId = u >> 4;
          return v > 9 ? C('#fff3c4') : (lit ? C('#ffe9a6') : C('#e3c889'));
        }
        if (v < 18) return ((u >> 2) % 2) ? neon : C('#fafafa'); // auvent rayé
        if (big && v > H - 18 && v < H - 4) { isNeon = true; return lit ? shadeC(neon, 0.9) : shadeC(neon, 0.7); }
        if (f === 'R' && !big && u > fw - 12 && u < fw - 3 && v > 22 && v < H - 4) { isNeon = true; return neon; } // enseigne verticale
        const fh = 11;
        if (v % fh >= 4 && v % fh <= 8 && u % 8 >= 2 && u % 8 <= 6) { isWin = true; winId = (u >> 3) * 31 + (v / fh | 0); return lit ? COL.win : COL.winD; }
        return base;
      }
      case 'gym': {
        if (v > H * 0.5 && v < H * 0.5 + 4) return C('#3a6fc4');
        if (v > 6 && v < 12 && u % 10 > 1) { isWin = true; winId = u >> 3; return lit ? COL.win : COL.winD; }
        return base;
      }
    }
    return base;
  };

  // Détails de façade : stores, climatiseurs, enseignes verticales, corniche, salissures et grain du crépi.
  const st = spec.style, block = st === 'office' || st === 'apart';
  const signU = st === 'office' && s >= 3 && hash2(s, H, 5) < 0.75 ? Math.round(fw * 0.12) : -99;
  const signV0 = Math.round(H * 0.35), signV1 = Math.min(H - 6, signV0 + 34);
  const detail = (f, u, v, col) => {
    const lit = f === 'R';
    if (f === 'R' && u >= signU && u < signU + 7 && v >= signV0 && v < signV1) { // enseigne kanji verticale
      if (u === signU || u === signU + 6 || v === signV0 || v === signV1 - 1) return C('#2a2230');
      const gv = (v - signV0 - 1) % 6, gi = u - signU - 1;
      if (gv < 5 && gi < 5 && (gv === 0 || gi === 2 || hash2(gi, gv, ((v - signV0) / 6 | 0) + s) > 0.55)) { isNeon = true; return C(hash2(s, 3, 1) < 0.5 ? '#ff6a8a' : '#7fe0ff'); }
      return C('#5a1f2a');
    }
    if (isWin) {
      if (block && col !== COL.lit && hash2(winId, f === 'L' ? 21 : 23, 3) < 0.3) { // stores à moitié baissés
        const fh = st === 'apart' ? 12 : 10, fv = v % fh;
        if (fv >= fh - 5) { isWin = false; return fv % 2 ? (lit ? C('#d9d2bf') : C('#b3ad9c')) : (lit ? C('#c2bba8') : C('#9c9686'));}
      }
      if (st === 'glass' && u % 8 === 1 && v % 8 > 1) return shadeC(col, 1.12); // reflet sur le bord de la vitre
      return col;
    }
    if (block) {
      const fh = st === 'apart' ? 12 : 10, fv = v % fh, fu = u % 8, wid = (u >> 3) * 131 + Math.floor(v / fh);
      // climatiseur sous la fenêtre
      if (v > fh && (fv === 2 || fv === 3) && fu >= 2 && fu <= 6 && hash2(wid, f === 'L' ? 31 : 37, 4) < 0.28) {
        if (fv === 3) return lit ? C('#e4e2dc') : C('#b8b6b0');
        return fu % 2 ? C('#7b7d82') : (lit ? C('#cfcdc6') : C('#a3a19b'));
      }
      // traînée de pluie sous les fenêtres
      if (fu >= 3 && fu <= 5 && fv < 4 && v > fh && hash2(u, wid, 6) < 0.35) col = shadeC(col, 0.92);
    }
    if (v >= H - 3 && st !== 'glass' && st !== 'house' && st !== 'temple') return v === H - 3 ? shadeC(col, 0.72) : shadeC(col, 1.1); // corniche
    if (v < 5 && st !== 'glass') col = shadeC(col, 0.78 + v * 0.045); // salissure au pied du mur
    const g = hash2(u, v, 77);
    return g < 0.12 ? shadeC(col, 0.94) : g > 0.93 ? shadeC(col, 1.05) : col; // grain du crépi
  };

  const face = (f) => (u, v, x, y) => {
    if (v < 0) return 0;
    if (state >= 3) {
      const c = cut(f, u);
      if (v > c) return 0;
      if (v > c - 2) return COL.slab;
      if (v > c - 4 && (u % 5 === 0)) return COL.rebar;
    }
    let col = detail(f, u, v, pattern(f, u, v));
    if (state >= 1) {
      if (cracks.has(f + u + ',' + v)) return COL.broken;
      if (isWin && hash2(winId, f === 'L' ? 3 : 5, state) < pBroken) {
        return hash2(u, v, 8) < 0.7 ? COL.broken : C('#7fa6c2');
      }
    }
    for (const ho of holes) {
      if (ho.f !== f) continue;
      const d = Math.hypot(u - ho.u, (v - ho.v) * 1.3);
      if (d < ho.r) return (v % 10 === 0) ? COL.slab : COL.interior;
      if (d < ho.r + 1.5) return COL.rubble[(u + v) % 3];
    }
    if (isNeon) addGlow(x, y, col, col);
    else if (isWin) {
      const st = spec.style;
      const p = st === 'shop' || st === 'mall' ? (v < 14 ? 1 : 0.5) : st === 'glass' ? 0.3 : st === 'factory' ? 0.55 : 0.42;
      if (col === COL.lit || hash2(winId, f === 'L' ? 11 : 13, 1) < p) {
        const cool = hash2(winId, 17, 2) < 0.22;
        addGlow(x, y, col, col === C('#f4f0e6') ? GLOW.amber : cool ? GLOW.cool : (v % 3 ? GLOW.warm : GLOW.warmL));
      }
    }
    return col;
  };

  isoBox(pb, gx, gy, s, s, H, { left: face('L'), right: face('R') });

  // Toit
  if (state < 3) {
    if (roofH > 0) drawHipRoof(pb, gx, gy - H, s, roofH, C(spec.roofC), spec.style === 'temple');
    else {
      const top = (x, y) => (hash2(x, y, 3) < 0.04 ? COL.roofD : COL.roof);
      isoBox(pb, gx, gy - H, s, s, 0, { top });
      // rebord
      const p = [[gx, gy - H], [gx + s * 16, gy - H + s * 8], [gx, gy - H + s * 16], [gx - s * 16, gy - H + s * 8]];
      for (let i = 0; i < 4; i++) pb.line(p[i][0], p[i][1], p[(i + 1) % 4][0], p[(i + 1) % 4][1], COL.roofRim);
      roofExtras(pb, spec, gx, gy - H, s, rng);
    }
  }
}

function drawHipRoof(pb, gx, gy, s, R, col, temple) {
  const o = temple ? 4 : 2; // débord
  const top = [gx, gy - o], right = [gx + s * 16 + o * 2, gy + s * 8], bottom = [gx, gy + s * 16 + o], left = [gx - s * 16 - o * 2, gy + s * 8];
  const peak = [gx, gy + s * 8 - R];
  const ridge = temple ? s * 5 : 0;
  const pL = [peak[0] - ridge, peak[1] + ridge / 2], pR = [peak[0] + ridge, peak[1] - ridge / 2];
  const tile = (c) => (x, y) => ((y + (x >> 2)) % 3 === 0 ? shadeC(c, 0.85) : c);
  pb.poly([top, pR, pL], tile(shadeC(col, 0.95)));
  pb.poly([top, right, pR], tile(shadeC(col, 1.05)));
  pb.poly([left, top, pL], tile(shadeC(col, 0.9)));
  pb.poly([left, bottom, pL], tile(shadeC(col, 0.72)));
  pb.poly([bottom, right, pR, pL], tile(shadeC(col, 1.12)));
  pb.line(pL[0], pL[1], pR[0], pR[1], shadeC(col, 0.6));
  pb.line(bottom[0], bottom[1], pL[0], pL[1], shadeC(col, 0.6));
}

function roofExtras(pb, spec, gx, gy, s, rng) {
  const at = (a, b) => [Math.round(gx + 16 * (a - b)), Math.round(gy + 8 * (a + b))];
  const grey = { left: () => C('#9a9690'), right: () => C('#bcb8b1'), top: () => C('#d2cec7') };
  if (spec.extra === 'antenna') {
    const [x, y] = at(s / 2, s / 2);
    isoBox(pb, x, y - 8, 1.2, 1.2, 10, grey);
    pb.line(x, y - 18, x, y - 52, C('#c9c9c9'));
    pb.set(x, y - 53, C('#ff3030')); pb.set(x, y - 54, C('#ff3030'));
    return;
  }
  if (spec.extra === 'chimney') {
    const [x, y] = at(s - 1.4, 0.4);
    const brick = (u, v) => (v % 4 === 0 ? C('#7d3a2b') : C('#a5553f'));
    isoBox(pb, x, y - 2, 0.8, 0.8, 34, { left: (u, v) => shadeC(brick(u, v), 0.8), right: brick, top: () => C('#2a2222') });
    return;
  }
  // garde-corps le long des deux bords arrière (toits plats assez grands)
  if (s >= 3) {
    const rail = C('#d9d6cf'), post = C('#8e8b85');
    for (const [a0, b0, a1, b1] of [[0, 0, s, 0], [0, 0, 0, s]]) {
      const [x0, y0] = at(a0 + 0.15, b0 + 0.15), [x1, y1] = at(a1 - (a1 ? 0.15 : -0.15), b1 - (b1 ? 0.15 : -0.15));
      pb.line(x0, y0 - 4, x1, y1 - 4, rail);
      const L = Math.max(Math.abs(x1 - x0), 1);
      for (let k = 0; k <= L; k += 6) { const t = k / L, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t); pb.line(x, y - 3, x, y, post); }
    }
  }
  const free = [];
  for (let b = 0; b < s - 0.9; b += 1) for (let a = 0; a < s - 0.9; a += 1) free.push([a + 0.2, b + 0.2]);
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  const n = Math.min(free.length, Math.max(1, Math.round(s * 1.2)));
  // tri arrière -> avant pour que les objets se recouvrent correctement
  const picks = free.slice(0, n).sort((p, q) => p[0] + p[1] - q[0] - q[1]);
  for (const [a, b] of picks) {
    const [x, y] = at(a, b), k = rng();
    if (k < 0.22 && s >= 3) { // réservoir d'eau sur pieds
      const tank = (u, v) => (v % 5 === 0 ? C('#7f9aa8') : C('#a9c3cf'));
      for (const [dx, dy] of [[-5, 0], [5, 0], [0, 3]]) pb.line(x + dx, y + dy, x + dx, y + dy - 5, C('#55565c'));
      isoBox(pb, x, y - 5, 0.55, 0.55, 9, { left: (u, v) => shadeC(tank(u, v), 0.8), right: tank, top: () => C('#c7dbe3') });
    } else if (k < 0.55) { // climatiseur avec ventilateur
      isoBox(pb, x, y - 1, 0.55, 0.4, 4, { left: () => C('#a8a49d'), right: (u, v) => (u % 2 ? C('#8f8c86') : C('#c6c2bb')), top: () => C('#dedad3') });
      pb.ellipse(x - 1, y - 5, 3, 1.4, C('#4a4b50'));
      pb.set(x - 1, y - 5, C('#9a9a9a'));
    } else if (k < 0.75) { // bouche d'aération coudée
      isoBox(pb, x, y - 1, 0.18, 0.18, 6, { left: () => C('#8f9196'), right: () => C('#b9bbc0'), top: () => C('#2a2b30') });
      pb.rect(x - 2, y - 9, 4, 2, C('#a4a6ab'));
    } else if (k < 0.88) { // cabanon d'accès à l'escalier
      isoBox(pb, x, y - 1, 0.8, 0.8, 9, { left: (u, v) => (u > 4 && u < 9 && v < 7 ? C('#5d544e') : C('#a9a59d')), right: () => C('#c3bfb7'), top: () => C('#8e8a84') });
    } else { // panneaux solaires
      isoBox(pb, x, y - 1, 0.7, 0.5, 2, { left: () => C('#3a4a6a'), right: () => C('#2f3e5c'), top: (px, py) => ((px + py) % 4 === 0 ? C('#7f97c4') : C('#304a7e')) });
    }
  }
}

function drawTank(pb, spec, gx, gy, state) {
  const s = spec.s, H = state >= 3 ? spec.h * 0.5 : spec.h;
  const cx = gx, cy = gy + s * 8;
  const rx = s * 13, ry = s * 6.5;
  const body = C(spec.wall);
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x + 0.5 - cx) / rx;
    if (Math.abs(dx) > 1) continue;
    const off = Math.sqrt(1 - dx * dx) * ry;
    const shade = dx < -0.4 ? 0.72 : dx < 0.2 ? 0.88 : dx < 0.6 ? 1 : 0.93;
    for (let y = Math.round(cy - H - off); y <= Math.round(cy + off); y++) {
      const v = cy + off - y;
      let c = shadeC(body, shade);
      if (Math.round(v) % 12 === 0) c = shadeC(c, 0.85);
      if (state >= 1 && hash2(x >> 1, y >> 2, state) < 0.06 * state) c = COL.broken;
      pb.set(x, y, c);
    }
  }
  if (state < 3) pb.ellipse(cx, cy - H, rx, ry, (x, y) => (hash2(x, y, 2) < 0.05 ? C('#bdb9b0') : C('#e9e6df')));
  else pb.ellipse(cx, cy - H, rx * 0.9, ry * 0.9, COL.interior);
}

function drawCrane(pb, spec, gx, gy, state) {
  const H = state >= 3 ? spec.h * 0.45 : spec.h;
  const cx = gx, base = gy + spec.s * 8;
  isoBox(pb, gx, gy + 4, 2, 2, 6, { left: () => C('#8c8880'), right: () => C('#a7a39a'), top: () => C('#bdb8af') });
  const L = cx - 3, R = cx + 3;
  pb.line(L, base, L, base - H, COL.steel); pb.line(R, base, R, base - H, COL.steel);
  for (let y = base; y > base - H + 6; y -= 6) { pb.line(L, y, R, y - 6, COL.steelD); pb.line(R, y, L, y - 6, COL.steelD); }
  if (state < 3) {
    const ty = base - H;
    pb.line(cx - 34, ty + 2, cx + 46, ty - 2, COL.steel, 2);
    for (let x = cx - 30; x < cx + 44; x += 5) pb.line(x, ty, x + 4, ty - 3, COL.steelD);
    pb.rect(cx - 36, ty - 2, 7, 6, C('#7a7a7a')); // contrepoids
    pb.rect(cx - 2, ty + 2, 6, 6, C('#f4f0e0')); // cabine
    pb.line(cx + 40, ty, cx + 40, ty + 40, C('#3a3a3a'));
    pb.rect(cx + 38, ty + 40, 5, 3, C('#3a3a3a'));
    pb.line(cx, ty - 14, cx - 34, ty + 2, C('#c9c9c9')); pb.line(cx, ty - 14, cx + 46, ty - 2, C('#c9c9c9'));
    pb.line(cx, ty, cx, ty - 14, COL.steel, 2);
  } else {
    for (let i = 0; i < 6; i++) pb.line(cx - 10 + i * 3, base - H, cx - 14 + i * 5, base - H - 6 + (i % 2) * 4, COL.steelD);
  }
}

function drawMonument(pb, spec, gx, gy, state) {
  const stone = { left: () => COL.stoneD, right: () => COL.stone, top: () => C('#d1cbc0') };
  isoBox(pb, gx, gy + 3, 1.6, 1.6, state >= 2 ? 8 : 14, stone);
  if (state >= 2) return;
  const x = gx, y = gy + 16 - 14;
  // statue : silhouette en bronze, bras levé
  pb.rect(x - 2, y - 18, 5, 10, COL.bronze);
  pb.rect(x - 1, y - 8, 2, 8, COL.bronze); pb.rect(x + 1, y - 8, 2, 8, COL.bronzeL);
  pb.rect(x - 2, y - 23, 4, 4, COL.bronzeL);
  pb.line(x + 3, y - 17, x + 6, y - 26, COL.bronzeL, 2);
  pb.line(x - 3, y - 17, x - 5, y - 10, COL.bronze, 2);
  if (state >= 1) pb.line(x - 2, y - 14, x + 2, y - 11, COL.broken);
}

function drawFountain(pb, spec, gx, gy, state) {
  const stone = { left: () => COL.stoneD, right: () => COL.stone, top: (x, y) => C('#d1cbc0') };
  isoBox(pb, gx, gy, 2, 2, 6, stone);
  pb.poly([[gx, gy - 6 + 3], [gx + 26, gy - 6 + 16], [gx, gy - 6 + 29], [gx - 26, gy - 6 + 16]], state >= 2 ? COL.interior : COL.water);
  if (state >= 2) return;
  isoBox(pb, gx, gy + 12, 0.4, 0.4, 14, stone);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI;
    pb.set(gx + Math.cos(a) * 9, gy - 6 + Math.sin(a) * -6 + 6, COL.waterL);
    pb.set(gx - Math.cos(a) * 9, gy - 6 + Math.sin(a) * -6 + 6, COL.waterL);
  }
  pb.rect(gx - 1, gy - 8, 2, 8, COL.waterL);
}

function drawRubble(pb, spec, gx, gy, rng) {
  const s = spec.s;
  const Hr = Math.min(26, 6 + spec.h * 0.12) * (spec.style === 'fountain' || spec.style === 'monument' ? 0.4 : 1);
  const wall = C(spec.wall || spec.glass || '#a39d93');
  const step = 1 / 16;
  for (let a = 0; a < s; a += step) {
    for (let b = 0; b < s; b += step) {
      const da = a / s - 0.5, db = b / s - 0.5;
      let hgt = Hr * (1 - (da * da + db * db) * 3.2) + (hash2((a * 4) | 0, (b * 4) | 0, 11) - 0.5) * 7;
      if (hgt < 1) continue;
      const x = Math.round(gx + 16 * (a - b)), y = Math.round(gy + 8 * (a + b) + 8 * step * 2);
      const cell = hash2((a * 3) | 0, (b * 3) | 0, 21);
      const col = cell < 0.18 ? wall : cell < 0.24 ? COL.rebar : COL.rubble[Math.floor(hash2((a * 6) | 0, (b * 6) | 0, 5) * 4)];
      for (let k = 0; k < hgt; k++) pb.set(x, y - k, k > hgt - 2 ? shadeC(col, 1.15) : shadeC(col, 0.75 + (k / hgt) * 0.25));
    }
  }
  if (spec.style === 'crane') for (let i = 0; i < 5; i++) pb.line(gx - 30 + i * 12, gy + 10 + i * 2, gx - 10 + i * 12, gy + 2 + i * 3, COL.steel, 2);
  for (let i = 0; i < s * 2; i++) {
    const x = gx + (rng() - 0.5) * s * 20, y = gy + s * 8 + (rng() - 0.5) * s * 8;
    pb.line(x, y, x + (rng() - 0.5) * 8, y - 4 - rng() * 6, COL.rebar);
  }
}
