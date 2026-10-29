// Sol pré-rendu par blocs (canvas) : les dégâts au sol y sont « tamponnés » et persistent pendant la session.
import { CHUNK } from '../config.js';
import { W } from '../state.js';
import { isoX, isoY, makeRng } from '../util.js';
import { NIGHT_TINT } from '../game/night.js';
import { makeTileSet, tileFor, makeDecals, tileDecals, makeCrater, makeScorch, makeCrackStamp, DMG_COLORS } from '../gfx/tiles.js';

let tileSet = null, decals = null;
const stamps = { crater: [], scorch: [], crack: [] };

export function initGroundArt() {
  tileSet = makeTileSet();
  decals = makeDecals();
  for (let r = 1; r <= 4; r++) {
    stamps.crater.push([0, 1, 2].map((s) => makeCrater(r * 0.7, r * 100 + s)));
    stamps.scorch.push([0, 1].map((s) => makeScorch(r * 0.8, r * 200 + s)));
  }
  stamps.crack = [0, 1, 2, 3].map((s) => makeCrackStamp(300 + s));
}

export class Ground {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.n = map.n / CHUNK;
    this.chunks = [];
    for (let cy = 0; cy < this.n; cy++) {
      for (let cx = 0; cx < this.n; cx++) {
        const a = cx * CHUNK, b = cy * CHUNK;
        const left = (a - b - CHUNK) * 16, top = isoY(a, b);
        const key = 'chunk_' + cx + '_' + cy;
        let tex = scene.textures.get(key);
        let canvas;
        if (!tex || tex.key === '__MISSING') {
          canvas = document.createElement('canvas');
          canvas.width = CHUNK * 32; canvas.height = CHUNK * 16;
          tex = scene.textures.addCanvas(key, canvas);
          tex.setFilter(Phaser.Textures.FilterMode.NEAREST); // sol : texels nets, même en rendu HD
        } else canvas = tex.getSourceImage();
        const img = scene.add.image(left, top, key).setOrigin(0, 0).setDepth(-1e6).setTint(NIGHT_TINT);
        this.chunks.push({ cx, cy, left, top, w: canvas.width, h: canvas.height, canvas, ctx: canvas.getContext('2d'), tex, img, dirty: false });
      }
    }
    this.redrawAll();
  }

  redrawAll() {
    const N = this.map.n;
    // cases occupées par un bâtiment, pour l'ombre de contact au pied des murs
    const occ = new Uint8Array(N * N);
    for (const b of this.map.buildings) for (let j = 0; j < b.s; j++) for (let i = 0; i < b.s; i++) occ[(b.y + j) * N + b.x + i] = 1;
    const isB = (x, y) => x >= 0 && y >= 0 && x < N && y < N && occ[y * N + x] === 1;
    for (const ch of this.chunks) {
      ch.ctx.clearRect(0, 0, ch.w, ch.h);
      const a = ch.cx * CHUNK, b = ch.cy * CHUNK;
      for (let y = b; y < b + CHUNK; y++) {
        for (let x = a; x < a + CHUNK; x++) {
          if (x >= N || y >= N) continue;
          const px = isoX(x, y) - 16 - ch.left, py = isoY(x, y) - ch.top;
          ch.ctx.drawImage(tileFor(tileSet, this.map, x, y), px, py);
          if (!occ[y * N + x]) for (const d of tileDecals(decals, this.map, x, y, isB)) ch.ctx.drawImage(d, px, py);
        }
      }
      ch.tex.refresh();
    }
  }

  // Dessine un canvas centré sur la position monde (x, y) dans tous les blocs concernés.
  stamp(canvas, x, y) {
    const sx = Math.round(isoX(x, y) - canvas.width / 2), sy = Math.round(isoY(x, y) - canvas.height / 2);
    for (const ch of this.chunks) {
      if (sx + canvas.width < ch.left || sx > ch.left + ch.w || sy + canvas.height < ch.top || sy > ch.top + ch.h) continue;
      ch.ctx.drawImage(canvas, sx - ch.left, sy - ch.top);
      ch.dirty = true;
    }
  }

  crater(x, y, r) {
    const i = Math.max(0, Math.min(3, Math.round(r / 0.7) - 1));
    const v = stamps.crater[i];
    this.stamp(v[Math.floor(Math.random() * v.length)], x, y);
  }
  scorch(x, y, r) {
    const i = Math.max(0, Math.min(3, Math.round(r / 0.8) - 1));
    const v = stamps.scorch[i];
    this.stamp(v[Math.floor(Math.random() * v.length)], x, y);
  }
  crack(x, y) {
    this.stamp(stamps.crack[Math.floor(Math.random() * stamps.crack.length)], x, y);
  }

  // Entaille rectiligne (Démantèlement, Violet...) tracée pixel par pixel.
  slash(x0, y0, x1, y1, width = 1, color = DMG_COLORS.crack) {
    const ax = isoX(x0, y0), ay = isoY(x0, y0), bx = isoX(x1, y1), by = isoY(x1, y1);
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    const css = '#' + [color & 255, (color >>> 8) & 255, (color >>> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('');
    const minX = Math.min(ax, bx) - 4, maxX = Math.max(ax, bx) + 4, minY = Math.min(ay, by) - 4, maxY = Math.max(ay, by) + 4;
    for (const ch of this.chunks) {
      if (maxX < ch.left || minX > ch.left + ch.w || maxY < ch.top || minY > ch.top + ch.h) continue;
      ch.ctx.fillStyle = css;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = Math.round(ax + (bx - ax) * t - ch.left), py = Math.round(ay + (by - ay) * t - ch.top);
        ch.ctx.fillRect(px, py, width, Math.max(1, width - 1));
      }
      ch.dirty = true;
    }
  }

  // Tranchée large (Violet) : succession de cratères le long d'un segment.
  trench(x0, y0, x1, y1, r) {
    const L = Math.hypot(x1 - x0, y1 - y0);
    const rng = makeRng((x0 * 1000 + y0) | 0);
    for (let d = 0; d <= L; d += r * 0.8) {
      const t = d / L;
      this.crater(x0 + (x1 - x0) * t + (rng() - 0.5) * 0.4, y0 + (y1 - y0) * t + (rng() - 0.5) * 0.4, r);
    }
  }

  // Envoie au GPU au plus 2 blocs modifiés par image (visibles en priorité) et masque les blocs hors caméra.
  update(cam) {
    const vx = cam.worldView.x - 8, vy = cam.worldView.y - 8, vw = cam.worldView.width + 16, vh = cam.worldView.height + 16;
    let budget = 2;
    for (const ch of this.chunks) {
      const vis = !(ch.left + ch.w < vx || ch.left > vx + vw || ch.top + ch.h < vy || ch.top > vy + vh);
      if (ch.img.visible !== vis) ch.img.setVisible(vis);
      if (ch.dirty && vis && budget > 0) { ch.tex.refresh(); ch.dirty = false; budget--; }
    }
    if (budget > 0) for (const ch of this.chunks) if (ch.dirty && budget-- > 0) { ch.tex.refresh(); ch.dirty = false; }
  }

  destroy() {
    for (const ch of this.chunks) ch.img.destroy();
    this.chunks = [];
  }
}
