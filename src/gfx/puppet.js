// Personnages et fléaux : planches de sprites générées image par image à partir de poses
// (squelette simple), puis contourées et ombrées à la main façon 16 bits.
import { PB, C, shadeC, OUTLINE } from './pixel.js';
import { hash2 } from '../util.js';

const seg = (x, y, a, l) => [x + Math.sin(a) * l, y + Math.cos(a) * l];
const lerp = (a, b, t) => a + (b - a) * t;

function limb(pb, pts, w, col) {
  for (let i = 0; i < pts.length - 1; i++) pb.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], OUTLINE, w + 2);
  for (let i = 0; i < pts.length - 1; i++) pb.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], col, w);
}

const BASE = { bob: 0, lean: 0.05, nt: 0.08, nk: 0.1, ft: -0.08, fk: 0.1, nua: 0.15, nfa: 0.35, fua: -0.1, ffa: 0.1, ht: 0 };
const p = (o) => Object.assign({}, BASE, o);
const mirror = (q) => p(Object.assign({}, q, { nt: q.ft, nk: q.fk, ft: q.nt, fk: q.nk, nua: q.fua, nfa: q.ffa, fua: q.nua, ffa: q.nfa }));

// --- Rendu d'un humanoïde ---
function drawHumanoid(pb, P, q, back, ox, oy) {
  const col = P.col;
  const lean = q.lean + (P.lean || 0);
  let hip = [ox, oy - P.thigh - P.shin - 2];
  const legs = (t, k, side) => {
    const h0 = [hip[0] + side, hip[1]];
    const knee = seg(h0[0], h0[1], t, P.thigh);
    const foot = seg(knee[0], knee[1], t - k, P.shin);
    return [h0, knee, foot];
  };
  let nl = legs(q.nt, q.nk, 1), fl = legs(q.ft, q.fk, -1);
  // contact au sol automatique, puis rebond
  const low = Math.max(nl[2][1], fl[2][1]);
  const dy = (q.air ? 0 : oy - 1 - low) + q.bob;
  const sh = (pt) => [pt[0], pt[1] + dy];
  hip = sh(hip); nl = nl.map(sh); fl = fl.map(sh);
  const neck = [hip[0] + Math.sin(lean) * P.torso, hip[1] - Math.cos(lean) * P.torso];
  const perp = [Math.cos(lean), Math.sin(lean)];
  const nS = [neck[0] + perp[0] * 1.5, neck[1] + 2], fS = [neck[0] - perp[0] * 1.5, neck[1] + 2];
  const arm = (S, ua, fa) => { const e = seg(S[0], S[1], ua, P.uarm); const hnd = seg(e[0], e[1], fa, P.farm); return [S, e, hnd]; };
  const na = arm(nS, q.nua, q.nfa), fa = arm(fS, q.fua, q.ffa);

  const drawLeg = (L, dark) => {
    limb(pb, [L[0], L[1], L[2]], P.legW, dark ? (col.pantsD || shadeC(col.pants, 0.8)) : col.pants);
    const f = L[2];
    if (P.feet === 'claw') { pb.rect(f[0] - 1, f[1] - 1, 4, 2, OUTLINE); pb.rect(f[0], f[1] - 1, 3, 1, col.shoe); }
    else { pb.rect(f[0] - 2, f[1] - 2, 6, 3, OUTLINE); pb.rect(f[0] - 1, f[1] - 1, 5, 2, dark ? shadeC(col.shoe, 0.8) : col.shoe); }
  };
  const drawArm = (A, dark) => {
    const c = dark ? (col.topD || shadeC(col.top, 0.8)) : col.top;
    limb(pb, [A[0], A[1]], P.armW, c);
    const fc = P.bareForearm ? (dark ? col.skinD : col.skin) : c;
    if (P.blade) limb(pb, [A[1], A[2], seg(A[2][0], A[2][1], (q.blade ?? 0.5) + Math.atan2(A[2][0] - A[1][0], A[2][1] - A[1][1]), P.blade)], P.armW - 1, dark ? shadeC(col.accent, 0.8) : col.accent);
    else limb(pb, [A[1], A[2]], P.armW, fc);
    if (P.tattoo && !back) { const m = [(A[1][0] + A[2][0]) / 2, (A[1][1] + A[2][1]) / 2]; pb.set(m[0], m[1], OUTLINE); }
    const hnd = A[2];
    pb.rect(hnd[0] - 1, hnd[1] - 1, P.hand + 2, P.hand + 2, OUTLINE);
    pb.rect(hnd[0], hnd[1], P.hand, P.hand, dark ? col.skinD : col.skin);
    if (q.point && !dark) { const t = seg(hnd[0], hnd[1], q.nfa, 3); pb.line(hnd[0] + 1, hnd[1], t[0] + 1, t[1], col.skin); }
  };

  // Traînée de mouvement (smear) : positions intermédiaires du membre qui frappe, en couleur claire.
  const trailCol = P.trail || C('#ffffff');
  const drawTrail = (part) => {
    const tr = q.trail;
    if (!tr || tr.part !== part) return;
    for (const k of [0.3, 0.65]) {
      if (part === 'na' || part === 'fa') {
        const n = part === 'na';
        const A = arm(n ? nS : fS, lerp(tr.a[0], n ? q.nua : q.fua, k), lerp(tr.a[1], n ? q.nfa : q.ffa, k));
        pb.line(A[0][0], A[0][1], A[1][0], A[1][1], trailCol, P.armW);
        pb.line(A[1][0], A[1][1], A[2][0], A[2][1], trailCol, P.armW + 1);
      } else {
        const n = part === 'nl';
        const L = legs(lerp(tr.a[0], n ? q.nt : q.ft, k), lerp(tr.a[1], n ? q.nk : q.fk, k), n ? 1 : -1);
        pb.line(L[0][0], L[0][1], L[1][0], L[1][1], trailCol, P.legW);
        pb.line(L[1][0], L[1][1], L[2][0], L[2][1], trailCol, P.legW + 1);
      }
    }
  };
  const first = back ? 'na' : 'fa', last = back ? 'fa' : 'na';
  drawTrail(first);
  drawArm(first === 'na' ? na : fa, true);
  drawTrail('fl');
  drawLeg(fl, true);
  drawTrail('nl');
  drawLeg(nl, false);
  // jupe / bas de manteau
  if (P.skirt) {
    const { len, wTop, wBot } = P.skirt;
    const top = hip[1] - 2;
    const sway = Math.sin(lean) * 3 + (q.nt - q.ft) * 1.5;
    pb.poly([[hip[0] - wTop / 2 - 1, top], [hip[0] + wTop / 2 + 1, top], [hip[0] + wBot / 2 + sway + 1, top + len + 1], [hip[0] - wBot / 2 + sway - 1, top + len + 1]], OUTLINE);
    pb.poly([[hip[0] - wTop / 2, top], [hip[0] + wTop / 2, top], [hip[0] + wBot / 2 + sway, top + len], [hip[0] - wBot / 2 + sway, top + len]],
      (x, y) => (x < hip[0] + sway * ((y - top) / len) - 1 ? (P.skirt.colD || col.pantsD) : (P.skirt.col || col.pants)));
  }
  // torse
  const hw = P.hipW / 2, sw = P.shW / 2;
  const tp = [[hip[0] - hw * perp[0], hip[1] - hw * perp[1] + 1], [hip[0] + hw * perp[0], hip[1] + hw * perp[1] + 1],
    [neck[0] + sw * perp[0], neck[1] + sw * perp[1] + 1], [neck[0] - sw * perp[0], neck[1] - sw * perp[1] + 1]];
  const grow = tp.map((pt, i) => [pt[0] + (i === 1 || i === 2 ? 1 : -1), pt[1] + (i < 2 ? 1 : -1)]);
  pb.poly(grow, OUTLINE);
  const midX = (x, y) => hip[0] + (neck[0] - hip[0]) * ((hip[1] - y) / (hip[1] - neck[1]));
  pb.poly(tp, (x, y) => {
    const m = midX(x, y);
    if (P.torsoFn) { const c = P.torsoFn(x - m, hip[1] - y, back, q); if (c) return c; }
    return x < m - 1 ? (col.topD || shadeC(col.top, 0.8)) : x > m + sw - 2 ? (col.topL || col.top) : col.top;
  });
  // tête
  const hx = Math.round(neck[0] + Math.sin(lean) * 2 + q.ht), hy = Math.round(neck[1] - P.headR - 1);
  P.head(pb, hx, hy, back, P, q);
  drawTrail(last);
  drawArm(last === 'na' ? na : fa, false);
  return { hip, neck, head: [hx, hy], nh: na[2], fh: fa[2] };
}

