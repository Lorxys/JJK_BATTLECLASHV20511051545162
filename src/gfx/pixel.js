// Tampon de pixels : tout le pixel art est dessiné ici, pixel par pixel, sans anticrénelage.
// Les couleurs sont des entiers 32 bits au format ABGR (ordre mémoire d'ImageData).

const cache = new Map();
export function C(hex) {
  let v = cache.get(hex);
  if (v !== undefined) return v;
  const n = parseInt(hex.slice(1, 7), 16);
  const a = hex.length > 7 ? parseInt(hex.slice(7, 9), 16) : 255;
  v = ((a << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
  cache.set(hex, v);
  return v;
}
export function rgba(r, g, b, a = 255) {
  return ((a << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
}
// Assombrit (f < 1) ou éclaircit (f > 1) une couleur.
export function shadeC(c, f) {
  const r = Math.min(255, (c & 255) * f) | 0;
  const g = Math.min(255, ((c >>> 8) & 255) * f) | 0;
  const b = Math.min(255, ((c >>> 16) & 255) * f) | 0;
  return rgba(r, g, b, c >>> 24);
}
export function mixC(a, b, t) {
  const f = (s) => (((a >>> s) & 255) * (1 - t) + ((b >>> s) & 255) * t) | 0;
  return rgba(f(0), f(8), f(16), 255);
}
export const OUTLINE = C('#1b1424');

export class PB {
  constructor(w, h) {
    this.w = w | 0;
    this.h = h | 0;
    this.img = new ImageData(this.w, this.h);
    this.d = new Uint32Array(this.img.data.buffer);
  }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  }
  get(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[y * this.w + x];
  }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  // Ligne de Bresenham, épaisseur en pixels (carré).
  line(x0, y0, x1, y1, c, th = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const o = -Math.floor((th - 1) / 2);
    for (;;) {
      if (th === 1) this.set(x0, y0, c);
      else this.rect(x0 + o, y0 + o, th, th, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Polygone convexe rempli ; fn(x, y) peut renvoyer une couleur ou 0 (rien).
  poly(pts, colorOrFn) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const p of pts) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    // orientation
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    const sgn = area >= 0 ? 1 : -1;
    const fn = typeof colorOrFn === 'function' ? colorOrFn : null;
    const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(this.w - 1, Math.ceil(maxX));
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        let inside = true;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if (((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])) * sgn < -0.001) { inside = false; break; }
        }
        if (!inside) continue;
        const c = fn ? fn(x, y) : colorOrFn;
        if (c) this.d[y * this.w + x] = c;
      }
    }
  }
  ellipse(cx, cy, rx, ry, colorOrFn) {
    const fn = typeof colorOrFn === 'function' ? colorOrFn : null;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          const c = fn ? fn(x, y, dx, dy) : colorOrFn;
          if (c) this.set(x, y, c);
        }
      }
    }
  }
  // Contour sombre autour de la silhouette (style 16 bits).
  outline(c = OUTLINE, diag = false) {
    const { w, h, d } = this;
    const src = d.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (src[y * w + x] >>> 24) continue;
        const o = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && (src[yy * w + xx] >>> 24) !== 0;
        if (o(x - 1, y) || o(x + 1, y) || o(x, y - 1) || o(x, y + 1) ||
          (diag && (o(x - 1, y - 1) || o(x + 1, y - 1) || o(x - 1, y + 1) || o(x + 1, y + 1)))) {
          d[y * w + x] = c;
        }
      }
    }
    return this;
  }
  // Copie un autre tampon (pixels opaques uniquement), éventuellement en miroir horizontal.
  blit(src, dx, dy, flip = false) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.d[y * src.w + (flip ? src.w - 1 - x : x)];
        if (c >>> 24) this.set(dx + x, dy + y, c);
      }
    }
  }
  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    cv.getContext('2d').putImageData(this.img, 0, 0);
    return cv;
  }
}

// Losange isométrique 32x16 : test exact sur le centre du pixel (pavage parfait).
export function inDiamond(x, y, w = 32, h = 16) {
  return Math.abs(x + 0.5 - w / 2) / (w / 2) + Math.abs(y + 0.5 - h / 2) / (h / 2) <= 1;
}

// Boîte isométrique générique. (gx, gy) = coin supérieur de l'empreinte au sol dans le tampon.
// a = longueur selon l'axe x du monde (en cases), b = selon y, h = hauteur en pixels.
// faces : { left(u, v), right(u, v), top(x, y) } -> couleur ou 0 ; u = colonne sur la face, v = hauteur depuis le sol.
export function isoBox(pb, gx, gy, a, b, h, faces) {
  const top = [gx, gy];
  const right = [gx + 16 * a, gy + 8 * a];
  const left = [gx - 16 * b, gy + 8 * b];
  const bottom = [gx + 16 * a - 16 * b, gy + 8 * a + 8 * b];
  const up = (p) => [p[0], p[1] - h];
  if (faces.left) {
    pb.poly([left, bottom, up(bottom), up(left)], (x, y) => {
      const u = x + 0.5 - left[0];
      const gyAt = left[1] + u / 2;
      return faces.left(Math.floor(u), Math.floor(gyAt - (y + 0.5)), x, y);
    });
  }
  if (faces.right) {
    pb.poly([bottom, right, up(right), up(bottom)], (x, y) => {
      const u = x + 0.5 - bottom[0];
      const gyAt = bottom[1] - u / 2;
      return faces.right(Math.floor(u), Math.floor(gyAt - (y + 0.5)), x, y);
    });
  }
  if (faces.top) {
    pb.poly([up(top), up(right), up(bottom), up(left)], (x, y) => faces.top(x, y));
  }
  return { top, right, left, bottom };
}

// Agrandissement x2 « Scale2x » (EPX) : double la définition en arrondissant les diagonales
// sans flou, pour le rendu HD lisse.
export function scale2x(src) {
  const w = src.width, h = src.height;
  const s = new Uint32Array(src.getContext('2d').getImageData(0, 0, w, h).data.buffer);
  const W2 = w * 2, img = new ImageData(W2, h * 2), d = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) {
    const up = y > 0 ? y - 1 : y, dn = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const P = s[y * w + x];
      const A = s[up * w + x], D = s[dn * w + x];
      const C = s[y * w + (x > 0 ? x - 1 : x)], B = s[y * w + (x < w - 1 ? x + 1 : x)];
      let e0 = P, e1 = P, e2 = P, e3 = P;
      if (A !== D && C !== B) {
        if (C === A) e0 = A;
        if (A === B) e1 = B;
        if (D === C) e2 = C;
        if (B === D) e3 = D;
      }
      const o = y * 2 * W2 + x * 2;
      d[o] = e0; d[o + 1] = e1; d[o + W2] = e2; d[o + W2 + 1] = e3;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = W2; cv.height = h * 2;
  cv.getContext('2d').putImageData(img, 0, 0);
  return cv;
}
