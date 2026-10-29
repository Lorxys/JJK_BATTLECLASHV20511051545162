// Extensions du territoire : Unlimited Void (Gojo) et Malevolent Shrine (Sukuna).
// Zone circulaire fixe, frontière visible, cinématique d'activation protégée, phase active, attaque finale, dissipation.
import { W } from '../state.js';
import { DOMAIN } from '../config.js';
import { isoX, isoY, depthOf, rand, TAU } from '../util.js';
import { originOf } from '../gfx/registry.js';

const SX = 45.25, SY = 22.63; // diamètre écran d'un cercle monde de rayon 1

export class Domain {
  constructor(scene) {
    this.scene = scene;
    this.zone = null;
    this.cinematic = false;
    this.g = scene.add.graphics().setDepth(-8.95e5);
    this.top = scene.add.graphics().setDepth(9e5 - 5);
    this.shrine = null;
  }

  contains(x, y) {
    const z = this.zone;
    return z && Math.hypot(x - z.x, y - z.y) <= z.r;
  }

  start(type, pl) {
    if (this.zone) return;
    this.zone = { type, x: pl.x, y: pl.y, r: DOMAIN.radius, phase: 'cinematic', t: 0, slashT: 0, once: new Set(), onceB: new Set(), onceM: new Set(), waveR: 0 };
    this.cinematic = true;
    pl.state = 'cinematic'; pl.animT = 0; pl.inv = DOMAIN.cinematic + 0.3;
    W.ui && W.ui.domainTitle(type);
    W.audio && W.audio.play('domain');
    W.fx.shakeCam(4);
  }

  filter() {
    const z = this.zone;
    return (x, y) => Math.hypot(x - z.x, y - z.y) <= z.r;
  }

  update(dt) {
    const z = this.zone;
    this.g.clear(); this.top.clear();
    if (!z) return;
    z.t += dt;
    const fx = W.fx;
    const void_ = z.type === 'void';
    let reveal = 1;

    if (z.phase === 'cinematic') {
      reveal = Math.min(1, z.t / (DOMAIN.cinematic * 0.8));
      if (Math.random() < 0.5) fx.energy(z.x, z.y, 20, 3, void_ ? 0x9fd0ff : 0xff3030, 4, 0.6);
      if (!void_ && !this.shrine && z.t > DOMAIN.cinematic * 0.45) this.spawnShrine();
      if (z.t >= DOMAIN.cinematic) {
        z.phase = 'active'; z.t = 0;
        this.cinematic = false;
        if (W.player) { W.player.state = 'idle'; W.player.inv = 0.3; }
        fx.ring(z.x, z.y, 0.5, z.r, 0.5, void_ ? 0xffffff : 0xff3030, 3);
        fx.shakeCam(6);
        W.audio && W.audio.play(void_ ? 'voidOn' : 'shrineOn');
      }
    } else if (z.phase === 'active') {
      if (void_) this.voidActive(dt, z);
      else this.shrineActive(dt, z, z.t > DOMAIN.duration - 1.6);
      if (z.t >= DOMAIN.duration) { z.phase = 'final'; z.t = 0; z.waveR = 0; W.audio && W.audio.play(void_ ? 'voidEnd' : 'shrineEnd'); }
    } else if (z.phase === 'final') {
      if (void_) { if (this.voidFinal(dt, z)) { z.phase = 'fade'; z.t = 0; } }
      else { this.shrineFinal(z); z.phase = 'fade'; z.t = 0; }
    } else if (z.phase === 'fade') {
      reveal = 1 - z.t / 1.6;
      if (this.shrine) this.shrine.setAlpha(Math.max(0, reveal)).setVisible(Math.floor(z.t * 12) % 2 === 0 || z.t < 0.8);
      if (z.t >= 1.6) { this.end(); return; }
    }
    this.draw(z, Math.max(0, reveal));
  }