// --- Têtes ---
function faceBase(pb, hx, hy, P, rx = 3.6, ry = 4.3) {
  pb.ellipse(hx + 0.5, hy + 0.5, rx + 1, ry + 1, OUTLINE);
  pb.ellipse(hx + 0.5, hy + 0.5, rx, ry, (x, y, dx) => (dx < -0.45 ? P.col.skinD : P.col.skin));
}
const gojoHead = (pb, hx, hy, back, P) => {
  const W = C('#f4f6fb'), Wd = C('#c3cadf'), Wl = C('#ffffff'), band = C('#16161f');
  faceBase(pb, hx + 1, hy, P);
  const spikes = [[-7, -4], [-6, -9], [-2, -12], [2, -11], [5, -9], [7, -5]];
  for (const [sx, sy] of spikes) pb.poly([[hx - 4, hy - 1], [hx + 4, hy - 2], [hx + sx, hy + sy]], OUTLINE);
  for (const [sx, sy] of spikes) pb.poly([[hx - 3, hy - 1], [hx + 3, hy - 2], [hx + sx * 0.85, hy + sy * 0.85]], (x, y) => (x < hx - 1 ? Wd : y < hy - 7 ? Wl : W));
  pb.ellipse(hx - 0.5, hy - 2.5, 5, 3.5, (x, y, dx, dy) => (dx < -0.3 ? Wd : dy < -0.4 ? Wl : W));
  if (back) {
    pb.ellipse(hx, hy + 0.5, 4.8, 4.5, (x, y, dx) => (dx < -0.2 ? Wd : W));
    pb.rect(hx - 5, hy - 1, 2, 2, band); pb.rect(hx - 7, hy, 2, 1, band);
  } else {
    pb.rect(hx - 1, hy - 1, 7, 2, band); // bandeau sur les yeux
    pb.rect(hx - 4, hy - 1, 3, 1, band);
    pb.set(hx + 4, hy + 2, P.col.skinD);
  }
};
const sukunaHead = (pb, hx, hy, back, P) => {
  const H = C('#f2a3ab'), Hd = C('#c97680'), Hl = C('#ffd0d5'), under = C('#4e2c30'), mark = C('#16161f'), eye = C('#e0202a');
  faceBase(pb, hx + 1, hy, P);
  const spikes = [[-6, -5], [-4, -9], [0, -10], [4, -8], [6, -4]];
  for (const [sx, sy] of spikes) pb.poly([[hx - 4, hy - 1], [hx + 4, hy - 2], [hx + sx, hy + sy]], OUTLINE);
  for (const [sx, sy] of spikes) pb.poly([[hx - 3, hy - 1], [hx + 3, hy - 2], [hx + sx * 0.85, hy + sy * 0.85]], (x, y) => (x < hx - 1 ? Hd : y < hy - 6 ? Hl : H));
  pb.ellipse(hx - 0.5, hy - 2.5, 4.6, 3, (x, y, dx) => (dx < -0.3 ? Hd : H));
  if (back) {
    pb.ellipse(hx, hy + 0.5, 4.6, 4.4, (x, y, dx, dy) => (dy > 0.3 ? under : dx < -0.2 ? Hd : H));
  } else {
    pb.set(hx + 2, hy, eye); pb.set(hx + 4, hy, eye);
    pb.rect(hx + 1, hy + 2, 4, 1, mark); // marques sous les yeux
    pb.set(hx + 2, hy - 1, mark); pb.set(hx + 4, hy - 1, mark);
    pb.rect(hx - 2, hy - 1, 2, 3, under);
  }
};
const curseHead = (opts) => (pb, hx, hy, back, P, q) => {
  const r = P.headR;
  pb.ellipse(hx + 0.5, hy + 0.5, r + 1.2, r * (opts.tall || 1) + 1.2, OUTLINE);
  pb.ellipse(hx + 0.5, hy + 0.5, r, r * (opts.tall || 1), (x, y, dx, dy) => (dx < -0.4 ? P.col.skinD : dy < -0.5 ? (P.col.skinL || P.col.skin) : P.col.skin));
  if (opts.horns) { pb.line(hx - 2, hy - r, hx - 5, hy - r - 6, C('#e8dcc4'), 2); pb.line(hx + 2, hy - r, hx + 4, hy - r - 7, C('#e8dcc4'), 2); }
  if (opts.hair) {
    pb.ellipse(hx - 1, hy - r * 0.5, r + 1, r * 0.8, opts.hair);
    for (let i = 0; i < 4; i++) pb.line(hx - r + i * 2, hy, hx - r - 2 + i * 2, hy + r + 3, opts.hair, 2);
  }
  if (back) return;
  if (opts.eye === 'big') { pb.ellipse(hx + 2, hy - 1, 2.5, 2.5, C('#ffe14a')); pb.rect(hx + 2, hy - 2, 2, 2, OUTLINE); }
  else if (opts.eye === 'red') { pb.rect(hx + 1, hy - 1, 2, 1, C('#ff3030')); pb.rect(hx + 4, hy - 1, 1, 1, C('#ff3030')); }
  else if (opts.eye === 'stitch') {
    pb.set(hx + 1, hy - 1, C('#a0e8ff')); pb.set(hx + 4, hy - 1, C('#ffe14a'));
    pb.line(hx - 2, hy - 3, hx + 1, hy + 3, OUTLINE);
  }
  if (opts.mouth) {
    const open = q && q.mouth ? 2 : 1;
    pb.rect(hx - 1, hy + 2, 6, open + 1, OUTLINE);
    for (let i = 0; i < 6; i += 2) pb.set(hx - 1 + i, hy + 2, C('#f4f0e0'));
    if (opts.grin) pb.line(hx - 2, hy + 1, hx + 5, hy + 2, C('#f4f0e0'));
  }
};

