// Mobilier urbain, véhicules, ombres et textures d'effets, tous dessinés en pixel art.
import { PB, C, shadeC, isoBox, OUTLINE } from './pixel.js';
import { hash2, makeRng } from '../util.js';

// Chaque entrée : { canvas, ox, oy } où (ox, oy) est le point au sol dans le canvas.
const out = {};
const put = (key, pb, ox, oy, outline = true) => { if (outline) pb.outline(OUTLINE); out[key] = { canvas: pb.toCanvas(), ox, oy }; };

export const CAR_COLORS = ['#d64545', '#3f72c9', '#e8e4dc', '#2f2f36', '#e0b33a', '#4aa36a'];
export const CONTAINER_COLORS = ['#c4473a', '#3f72c9', '#3d8f5a', '#d68a2e', '#8a5ab8', '#c4473a'];

function trees() {
  const mk = (key, leaf, leafD, leafL, pine) => {
    const pb = new PB(26, 34);
    pb.rect(12, 20, 3, 13, C('#6e4a2c')); pb.rect(12, 20, 1, 13, C('#4f331d'));
    if (pine) {
      for (let k = 0; k < 3; k++) {
        const y0 = 4 + k * 6, half = 5 + k * 3;
        pb.poly([[13, y0], [13 + half, y0 + 10], [13 - half, y0 + 10]], (x, y) => (x < 13 ? leafD : hash2(x, y, 1) < 0.12 ? leafL : leaf));
      }
    } else {
      const blobs = [[13, 12, 9, 8], [8, 16, 6, 5], [18, 16, 6, 5], [13, 7, 6, 5]];
      for (const [x, y, rx, ry] of blobs) pb.ellipse(x, y, rx, ry, (px, py, dx, dy) => (dy < -0.3 && dx > -0.4 ? leafL : dx < -0.3 || dy > 0.5 ? leafD : hash2(px, py, 3) < 0.1 ? leafL : leaf));
    }
    put(key, pb, 13, 32);
  };
  mk('tree_round', C('#4f9a3c'), C('#3a7a2c'), C('#79c45a'));
  mk('tree_cherry', C('#f0a6c4'), C('#d27ea3'), C('#fbd2e2'));
  mk('tree_pine', C('#2f7a4a'), C('#215a36'), C('#4f9c64'), true);
  const st = new PB(10, 8); st.rect(3, 2, 4, 5, C('#6e4a2c')); st.rect(3, 2, 4, 1, C('#c9a26b')); put('stump', st, 5, 7);
  const bu = new PB(16, 11);
  bu.ellipse(8, 6, 7, 4.5, (x, y, dx, dy) => (dy < -0.2 ? C('#6fb84f') : C('#4a8c38')));
  put('bush', bu, 8, 10);
  const bub = new PB(16, 8); for (let i = 0; i < 6; i++) bub.line(3 + i * 2, 7, 2 + i * 2 + (i % 3), 3, C('#5a4026')); put('bush_b', bub, 8, 7);
}

