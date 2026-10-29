// Effets visuels : particules et débris en pixels (pool limité selon la qualité), anneaux,
// lignes d'énergie, tremblements, gel à l'impact et ralentis.
import { W } from '../state.js';
import { isoX, isoY, depthOf, rand, TAU } from '../util.js';
import { QUALITY } from '../config.js';
import { settings } from '../settings.js';
import { NIGHT_TINT, nightMul } from './night.js';

const FX_DEPTH = 9e5;
const GLOWING = /^(flame|impact|swipe|star|spark|orb)/;

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.live = [];
    this.shapes = [];
    this.ghosts = [];
    this.groundG = scene.add.graphics().setDepth(-9e5);
    this.topG = scene.add.graphics().setDepth(FX_DEPTH);
    this.shake = 0;
  }

  limit() {
    const q = QUALITY[W.quality] || QUALITY.medium;
    const e = settings().effects;
    return Math.round(q.particles * (e === 'reduced' ? 0.5 : e === 'max' ? 1.4 : 1));
  }
  debrisLimit() {
    const q = QUALITY[W.quality] || QUALITY.medium;
    const d = settings().debris;
    return Math.round(q.debris * (d === 'few' ? 0.5 : d === 'many' ? 1.6 : 1));
  }

  // Particule monde : x, y en cases ; z en pixels ; vitesses en cases/s (z en px/s).
  spawn(tex, x, y, z, vx, vy, vz, life, o = {}) {
    if (this.live.length >= this.limit()) {
      if (!o.important) return null;
      this.kill(this.live[0], 0);
    }
    let img = this.pool.pop();
    if (!img) img = this.scene.add.image(0, 0, tex);
    else img.setTexture(tex).setVisible(true);
    img.setOrigin(0.5, 0.5).setScale(o.scale || 1).setAlpha(1).setRotation(o.rot || 0);
    // la nuit assombrit poussière, débris et fumée ; flammes, éclats et énergie restent lumineux
    const lum = o.add || o.raw || GLOWING.test(tex);
    if (o.tint !== undefined) img.setTint(lum ? o.tint : nightMul(o.tint)); else if (lum) img.clearTint(); else img.setTint(NIGHT_TINT);
    img.setBlendMode(o.add ? 1 : 0);
    const p = { img, x, y, z, vx, vy, vz, life, max: life, g: o.g ?? 0, drag: o.drag ?? 0, frames: o.frames, fps: o.fps || 12,
      grow: o.grow || 0, top: !!o.top, blink: o.blink !== false, bounce: o.bounce ?? 0, debris: !!o.debris, spin: o.spin || 0 };
    this.live.push(p);
    this.place(p);
    return p;
  }
  place(p) {
    p.img.setPosition(isoX(p.x, p.y), isoY(p.x, p.y) - p.z);
    p.img.setDepth(p.top ? FX_DEPTH - 1 : depthOf(p.x, p.y) + 3);
  }
  kill(p, i = this.live.indexOf(p)) {
    if (i >= 0) this.live.splice(i, 1);
    p.img.setVisible(false);
    this.pool.push(p.img);
  }

  // --- Recettes ---
  dust(x, y, n = 6, size = 1, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(0.3, 1.4) * spread;
      this.spawn('dust' + Math.min(3, Math.max(0, size + Math.floor(Math.random() * 2) - 1)), x, y, rand(0, 6),
        Math.cos(a) * s, Math.sin(a) * s, rand(5, 25), rand(0.5, 1.1), { drag: 2.5, grow: 0.6 });
    }
  }
  debris(x, y, z, n = 8, kind = 'concrete', force = 1) {
    const set = kind === 'glass' ? ['deb3'] : kind === 'brick' ? ['deb2', 'deb0'] : kind === 'metal' ? ['deb4', 'deb5'] : kind === 'leaf' ? ['px2'] : ['deb0', 'deb1', 'deb5'];
    let count = 0;
    for (const p of this.live) if (p.debris) count++;
    n = Math.min(n, Math.max(2, this.debrisLimit() - count));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(0.5, 3) * force;
      this.spawn(set[i % set.length], x, y, z, Math.cos(a) * s, Math.sin(a) * s, rand(60, 200) * force, rand(1.2, 2.2),
        { g: 520, bounce: 0.35, debris: true, tint: kind === 'leaf' ? 0x4f9a3c : undefined, spin: rand(-8, 8) });
    }
  }
  chunks(x, y, z, n = 3, force = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(0.5, 2.2) * force;
      this.spawn('chunk' + (i % 3), x, y, z, Math.cos(a) * s, Math.sin(a) * s, rand(40, 140), rand(1.5, 2.4), { g: 520, bounce: 0.2, debris: true, spin: rand(-5, 5) });
    }
  }
  sparks(x, y, z, n = 6, tint = 0xffffff, speed = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(0.5, 1) * speed;
      this.spawn(i % 3 ? 'px2' : 'spark', x, y, z, Math.cos(a) * s, Math.sin(a) * s, rand(-30, 90), rand(0.15, 0.4), { tint, add: true, g: 200 });
    }
  }
  energy(x, y, z, n, tint, speed = 2, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(0.3, 1) * speed;
      this.spawn(i % 2 ? 'px2' : 'px3', x, y, z, Math.cos(a) * s, Math.sin(a) * s, rand(-20, 60), rand(life * 0.5, life), { tint, add: true, drag: 1.5 });
    }
  }
  // Implosion : particules aspirées vers (x, y).
  suck(x, y, r, n, tint) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = r * rand(0.6, 1);
      const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d;
      const t = rand(0.25, 0.45);
      this.spawn('px2', sx, sy, rand(4, 30), (x - sx) / t, (y - sy) / t, 0, t, { tint, add: true });
    }
  }
  flames(x, y, n = 6, r = 0.6, z0 = 0) {
    for (let i = 0; i < n; i++) {
      this.spawn('flame' + (i % 4), x + rand(-r, r), y + rand(-r, r) * 0.7, z0 + rand(0, 6), rand(-0.2, 0.2), rand(-0.2, 0.2), rand(20, 50), rand(0.35, 0.7), { frames: ['flame0', 'flame1', 'flame2', 'flame3'], fps: 14 });
    }
  }
  smoke(x, y, z = 10, n = 2) {
    for (let i = 0; i < n; i++) {
      this.spawn('dust' + (2 + (i % 2)), x + rand(-0.2, 0.2), y + rand(-0.2, 0.2), z, rand(-0.2, 0.2), rand(-0.3, 0), rand(18, 30), rand(1, 1.6), { tint: 0x55504c, grow: 0.8 });
    }
  }
  explosion(x, y, r = 2, tint = 0xffa22e) {
    const big = r > 2.5;
    this.ring(x, y, 0.3, r * 1.2, 0.35, 0xfff3a0, 3);
    this.ring(x, y, 0.2, r * 0.9, 0.5, tint, 2);
    for (let i = 0; i < 10 + r * 6; i++) {
      const a = Math.random() * TAU, s = rand(0.5, 2.5) * r;
      this.spawn('flame' + (i % 4), x, y, rand(0, 10), Math.cos(a) * s, Math.sin(a) * s, rand(30, 120), rand(0.3, 0.7), { frames: ['flame0', 'flame1', 'flame2', 'flame3'], drag: 3, scale: big ? 2 : 1, important: i < 6 });
    }
    this.dust(x, y, 6 + r * 3, 3, r * 0.8);
    this.debris(x, y, 4, 6 + r * 2, 'concrete', 1 + r * 0.2);
    this.flash(x, y, r);
    W.night && W.night.flash(x, y, r * 2.4, tint, 0.45, 0.55);
  }
  // Impact de coup : éclat en étoile + lignes de vitesse.
  impact(x, y, z, tint = 0xffffff, heavy = false) {
    this.spawn('impact0', x, y, z, 0, 0, 0, heavy ? 0.16 : 0.11, { frames: ['impact0', 'impact1', 'impact2'], fps: heavy ? 18 : 27, tint, top: true, blink: false, important: true, scale: heavy ? 1.6 : 1 });
    const n = heavy ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r0 = 0.35, r1 = heavy ? 1.6 : 1.0;
      this.beam(x + Math.cos(a) * r0, y + Math.sin(a) * r0, z, x + Math.cos(a) * r1, y + Math.sin(a) * r1, z + rand(-6, 6), 0.07, i % 2 ? 0xffffff : tint, 1);
    }
    this.sparks(x, y, z, heavy ? 8 : 4, tint, heavy ? 4 : 2.5);
  }

  // Disparition d'un fléau : énergie maudite qui s'élève.
  dissolve(x, y, h, big = false) {
    const n = big ? 40 : 16;
    for (let i = 0; i < n; i++) {
      this.spawn(i % 3 ? 'px2' : 'px3', x + rand(-0.4, 0.4) * (big ? 2 : 1), y + rand(-0.3, 0.3), rand(0, h), rand(-0.3, 0.3), rand(-0.3, 0.3), rand(20, 70), rand(0.6, 1.2),
        { tint: i % 2 ? 0x2a0f3a : 0x8a3ad0, drag: 1 });
    }
  }
  // Silhouette fantôme (téléportation, dash).
  ghost(sprite, tint = 0x9fd0ff, life = 0.3) {
    const g = this.scene.add.image(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
      .setOrigin(sprite.originX, sprite.originY).setFlipX(sprite.flipX).setTint(tint).setAlpha(0.7).setDepth(sprite.depth - 1).setBlendMode(1);
    this.ghosts.push({ g, life, max: life });
  }

  // --- Formes dessinées (anneaux, zones, faisceaux) ---
  ring(x, y, r0, r1, life, color, width = 2, o = {}) { this.shapes.push({ k: 'ring', x, y, r0, r1, life, max: life, color, width, top: o.top !== false, alpha: o.alpha ?? 1 }); }
  disc(x, y, r0, r1, life, color, alpha = 0.5, o = {}) { this.shapes.push({ k: 'disc', x, y, r0, r1, life, max: life, color, alpha, top: !!o.top }); }
  beam(x0, y0, z0, x1, y1, z1, life, color, width = 2) { this.shapes.push({ k: 'beam', x0, y0, z0, x1, y1, z1, life, max: life, color, width, top: true }); }
  flash(x, y, r) { this.shapes.push({ k: 'disc', x, y, r0: r * 0.6, r1: r * 0.2, life: 0.1, max: 0.1, color: 0xffffff, alpha: 0.9, top: true }); W.night && W.night.flash(x, y, r * 1.6, 0xfff0d0, 0.15, 0.45); }

  shakeCam(amount) {
    if (!settings().shake) return;
    this.shake = Math.min(12, Math.max(this.shake, amount));
  }
  hitstop(t) { W.hitstop = Math.max(W.hitstop, t); }
  slowmo(f, t) { W.slowmo = f; W.slowmoT = t; }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) { this.kill(p, i); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      if (p.g) {
        p.vz -= p.g * dt;
        if (p.z < 0) {
          p.z = 0;
          if (p.bounce && p.vz < -40) { p.vz = -p.vz * p.bounce; p.vx *= 0.6; p.vy *= 0.6; }
          else { p.vz = 0; p.vx *= 0.8; p.vy *= 0.8; p.spin = 0; }
        }
      }
      if (p.spin) p.img.rotation += p.spin * dt;
      if (p.grow) p.img.setScale(p.img.scaleX + p.grow * dt);
      if (p.frames) p.img.setTexture(p.frames[Math.floor((p.max - p.life) * p.fps) % p.frames.length]);
      // disparition par clignotement (pas de fondu progressif)
      if (p.blink && p.life < p.max * 0.3) p.img.setVisible(Math.floor(p.life * 30) % 2 === 0);
      this.place(p);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life -= dt;
      if (g.life <= 0) { g.g.destroy(); this.ghosts.splice(i, 1); continue; }
      g.g.setAlpha(0.7 * (g.life / g.max));
    }
    this.drawShapes(dt);
  }

  drawShapes(dt) {
    const gG = this.groundG, tG = this.topG;
    gG.clear(); tG.clear();
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      s.life -= dt;
      if (s.life <= 0) { this.shapes.splice(i, 1); continue; }
      const t = 1 - s.life / s.max;
      const g = s.top ? tG : gG;
      if (s.k === 'ring') {
        const r = s.r0 + (s.r1 - s.r0) * t;
        g.lineStyle(s.width, s.color, s.alpha * (t > 0.7 ? 0.6 : 1));
        g.strokeEllipse(isoX(s.x, s.y), isoY(s.x, s.y), r * 45.25, r * 22.63);
      } else if (s.k === 'disc') {
        const r = s.r0 + (s.r1 - s.r0) * t;
        g.fillStyle(s.color, s.alpha);
        g.fillEllipse(isoX(s.x, s.y), isoY(s.x, s.y), r * 45.25, r * 22.63);
      } else if (s.k === 'beam') {
        g.lineStyle(s.width, s.color, 1);
        g.lineBetween(isoX(s.x0, s.y0), isoY(s.x0, s.y0) - s.z0, isoX(s.x1, s.y1), isoY(s.x1, s.y1) - s.z1);
      }
    }
  }

  clear() {
    for (const p of this.live) { p.img.setVisible(false); this.pool.push(p.img); }
    this.live = [];
    this.shapes = [];
    for (const g of this.ghosts) g.g.destroy();
    this.ghosts = [];
  }
}