  draw(z, k) {
    const void_ = z.type === 'void';
    const cx = isoX(z.x, z.y), cy = isoY(z.x, z.y);
    const r = z.r * k;
    // voile sur le sol (la ville reste lisible)
    this.g.fillStyle(void_ ? 0x1a0f4a : 0x3a0408, void_ ? 0.42 : 0.4);
    this.g.fillEllipse(cx, cy, r * SX, r * SY);
    this.g.fillStyle(void_ ? 0x3d2a8a : 0x6a0a10, 0.25);
    this.g.fillEllipse(cx, cy, r * SX * 0.6, r * SY * 0.6);
    // anneaux de distorsion
    for (let i = 0; i < 3; i++) {
      const rr = r * (((z.t * 0.25 + i / 3) % 1));
      this.g.lineStyle(1, void_ ? 0x8fa8ff : 0xff5050, 0.5);
      this.g.strokeEllipse(cx, cy, rr * SX, rr * SY);
    }
    // frontière d'énergie bien visible
    const pulse = 2 + (Math.floor(z.t * 8) % 2);
    this.top.lineStyle(pulse + 1, 0x000000, 0.6);
    this.top.strokeEllipse(cx, cy, r * SX + 2, r * SY + 2);
    this.top.lineStyle(pulse, void_ ? 0xcfe0ff : 0xff3030, 1);
    this.top.strokeEllipse(cx, cy, r * SX, r * SY);
    this.top.lineStyle(1, 0xffffff, 0.8);
    this.top.strokeEllipse(cx, cy, r * SX - 4, r * SY - 2);
    // particules qui montent le long de la frontière
    if (k > 0.5 && Math.random() < 0.9) {
      const a = Math.random() * TAU;
      W.fx.spawn('px2', z.x + Math.cos(a) * z.r * k, z.y + Math.sin(a) * z.r * k, 0, 0, 0, rand(40, 90), rand(0.4, 0.9), { tint: void_ ? 0xcfe0ff : 0xff4040, add: true });
    }
  }