function street() {
  const pole = C('#5b5f68'), poleL = C('#8a8f99');
  let pb = new PB(14, 38);
  pb.rect(6, 6, 2, 31, pole); pb.rect(7, 6, 1, 31, poleL);
  pb.rect(6, 4, 6, 2, pole); pb.rect(9, 6, 4, 2, C('#fff2b0'));
  pb.rect(5, 35, 4, 2, C('#3d4048'));
  put('lamp', pb, 7, 36);
  pb = new PB(30, 14);
  pb.rect(13, 6, 3, 6, pole); pb.line(15, 10, 27, 12, pole, 2); pb.rect(26, 11, 3, 2, C('#fff2b0'));
  put('lamp_b', pb, 14, 11);

  pb = new PB(8, 12); pb.rect(2, 3, 4, 8, C('#d33b2f')); pb.rect(1, 5, 6, 2, C('#a82a22')); pb.rect(3, 1, 2, 2, C('#d33b2f')); put('hydrant', pb, 4, 11);
  pb = new PB(8, 6); pb.rect(2, 2, 4, 3, C('#a82a22')); put('hydrant_b', pb, 4, 5);

  pb = new PB(10, 26); pb.rect(4, 8, 2, 17, pole); pb.ellipse(5, 5, 4.5, 4.5, C('#2f6cd4')); pb.rect(2, 4, 6, 2, C('#f4f4f4')); put('sign', pb, 5, 25);
  pb = new PB(24, 10); pb.line(3, 8, 18, 5, pole, 2); pb.ellipse(20, 4, 3.5, 3.5, C('#2f6cd4')); put('sign_b', pb, 4, 8);

  pb = new PB(8, 11); pb.rect(1, 2, 6, 8, C('#3f8a5a')); pb.rect(1, 2, 6, 2, C('#2c6a42')); pb.rect(1, 5, 2, 5, C('#2f7049')); put('bin', pb, 4, 10);
  pb = new PB(12, 7); pb.rect(1, 2, 9, 4, C('#3f8a5a')); pb.set(10, 5, C('#c9c3b6')); put('bin_b', pb, 6, 6);

  // Banc (iso, selon x)
  pb = new PB(30, 18);
  const wood = { left: () => C('#8a5a32'), right: () => C('#b07a48'), top: () => C('#c48d58') };
  isoBox(pb, 15 - 6, 4, 0.75, 0.22, 4, wood);
  pb.line(9, 12, 9, 15, C('#3d4048')); pb.line(21, 15, 21, 17, C('#3d4048'));
  put('bench', pb, 15, 13);
  pb = new PB(30, 12); pb.line(4, 8, 24, 6, C('#8a5a32'), 2); pb.line(8, 10, 20, 9, C('#b07a48'), 2); put('bench_b', pb, 15, 9);

  // Barrières
  for (const dir of ['x', 'y']) {
    pb = new PB(20, 14);
    const sx = dir === 'x' ? 1 : -1;
    const p0 = [10 - 8 * sx, 9 - 4], p1 = [10 + 8 * sx, 9 + 4];
    pb.line(p0[0], p0[1] - 5, p1[0], p1[1] - 5, C('#d9d9d9'));
    pb.line(p0[0], p0[1] - 2, p1[0], p1[1] - 2, C('#b8b8b8'));
    pb.line(p0[0], p0[1], p0[0], p0[1] - 6, C('#8a8a8a')); pb.line(p1[0], p1[1], p1[0], p1[1] - 6, C('#8a8a8a'));
    put('fence_' + dir, pb, 10, 9);
    pb = new PB(20, 12); pb.line(p0[0], p0[1], p1[0], p1[1], C('#b8b8b8')); pb.line(p0[0] + 2, p0[1] + 1, p1[0] - 3, p1[1] - 1, C('#8a8a8a'));
    put('fence_' + dir + '_b', pb, 10, 9);
  }

  // Torii du sanctuaire
  pb = new PB(56, 50);
  const red = C('#d2402d'), redD = C('#9c2c1f');
  pb.rect(12, 14, 4, 34, red); pb.rect(12, 14, 1, 34, redD);
  pb.rect(40, 14, 4, 34, red); pb.rect(40, 14, 1, 34, redD);
  pb.rect(4, 6, 48, 4, C('#2b2b2b')); pb.rect(2, 4, 4, 3, C('#2b2b2b')); pb.rect(50, 4, 4, 3, C('#2b2b2b'));
  pb.rect(7, 10, 42, 3, red); pb.rect(9, 18, 38, 3, red); pb.rect(26, 12, 4, 7, red);
  put('torii', pb, 28, 47);
  pb = new PB(56, 30); pb.rect(12, 6, 4, 22, red); pb.line(20, 26, 50, 22, red, 3); pb.rect(30, 20, 20, 3, C('#2b2b2b'));
  put('torii_b', pb, 28, 27);
}