// --- Définitions des personnages ---
export const BODIES = {
  gojo: {
    fw: 48, fh: 58, ox: 24, oy: 55,
    thigh: 7, shin: 8, torso: 12, uarm: 6, farm: 6, legW: 3, armW: 3, hipW: 7, shW: 9, headR: 4, hand: 2,
    col: { skin: C('#f3d6c4'), skinD: C('#d6b09b'), top: C('#232a48'), topD: C('#161b30'), topL: C('#36406a'), pants: C('#1d2340'), pantsD: C('#13172b'), shoe: C('#0f0f14') },
    head: gojoHead, trail: C('#bfe2ff'),
    torsoFn: (dx, dy, back) => (!back && dy > 9 && dy < 12 && dx > -1 && dx < 3 ? C('#36406a') : !back && dy === 7 && dx === 1 ? C('#e8c050') : 0),
  },
  sukuna: {
    fw: 48, fh: 58, ox: 24, oy: 55,
    thigh: 7, shin: 8, torso: 12, uarm: 6, farm: 6, legW: 3, armW: 3, hipW: 8, shW: 10, headR: 4, hand: 2,
    col: { skin: C('#f1cdb5'), skinD: C('#d2a68c'), top: C('#ece8e0'), topD: C('#c4bdb0'), topL: C('#ffffff'), pants: C('#2c272b'), pantsD: C('#1c181b'), shoe: C('#141012') },
    head: sukunaHead, bareForearm: true, tattoo: true, trail: C('#ffb0b0'),
    skirt: { len: 9, wTop: 9, wBot: 14, col: C('#ece8e0'), colD: C('#c4bdb0') },
    torsoFn: (dx, dy) => (dy >= 0 && dy < 3 ? C('#1a1418') : 0),
  },
  rodeur: {
    fw: 48, fh: 56, ox: 24, oy: 53,
    thigh: 6, shin: 7, torso: 10, uarm: 8, farm: 8, legW: 3, armW: 3, hipW: 8, shW: 10, headR: 5, hand: 3, lean: 0.35, feet: 'claw',
    col: { skin: C('#8fa38a'), skinD: C('#647862'), skinL: C('#b2c4ac'), top: C('#7d917a'), topD: C('#5a6c58'), pants: C('#7d917a'), pantsD: C('#5a6c58'), shoe: C('#3b4a3a') },
    head: curseHead({ eye: 'big', mouth: true }),
  },
  colosse: {
    fw: 84, fh: 88, ox: 42, oy: 85,
    thigh: 11, shin: 11, torso: 18, uarm: 11, farm: 11, legW: 6, armW: 6, hipW: 16, shW: 26, headR: 5, hand: 5, lean: 0.12,
    col: { skin: C('#8a3b2e'), skinD: C('#62271e'), skinL: C('#b05442'), top: C('#7a6f62'), topD: C('#574e44'), topL: C('#9a8f80'), pants: C('#8a3b2e'), pantsD: C('#62271e'), shoe: C('#3a201a') },
    head: curseHead({ eye: 'red', horns: true }),
    torsoFn: (dx, dy) => (hash2(Math.floor(dx / 3), Math.floor(dy / 3), 4) < 0.25 ? C('#8a3b2e') : 0),
  },
  predateur: {
    fw: 60, fh: 54, ox: 30, oy: 51,
    thigh: 7, shin: 8, torso: 11, uarm: 6, farm: 5, legW: 2, armW: 3, hipW: 6, shW: 9, headR: 4, hand: 1, lean: 0.55, feet: 'claw', blade: 9,
    col: { skin: C('#4a3460'), skinD: C('#2f2040'), skinL: C('#6a4e86'), top: C('#3e2b52'), topD: C('#2a1c38'), pants: C('#3e2b52'), pantsD: C('#2a1c38'), shoe: C('#1a1024'), accent: C('#e6e1d4') },
    head: curseHead({ eye: 'red', tall: 1.3, mouth: true }),
  },
  superieur: {
    fw: 56, fh: 66, ox: 28, oy: 63,
    thigh: 9, shin: 9, torso: 14, uarm: 7, farm: 7, legW: 3, armW: 3, hipW: 8, shW: 11, headR: 4, hand: 2,
    col: { skin: C('#cfc6bd'), skinD: C('#a39a90'), top: C('#2c3140'), topD: C('#1d212c'), topL: C('#404860'), pants: C('#2c3140'), pantsD: C('#1d212c'), shoe: C('#121418') },
    head: curseHead({ eye: 'stitch', mouth: true, grin: true, hair: C('#3a4258') }),
    bareForearm: true, tattoo: true,
    skirt: { len: 12, wTop: 9, wBot: 18, col: C('#2c3140'), colD: C('#1d212c') },
  },
};

