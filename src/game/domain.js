// Extensions du territoire : Unlimited Void (Gojo) et Malevolent Shrine (Sukuna).
// Zone circulaire fixe, frontière visible, cinématique d'activation protégée, phase active, attaque finale, dissipation.
import { W } from '../state.js';
import { DOMAIN } from '../config.js';
import { isoX, isoY, depthOf, rand, TAU } from '../util.js';
import { originOf } from '../gfx/registry.js';
import { settings } from '../settings.js';

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
    this.setVignette(!void_ && z.phase !== 'fade' ? 1 : 0, z);
    if (!void_) { this.drawShrineAura(z, k, cx, cy, r); return; }
    // voile sur le sol (la ville reste lisible)
    this.g.fillStyle(0x1a0f4a, 0.42);
    this.g.fillEllipse(cx, cy, r * SX, r * SY);
    this.g.fillStyle(0x3d2a8a, 0.25);
    this.g.fillEllipse(cx, cy, r * SX * 0.6, r * SY * 0.6);
    // anneaux de distorsion
    for (let i = 0; i < 3; i++) {
      const rr = r * (((z.t * 0.25 + i / 3) % 1));
      this.g.lineStyle(1, 0x8fa8ff, 0.5);
      this.g.strokeEllipse(cx, cy, rr * SX, rr * SY);
    }
    // frontière d'énergie bien visible
    const pulse = 2 + (Math.floor(z.t * 8) % 2);
    this.top.lineStyle(pulse + 1, 0x000000, 0.6);
    this.top.strokeEllipse(cx, cy, r * SX + 2, r * SY + 2);
    this.top.lineStyle(pulse, 0xcfe0ff, 1);
    this.top.strokeEllipse(cx, cy, r * SX, r * SY);
    this.top.lineStyle(1, 0xffffff, 0.8);
    this.top.strokeEllipse(cx, cy, r * SX - 4, r * SY - 2);
    // particules qui montent le long de la frontière
    if (k > 0.5 && Math.random() < 0.9) {
      const a = Math.random() * TAU;
      W.fx.spawn('px2', z.x + Math.cos(a) * z.r * k, z.y + Math.sin(a) * z.r * k, 0, 0, 0, rand(40, 90), rand(0.4, 0.9), { tint: 0xcfe0ff, add: true });
    }
  }

  // Malevolent Shrine : aura rouge sang, battement de cœur, braises et colonnes écarlates.
  drawShrineAura(z, k, cx, cy, r) {
    const g = this.g, top = this.top;
    const beat = Math.max(0, Math.sin(z.t * 7.5)) ** 6; // pulsation façon battement de cœur
    g.fillStyle(0x2a0003, 0.62 * k);
    g.fillEllipse(cx, cy, r * SX, r * SY);
    g.fillStyle(0x8a0010, (0.28 + beat * 0.25) * k);
    g.fillEllipse(cx, cy, r * SX * 0.85, r * SY * 0.85);
    g.fillStyle(0xd0101c, (0.22 + beat * 0.2) * k);
    g.fillEllipse(cx, cy, r * SX * 0.45, r * SY * 0.45);
    g.fillStyle(0xff3030, (0.18 + beat * 0.25) * k);
    g.fillEllipse(cx, cy, r * SX * 0.18, r * SY * 0.18);
    // ondes rouges qui pulsent depuis le sanctuaire
    for (let i = 0; i < 6; i++) {
      const rr = r * (((z.t * 0.4 + i / 6) % 1));
      g.lineStyle(i % 2 ? 1 : 2, i % 2 ? 0xff2020 : 0xff6060, 0.6);
      g.strokeEllipse(cx, cy, rr * SX, rr * SY);
    }
    // voile rouge par-dessus les bâtiments : tout le territoire baigne dans le sang
    top.fillStyle(0xff0814, (0.13 + beat * 0.1) * k);
    top.fillEllipse(cx, cy, r * SX, r * SY);
    top.fillStyle(0x600004, 0.12 * k);
    top.fillEllipse(cx, cy - 20, r * SX * 1.02, r * SY * 1.9);
    // frontière écarlate épaisse et vibrante
    const pulse = 3 + (Math.floor(z.t * 10) % 2) + Math.round(beat * 2);
    top.lineStyle(pulse + 3, 0x000000, 0.7);
    top.strokeEllipse(cx, cy, r * SX + 3, r * SY + 3);
    top.lineStyle(pulse + 2, 0x8a0008, 1);
    top.strokeEllipse(cx, cy, r * SX + 1, r * SY + 1);
    top.lineStyle(pulse, 0xff1a1a, 1);
    top.strokeEllipse(cx, cy, r * SX, r * SY);
    top.lineStyle(1, 0xffb0b0, 0.9);
    top.strokeEllipse(cx, cy, r * SX - 5, r * SY - 3);
    if (k < 0.5) return;
    const fx = W.fx;
    // braises rouges qui montent du sol et le long de la frontière
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * TAU, d = i < 2 ? z.r * k : Math.sqrt(Math.random()) * z.r * k;
      fx.spawn(Math.random() < 0.5 ? 'px2' : 'px1', z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, rand(0, 10), rand(-0.3, 0.3), rand(-0.3, 0.3), rand(30, 110), rand(0.5, 1.1),
        { tint: Math.random() < 0.7 ? 0xff2020 : 0xff8080, add: true });
    }
    // colonnes écarlates qui jaillissent de la frontière
    if (Math.random() < 0.35) {
      const a = Math.random() * TAU, x = z.x + Math.cos(a) * z.r * k, y = z.y + Math.sin(a) * z.r * k;
      fx.beam(x, y, 0, x, y, rand(60, 140), 0.12, 0xff2020, 2);
    }
  }

  // Vignette rouge plein écran (couche DOM, indépendante de la résolution).
  setVignette(on, z) {
    if (!this.vig) {
      this.vig = document.createElement('div');
      this.vig.id = 'shrinevig';
      document.body.appendChild(this.vig);
    }
    const want = on && z && (z.phase === 'active' || z.phase === 'final' || z.t > DOMAIN.cinematic * 0.4);
    if (this.vig.classList.contains('on') !== !!want) this.vig.classList.toggle('on', !!want);
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

  // Ligne de taillade purement visuelle (aucune requête de combat) : permet un déluge de coupes à bas coût.
  slashFx(x, y, big = false) {
    const a = Math.random() * Math.PI, L = big ? rand(1.2, 3) : rand(0.5, 2.2);
    const dx = Math.cos(a) * L, dy = Math.sin(a) * L, z0 = rand(0, 40), z1 = z0 + rand(-14, 14);
    const r = Math.random();
    const col = r < 0.3 ? 0xffffff : r < 0.75 ? 0xff2020 : r < 0.9 ? 0xff6060 : 0x9a0008;
    W.fx.beam(x - dx, y - dy, z0, x + dx, y + dy, z1, rand(0.07, 0.16), col, big || r < 0.15 ? 2 : 1);
  }

  slashAt(x, y, big = false) {
    // marque permanente rouge sang + petite coupe sur le mobilier
    const a = Math.random() * Math.PI, L = big ? rand(1.2, 2) : rand(0.7, 1.4);
    const dx = Math.cos(a) * L, dy = Math.sin(a) * L;
    W.ground.slash(x - dx, y - dy, x + dx, y + dy, 1, Math.random() < 0.6 ? 0x140a8a : 0x1a1a1a);
    for (const p of W.city.propsInCircle(x, y, 0.7)) W.city.breakProp(p, 1);
  }

  shrineActive(dt, z, salvo) {
    const fx = W.fx, f = this.filter(), city = W.city;
    const eff = settings().effects;
    const qk = (W.quality === 'low' ? 0.45 : W.quality === 'high' ? 1 : 0.7) * (eff === 'reduced' ? 0.5 : eff === 'max' ? 1.3 : 1);
    // 1) déluge de taillades (~50x l'ancien débit) partout dans le territoire
    z.visT = (z.visT || 0) + dt * (salvo ? 1500 : 550) * qk;
    let n = 0;
    while (z.visT >= 1 && n++ < 90) {
      z.visT -= 1;
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * (z.r - 0.3);
      this.slashFx(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, salvo && Math.random() < 0.3);
    }
    z.visT = Math.min(z.visT, 1);
    // 2) frappe garantie : chaque vague touche TOUTES les cibles du territoire
    z.slashT -= dt;
    if (z.slashT > 0) { W.fx.shakeCam(salvo ? 3 : 1); return; }
    z.slashT = salvo ? 0.08 : 0.2;
    let imp = 0;
    for (const e of W.enemies.list) {
      if (e.dead || !(e.inDomain || this.contains(e.x, e.y))) continue;
      for (let i = 0; i < 3; i++) this.slashFx(e.x + rand(-0.3, 0.3), e.y + rand(-0.3, 0.3), true);
      const a = Math.random() * TAU;
      e.hit({ dmg: salvo ? 40 : 25, kx: Math.cos(a) * 1.5, ky: Math.sin(a) * 1.5, stun: 0.2, heavy: false, src: 'shrine' });
      if (imp++ < 6) { fx.impact(e.x, e.y, e.def.h * 0.5, 0xff3030, salvo); this.slashAt(e.x, e.y, salvo); }
    }
    for (const b of city.buildings) {
      if (b.state >= 4 || !f(b.cx, b.cy)) continue;
      const ix = b.cx + rand(-b.s / 2, b.s / 2), iy = b.cy + rand(-b.s / 2, b.s / 2);
      city.damageBuilding(b, salvo ? 90 : 35, ix, iy);
      this.slashFx(ix, iy, true);
    }
    for (const m of city.movables) if (!m.wreck && f(m.x, m.y)) city.damageMovable(m, salvo ? 30 : 12);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * (z.r - 0.5);
      this.slashAt(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, salvo);
    }
    W.audio && W.audio.play('slashSoft');
    W.fx.shakeCam(salvo ? 3 : 1);
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
    if (this.vig) this.vig.classList.remove('on');
  }

  clear() { this.end(); }
}
