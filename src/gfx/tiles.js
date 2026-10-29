// Cases de sol isométriques (32x16) et tampons de dégâts au sol (cratères, brûlures).
import { PB, C, inDiamond, shadeC } from './pixel.js';
import { hash2, makeRng } from '../util.js';
import { T } from '../world/citygen.js';

const P = {
  water: [C('#3d7fc4'), C('#4a8fd3'), C('#326fb0'), C('#d4ecf7')],
  prom: [C('#cbbf9f'), C('#bfb291'), C('#d8cdb0')],
  road: [C('#4b4d56'), C('#55575f'), C('#42444c')],
  line: C('#ecebe4'), lineY: C('#f2c94c'),
  side: [C('#bdb8ae'), C('#a7a297'), C('#cbc7bd')],
  grass: [C('#5fa84a'), C('#6bb653'), C('#55993f'), C('#82cc63')],
  plaza: [C('#d5c9b1'), C('#c6b89e'), C('#e0d6c1')],
  conc: [C('#9e988c'), C('#918b7f'), C('#aaa497'), C('#7e786d')],
  path: [C('#cba878'), C('#b99566'), C('#d8b98b')],
  field: [C('#6cb050'), C('#79bd5b'), C('#f1f1e8')],
  pond: [C('#3a8fae'), C('#4aa0bd'), C('#2d7c99'), C('#5fae4a')],
};

// Coordonnées locales isométriques d'un pixel de case : tx selon x du monde, ty selon y (0..1).
const local = (X, Y) => [(X + 0.5) / 32 + (Y + 0.5) / 16 - 0.5, (Y + 0.5) / 16 - (X + 0.5) / 32 + 0.5];

function tile(seed, fn) {
  const pb = new PB(32, 16);
  for (let Y = 0; Y < 16; Y++) for (let X = 0; X < 32; X++) {
    if (!inDiamond(X, Y)) continue;
    const [tx, ty] = local(X, Y);
    pb.set(X, Y, fn(X, Y, tx, ty, hash2(X, Y, seed)));
  }
  return pb;
}
const near = (v, step, w) => { const f = (v * step) % 1; return f < w || f > 1 - w; };

// Variante de case selon le type, la voirie et la position.
export function makeTileSet() {
  const set = {};
  const v = (k, n, f) => { set[k] = []; for (let i = 0; i < n; i++) set[k].push(f(i).toCanvas()); };

  v('water', 3, (s) => tile(10 + s, (X, Y, tx, ty, h) => {
    const wave = Math.sin((tx * 3 + ty * 1.2 + s * 0.3) * 6.28) > 0.86;
    return wave ? P.water[1] : h < 0.04 ? P.water[2] : P.water[0];
  }));
  v('waterEdge', 1, () => tile(14, (X, Y, tx, ty, h) => (h < 0.5 ? P.water[3] : P.water[1])));
  v('prom', 2, (s) => tile(20 + s, (X, Y, tx, ty, h) => (near(tx, 4, 0.04) ? P.prom[1] : h < 0.08 ? P.prom[2] : P.prom[0])));
  v('road', 3, (s) => tile(30 + s, (X, Y, tx, ty, h) => (h < 0.06 ? P.road[1] : h > 0.95 ? P.road[2] : P.road[0])));
  v('side', 2, (s) => tile(40 + s, (X, Y, tx, ty, h) => (near(tx, 2, 0.05) || near(ty, 2, 0.05) ? P.side[1] : h < 0.05 ? P.side[2] : P.side[0])));
  v('grass', 4, (s) => tile(50 + s, (X, Y, tx, ty, h) => (h < 0.05 ? P.grass[3] : h < 0.22 ? P.grass[2] : h > 0.8 ? P.grass[1] : P.grass[0])));
  v('plaza', 2, (s) => tile(60 + s, (X, Y, tx, ty, h) => {
    if (near(tx, 2, 0.04) || near(ty, 2, 0.04)) return P.plaza[1];
    const chk = (Math.floor(tx * 2) + Math.floor(ty * 2) + s) % 2;
    return h < 0.04 ? P.plaza[2] : chk ? P.plaza[0] : shadeC(P.plaza[0], 0.95);
  }));
  v('conc', 3, (s) => tile(70 + s, (X, Y, tx, ty, h) => {
    if (near(tx, 1, 0.03)) return P.conc[1];
    const stain = hash2(Math.floor(tx * 3), Math.floor(ty * 3), 77 + s) < 0.15;
    return h < 0.03 ? P.conc[3] : stain ? P.conc[1] : h > 0.9 ? P.conc[2] : P.conc[0];
  }));
  v('parking', 1, () => tile(80, (X, Y, tx, ty, h) => (ty < 0.07 && tx > 0.1 ? P.line : h < 0.06 ? P.road[1] : P.road[0])));
  v('path', 2, (s) => tile(90 + s, (X, Y, tx, ty, h) => (h < 0.08 ? P.path[1] : h > 0.93 ? P.path[2] : P.path[0])));
  v('field', 2, (s) => tile(100 + s, (X, Y, tx, ty, h) => (s ? P.field[1] : P.field[0])));
  v('pond', 2, (s) => tile(110 + s, (X, Y, tx, ty, h) => {
    if (s && Math.hypot(tx - 0.4, ty - 0.6) < 0.16) return P.pond[3];
    return h < 0.05 ? P.pond[1] : P.pond[0];
  }));

  // Routes : marquages au sol.
  const roadMark = (dirX, lane, cross) => tile(120, (X, Y, tx, ty, h) => {
    const base = h < 0.06 ? P.road[1] : h > 0.95 ? P.road[2] : P.road[0];
    const along = dirX ? tx : ty, across = dirX ? ty : tx;
    if (cross) return Math.floor(along * 5) % 2 === 0 && across > 0.12 && across < 0.88 ? P.line : base;
    if (lane === 0 && across > 0.9 && along > 0.2 && along < 0.7) return P.line;
    return base;
  });
  set.roadX0 = [roadMark(true, 0, false).toCanvas()];
  set.roadY0 = [roadMark(false, 0, false).toCanvas()];
  set.crossX = [roadMark(false, 0, true).toCanvas()];
  set.crossY = [roadMark(true, 0, true).toCanvas()];
  return set;
}