// --- Animations ---
const run = (lean = 0.22) => {
  const F0 = p({ lean, nt: 0.7, nk: 0.2, ft: -0.6, fk: 0.9, nua: -0.6, nfa: -0.2, fua: 0.7, ffa: 1.4, bob: 0 });
  const F1 = p({ lean, nt: 0.35, nk: 0.5, ft: -0.2, fk: 1.3, nua: -0.3, nfa: 0.1, fua: 0.35, ffa: 1.0, bob: -1 });
  const F2 = p({ lean, nt: -0.1, nk: 0.3, ft: 0.25, fk: 1.1, nua: 0.05, nfa: 0.4, fua: -0.05, ffa: 0.6, bob: -1 });
  return [F0, F1, F2, mirror(F0), mirror(F1), mirror(F2)];
};

const ANIMS = {
  gojo: {
    idle: { fps: 4, poses: [p({}), p({}), p({ bob: 1, nua: 0.1, fua: -0.05 }), p({ bob: 1 })] },
    run: { fps: 12, poses: run() },
    // Coups de base : préparation, frappe, extension (traînée), suivi, retour.
    atk1: { fps: 20, poses: [ // direct du bras avant
      p({ lean: -0.12, nua: -0.6, nfa: -1.7, fua: 0.4, ffa: 1.2, nt: 0.25, ft: -0.3 }),
      p({ lean: 0.2, nua: 1.2, nfa: 1.3, fua: -0.2, ffa: 0.5, nt: 0.4, ft: -0.4, trail: { part: 'na', a: [-0.6, -1.7] } }),
      p({ lean: 0.32, nua: 1.55, nfa: 1.57, fua: -0.5, ffa: 0.1, nt: 0.45, ft: -0.45, trail: { part: 'na', a: [0.5, 0.8] } }),
      p({ lean: 0.26, nua: 1.45, nfa: 1.5, fua: -0.4, ffa: 0.2, nt: 0.4, ft: -0.4 }),
      p({ lean: 0.1, nua: 0.6, nfa: 1.0, nt: 0.25, ft: -0.25 })] },
    atk2: { fps: 20, poses: [ // coup de pied haut
      p({ lean: 0.05, nt: 0.6, nk: 1.7, fua: 0.5, ffa: 1.0, nua: -0.4, nfa: 0 }),
      p({ lean: -0.2, nt: 1.2, nk: 0.4, fua: 0.7, ffa: 1.1, nua: -0.6, nfa: -0.2, trail: { part: 'nl', a: [0.6, 1.7] } }),
      p({ lean: -0.4, nt: 1.65, nk: 0, nua: -0.8, nfa: -0.5, fua: 0.9, ffa: 1.3, trail: { part: 'nl', a: [1.0, 0.8] } }),
      p({ lean: -0.3, nt: 1.4, nk: 0.3, nua: -0.6, nfa: -0.3, fua: 0.8, ffa: 1.2 }),
      p({ lean: -0.1, nt: 0.7, nk: 1.0 })] },
    atk3: { fps: 20, poses: [ // double paume
      p({ lean: -0.15, bob: 1, nua: -0.7, nfa: -1.2, fua: -0.7, ffa: -1.2, nt: 0.3, ft: -0.4 }),
      p({ lean: 0.25, nua: 1.2, nfa: 1.4, fua: 1.1, ffa: 1.3, nt: 0.5, ft: -0.5, trail: { part: 'na', a: [-0.7, -1.2] } }),
      p({ lean: 0.38, nua: 1.5, nfa: 1.6, fua: 1.4, ffa: 1.55, nt: 0.6, ft: -0.6, point: true, trail: { part: 'na', a: [0.5, 0.6] } }),
      p({ lean: 0.3, nua: 1.45, nfa: 1.5, fua: 1.35, ffa: 1.45, nt: 0.55, ft: -0.55, point: true }),
      p({ lean: 0.15, nua: 0.9, nfa: 1.2, fua: 0.8, ffa: 1.1, nt: 0.35, ft: -0.35 })] },
    atk4: { fps: 15, poses: [ // coup de pied retourné + poussée de l'Infini
      p({ bob: 3, lean: 0.2, nk: 1.0, fk: 1.0, nt: 0.4, ft: -0.4, nua: 0.6, nfa: 1.9, fua: 0.5, ffa: 1.8 }),
      p({ bob: 1, lean: -0.2, ft: 0.8, fk: 1.6, nua: -0.6, nfa: -0.2, fua: 0.8, ffa: 1.4 }),
      p({ lean: -0.45, ft: 1.4, fk: 0.3, nt: -0.05, nk: 0.25, nua: -0.9, nfa: -0.6, fua: 0.9, ffa: 1.4, trail: { part: 'fl', a: [0.8, 1.6] } }),
      p({ lean: -0.55, ft: 1.85, fk: -0.1, nt: -0.1, nk: 0.2, nua: -1.0, nfa: -0.7, fua: 1.0, ffa: 1.5, trail: { part: 'fl', a: [1.2, 0.6] } }),
      p({ lean: -0.4, ft: 1.6, fk: 0.2, nua: -0.7, nfa: -0.4, fua: 0.9, ffa: 1.4 }),
      p({ lean: -0.15, ft: 0.8, fk: 0.7, nua: -0.2, nfa: 0.2 })] },
    dash: { fps: 10, poses: [p({ lean: 0.55, nt: -0.5, nk: 0.8, ft: 0.6, fk: 0.4, nua: -1.0, nfa: -0.8, fua: -0.9, ffa: -0.7 })] },
    dodge: { fps: 10, poses: [p({ lean: -0.35, bob: 2, nt: 0.5, nk: 1.2, ft: -0.6, fk: 0.6, nua: 0.8, nfa: 1.6, fua: 0.6, ffa: 1.4 })] },
    cast: { fps: 12, poses: [p({ lean: -0.05, nua: -0.4, nfa: -1.4, nt: 0.3, ft: -0.3 }), p({ lean: 0.15, nua: 1.45, nfa: 1.5, nt: 0.4, ft: -0.4, point: true }), p({ lean: 0.12, nua: 1.4, nfa: 1.45, nt: 0.4, ft: -0.4, point: true })] },
    charge: { fps: 6, poses: [p({ lean: 0, nua: 1.6, nfa: 1.7, fua: -1.5, ffa: -1.7, nt: 0.4, ft: -0.4, point: true }), p({ lean: 0, bob: 1, nua: 1.55, nfa: 1.75, fua: -1.45, ffa: -1.65, nt: 0.4, ft: -0.4, point: true })] },
    sign: { fps: 4, poses: [p({ nua: 0.55, nfa: 2.7, fua: 0.7, ffa: 2.6, point: true }), p({ bob: 1, nua: 0.55, nfa: 2.75, fua: 0.7, ffa: 2.65, point: true })] },
    stagger: { fps: 8, poses: [p({ lean: -0.4, nua: -1.2, nfa: -2.0, fua: -0.9, ffa: -1.6, nk: 0.4 })] },
  },
};
ANIMS.sukuna = {
  idle: { fps: 4, poses: [p({ lean: 0.08, nua: 0.25, nfa: 0.6 }), p({ lean: 0.08, nua: 0.25, nfa: 0.6 }), p({ bob: 1, lean: 0.1, nua: 0.3, nfa: 0.65 }), p({ bob: 1, lean: 0.1, nua: 0.3, nfa: 0.65 })] },
  run: { fps: 12, poses: run(0.3) },
  atk1: { fps: 20, poses: [ // griffe plongeante
    p({ lean: -0.15, nua: 2.7, nfa: 3.0, fua: -0.3, ffa: 0.2, nt: 0.3, ft: -0.3 }),
    p({ lean: 0.15, nua: 1.8, nfa: 1.9, nt: 0.4, ft: -0.4, trail: { part: 'na', a: [2.7, 3.0] } }),
    p({ lean: 0.35, nua: 0.8, nfa: 0.4, nt: 0.5, ft: -0.45, trail: { part: 'na', a: [1.8, 1.9] } }),
    p({ lean: 0.35, nua: 0.4, nfa: 0.1, nt: 0.5, ft: -0.45 }),
    p({ lean: 0.2, nua: 0.3, nfa: 0.4, nt: 0.3, ft: -0.3 })] },
  atk2: { fps: 20, poses: [ // revers du bras arrière
    p({ lean: -0.05, fua: -0.8, ffa: -1.8, nua: 0.6, nfa: 1.6 }),
    p({ lean: 0.25, fua: 1.0, ffa: 1.3, nt: 0.45, ft: -0.45, trail: { part: 'fa', a: [-0.8, -1.8] } }),
    p({ lean: 0.35, fua: 1.55, ffa: 1.6, nua: -0.6, nfa: -0.3, nt: 0.5, ft: -0.5, trail: { part: 'fa', a: [1.0, 1.3] } }),
    p({ lean: 0.3, fua: 1.45, ffa: 1.5, nua: -0.5, nfa: -0.2, nt: 0.5, ft: -0.5 }),
    p({ lean: 0.15, fua: 0.8, ffa: 1.1 })] },
  atk3: { fps: 20, poses: [ // genou montant + uppercut
    p({ lean: 0.1, bob: 1, nt: 0.4, nk: 1.2, nua: -0.4, nfa: -1.2 }),
    p({ lean: -0.05, nt: 1.2, nk: 2.0, nua: 1.0, nfa: 2.4, trail: { part: 'nl', a: [0.4, 1.2] } }),
    p({ lean: -0.15, nt: 1.55, nk: 2.3, nua: 1.6, nfa: 2.9, trail: { part: 'na', a: [1.0, 2.4] } }),
    p({ lean: -0.1, nt: 1.2, nk: 1.8, nua: 1.5, nfa: 2.7 }),
    p({ nt: 0.6, nk: 0.9, nua: 0.6, nfa: 1.2 })] },
  atk4: { fps: 15, poses: [ // écrasement à deux mains
    p({ bob: 2, lean: 0.2, nk: 0.8, fk: 0.8, nua: 0.4, nfa: 1.0, fua: 0.3, ffa: 0.9 }),
    p({ bob: -1, lean: -0.25, nua: 2.9, nfa: 3.05, fua: 2.8, ffa: 3.0, nt: 0.3, ft: -0.3 }),
    p({ lean: 0.2, nua: 1.8, nfa: 1.6, fua: 1.7, ffa: 1.5, nt: 0.5, ft: -0.5, trail: { part: 'na', a: [2.9, 3.05] } }),
    p({ lean: 0.5, bob: 3, nua: 0.7, nfa: 0.4, fua: 0.6, ffa: 0.35, nt: 0.65, nk: 0.9, ft: -0.6, fk: 0.5, trail: { part: 'na', a: [1.8, 1.6] } }),
    p({ lean: 0.45, bob: 3, nua: 0.55, nfa: 0.3, fua: 0.5, ffa: 0.3, nt: 0.6, nk: 0.9, ft: -0.6, fk: 0.5 }),
    p({ lean: 0.25, bob: 1, nua: 0.5, nfa: 0.4 })] },
  dash: { fps: 10, poses: [p({ lean: 0.6, nt: -0.6, nk: 0.6, ft: 0.8, fk: 0.9, nua: -1.1, nfa: -0.6, fua: -1.0, ffa: -0.5 })] },
  dodge: { fps: 10, poses: [p({ lean: -0.3, bob: 2, nt: 0.5, nk: 1.2, ft: -0.6, fk: 0.6, nua: 0.5, nfa: 1.0, fua: 0.4, ffa: 1.2 })] },
  cast: { fps: 12, poses: [p({ lean: 0.05, nua: -0.8, nfa: -1.9, nt: 0.3, ft: -0.3 }), p({ lean: 0.2, nua: 1.6, nfa: 1.6, nt: 0.4, ft: -0.4 }), p({ lean: 0.2, nua: 1.9, nfa: 2.0, nt: 0.4, ft: -0.4 })] },
  charge: { fps: 6, poses: [p({ lean: 0, nua: 1.5, nfa: 1.55, fua: 0.2, ffa: -1.5, nt: 0.4, ft: -0.4 }), p({ lean: -0.05, bob: 1, nua: 1.5, nfa: 1.55, fua: 0.0, ffa: -1.6, nt: 0.4, ft: -0.4 })] },
  fuga: { fps: 6, poses: [ // Flèche de feu : mains ouvertes (開) puis arc de feu bandé
    p({ lean: 0.1, bob: 1, nua: 1.0, nfa: 2.2, fua: -1.0, ffa: -2.2, nt: 0.3, ft: -0.3 }),
    p({ lean: 0, nua: 1.5, nfa: 1.6, fua: 1.4, ffa: 1.55, nt: 0.45, ft: -0.45 }),
    p({ lean: -0.12, nua: 1.75, nfa: 1.8, fua: -1.35, ffa: 1.3, nt: 0.6, nk: 0.2, ft: -0.65, fk: 0.35 }),
    p({ lean: -0.14, bob: 1, nua: 1.78, nfa: 1.82, fua: -1.4, ffa: 1.4, nt: 0.6, nk: 0.25, ft: -0.65, fk: 0.4 })] },
  sign: { fps: 4, poses: [p({ nua: 0.5, nfa: 2.6, fua: 0.65, ffa: 2.5 }), p({ bob: 1, nua: 0.5, nfa: 2.65, fua: 0.65, ffa: 2.55 })] },
  stagger: { fps: 8, poses: [p({ lean: -0.4, nua: -1.2, nfa: -2.0, fua: -0.9, ffa: -1.6, nk: 0.4 })] },
};
const curseAnims = (lean = 0) => ({
  idle: { fps: 4, poses: [p({ nua: 0.2, nfa: 0.3 }), p({ bob: 1, nua: 0.25, nfa: 0.35 })] },
  run: { fps: 9, poses: run(lean).filter((_, i) => i % 3 !== 1) },
  attack: { fps: 10, poses: [p({ lean: -0.2, nua: 2.5, nfa: 2.8, fua: 2.2, ffa: 2.6, mouth: true }), p({ lean: 0.35, nua: 0.9, nfa: 0.5, fua: 0.8, ffa: 0.4, nt: 0.5, ft: -0.5, mouth: true }), p({ lean: 0.15, nua: 0.5, nfa: 0.4 })] },
  hit: { fps: 8, poses: [p({ lean: -0.45, nua: -1.0, nfa: -1.8, fua: -0.8, ffa: -1.4, nk: 0.5, mouth: true })] },
  down: { fps: 8, poses: [p({ lean: -1.35, air: true, bob: 6, nt: -1.2, nk: 0, ft: -1.4, fk: 0.1, nua: -2.2, nfa: -2.4, fua: -2.0, ffa: -2.2 })] },
  cast: { fps: 10, poses: [p({ nua: 1.4, nfa: 1.6, fua: 1.3, ffa: 1.5, mouth: true }), p({ lean: 0.1, nua: 1.5, nfa: 1.5, fua: 1.4, ffa: 1.4, mouth: true })] },
});
ANIMS.rodeur = curseAnims(0.1);
ANIMS.colosse = curseAnims(0.05);
ANIMS.predateur = curseAnims(0.15);
ANIMS.superieur = curseAnims(0);