// Véhicules et objets mobiles, deux orientations + épave.
function vehicles() {
  const glass = C('#8fc0e0'), glassD = C('#5d8fb0'), tire = C('#1f1f24');
  const box = (pb, gx, gy, a, b, h, col, opt = {}) => {
    const c = C(col);
    isoBox(pb, gx, gy, a, b, h, {
      left: (u, v) => (opt.win && v >= h - 4 && v <= h - 2 && u % 7 > 1 ? glassD : opt.stripe && v % 3 === 0 ? shadeC(c, 0.62) : shadeC(c, 0.75)),
      right: (u, v) => (opt.win && v >= h - 4 && v <= h - 2 && u % 7 > 1 ? glass : opt.stripe && u % 3 === 0 ? shadeC(c, 0.85) : c),
      top: (x, y) => (opt.roofC ? C(opt.roofC) : shadeC(c, 1.12)),
    });
  };
  const make = (type, colorHex, orient, wreck) => {
    const pb = new PB(64, 52);
    const rot = (a, b) => (orient ? [b, a] : [a, b]);
    const col = wreck ? '#3d3836' : colorHex;
    // le centre de l'empreinte est en (32, 36)
    const topCorner = (a, b) => [Math.round(32 - (16 * a - 16 * b) / 2), Math.round(36 - (8 * a + 8 * b) / 2)];
    const wheels = (a, b) => {
      const [tx, ty] = topCorner(a, b);
      const pts = [[a * 0.15, b], [a * 0.85, b], [a, b * 0.2], [a, b * 0.8]];
      for (const [pa, pbb] of pts) pb.rect(tx + 16 * (pa - pbb) - 1, ty + 8 * (pa + pbb) - 2, 3, 3, tire);
    };
    if (type === 'car') {
      const [a, b] = rot(1.1, 0.55);
      const [tx, ty] = topCorner(a, b);
      box(pb, tx, ty, a, b, wreck ? 4 : 6, col);
      const [ca, cb] = rot(0.6, 0.48);
      const off = orient ? [0.03, 0.25] : [0.25, 0.03];
      const cx0 = tx + 16 * (off[0] - off[1]), cy0 = ty + 8 * (off[0] + off[1]) - (wreck ? 4 : 6);
      isoBox(pb, cx0, cy0, ca, cb, wreck ? 3 : 5, {
        left: () => (wreck ? C('#211d1c') : glassD), right: () => (wreck ? C('#2a2524') : glass), top: () => shadeC(C(col), 1.08),
      });
      wheels(a, b);
    } else if (type === 'van') {
      const [a, b] = rot(1.25, 0.6);
      const [tx, ty] = topCorner(a, b);
      box(pb, tx, ty, a, b, wreck ? 9 : 13, col, { win: !wreck });
      wheels(a, b);
    } else if (type === 'truck') {
      const [a, b] = rot(1.7, 0.65);
      const [tx, ty] = topCorner(a, b);
      box(pb, tx, ty, a, b, wreck ? 10 : 15, wreck ? col : '#e8e4dc', { stripe: true });
      wheels(a, b);
    } else if (type === 'container') {
      const [a, b] = rot(1.6, 0.62);
      const [tx, ty] = topCorner(a, b);
      box(pb, tx, ty, a, b, wreck ? 9 : 13, col, { stripe: true });
    } else if (type === 'vending') {
      const [a, b] = rot(0.42, 0.36);
      const [tx, ty] = topCorner(a, b);
      isoBox(pb, tx, ty, a, b, wreck ? 8 : 17, {
        left: (u, v) => (wreck ? C('#4a4442') : v > 10 ? C('#d7d7d7') : C('#c03535')),
        right: (u, v) => (wreck ? C('#5a5452') : v > 8 && v < 15 && u > 1 && u < 6 ? C('#ffe8a0') : v < 4 ? C('#c03535') : C('#efefef')),
        top: () => (wreck ? C('#5a5452') : C('#f6f6f6')),
      });
    }
    pb.outline(OUTLINE);
    return { canvas: pb.toCanvas(), ox: 32, oy: 36 };
  };
  for (const type of ['car', 'van', 'truck', 'container', 'vending']) {
    const cols = type === 'container' ? CONTAINER_COLORS : CAR_COLORS;
    for (let o = 0; o < 2; o++) {
      cols.forEach((c, i) => { out[`${type}_${i}_${o}`] = make(type, c, o, false); });
      out[`${type}_w_${o}`] = make(type, '#3d3836', o, true);
    }
  }
}

function shadows() {
  const sh = (key, rx, ry) => {
    const pb = new PB(rx * 2 + 2, ry * 2 + 2);
    pb.ellipse(rx + 1, ry + 1, rx, ry, (x, y) => C('#1b1424') & 0x00ffffff | (0x55 << 24));
    out[key] = { canvas: pb.toCanvas(), ox: rx + 1, oy: ry + 1 };
  };
  sh('shadow_s', 7, 3); sh('shadow_m', 11, 5); sh('shadow_l', 18, 8); sh('shadow_xl', 26, 12);
}