// Choix de la case à dessiner pour la position (x, y).
export function tileFor(set, map, x, y) {
  const N = map.n;
  const i = y * N + x;
  const t = map.ground[i];
  const h = Math.floor(hash2(x, y, 5) * 1000);
  const pickV = (k) => set[k][h % set[k].length];
  switch (t) {
    case T.WATER: {
      const land = (a, b) => a >= 0 && b >= 0 && a < N && b < N && map.ground[b * N + a] !== T.WATER;
      if (land(x - 1, y) || land(x, y - 1) || land(x + 1, y) || land(x, y + 1)) return set.waterEdge[0];
      return pickV('water');
    }
    case T.PROM: return pickV('prom');
    case T.ROAD: {
      const r = map.road[i];
      const ax = r & 1, ay = r & 2;
      if (ax && ay) return pickV('road');
      // passage piéton à l'approche d'un carrefour
      if (ax) {
        const nx = (dx) => map.road[y * N + x + dx] & 2;
        if (nx(1) || nx(-1)) return set.crossX[0];
        return ((r >> 2) & 1) === 0 && x % 2 === 0 ? set.roadX0[0] : pickV('road');
      }
      if (ay) {
        const ny = (dy) => map.road[(y + dy) * N + x] & 1;
        if (ny(1) || ny(-1)) return set.crossY[0];
        return ((r >> 3) & 1) === 0 && y % 2 === 0 ? set.roadY0[0] : pickV('road');
      }
      return pickV('road');
    }
    case T.SIDEWALK: return pickV('side');
    case T.GRASS: return pickV('grass');
    case T.PLAZA: return pickV('plaza');
    case T.CONCRETE: return pickV('conc');
    case T.PARKING: return set.parking[0];
    case T.PATH: return pickV('path');
    case T.FIELD: return set.field[(x + y) % 2];
    case T.POND: return pickV('pond');
    default: return pickV('grass');
  }
}

// --- Tampons de dégâts au sol (pixels opaques uniquement pour éviter tout fondu) ---
const DMG = {
  hole: C('#2a2629'), deep: C('#1c191c'), rim: C('#6f6a63'), rim2: C('#8c867c'),
  crack: C('#26232a'), scorch: C('#2f2a28'), scorch2: C('#45403a'), ember: C('#d9572b'),
};