// --- Fléaux non humanoïdes ---
function drawLarve(pb, f, anim) {
  const sq = anim === 'run' ? [0, 1, 0, -1][f] : 0;
  const open = anim === 'attack' && f === 1;
  const flat = anim === 'down';
  const cx = 14, base = 20;
  const rx = 9 + sq * 0.8, ry = flat ? 3 : 6 - sq * 0.6;
  pb.ellipse(cx, base - ry, rx + 1, ry + 1, OUTLINE);
  pb.ellipse(cx, base - ry, rx, ry, (x, y, dx, dy) => (dy < -0.4 ? C('#7a6a8c') : dx < -0.5 || dy > 0.5 ? C('#3d304c') : C('#5a4a6c')));
  if (anim === 'hit') pb.ellipse(cx, base - ry, rx - 2, ry - 2, C('#9a8aac'));
  if (!flat) {
    for (const [ex, ey] of [[4, -2], [6, -5], [1, -6], [8, -1]]) pb.set(cx + ex, base - ry + ey, C('#ffe14a'));
    if (open) { pb.rect(cx + 4, base - ry, 6, 3, OUTLINE); for (let i = 0; i < 6; i += 2) pb.set(cx + 4 + i, base - ry, C('#f4f0e0')); }
    for (let i = 0; i < 3; i++) pb.set(cx - 6 + i * 4, base - 1, C('#2a2034'));
  }
}
function drawArtillerie(pb, f, anim) {
  const bob = anim === 'down' ? 18 : Math.round(Math.sin(f * 1.57) * 1.5);
  const cx = 20, cy = 20 + bob;
  for (let i = 0; i < 5; i++) {
    const x0 = cx - 8 + i * 4, sway = Math.sin(f * 1.57 + i) * 2;
    limb(pb, [[x0, cy + 6], [x0 + sway, cy + 14], [x0 - sway, cy + 22]], 1, C('#4a2a3a'));
  }
  pb.ellipse(cx, cy, 12, 10, OUTLINE);
  pb.ellipse(cx, cy, 11, 9, (x, y, dx, dy) => (dy < -0.5 ? C('#a0507a') : dx < -0.5 || dy > 0.5 ? C('#5a2440') : C('#7a3458')));
  if (anim === 'hit') pb.ellipse(cx, cy, 8, 6, C('#c890b0'));
  pb.ellipse(cx - 1, cy - 2, 4.5, 4.5, C('#f4f0e0'));
  pb.ellipse(cx, cy - 2, 2.2, 2.2, C('#ffe14a')); pb.rect(cx, cy - 2, 1, 2, OUTLINE);
  // canon buccal
  const fire = anim === 'cast';
  pb.rect(cx + 8, cy + 1, 7, 5, OUTLINE); pb.rect(cx + 8, cy + 2, 6, 3, C('#5a2440'));
  if (fire) { pb.rect(cx + 14, cy + 1, 3, 5, C('#e0b0ff')); pb.rect(cx + 15, cy + 2, 3, 3, C('#ffffff')); }
}

