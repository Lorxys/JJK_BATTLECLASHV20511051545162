// Requêtes de combat partagées : zones, lignes et arcs qui touchent fléaux, bâtiments, mobilier et véhicules.
import { W } from '../state.js';
import { clamp, norm } from '../util.js';

const ok = (def, x, y) => !def.filter || def.filter(x, y);

function closestOnB(b, x, y) {
  return [clamp(x, b.x, b.x + b.s), clamp(y, b.y, b.y + b.s)];
}

// Dégâts en cercle. force > 0 repousse depuis le centre, < 0 attire.
export function area(x, y, r, def) {
  let hits = 0;
  const E = W.enemies;
  if (E && def.dmg) {
    for (const e of E.list) {
      if (e.dead || (def.once && def.once.has(e))) continue;
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
      if (d > r + e.def.r || !ok(def, e.x, e.y)) continue;
      const [nx, ny] = d > 0.01 ? [dx / d, dy / d] : norm(Math.random() - 0.5, Math.random() - 0.5);
      const fall = def.flat ? 1 : 1 - 0.4 * (d / (r + e.def.r));
      const f = (def.force || 0) * fall;
      e.hit({ dmg: def.dmg * fall, kx: nx * f + (def.dirX || 0), ky: ny * f + (def.dirY || 0), lift: (def.lift || 0) * fall, stun: def.stun || 0.3, heavy: def.heavy ?? f > 8, src: def.src });
      def.once && def.once.add(e);
      hits++;
    }
  }
  const city = W.city;
  if (!city) return hits;
  if (def.bld) {
    for (const b of city.buildings) {
      if (b.state >= 4) continue;
      if (Math.abs(b.cx - x) > r + b.s || Math.abs(b.cy - y) > r + b.s) continue;
      if (def.onceB && def.onceB.has(b)) continue;
      const [cx, cy] = closestOnB(b, x, y);
      const d = Math.hypot(cx - x, cy - y);
      if (d > r || !ok(def, cx, cy)) continue;
      city.damageBuilding(b, def.bld * (1 - 0.5 * d / r), cx, cy);
      def.onceB && def.onceB.add(b);
    }
  }
  if (def.prop !== false) for (const p of city.propsInCircle(x, y, r)) if (ok(def, p.x, p.y)) city.breakProp(p, 1 + (def.force || 0) * 0.05);
  if (def.mov || def.force) {
    for (const m of city.movablesNear(x, y, r)) {
      if (!ok(def, m.x, m.y) || (def.onceM && def.onceM.has(m))) continue;
      const dx = m.x - x, dy = m.y - y, d = Math.hypot(dx, dy) || 0.01;
      const f = (def.force || 0) * (1 - 0.4 * d / r) * 1.2;
      city.push(m, (dx / d) * f + (def.dirX || 0), (dy / d) * f + (def.dirY || 0), (def.lift || 0) * 0.8, def.mov || 0, def.src || 'player');
      def.onceM && def.onceM.add(m);
    }
  }
  return hits;
}

// Dégâts le long d'un segment de largeur w (rayon).
export function line(x0, y0, x1, y1, w, def) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 0.001;
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  const distSeg = (px, py) => {
    const t = clamp((px - x0) * ux + (py - y0) * uy, 0, L);
    return [Math.hypot(px - (x0 + ux * t), py - (y0 + uy * t)), t];
  };
  let hits = 0;
  const E = W.enemies;
  if (E && def.dmg) {
    for (const e of E.list) {
      if (e.dead || (def.once && def.once.has(e))) continue;
      const [d] = distSeg(e.x, e.y);
      if (d > w + e.def.r || !ok(def, e.x, e.y)) continue;
      const side = (e.x - x0) * -uy + (e.y - y0) * ux >= 0 ? 1 : -1;
      const f = def.force || 0, sf = def.sideForce || 0;
      e.hit({ dmg: def.dmg, kx: ux * f - uy * side * sf, ky: uy * f + ux * side * sf, lift: def.lift || 0, stun: def.stun || 0.3, heavy: def.heavy ?? f > 8, src: def.src });
      def.once && def.once.add(e);
      hits++;
    }
  }
  const city = W.city;
  if (!city) return hits;
  const steps = Math.ceil(L / 0.5);
  if (def.bld) {
    for (const b of city.buildings) {
      if (b.state >= 4 || (def.onceB && def.onceB.has(b))) continue;
      const [d, t] = distSeg(b.cx, b.cy);
      if (d > w + b.s * 0.71) continue;
      const ix = x0 + ux * t, iy = y0 + uy * t;
      if (!ok(def, ix, iy)) continue;
      city.damageBuilding(b, def.bld, ix, iy);
      def.onceB && def.onceB.add(b);
      if (def.stopOnBuilding) return hits;
    }
  }
  for (let i = 0; i <= steps; i++) {
    const px = x0 + ux * (L * i / steps), py = y0 + uy * (L * i / steps);
    if (!ok(def, px, py)) continue;
    if (def.prop !== false) for (const p of city.propsInCircle(px, py, w)) city.breakProp(p, 1.5);
    if (def.mov || def.force) {
      for (const m of city.movablesNear(px, py, w)) {
        if (def.onceM && def.onceM.has(m)) continue;
        city.push(m, ux * (def.force || 0) * 1.5, uy * (def.force || 0) * 1.5, def.lift || 0, def.mov || 0, 'player');
        def.onceM && def.onceM.add(m);
      }
    }
  }
  return hits;
}

// Arc de mêlée devant (x, y) dans la direction (dx, dy).
export function arc(x, y, dx, dy, range, half, def) {
  let hits = 0;
  const cosH = Math.cos(half);
  const E = W.enemies;
  if (E) {
    for (const e of E.list) {
      if (e.dead) continue;
      const ex = e.x - x, ey = e.y - y, d = Math.hypot(ex, ey);
      if (d > range + e.def.r) continue;
      if (d > 0.3 && (ex * dx + ey * dy) / d < cosH) continue;
      if (!ok(def, e.x, e.y)) continue;
      const f = def.force || 0;
      const extra = def.pctMax ? e.max * def.pctMax : 0;
      e.hit({ dmg: def.dmg + extra, kx: dx * f, ky: dy * f, lift: def.lift || 0, stun: def.stun || 0.25, heavy: def.heavy ?? f > 8, src: def.src });
      if (def.hitList) def.hitList.push(e);
      hits++;
    }
  }
  const city = W.city;
  if (!city) return hits;
  const cx = x + dx * range * 0.6, cy = y + dy * range * 0.6;
  if (def.bld) {
    const tx = Math.floor(x + dx * range * 0.8), ty = Math.floor(y + dy * range * 0.8);
    const seen = new Set();
    for (const [ax, ay] of [[tx, ty], [Math.floor(x + dx * 0.9), Math.floor(y + dy * 0.9)]]) {
      const b = city.buildingAtCell(ax, ay);
      if (b && !seen.has(b) && ok(def, ax, ay)) { seen.add(b); city.damageBuilding(b, def.bld, ax + 0.5, ay + 0.5); }
    }
  }
  for (const p of city.propsInCircle(cx, cy, range * 0.6)) city.breakProp(p, 1);
  if (def.mov || def.force) {
    for (const m of city.movablesNear(cx, cy, range * 0.55)) {
      city.push(m, dx * (def.force || 0) * 1.3, dy * (def.force || 0) * 1.3, def.lift || 0, def.mov || 0, 'player');
    }
  }
  return hits;
}

export function installCombat() {
  W.combat = { area, line, arc };
}