export function makeCrater(r, seed) {
  const rng = makeRng(seed);
  const rx = Math.round(r * 22), ry = Math.round(r * 11);
  const pb = new PB(rx * 2 + 16, ry * 2 + 12);
  const cx = pb.w / 2, cy = pb.h / 2;
  // fissures rayonnantes
  for (let k = 0; k < 5 + r * 2; k++) {
    let a = rng() * 6.28, x = cx, y = cy;
    const L = rx * (0.9 + rng() * 0.5);
    for (let s = 0; s < L; s++) {
      a += (rng() - 0.5) * 0.6;
      x += Math.cos(a); y += Math.sin(a) * 0.5;
      pb.set(x, y, DMG.crack);
    }
  }
  pb.ellipse(cx, cy, rx * 0.95 + 1, ry * 0.95 + 1, (x, y, dx, dy) => {
    const d = Math.hypot(dx, dy) + (rng() - 0.5) * 0.18;
    if (d > 0.98) return 0;
    if (d > 0.78) return rng() < 0.5 ? DMG.rim : DMG.rim2;
    return d < 0.45 ? DMG.deep : DMG.hole;
  });
  return pb.toCanvas();
}

export function makeScorch(r, seed) {
  const rng = makeRng(seed);
  const rx = Math.round(r * 22), ry = Math.round(r * 11);
  const pb = new PB(rx * 2 + 4, ry * 2 + 4);
  pb.ellipse(pb.w / 2, pb.h / 2, rx, ry, (x, y, dx, dy) => {
    const d = Math.hypot(dx, dy) + (rng() - 0.5) * 0.35;
    if (d > 0.95) return 0;
    if (d < 0.3 && rng() < 0.05) return DMG.ember;
    return d < 0.6 ? DMG.scorch : rng() < 0.6 ? DMG.scorch2 : 0;
  });
  return pb.toCanvas();
}

export function makeCrackStamp(seed) {
  const rng = makeRng(seed);
  const pb = new PB(48, 24);
  for (let k = 0; k < 3; k++) {
    let a = rng() * 6.28, x = 24, y = 12;
    for (let s = 0; s < 22; s++) {
      a += (rng() - 0.5) * 0.9;
      x += Math.cos(a); y += Math.sin(a) * 0.5;
      pb.set(x, y, DMG.crack);
    }
  }
  return pb.toCanvas();
}
export const DMG_COLORS = DMG;

// --- Détails superposés aux cases (32x16, même cadrage qu'une case) ---
// Choisis par tileDecals() selon le type de sol, la position et les cases voisines.
function decal(seed, fn) {
  const pb = new PB(32, 16);
  const rng = makeRng(seed);
  for (let Y = 0; Y < 16; Y++) for (let X = 0; X < 32; X++) {
    if (!inDiamond(X, Y)) continue;
    const [tx, ty] = local(X, Y);
    const c = fn(X, Y, tx, ty, hash2(X, Y, seed), rng);
    if (c) pb.set(X, Y, c);
  }
  return pb.toCanvas();
}
const A = (hex, a) => C(hex + Math.round(a * 255).toString(16).padStart(2, '0'));