function fx() {
  const add = (key, pb, ox, oy) => { out[key] = { canvas: pb.toCanvas(), ox: ox ?? pb.w / 2, oy: oy ?? pb.h / 2 }; };
  let pb;
  for (const n of [1, 2, 3, 4]) { pb = new PB(n, n); pb.rect(0, 0, n, n, C('#ffffff')); add('px' + n, pb); }
  // poussière : 4 tailles
  [2, 3, 5, 7].forEach((r, i) => {
    pb = new PB(r * 2 + 2, r * 2 + 2);
    pb.ellipse(r + 1, r + 1, r, r * 0.85, (x, y, dx, dy) => (dy < -0.2 && dx > -0.3 ? C('#efe9de') : dy > 0.4 ? C('#b3aa9c') : C('#d8d0c2')));
    add('dust' + i, pb);
  });
  // débris
  const debCols = [['#8d877e', '#6e6962'], ['#a39d93', '#7e786d'], ['#b55a42', '#8a4533'], ['#9fd0ee', '#e6f6ff'], ['#5b5f68', '#8a8f99'], ['#4a4541', '#2f2b28']];
  debCols.forEach(([a, b], i) => {
    pb = new PB(4, 4);
    if (i === 3) { pb.rect(0, 0, 2, 2, C(a)); pb.set(0, 0, C(b)); }
    else if (i === 4) { pb.rect(0, 1, 4, 1, C(a)); pb.set(3, 1, C(b)); }
    else { pb.rect(0, 0, 3, 3, C(a)); pb.rect(0, 2, 3, 1, C(b)); pb.set(3, 1, C(b)); }
    add('deb' + i, pb);
  });
  // gros débris (morceaux de façade)
  for (let i = 0; i < 3; i++) {
    pb = new PB(10, 9);
    const r = makeRng(50 + i);
    pb.poly([[1, 2 + r() * 2], [8, 1], [9, 6 + r() * 2], [2, 8]], (x, y) => (y > 5 ? C('#6e6962') : hash2(x, y, i) < 0.2 ? C('#4d6d8f') : C('#a39d93')));
    pb.outline(OUTLINE);
    add('chunk' + i, pb);
  }
  pb = new PB(5, 5); pb.rect(2, 0, 1, 5, C('#ffffff')); pb.rect(0, 2, 5, 1, C('#ffffff')); add('spark', pb);
  // éclat d'impact en étoile (3 images qui s'ouvrent), blanc pour être teinté
  [5, 9, 12].forEach((R, i) => {
    pb = new PB(R * 2 + 3, R * 2 + 3);
    const c = R + 1;
    const pts = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + i * 0.2, r = k % 2 ? R * 0.42 : R * (k % 4 ? 0.8 : 1);
      pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r * 0.8]);
    }
    for (let k = 0; k < 16; k += 2) {
      const a = pts[k], b = pts[(k + 1) % 16], d = pts[(k + 15) % 16];
      pb.poly([[c, c], d, a, b], i === 2 ? C('#cfcfcf') : C('#ffffff'));
    }
    if (i < 2) pb.ellipse(c, c, R * 0.35, R * 0.3, C('#ffffff'));
    else pb.ellipse(c, c, R * 0.5, R * 0.42, (x, y) => { pb.d[y * pb.w + x] = 0; return 0; }); // dernière image évidée
    add('impact' + i, pb);
  });
  // flammes (4 images)
  for (let i = 0; i < 4; i++) {
    pb = new PB(10, 14);
    const r = makeRng(70 + i);
    const h = 9 + i % 2 * 3;
    for (let y = 0; y < h; y++) {
      const half = Math.max(1, Math.round((1 - y / h) * 4 * (0.8 + r() * 0.3)));
      for (let x = -half; x <= half; x++) {
        const t = Math.abs(x) / (half + 0.01);
        pb.set(5 + x + Math.round(Math.sin(y * 0.6 + i) * 1), 13 - y, t < 0.35 && y < h * 0.6 ? C('#fff3a0') : t < 0.7 ? C('#ffa22e') : C('#e2421f'));
      }
    }
    add('flame' + i, pb, 5, 13);
  }
  // orbes
  const orb = (key, r, core, mid, rim) => {
    pb = new PB(r * 2 + 4, r * 2 + 4);
    pb.ellipse(r + 2, r + 2, r + 1.5, r + 1.5, C(rim));
    pb.ellipse(r + 2, r + 2, r, r, C(mid));
    pb.ellipse(r + 1, r + 1, r * 0.5, r * 0.5, C(core));
    add(key, pb);
  };
  orb('orb_blue', 7, '#e8f4ff', '#3d8bff', '#16307a');
  orb('orb_red', 6, '#fff0e8', '#ff3b3b', '#7a1010');
  orb('orb_purple', 16, '#f6e8ff', '#a24bff', '#3a1070');
  orb('orb_curse', 4, '#e0b0ff', '#5a1a7a', '#1b0a24');
  orb('orb_curse_big', 7, '#ffb0d0', '#8a1a4a', '#2a0a14');
  // flèche de feu
  pb = new PB(30, 11);
  for (let x = 0; x < 30; x++) {
    const half = x > 22 ? Math.round((30 - x) * 0.6) : Math.max(1, Math.round(x * 0.18));
    for (let y = -half; y <= half; y++) pb.set(x, 5 + y, Math.abs(y) < half * 0.4 ? C('#fff6c0') : Math.abs(y) < half * 0.8 ? C('#ff9a1e') : C('#d2301a'));
  }
  add('fire_arrow', pb, 22, 5);
  // croissant de coup (balayage)
  pb = new PB(28, 28);
  pb.ellipse(14, 14, 13, 13, (x, y, dx, dy) => {
    const d = Math.hypot(dx, dy), d2 = Math.hypot(dx + 0.35, dy);
    return d < 1 && d2 > 0.9 && dx > -0.2 ? (d > 0.86 ? C('#ffffff') : C('#cfe6ff')) : 0;
  });
  add('swipe', pb);
  pb = new PB(28, 28);
  pb.ellipse(14, 14, 13, 13, (x, y, dx, dy) => {
    const d = Math.hypot(dx, dy), d2 = Math.hypot(dx + 0.35, dy);
    return d < 1 && d2 > 0.9 && dx > -0.2 ? (d > 0.86 ? C('#ffffff') : C('#ff6b6b')) : 0;
  });
  add('swipe_red', pb);
  // étoile pour l'Unlimited Void
  pb = new PB(5, 5); pb.set(2, 0, C('#ffffff')); pb.set(2, 4, C('#ffffff')); pb.set(0, 2, C('#ffffff')); pb.set(4, 2, C('#ffffff')); pb.rect(1, 1, 3, 3, C('#e8f0ff')); add('star', pb);
  // marqueur de visée au sol
  pb = new PB(9, 5); pb.line(0, 2, 4, 0, C('#ffffff')); pb.line(4, 0, 8, 2, C('#ffffff')); pb.line(8, 2, 4, 4, C('#ffffff')); pb.line(4, 4, 0, 2, C('#ffffff')); add('reticle', pb);
  shrine();
}