  voidActive(dt, z) {
    const fx = W.fx;
    // motifs cosmiques : étoiles et éclats dans la zone
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * z.r;
      fx.spawn('star', z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, rand(0, 50), rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-4, 4), rand(0.8, 1.6), { tint: Math.random() < 0.3 ? 0x9fd0ff : 0xffffff, add: true });
    }
    // les fléaux immobilisés sont submergés d'informations
    for (const e of W.enemies.list) if (!e.dead && e.frozen && Math.random() < dt * 2) fx.energy(e.x, e.y, e.def.h, 2, 0xcfe0ff, 0.8, 0.4);
  }

  voidFinal(dt, z) {
    const fx = W.fx;
    const prev = z.waveR;
    z.waveR = Math.min(z.r, z.waveR + dt * z.r / 0.6);
    fx.ring(z.x, z.y, z.waveR, z.waveR + 0.3, 0.06, 0xffffff, 4);
    fx.shakeCam(5);
    const inBand = (x, y) => { const d = Math.hypot(x - z.x, y - z.y); return d > prev - 0.5 && d <= z.waveR + 0.5; };
    for (const e of W.enemies.list) {
      if (e.dead || z.once.has(e) || !e.inDomain && !this.contains(e.x, e.y) || !inBand(e.x, e.y)) continue;
      z.once.add(e);
      const dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy) || 1;
      e.frozen = false;
      e.hit({ dmg: 450, kx: (dx / d) * 14, ky: (dy / d) * 14, lift: 220, stun: 1, heavy: true, src: 'void' });
      if (e.elite && !e.dead) e.stunT = DOMAIN.voidEliteStun;
    }
    const f = this.filter();
    for (const b of W.city.buildings) {
      if (b.state >= 4 || z.onceB.has(b) || !f(b.cx, b.cy) || !inBand(b.cx, b.cy)) continue;
      z.onceB.add(b);
      W.city.damageBuilding(b, 520, b.cx, b.cy);
    }
    for (const m of W.city.movables) {
      if (z.onceM.has(m) || !f(m.x, m.y) || !inBand(m.x, m.y)) continue;
      z.onceM.add(m);
      const dx = m.x - z.x, dy = m.y - z.y, d = Math.hypot(dx, dy) || 1;
      W.city.push(m, (dx / d) * 12, (dy / d) * 12, 140, 90, 'player');
    }
    for (const p of W.city.propsInCircle(z.x, z.y, z.waveR)) if (inBand(p.x, p.y)) W.city.breakProp(p, 2);
    if (z.waveR >= z.r) {
      fx.flash(z.x, z.y, 3); fx.hitstop(0.12);
      return true;
    }
    return false;
  }

  spawnShrine() {
    const z = this.zone;
    const [ox, oy] = originOf('shrine');
    this.shrine = this.scene.add.image(Math.round(isoX(z.x, z.y)), Math.round(isoY(z.x, z.y)), 'shrine').setOrigin(ox, oy).setDepth(depthOf(z.x, z.y) + 2);
    W.fx.dust(z.x, z.y, 14, 3, 2);
    W.fx.shakeCam(8);
  }

  slashAt(x, y, big = false) {
    const fx = W.fx, f = this.filter();
    if (!f(x, y)) return;
    const a = Math.random() * Math.PI, L = big ? 1.6 : 1.1;
    const dx = Math.cos(a) * L, dy = Math.sin(a) * L;
    fx.beam(x - dx, y - dy, rand(6, 30), x + dx, y + dy, rand(0, 20), 0.07, 0xffffff, big ? 2 : 1);
    fx.beam(x - dx * 0.8, y - dy * 0.8, 12, x + dx * 0.8, y + dy * 0.8, 6, 0.1, 0xff3030, 1);
    W.ground.slash(x - dx, y - dy, x + dx, y + dy, 1);
    W.combat.area(x, y, big ? 1.1 : 0.8, { dmg: big ? 90 : 55, force: 2, stun: 0.25, bld: big ? 380 : 230, mov: 45, filter: f, src: 'shrine' });
  }

  shrineActive(dt, z, salvo) {
    // taillades automatiques et continues sur fléaux et bâtiments à l'intérieur
    z.slashT -= dt;
    const rate = salvo ? 0.025 : 0.09;
    while (z.slashT <= 0) {
      z.slashT += rate;
      const r = Math.random();
      const inside = W.enemies.list.filter((e) => !e.dead && this.contains(e.x, e.y));
      if (r < 0.5 && inside.length) { const e = inside[Math.floor(Math.random() * inside.length)]; this.slashAt(e.x + rand(-0.3, 0.3), e.y + rand(-0.3, 0.3), salvo); }
      else if (r < 0.8) {
        const bs = W.city.buildings.filter((b) => b.state < 4 && this.contains(b.cx, b.cy));
        if (bs.length) { const b = bs[Math.floor(Math.random() * bs.length)]; this.slashAt(b.cx + rand(-b.s / 2, b.s / 2), b.cy + rand(-b.s / 2, b.s / 2), salvo); }
      } else {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * z.r;
        this.slashAt(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, salvo);
      }
    }
    if (Math.random() < dt * 3) W.audio && W.audio.play('slashSoft');
    W.fx.shakeCam(salvo ? 3 : 0.8);
  }

  shrineFinal(z) {
    // ultime salve : ravage de la zone, effondrements et explosions
    const fx = W.fx, f = this.filter();
    for (const e of W.enemies.list) {
      if (e.dead || !this.contains(e.x, e.y)) continue;
      const a = Math.random() * TAU;
      e.hit({ dmg: 900, kx: Math.cos(a) * 9, ky: Math.sin(a) * 9, lift: 260, stun: 1, heavy: true, src: 'shrine' });
      if (e.elite && !e.dead) e.stunT = DOMAIN.shrineEliteStun;
    }
    for (const b of W.city.buildings) if (b.state < 4 && f(b.cx, b.cy)) W.city.damageBuilding(b, 7000, b.cx, b.cy);
    for (const m of W.city.movables) if (f(m.x, m.y)) W.city.damageMovable(m, 999);
    for (const p of W.city.propsInCircle(z.x, z.y, z.r)) W.city.breakProp(p, 2);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * (z.r - 0.5);
      const x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d;
      const b = Math.random() * Math.PI, L = rand(0.8, 2.2);
      W.ground.slash(x - Math.cos(b) * L, y - Math.sin(b) * L, x + Math.cos(b) * L, y + Math.sin(b) * L, 2);
      if (i % 4 === 0) W.ground.crack(x, y);
      fx.beam(x - Math.cos(b) * L, y - Math.sin(b) * L, 30, x + Math.cos(b) * L, y + Math.sin(b) * L, 0, 0.2, i % 2 ? 0xffffff : 0xff3030, 2);
    }
    fx.ring(z.x, z.y, 0.5, z.r, 0.5, 0xff3030, 4);
    fx.flash(z.x, z.y, 4); fx.shakeCam(12); fx.hitstop(0.15);
    W.audio && W.audio.play('bigBoom');
  }

  end() {
    this.zone = null;
    this.cinematic = false;
    if (this.shrine) { this.shrine.destroy(); this.shrine = null; }
    this.g.clear(); this.top.clear();
  }

  clear() { this.end(); }
}
