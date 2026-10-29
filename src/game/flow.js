// Champ de navigation : distance (BFS) de chaque case au joueur, pour contourner les bâtiments.
import { W } from '../state.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Flow {
  constructor(n) {
    this.n = n;
    this.dist = new Uint16Array(n * n);
    this.queue = new Int32Array(n * n);
    this.t = 0;
    this.dirty = true;
    this.tx = -1; this.ty = -1;
  }

  update(dt, tx, ty) {
    this.t -= dt;
    tx = Math.floor(tx); ty = Math.floor(ty);
    if (!this.dirty && this.t > 0) return;
    if (!this.dirty && tx === this.tx && ty === this.ty && this.t > -1) return;
    this.t = 0.3; this.dirty = false; this.tx = tx; this.ty = ty;
    const { n, dist, queue } = this;
    const city = W.city;
    dist.fill(65535);
    if (tx < 0 || ty < 0 || tx >= n || ty >= n) return;
    let h = 0, t = 0;
    dist[ty * n + tx] = 0; queue[t++] = ty * n + tx;
    while (h < t) {
      const c = queue[h++];
      const cx = c % n, cy = (c / n) | 0, d = dist[c] + 1;
      if (d > 60) continue;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DIRS[k][0], ny = cy + DIRS[k][1];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const ni = ny * n + nx;
        if (dist[ni] <= d || city.solidCell(nx, ny)) continue;
        if (k >= 4 && (city.solidCell(cx + DIRS[k][0], cy) || city.solidCell(cx, cy + DIRS[k][1]))) continue;
        dist[ni] = d; queue[t++] = ni;
      }
    }
  }

  // Direction (dx, dy) vers la case voisine la plus proche du joueur, ou null.
  dirAt(x, y) {
    const { n, dist } = this;
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) return null;
    let best = dist[cy * n + cx], bx = 0, by = 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const v = dist[ny * n + nx];
      if (v < best) { best = v; bx = nx + 0.5 - x; by = ny + 0.5 - y; }
    }
    if (bx === 0 && by === 0) return null;
    const l = Math.hypot(bx, by);
    return [bx / l, by / l];
  }
}