const BLOBS = {
  larve: { fw: 28, fh: 22, ox: 14, oy: 20, draw: drawLarve, anims: { idle: 2, run: 4, attack: 2, hit: 1, down: 1 }, fps: { idle: 4, run: 10, attack: 8, hit: 8, down: 8 } },
  artillerie: { fw: 40, fh: 48, ox: 20, oy: 44, draw: drawArtillerie, anims: { idle: 4, run: 4, cast: 2, attack: 2, hit: 1, down: 1 }, fps: { idle: 6, run: 6, cast: 8, attack: 8, hit: 8, down: 8 } },
};

// Construit une planche : renvoie { canvas, fw, fh, ox, oy, anims: { nom: { f: [..], b: [..], fps } } }.
export function buildSheet(key) {
  if (BLOBS[key]) return buildBlobSheet(key);
  const P = BODIES[key];
  const A = ANIMS[key];
  const frames = [];
  const anims = {};
  for (const [name, def] of Object.entries(A)) {
    anims[name] = { f: [], b: [], fps: def.fps };
    for (const back of [false, true]) {
      for (const q of def.poses) {
        const pb = new PB(P.fw, P.fh);
        drawHumanoid(pb, P, q, back, P.ox, P.oy);
        pb.outline(OUTLINE);
        anims[name][back ? 'b' : 'f'].push(frames.length);
        frames.push(pb);
      }
    }
  }
  return pack(frames, P, anims);
}

function buildBlobSheet(key) {
  const B = BLOBS[key];
  const frames = [], anims = {};
  for (const [name, n] of Object.entries(B.anims)) {
    anims[name] = { f: [], b: [], fps: B.fps[name] };
    for (let i = 0; i < n; i++) {
      const pb = new PB(B.fw, B.fh);
      B.draw(pb, i, name);
      anims[name].f.push(frames.length);
      anims[name].b.push(frames.length);
      frames.push(pb);
    }
  }
  return pack(frames, B, anims);
}

function pack(frames, P, anims) {
  const cols = Math.min(8, frames.length), rows = Math.ceil(frames.length / cols);
  const sheet = new PB(cols * P.fw, rows * P.fh);
  frames.forEach((f, i) => sheet.blit(f, (i % cols) * P.fw, Math.floor(i / cols) * P.fh));
  return { canvas: sheet.toCanvas(), fw: P.fw, fh: P.fh, ox: P.ox, oy: P.oy, count: frames.length, cols, anims };
}

export const SHEET_KEYS = ['gojo', 'sukuna', 'rodeur', 'colosse', 'predateur', 'superieur', 'larve', 'artillerie'];
