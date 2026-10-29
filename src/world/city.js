// Ville vivante : bâtiments destructibles par états, mobilier cassable, véhicules et objets projetables.
import { W } from '../state.js';
import { isoX, isoY, depthOf, rand, clamp } from '../util.js';
import { WALKABLE, T } from './citygen.js';
import { VARIANTS, buildingHp } from '../gfx/buildingArt.js';
import { buildingTex, originOf, ART } from '../gfx/registry.js';
import { settings } from '../settings.js';

const BROKEN = {
  tree_round: 'stump', tree_cherry: 'stump', tree_pine: 'stump', bush: 'bush_b', lamp: 'lamp_b', hydrant: 'hydrant_b',
  sign: 'sign_b', bin: 'bin_b', bench: 'bench_b', fence_x: 'fence_x_b', fence_y: 'fence_y_b', torii: 'torii_b',
};
const MOV = {
  car: { r: 0.42, mass: 1, hp: 60, explode: true },
  van: { r: 0.5, mass: 1.5, hp: 85, explode: true },
  truck: { r: 0.6, mass: 2.3, hp: 130, explode: true },
  container: { r: 0.6, mass: 2.2, hp: 170, explode: false },
  vending: { r: 0.25, mass: 0.5, hp: 30, explode: false },
};
const STATE_AT = [0.8, 0.55, 0.3, 0]; // seuils de vie -> états 1..4
const G = 700;

