// Petits outils mathématiques partagés.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

export function norm(x, y) {
  const l = Math.hypot(x, y);
  return l > 1e-6 ? [x / l, y / l] : [0, 0];
}

// Générateur pseudo-aléatoire déterministe (mulberry32).
export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];

// Hash entier -> [0,1) pour du bruit stable par pixel.
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Projection isométrique 2:1. x, y en cases, z en pixels.
export const isoX = (x, y) => (x - y) * 16;
export const isoY = (x, y) => (x + y) * 8;
export const depthOf = (x, y) => (x + y) * 16;

// Direction monde -> direction écran (pour choisir l'orientation des sprites).
export function screenDir(dx, dy) {
  return [dx - dy, (dx + dy) * 0.5];
}
// Direction écran (joystick) -> direction monde.
export function worldDirFromScreen(sx, sy) {
  // sx = dx - dy ; sy = (dx + dy)/2  =>  dx = sy + sx/2 ; dy = sy - sx/2
  return norm(sy + sx * 0.5, sy - sx * 0.5);
}

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