export function makeDecals() {
  const D = {};
  const many = (k, n, f) => { D[k] = []; for (let i = 0; i < n; i++) D[k].push(f(i)); };
  // plaque d'égout : disque en fonte quadrillé avec rebord
  D.manhole = [decal(1, (X, Y) => {
    const d = Math.hypot((X + 0.5 - 16) / 6, (Y + 0.5 - 8) / 3);
    if (d > 1) return 0;
    if (d > 0.8) return C('#6b6d75');
    return (X + Y) % 3 === 0 ? C('#2c2d33') : C('#3c3e45');
  })];
  // grille d'évacuation le long du trottoir
  D.grate = [decal(2, (X, Y, tx, ty) => (tx > 0.4 && tx < 0.62 && ty > 0.08 && ty < 0.22 ? (X % 2 ? C('#1e1f24') : C('#5a5c63')) : 0))];
  // fissures dans l'asphalte
  many('crack', 3, (s) => {
    const pb = new PB(32, 16), rng = makeRng(30 + s);
    let x = 8 + rng() * 16, y = 5 + rng() * 6, a = rng() * 6.28;
    for (let i = 0; i < 16; i++) { a += (rng() - 0.5) * 1.1; x += Math.cos(a); y += Math.sin(a) * 0.5; if (inDiamond(x | 0, y | 0)) pb.set(x, y, C('#34363d')); if (rng() < 0.2 && inDiamond((x | 0) + 1, y | 0)) pb.set(x + 1, y, C('#5d5f67')); }
    return pb.toCanvas();
  });
  // taches d'huile
  many('oil', 2, (s) => decal(40 + s, (X, Y) => {
    const d = Math.hypot((X + 0.5 - 15 - s * 3) / (5 + s), (Y + 0.5 - 8) / (2.4 + s * 0.5)) + hash2(X, Y, 41 + s) * 0.35;
    return d < 0.9 ? A('#26272d', d < 0.5 ? 0.55 : 0.35) : 0;
  }));
  // trottoir : dalles fendues, chewing-gums, feuilles mortes
  many('sideDirt', 3, (s) => decal(50 + s, (X, Y, tx, ty, h) => {
    if (h < 0.025) return C('#8e8a82');
    if (s === 2 && h > 0.985) return [C('#c9772e'), C('#a8572a'), C('#d9a441')][(X + Y) % 3];
    return 0;
  }));
  // herbe : touffes, fleurs blanches, jaunes et roses
  many('tuft', 4, (s) => {
    const pb = new PB(32, 16), rng = makeRng(60 + s);
    for (let k = 0; k < 7; k++) {
      const x = 6 + rng() * 20 | 0, y = 4 + rng() * 9 | 0;
      if (!inDiamond(x, y) || !inDiamond(x, y - 2)) continue;
      pb.set(x, y, C('#3f7f30')); pb.set(x, y - 1, C('#4f9a3c')); pb.set(x + 1, y - 1, C('#79c45a'));
      if (rng() < 0.3) pb.set(x - 1, y - 2, C('#8fd66b'));
    }
    if (s >= 2) for (let k = 0; k < 4; k++) {
      const x = 6 + rng() * 20 | 0, y = 4 + rng() * 9 | 0;
      if (inDiamond(x, y)) pb.set(x, y, [C('#f6f4ea'), C('#f2d34a'), C('#f2a6c8')][(k + s) % 3]);
    }
    return pb.toCanvas();
  });
  // ombre portée au pied d'un bâtiment (bord de la case qui touche le mur) et bordure de trottoir
  const edge = (side, w, col) => decal(70, (X, Y, tx, ty, h) => {
    const d = side === 'xm' ? tx : side === 'ym' ? ty : side === 'xp' ? 1 - tx : 1 - ty;
    if (d > w) return 0;
    return typeof col === 'function' ? col(d / w, h) : col;
  });
  for (const s of ['xm', 'ym']) D['ao_' + s] = [edge(s, 0.34, (k, h) => (h > k * 0.9 ? A('#0a0c18', 0.42 - k * 0.3) : 0))];
  for (const s of ['xm', 'ym', 'xp', 'yp']) {
    D['curb_' + s] = [edge(s, 0.07, C('#e2ded4'))];          // arête claire du trottoir
    D['gutter_' + s] = [edge(s, 0.08, A('#121318', 0.45))];  // caniveau sombre côté route
  }
  return D;
}

// Liste des détails à poser sur la case (x, y).
export function tileDecals(D, map, x, y, isBuilding) {
  const N = map.n, t = map.ground[y * N + x], h = hash2(x, y, 91);
  const at = (a, b) => (a >= 0 && b >= 0 && a < N && b < N ? map.ground[b * N + a] : -1);
  const out = [];
  const pick = (k) => D[k][Math.floor(hash2(x, y, 92) * D[k].length)];
  if (t === T.ROAD) {
    if (h < 0.035) out.push(D.manhole[0]);
    else if (h < 0.11) out.push(pick('crack'));
    else if (h < 0.16) out.push(pick('oil'));
    for (const [dx, dy, s] of [[-1, 0, 'xm'], [1, 0, 'xp'], [0, -1, 'ym'], [0, 1, 'yp']]) if (at(x + dx, y + dy) === T.SIDEWALK) {
      out.push(D['gutter_' + s][0]);
      if (h > 0.9 && (s === 'xm' || s === 'ym')) out.push(D.grate[0]);
    }
  } else if (t === T.SIDEWALK) {
    if (h < 0.4) out.push(pick('sideDirt'));
    for (const [dx, dy, s] of [[-1, 0, 'xm'], [1, 0, 'xp'], [0, -1, 'ym'], [0, 1, 'yp']]) if (at(x + dx, y + dy) === T.ROAD) out.push(D['curb_' + s][0]);
  } else if (t === T.GRASS || t === T.FIELD) {
    if (h < 0.6) out.push(pick('tuft'));
  } else if (t === T.PARKING || t === T.CONCRETE) {
    if (h < 0.12) out.push(pick('oil'));
    else if (h < 0.2) out.push(pick('crack'));
  }
  // ombre de contact des murs visibles des bâtiments voisins
  if (isBuilding(x - 1, y)) out.push(D.ao_xm[0]);
  if (isBuilding(x, y - 1)) out.push(D.ao_ym[0]);
  return out;
}