export class City {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    const N = map.n;
    this.cellB = new Int16Array(N * N).fill(-1);
    this.buildings = map.buildings.map((d, i) => {
      const spec = VARIANTS[d.variant];
      const key = buildingTex(d.variant, 0);
      const a = ART.anchors[key];
      const img = scene.add.image(isoX(d.x, d.y) - a.ox, isoY(d.x, d.y) - a.oy, key).setOrigin(0, 0);
      const depth = (d.x + d.y + d.s - 0.15) * 16;
      img.setDepth(depth);
      for (let j = 0; j < d.s; j++) for (let k = 0; k < d.s; k++) this.cellB[(d.y + j) * N + d.x + k] = i;
      const hp = buildingHp(d.variant);
      return { id: i, x: d.x, y: d.y, s: d.s, variant: d.variant, spec, hp, max: hp, state: 0, img, depth, collapse: 0, cx: d.x + d.s / 2, cy: d.y + d.s / 2, smokeT: 0 };
    });
    this.props = map.props.map((d) => {
      const [ox, oy] = originOf(d.type);
      const img = scene.add.image(Math.round(isoX(d.x, d.y)), Math.round(isoY(d.x, d.y)), d.type).setOrigin(ox, oy).setDepth(depthOf(d.x, d.y));
      return { x: d.x, y: d.y, type: d.type, img, broken: false, spray: 0 };
    });
    this.propGrid = new Map();
    for (const p of this.props) {
      const k = (p.y | 0) * N + (p.x | 0);
      if (!this.propGrid.has(k)) this.propGrid.set(k, []);
      this.propGrid.get(k).push(p);
    }
    this.movables = map.movables.map((d) => this.makeMovable(d));
    this.explodeQueue = [];
    this.fires = [];
    this.cullT = 0;
    this.mgrid = new Map();
    this.shadows = settings().shadows;
  }

  makeMovable(d) {
    const def = MOV[d.type];
    const key = `${d.type}_${d.color % 6}_${d.orient}`;
    const [ox, oy] = originOf(key);
    const shadow = this.scene.add.image(0, 0, d.type === 'vending' ? 'shadow_s' : 'shadow_m').setDepth(-8e5).setVisible(false);
    const img = this.scene.add.image(0, 0, key).setOrigin(ox, oy);
    const m = { ...d, def, x: d.x, y: d.y, z: 0, vx: 0, vy: 0, vz: 0, hp: def.hp, wreck: false, img, shadow, sleep: true, spinT: 0, burn: 0, held: false, thrower: null, hitSet: null };
    this.placeMovable(m);
    return m;
  }
  placeMovable(m) {
    m.img.setPosition(Math.round(isoX(m.x, m.y)), Math.round(isoY(m.x, m.y) - m.z)).setDepth(depthOf(m.x, m.y) + (m.held ? 40 : 0));
    const show = this.shadows && (m.z > 2 || m.held);
    m.shadow.setVisible(show && m.img.visible);
    if (show) m.shadow.setPosition(Math.round(isoX(m.x, m.y)), Math.round(isoY(m.x, m.y)));
  }

  // --- Collisions ---
  solidCell(tx, ty) {
    const N = this.map.n;
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return true;
    const i = ty * N + tx;
    if (!WALKABLE(this.map.ground[i])) return true;
    const b = this.cellB[i];
    return b >= 0 && this.buildings[b].state < 4;
  }
  solid(x, y) { return this.solidCell(Math.floor(x), Math.floor(y)); }
  circleSolid(x, y, r) {
    const pts = [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]];
    for (const [px, py] of pts) if (this.solid(px, py)) return [Math.floor(px), Math.floor(py)];
    return null;
  }
  // Déplacement par axe avec glissement le long des murs. Renvoie la case heurtée ou null.
  moveCircle(o, dx, dy, r) {
    let hit = null;
    if (dx) {
      o.x += dx;
      const h = this.circleSolid(o.x, o.y, r);
      if (h) { o.x -= dx; hit = h; }
    }
    if (dy) {
      o.y += dy;
      const h = this.circleSolid(o.x, o.y, r);
      if (h) { o.y -= dy; hit = hit || h; }
    }
    return hit;
  }
  buildingAtCell(tx, ty) {
    const N = this.map.n;
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return null;
    const b = this.cellB[ty * N + tx];
    return b >= 0 ? this.buildings[b] : null;
  }

  // --- Bâtiments ---
  damageBuilding(b, dmg, ix = b.cx, iy = b.cy) {
    if (b.state >= 4 || b.collapse > 0) return;
    dmg *= W.session ? W.session.destruction : 1;
    if (b.spec.style === 'tank' || b.spec.style === 'crane') dmg *= 1.3;
    b.hp -= dmg;
    const ratio = b.hp / b.max;
    let ns = 0;
    for (let i = 0; i < STATE_AT.length; i++) if (ratio <= STATE_AT[i]) ns = i + 1;
    if (b.hp <= 0) ns = 4;
    // éclats à l'impact
    const fx = W.fx;
    const z = Math.min(b.spec.h * 0.6, 20 + Math.random() * b.spec.h * 0.4);
    if (fx && dmg > 20) {
      fx.debris(ix, iy, z, Math.min(8, 2 + dmg / 80), b.spec.style === 'glass' ? 'glass' : b.spec.style === 'factory' ? 'brick' : 'concrete', 0.8);
      if (Math.random() < 0.5) fx.dust(ix, iy, 2, 1, 0.5);
    }
    if (ns > b.state) this.setBuildingState(b, ns);
  }

  setBuildingState(b, ns) {
    const prev = b.state;
    const fx = W.fx;
    W.chaos && W.chaos.addDestruction(ns - prev);
    if (ns >= 4) { this.startCollapse(b); return; }
    b.state = ns;
    b.img.setTexture(buildingTex(b.variant, ns));
    if (fx) {
      fx.dust(b.cx, b.cy, 4 + b.s * 2, 2, b.s * 0.4);
      if (ns >= 2) fx.debris(b.cx, b.cy, b.spec.h * 0.5, 6 + b.s, b.spec.style === 'glass' ? 'glass' : 'concrete', 1.2);
      if (ns === 3) {
        // les étages supérieurs se détachent et tombent
        for (let i = 0; i < 3 + b.s; i++) fx.chunks(b.cx + rand(-b.s / 2, b.s / 2), b.cy + rand(-b.s / 2, b.s / 2), b.spec.h * rand(0.6, 1), 1, 1.4);
        fx.shakeCam(3 + b.s * 0.5);
        W.audio && W.audio.play('crumble');
      } else W.audio && W.audio.play('glass');
    }
  }

  startCollapse(b) {
    b.collapse = 0.001;
    b.state = 3;
    b.img.setTexture(buildingTex(b.variant, 3));
    const fx = W.fx;
    if (fx) {
      fx.shakeCam(5 + b.s);
      fx.ring(b.cx, b.cy, b.s * 0.5, b.s * 1.4, 0.8, 0xd8d0c2, 3, { top: false });
    }
    W.audio && W.audio.play('collapse');
  }

  finishCollapse(b) {
    b.collapse = 0;
    b.state = 4;
    const key = buildingTex(b.variant, 4);
    const a = ART.anchors[key];
    b.img.setTexture(key).setCrop().setPosition(isoX(b.x, b.y) - a.ox, isoY(b.x, b.y) - a.oy);
    b.img.setDepth((b.x + b.y) * 16 + 2);
    W.flow && (W.flow.dirty = true);
    const fx = W.fx;
    if (fx) {
      for (let i = 0; i < 4 + b.s * 2; i++) fx.dust(b.cx + rand(-b.s / 2, b.s / 2), b.cy + rand(-b.s / 2, b.s / 2), 2, 3, 1.2);
      fx.debris(b.cx, b.cy, 6, 10, 'concrete', 1.5);
    }
    // l'effondrement écrase ce qui est autour
    W.combat && W.combat.area(b.cx, b.cy, b.s * 0.75 + 1, { dmg: 60, force: 5, lift: 80, stun: 0.6, bld: 0, mov: 60, src: 'collapse' });
    this.smokeT = 0;
    b.smokeT = 6;
  }

  // --- Mobilier ---
  breakProp(p, force = 1) {
    if (p.broken) return;
    p.broken = true;
    const b = BROKEN[p.type];
    if (b) { const [ox, oy] = originOf(b); p.img.setTexture(b).setOrigin(ox, oy); }
    else p.img.setVisible(false);
    const fx = W.fx;
    W.chaos && W.chaos.addDestruction(0.05);
    if (!fx) return;
    if (p.type.startsWith('tree') || p.type === 'bush') {
      fx.debris(p.x, p.y, 18, 8, 'leaf', force);
      for (let i = 0; i < 6; i++) fx.spawn('px2', p.x, p.y, 14 + Math.random() * 10, rand(-1, 1) * force, rand(-1, 1) * force, rand(30, 80), 1.2,
        { tint: p.type === 'tree_cherry' ? 0xf0a6c4 : 0x5fa84a, g: 200, debris: true });
    } else if (p.type === 'lamp') { fx.sparks(p.x, p.y, 30, 8, 0xfff2b0); fx.debris(p.x, p.y, 20, 4, 'metal'); }
    else if (p.type === 'hydrant') { p.spray = 8; fx.debris(p.x, p.y, 4, 3, 'metal'); }
    else fx.debris(p.x, p.y, 6, 5, p.type.startsWith('fence') ? 'metal' : 'concrete', force);
  }
  propsInCircle(x, y, r) {
    const N = this.map.n, out = [];
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      const l = this.propGrid.get(ty * N + tx);
      if (!l) continue;
      for (const p of l) if (!p.broken && (p.x - x) ** 2 + (p.y - y) ** 2 <= r * r) out.push(p);
    }
    return out;
  }

  // --- Véhicules et objets mobiles ---
  movablesNear(x, y, r) {
    const out = [];
    for (const m of this.movables) if (!m.held && Math.abs(m.x - x) < r + 1 && Math.abs(m.y - y) < r + 1 && (m.x - x) ** 2 + (m.y - y) ** 2 <= (r + m.def.r) ** 2) out.push(m);
    return out;
  }
  // Pousse / projette un objet. (kx, ky) en cases/s, lift en px/s.
  push(m, kx, ky, lift = 0, dmg = 0, thrower = null) {
    m.sleep = false;
    const inv = 1 / m.def.mass;
    m.vx += kx * inv; m.vy += ky * inv; m.vz += lift * inv;
    if (thrower) { m.thrower = thrower; m.hitSet = new Set(); }
    if (dmg) this.damageMovable(m, dmg);
  }
  damageMovable(m, dmg) {
    if (m.wreck) return;
    m.hp -= dmg;
    if (m.hp <= m.def.hp * 0.5 && !m.burn && m.def.explode) m.burn = 0.01;
    if (m.hp <= 0) {
      if (m.def.explode) this.explodeQueue.push({ m, t: rand(0.12, 0.35) });
      else this.wreckMovable(m);
    } else if (dmg > 10 && W.fx) W.fx.debris(m.x, m.y, 6, 3, 'metal', 0.8);
  }
  wreckMovable(m) {
    if (m.wreck) return;
    m.wreck = true;
    const key = `${m.type}_w_${m.orient}`;
    const [ox, oy] = originOf(key);
    m.img.setTexture(key).setOrigin(ox, oy);
    W.chaos && W.chaos.addDestruction(0.4);
    if (W.fx) W.fx.debris(m.x, m.y, 6, 6, 'metal', 1);
  }
  explodeMovable(m) {
    if (m.wreck) return;
    this.wreckMovable(m);
    m.burn = 7;
    const fx = W.fx;
    fx && fx.explosion(m.x, m.y, 2.2);
    fx && fx.shakeCam(4);
    W.ground && W.ground.scorch(m.x, m.y, 1.2);
    W.audio && W.audio.play('explosion');
    W.chaos && W.chaos.addDestruction(0.8);
    this.push(m, 0, 0, 160);
    // réaction en chaîne
    W.combat && W.combat.area(m.x, m.y, 2.3, { dmg: 70, force: 9, lift: 150, stun: 0.6, bld: 160, mov: 90, prop: true, src: 'car' });
  }

  updateMovables(dt) {
    // grille de voisinage pour les collisions entre objets
    this.mgrid.clear();
    for (const m of this.movables) {
      if (m.held) continue;
      const k = (m.x >> 2) + ',' + (m.y >> 2);
      let l = this.mgrid.get(k); if (!l) this.mgrid.set(k, l = []); l.push(m);
    }
    for (const m of this.movables) {
      if (m.burn > 0) {
        m.burn -= dt;
        if (Math.random() < dt * (m.wreck ? 6 : 3)) W.fx && (m.wreck ? W.fx.flames(m.x, m.y, 1, 0.3) : W.fx.smoke(m.x, m.y, 8, 1));
        if (!m.wreck && m.burn > 0 && Math.random() < dt * 0.08) this.damageMovable(m, 999);
      }
      if (m.held) { this.placeMovable(m); continue; }
      if (m.sleep) continue;
      const sp = Math.hypot(m.vx, m.vy);
      const hit = W.city.moveCircle(m, m.vx * dt, m.vy * dt, m.def.r * 0.8);
      if (hit) {
        const b = this.buildingAtCell(hit[0], hit[1]);
        if (sp > 3) {
          if (b) this.damageBuilding(b, sp * m.def.mass * 18, m.x, m.y);
          this.damageMovable(m, sp * 4);
          W.fx && W.fx.dust(m.x, m.y, 4, 2, 0.6);
          W.fx && W.fx.shakeCam(Math.min(4, sp * 0.3));
          W.audio && W.audio.play('metal');
        }
        // rebond
        const cx = hit[0] + 0.5, cy = hit[1] + 0.5;
        if (Math.abs(m.x - cx) > Math.abs(m.y - cy)) m.vx = -m.vx * 0.35; else m.vy = -m.vy * 0.35;
      }
      m.z += m.vz * dt;
      m.vz -= G * dt;
      if (m.z <= 0) {
        if (m.vz < -160) {
          this.damageMovable(m, -m.vz * 0.05);
          W.fx && W.fx.dust(m.x, m.y, 3, 2, 0.6);
          if (m.vz < -260) W.ground && W.ground.crack(m.x, m.y);
          m.vz = -m.vz * 0.25;
        } else m.vz = 0;
        m.z = 0;
        const k = Math.exp(-3.2 * dt);
        m.vx *= k; m.vy *= k;
      }
      // rotation simulée pendant le vol
      if (m.z > 6) {
        m.spinT -= dt;
        if (m.spinT <= 0) {
          m.spinT = 0.14; m.orient ^= 1;
          const key = m.wreck ? `${m.type}_w_${m.orient}` : `${m.type}_${m.color % 6}_${m.orient}`;
          m.img.setTexture(key);
        }
      }
      // collisions entre objets et contre les fléaux
      if (sp > 2.5 || m.z > 4) {
        for (let gy = (m.y >> 2) - 1; gy <= (m.y >> 2) + 1; gy++) for (let gx = (m.x >> 2) - 1; gx <= (m.x >> 2) + 1; gx++) {
          const l = this.mgrid.get(gx + ',' + gy);
          if (!l) continue;
          for (const o of l) {
            if (o === m) continue;
            const dx = o.x - m.x, dy = o.y - m.y, rr = m.def.r + o.def.r;
            if (dx * dx + dy * dy > rr * rr || Math.abs(o.z - m.z) > 20) continue;
            const d = Math.hypot(dx, dy) || 0.01;
            const share = m.def.mass / (m.def.mass + o.def.mass);
            this.push(o, (dx / d) * sp * share * 1.4 * o.def.mass, (dy / d) * sp * share * 1.4 * o.def.mass, 40);
            this.damageMovable(o, sp * 5 * m.def.mass);
            this.damageMovable(m, sp * 2);
            m.vx *= 1 - share * 0.6; m.vy *= 1 - share * 0.6;
            W.audio && W.audio.play('metal');
          }
        }
        if (W.enemies) W.enemies.hitByObject(m, sp);
        for (const p of this.propsInCircle(m.x, m.y, m.def.r + 0.2)) this.breakProp(p, 1);
      }
      if (sp < 0.08 && m.z <= 0 && Math.abs(m.vz) < 1) { m.vx = m.vy = 0; m.sleep = true; m.thrower = null; }
      this.placeMovable(m);
    }
    for (let i = this.explodeQueue.length - 1; i >= 0; i--) {
      const e = this.explodeQueue[i];
      e.t -= dt;
      if (e.t <= 0) { this.explodeQueue.splice(i, 1); this.explodeMovable(e.m); }
    }
  }

  // Zone en feu qui brûle les fléaux (Flèche de feu).
  addFire(x, y, r, dur) { this.fires.push({ x, y, r, t: dur }); }

  update(dt, cam) {
    this.updateMovables(dt);
    for (const b of this.buildings) {
      if (b.collapse > 0) {
        b.collapse += dt;
        const k = Math.min(1, b.collapse / 0.9);
        const a = ART.anchors[b.img.texture.key];
        const sink = Math.round(k * k * a.h * 0.55);
        b.img.setCrop(0, 0, a.w, a.h - sink).setPosition(isoX(b.x, b.y) - a.ox + Math.round(Math.sin(b.collapse * 60) * 1.5), isoY(b.x, b.y) - a.oy + sink);
        if (Math.random() < dt * 30) W.fx && W.fx.dust(b.cx + rand(-b.s / 2, b.s / 2), b.cy + rand(-b.s / 2, b.s / 2), 1, 3, 0.8);
        if (k >= 1) this.finishCollapse(b);
      } else if (b.smokeT > 0) {
        b.smokeT -= dt;
        if (Math.random() < dt * 4) W.fx && W.fx.smoke(b.cx + rand(-b.s / 3, b.s / 3), b.cy + rand(-b.s / 3, b.s / 3), 6, 1);
      }
    }
    for (const p of this.props) {
      if (p.spray > 0) {
        p.spray -= dt;
        if (W.fx && Math.random() < dt * 25) W.fx.spawn('px2', p.x, p.y, 4, rand(-0.4, 0.4), rand(-0.4, 0.4), rand(90, 140), 0.7, { tint: 0xbfe6fa, g: 300 });
      }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      if (f.t <= 0) { this.fires.splice(i, 1); continue; }
      if (W.fx && Math.random() < dt * 10) W.fx.flames(f.x, f.y, 1, f.r * 0.7);
      if (W.enemies) W.enemies.burn(f.x, f.y, f.r, 18 * dt);
    }
    this.cull(cam, dt);
  }

  // Masque ce qui est hors champ et rend translucides les bâtiments qui cachent le joueur.
  cull(cam, dt) {
    const v = cam.worldView, m = 40;
    const x0 = v.x - m, y0 = v.y - m, x1 = v.x + v.width + m, y1 = v.y + v.height + m;
    const pl = W.player;
    const px = pl ? isoX(pl.x, pl.y) : 0, py = pl ? isoY(pl.x, pl.y) - 16 : 0, pd = pl ? depthOf(pl.x, pl.y) : 0;
    for (const b of this.buildings) {
      const im = b.img;
      const a = ART.anchors[im.texture.key];
      const vis = !(im.x + a.w < x0 || im.x > x1 || im.y + a.h < y0 || im.y > y1);
      if (im.visible !== vis) im.setVisible(vis);
      if (!vis) continue;
      let alpha = 1;
      if (pl && b.state < 4 && b.depth > pd && px > im.x + 4 && px < im.x + a.w - 4 && py > im.y && py < im.y + a.h - b.s * 6) alpha = 0.38;
      if (im.alpha !== alpha) im.setAlpha(alpha);
    }
    this.cullT -= dt;
    if (this.cullT > 0) return;
    this.cullT = 0.12;
    for (const p of this.props) {
      const vis = (p.img.x > x0 && p.img.x < x1 && p.img.y > y0 && p.img.y < y1 + 30) && !(p.broken && !BROKEN[p.type]);
      if (p.img.visible !== vis) p.img.setVisible(vis);
    }
    for (const mv of this.movables) {
      const vis = mv.img.x > x0 && mv.img.x < x1 && mv.img.y > y0 && mv.img.y < y1 + 30;
      if (mv.img.visible !== vis) mv.img.setVisible(vis);
    }
  }

  destroy() {
    for (const b of this.buildings) b.img.destroy();
    for (const p of this.props) p.img.destroy();
    for (const m of this.movables) { m.img.destroy(); m.shadow.destroy(); }
    this.buildings = []; this.props = []; this.movables = [];
  }
}