// Sanctuaire de Malevolent Shrine : temple sombre à mâchoires, cornes et ossements.
function shrine() {
  const pb = new PB(110, 110);
  const cx = 55, base = 100;
  const bone = C('#e8dcc4'), boneD = C('#b5a688'), dark = C('#2a1214'), wood = C('#5a1c1c'), woodL = C('#7a2a24');
  // tas d'ossements
  for (let i = 0; i < 260; i++) {
    const a = (i * 2.399) % 6.283, r = Math.sqrt(i / 260) * 46;
    const x = cx + Math.cos(a) * r, y = base - 4 + Math.sin(a) * r * 0.42;
    pb.ellipse(x, y, 2.5, 1.8, i % 5 === 0 ? boneD : bone);
    if (i % 9 === 0) { pb.set(x - 1, y, dark); pb.set(x + 1, y, dark); }
  }
  // piliers
  for (const px of [cx - 24, cx + 20]) { pb.rect(px, 44, 5, 52, wood); pb.rect(px + 3, 44, 2, 52, woodL); }
  // corps et bouche
  pb.rect(cx - 22, 52, 44, 30, dark);
  for (let i = 0; i < 10; i++) {
    pb.poly([[cx - 20 + i * 4, 52], [cx - 16 + i * 4, 52], [cx - 18 + i * 4, 60]], bone);
    pb.poly([[cx - 20 + i * 4, 82], [cx - 16 + i * 4, 82], [cx - 18 + i * 4, 74]], bone);
  }
  // toits superposés
  const roof = (y, half, h) => {
    pb.poly([[cx - half, y + h], [cx + half, y + h], [cx + half - 8, y], [cx - half + 8, y]], (x, yy) => (yy > y + h - 2 ? C('#120808') : C('#3a1414')));
    pb.poly([[cx - half - 4, y + h], [cx - half + 4, y + h - 2], [cx - half, y + h + 3]], C('#3a1414'));
    pb.poly([[cx + half + 4, y + h], [cx + half - 4, y + h - 2], [cx + half, y + h + 3]], C('#3a1414'));
  };
  roof(36, 38, 12); roof(18, 28, 12);
  // cornes
  pb.line(cx - 10, 20, cx - 22, 2, bone, 3); pb.line(cx + 10, 20, cx + 22, 2, bone, 3);
  // yeux
  pb.rect(cx - 8, 42, 4, 3, C('#ff2a2a')); pb.rect(cx + 4, 42, 4, 3, C('#ff2a2a'));
  pb.outline(OUTLINE);
  out.shrine = { canvas: pb.toCanvas(), ox: cx, oy: base };
}

export function makePropArt() {
  trees(); street(); vehicles(); shadows(); fx();
  return out;
}
