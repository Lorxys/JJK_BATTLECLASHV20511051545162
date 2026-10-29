// Personnage jouable : déplacement, combos, esquive, dash et techniques de Gojo / Sukuna.
import { W } from '../state.js';
import { KITS } from '../config.js';
import { isoX, isoY, depthOf, rand, norm, screenDir, TAU } from '../util.js';
import { ART } from '../gfx/registry.js';
import { settings } from '../settings.js';

const COMBOS = {
  gojo: [
    { anim: 'atk1', dur: 0.26, hitAt: 0.07, range: 1.5, half: 1.1, dmg: 14, force: 3, lift: 0, stun: 0.35, lunge: 3, bld: 25, sfx: 'punch' },
    { anim: 'atk2', dur: 0.26, hitAt: 0.07, range: 1.6, half: 1.0, dmg: 15, force: 4, lift: 0, stun: 0.35, lunge: 3, bld: 30, sfx: 'kick' },
    { anim: 'atk3', dur: 0.26, hitAt: 0.07, range: 1.6, half: 1.1, dmg: 18, force: 5, lift: 0, stun: 0.4, lunge: 3.5, bld: 40, sfx: 'punch' },
    { anim: 'atk4', dur: 0.42, hitAt: 0.15, range: 1.9, half: 1.3, dmg: 34, force: 13, lift: 200, stun: 0.8, lunge: 4, bld: 160, mov: 20, heavy: true, sfx: 'heavy' },
  ],
  sukuna: [
    { anim: 'atk1', dur: 0.26, hitAt: 0.07, range: 1.6, half: 1.2, dmg: 16, force: 3, lift: 0, stun: 0.35, lunge: 3, bld: 30, sfx: 'claw', swipe: 'swipe_red' },
    { anim: 'atk2', dur: 0.26, hitAt: 0.07, range: 1.5, half: 1.0, dmg: 16, force: 4, lift: 0, stun: 0.35, lunge: 3, bld: 30, sfx: 'punch', swipe: 'swipe_red' },
    { anim: 'atk3', dur: 0.26, hitAt: 0.07, range: 1.4, half: 1.0, dmg: 20, force: 6, lift: 90, stun: 0.45, lunge: 2.5, bld: 40, sfx: 'kick' },
    { anim: 'atk4', dur: 0.42, hitAt: 0.15, range: 2.0, half: 1.4, dmg: 38, force: 12, lift: 160, stun: 0.9, lunge: 3, bld: 200, mov: 25, heavy: true, sfx: 'heavy', crack: true, swipe: 'swipe_red' },
  ],
};
const BLINK_RANGE = 8; // distance max de la téléportation automatique vers un fléau
const FUGA_RADIUS = 21.5; // rayon d'explosion de la Flèche de feu (5 x 4,3)

export class Player {
  constructor(scene, key, x, y) {
    this.scene = scene;
    this.x = x; this.y = y; this.z = 0; this.vz = 0; this.r = 0.3;
    this.kvx = 0; this.kvy = 0;
    this.face = [1, 1].map((v) => v / Math.SQRT2);
    this.state = 'idle'; this.t = 0; this.animT = 0;
    this.step = -1; this.queued = false; this.comboWin = 0;
    this.inv = 0; this.actions = []; this.effects = [];
    this.vel = [0, 0];
    this.sprite = scene.add.image(0, 0, 'sheet_' + key, 0);
    this.shadow = scene.add.image(0, 0, 'shadow_s').setDepth(-8e5);
    this.setChar(key);
  }

  setChar(key) {
    this.key = key;
    this.kit = KITS[key];
    this.sheet = ART.sheets[key];
    this.sprite.setTexture('sheet_' + key, 0).setOrigin(this.sheet.ox / this.sheet.fw, this.sheet.oy / this.sheet.fh);
    this.cds = { dash: 0, dodge: 0, p: [0, 0, 0, 0] };
    this.state = 'idle'; this.actions = [];
    for (const e of this.effects) e.destroy && e.destroy();
    this.effects = [];
  }

  // Infos de recharge pour le HUD.
  cooldowns() {
    return {
      dash: this.cds.dash / this.kit.dashCd, dodge: this.cds.dodge / this.kit.dodgeCd,
      p: this.kit.powers.map((p, i) => ({ frac: this.cds.p[i] / p.cd, left: this.cds.p[i] })),
    };
  }

  busy() { return ['dash', 'dodge', 'cast', 'charge', 'cinematic', 'stagger'].includes(this.state); }

  aim(input) {
    if (input.mag > 0.2) return [input.mx, input.my];
    // aide à la visée légère quand le joystick est relâché
    const e = W.enemies && W.enemies.nearest(this.x, this.y, 3.5, this.face[0], this.face[1], 0.3);
    if (e) return norm(e.x - this.x, e.y - this.y);
    return this.face;
  }

  schedule(at, fn) { this.actions.push({ at, fn }); }

  update(dt, input) {
    const kit = this.kit;
    this.inv -= dt; this.comboWin -= dt;
    this.cds.dash = Math.max(0, this.cds.dash - dt);
    this.cds.dodge = Math.max(0, this.cds.dodge - dt);
    for (let i = 0; i < 4; i++) this.cds.p[i] = Math.max(0, this.cds.p[i] - dt);
    this.animT += dt;

    // actions programmées (moment d'impact d'une animation)
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const a = this.actions[i];
      a.at -= dt;
      if (a.at <= 0) { this.actions.splice(i, 1); a.fn(); }
    }

    if (this.state !== 'cinematic') {
      // entrées
      const pr = input.pressed;
      if (pr.has('dash') && this.cds.dash <= 0 && !this.busy()) this.dash(input);
      else if (pr.has('dodge') && this.cds.dodge <= 0 && !this.busy()) this.dodge(input);
      for (let i = 0; i < 4; i++) {
        if (pr.has('p' + i) && this.cds.p[i] <= 0 && !this.busy() && this.canUse(i)) { this.usePower(i, input); break; }
      }
      if ((pr.has('attack') || (input.attackHeld && this.state !== 'attack')) && !this.busy()) this.attack(input);
      else if (pr.has('attack') && this.state === 'attack') this.queued = true;
      if (input.attackHeld && this.state === 'attack' && this.t < COMBOS[this.key][this.step].dur * 0.5) this.queued = true;
    }

    // états
    this.t -= dt;
    let moveSpeed = 0;
    switch (this.state) {
      case 'idle': case 'run': {
        moveSpeed = kit.speed;
        if (input.mag > 0.15) {
          this.face = [input.mx, input.my];
          this.state = 'run';
        } else this.state = 'idle';
        break;
      }
      case 'attack': {
        const c = COMBOS[this.key][this.step];
        if (this.t > c.dur - c.hitAt - 0.05) {
          const k = c.lunge * dt;
          W.city.moveCircle(this, this.face[0] * k, this.face[1] * k, this.r);
        }
        if (this.t <= 0) {
          if (this.queued && this.step < 3) this.startCombo(this.step + 1, input);
          else { this.state = 'idle'; this.comboWin = this.step < 3 ? 0.35 : 0; }
        }
        break;
      }
      case 'dash': case 'dodge': {
        if (this.vel[0] || this.vel[1]) W.city.moveCircle(this, this.vel[0] * dt, this.vel[1] * dt, this.r);
        if (this.state === 'dash' && this.key === 'sukuna') {
          if (Math.random() < 0.6) W.fx.dust(this.x, this.y, 1, 1, 0.4);
          W.combat.area(this.x, this.y, 0.9, { dmg: 10, force: 7, stun: 0.5, once: this.dashSet, bld: 30, onceB: this.dashSetB, mov: 15, onceM: this.dashSetM, src: 'player' });
        }
        if (this.t <= 0) { this.state = 'idle'; this.vel = [0, 0]; }
        break;
      }
      case 'cast': case 'charge': case 'stagger':
        if (this.t <= 0) this.state = 'idle';
        break;
      case 'cinematic': break;
    }
    if (moveSpeed && input.mag > 0.15) {
      const sp = moveSpeed * Math.min(1, input.mag * 1.3);
      W.city.moveCircle(this, input.mx * sp * dt, input.my * sp * dt, this.r);
    }
    // recul
    if (Math.abs(this.kvx) + Math.abs(this.kvy) > 0.05) {
      W.city.moveCircle(this, this.kvx * dt, this.kvy * dt, this.r);
      const k = Math.exp(-6 * dt); this.kvx *= k; this.kvy *= k;
    }
    this.confine();

    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (!this.effects[i].update(dt)) { this.effects[i].destroy && this.effects[i].destroy(); this.effects.splice(i, 1); }
    }
    this.render();
  }

  // Le joueur ne peut pas sortir d'un territoire actif.
  confine() {
    const D = W.domain && W.domain.zone;
    if (!D || D.phase === 'fade') return;
    const dx = this.x - D.x, dy = this.y - D.y, d = Math.hypot(dx, dy), m = D.r - 0.5;
    if (d > m) { this.x = D.x + (dx / d) * m; this.y = D.y + (dy / d) * m; }
  }
  insideDomain(x, y) {
    const D = W.domain && W.domain.zone;
    if (!D || D.phase === 'fade') return true;
    return Math.hypot(x - D.x, y - D.y) < D.r - 0.5;
  }

  canUse(i) {
    const p = this.kit.powers[i];
    if (p.id === 'domain') return !(W.domain && W.domain.zone);
    return true;
  }

  // --- Combo de base ---
  attack(input) {
    const next = this.comboWin > 0 && this.step >= 0 && this.step < 3 ? this.step + 1 : 0;
    this.startCombo(next, input);
  }
  startCombo(step, input) {
    const c = COMBOS[this.key][step];
    this.step = step; this.queued = false;
    this.state = 'attack'; this.t = c.dur; this.animT = 0; this.anim = c.anim;
    // Téléportation automatique sur le fléau le plus proche s'il est hors de portée.
    const tgt = this.autoTarget(input);
    if (tgt) {
      if (Math.hypot(tgt.x - this.x, tgt.y - this.y) > c.range * 0.8 + tgt.def.r) this.blinkTo(tgt);
      this.face = norm(tgt.x - this.x, tgt.y - this.y);
    } else this.face = input.mag > 0.2 ? [input.mx, input.my] : this.face;
    const dir = this.face.slice();
    const tint = this.key === 'gojo' ? 0x9fd0ff : 0xff6b6b;
    // anticipation : petite traînée pendant la préparation
    W.fx.ghost(this.sprite, tint, 0.12);
    this.schedule(c.hitAt, () => {
      const hitList = [];
      const hits = W.combat.arc(this.x, this.y, dir[0], dir[1], c.range, c.half,
        { dmg: c.dmg, force: c.force, lift: c.lift, stun: c.stun, bld: c.bld, mov: c.mov, heavy: c.heavy, src: 'melee', hitList });
      const fx = W.fx;
      const ax = this.x + dir[0] * 0.9, ay = this.y + dir[1] * 0.9;
      const [sx, sy] = screenDir(dir[0], dir[1]);
      const rot = Math.atan2(sy, sx);
      fx.spawn(c.swipe || 'swipe', ax, ay, 18, dir[0] * 2, dir[1] * 2, 0, 0.12, { rot, scale: c.heavy ? 1.7 : 1.15, top: true, blink: false });
      if (this.key === 'sukuna') fx.spawn('swipe_red', ax, ay, 14, 0, 0, 0, 0.1, { rot: rot + (step % 2 ? 0.9 : -0.9), scale: 0.9, top: true, blink: false });
      for (const e of hitList.slice(0, 4)) fx.impact(e.x, e.y, e.def.h * 0.55, tint, !!c.heavy);
      if (hits) { fx.hitstop(c.heavy ? 0.09 : 0.045); fx.shakeCam(c.heavy ? 5 : 1.5); W.audio.play(c.heavy ? 'heavyHit' : 'hit'); }
      else W.audio.play('whoosh');
      if (c.heavy) {
        fx.shakeCam(hits ? 4 : 2);
        if (hits) fx.slowmo(0.35, 0.12);
        if (this.key === 'gojo') { fx.ring(ax, ay, 0.2, 1.8, 0.25, 0x9fd0ff, 2); fx.energy(ax, ay, 16, 10, 0x9fd0ff, 3, 0.4); }
        if (c.crack) { W.ground.crack(ax, ay); fx.dust(ax, ay, 6, 2, 0.9); fx.ring(ax, ay, 0.2, 1.6, 0.25, 0xff6b6b, 2); }
      }
    });
  }

  // Cible du combo : dans la direction du joystick s'il est tenu, sinon le fléau le plus proche.
  autoTarget(input) {
    const E = W.enemies;
    if (!E) return null;
    let e = null;
    if (input.mag > 0.2) e = E.nearest(this.x, this.y, BLINK_RANGE, input.mx, input.my, 0.45);
    if (!e) e = E.nearest(this.x, this.y, BLINK_RANGE);
    return e;
  }

  // Se téléporte juste à côté du fléau, du côté où se trouve le joueur (ou autour s'il y a un mur).
  blinkTo(e) {
    const base = Math.atan2(this.y - e.y, this.x - e.x);
    const d = e.def.r + 0.75;
    for (const off of [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2, Math.PI]) {
      const tx = e.x + Math.cos(base + off) * d, ty = e.y + Math.sin(base + off) * d;
      if (W.city.circleSolid(tx, ty, this.r) || !this.insideDomain(tx, ty)) continue;
      const fx = W.fx, gojo = this.key === 'gojo';
      const tint = gojo ? 0x9fd0ff : 0xff6b6b;
      fx.ghost(this.sprite, tint, 0.3);
      fx.energy(this.x, this.y, 16, 6, tint, 1.5, 0.35);
      if (!gojo) { fx.beam(this.x, this.y, 16, tx, ty, 16, 0.08, 0xffffff, 2); fx.beam(this.x, this.y, 12, tx, ty, 12, 0.12, 0xff4040, 1); }
      this.x = tx; this.y = ty;
      this.render();
      fx.ghost(this.sprite, tint, 0.15);
      fx.ring(tx, ty, 0.1, 0.8, 0.15, tint, 1);
      if (!gojo) fx.dust(tx, ty, 3, 1, 0.6);
      this.inv = Math.max(this.inv, 0.15);
      W.audio.play(gojo ? 'blink' : 'dash');
      return true;
    }
    return false;
  }

  dash(input) {
    const dir = input.mag > 0.2 ? [input.mx, input.my] : this.face;
    this.face = dir;
    this.cds.dash = this.kit.dashCd;
    this.inv = 0.3;
    this.animT = 0; this.anim = 'dash';
    if (this.key === 'gojo') {
      // Téléportation courte : on s'arrête avant les murs et la frontière d'un territoire.
      let tx = this.x, ty = this.y;
      for (let d = 0.2; d <= 4.2; d += 0.2) {
        const nx = this.x + dir[0] * d, ny = this.y + dir[1] * d;
        if (W.city.circleSolid(nx, ny, this.r) || !this.insideDomain(nx, ny)) break;
        tx = nx; ty = ny;
      }
      W.fx.ghost(this.sprite, 0x9fd0ff, 0.35);
      W.fx.energy(this.x, this.y, 16, 8, 0x9fd0ff, 1.5, 0.4);
      this.x = tx; this.y = ty;
      W.fx.energy(this.x, this.y, 16, 8, 0x9fd0ff, 1.5, 0.4);
      W.fx.ring(this.x, this.y, 0.1, 0.9, 0.2, 0x9fd0ff, 1);
      this.state = 'dash'; this.t = 0.12; this.vel = [0, 0];
      W.audio.play('blink');
    } else {
      this.state = 'dash'; this.t = 0.2; this.vel = [dir[0] * 20, dir[1] * 20];
      this.dashSet = new Set(); this.dashSetB = new Set(); this.dashSetM = new Set();
      W.ground.crack(this.x, this.y);
      W.fx.dust(this.x, this.y, 6, 2, 0.8);
      W.fx.ghost(this.sprite, 0xff8080, 0.3);
      W.audio.play('dash');
    }
  }

  dodge(input) {
    const dir = input.mag > 0.2 ? [input.mx, input.my] : [-this.face[0], -this.face[1]];
    this.cds.dodge = this.kit.dodgeCd;
    this.inv = 0.3;
    this.state = 'dodge'; this.t = 0.22; this.animT = 0; this.anim = 'dodge';
    this.vel = [dir[0] * 9, dir[1] * 9];
    W.fx.ghost(this.sprite, this.key === 'gojo' ? 0x9fd0ff : 0xff8080, 0.25);
    W.audio.play('whoosh');
  }

  hurt(h) {
    if (this.inv > 0 || this.state === 'cinematic') return;
    const fx = W.fx;
    if (this.key === 'gojo') {
      // Infini : les attaques n'atteignent pas Gojo ; seuls les coups lourds le font reculer.
      fx.ring(this.x, this.y, 0.4, 0.9, 0.25, 0x9fd0ff, 1);
      fx.energy(this.x, this.y, 16, 4, 0xcfe6ff, 1.2, 0.3);
      if (h.heavy) { this.kvx += h.kx * 0.4; this.kvy += h.ky * 0.4; fx.shakeCam(2); }
      W.audio.play('infinity');
      this.inv = 0.15;
      return;
    }
    this.kvx += h.kx * 0.6; this.kvy += h.ky * 0.6;
    if (h.heavy && !this.busy()) { this.state = 'stagger'; this.t = 0.3; this.animT = 0; this.anim = 'stagger'; }
    this.flash = 0.1;
    fx.sparks(this.x, this.y, 18, 4, 0xff8080, 2);
    fx.shakeCam(h.heavy ? 3 : 1.5);
    W.audio.play('hurt');
    this.inv = 0.35;
  }

  // --- Techniques ---
  usePower(i, input) {
    const p = this.kit.powers[i];
    const aim = this.aim(input);
    const aimed = input.mag > 0.2;
    this.face = aim;
    this.cds.p[i] = p.cd;
    const fn = POWERS[p.id];
    fn(this, aim, aimed);
  }

  render() {
    const sh = this.sheet;
    let name;
    switch (this.state) {
      case 'run': name = 'run'; break;
      case 'attack': case 'dash': case 'dodge': case 'stagger': name = this.anim; break;
      case 'cast': name = 'cast'; break;
      case 'charge': name = 'charge'; break;
      case 'cinematic': name = 'sign'; break;
      default: name = 'idle';
    }
    const a = sh.anims[name] || sh.anims.idle;
    const [sx, sy] = screenDir(this.face[0], this.face[1]);
    const frames = sy < -0.05 ? a.b : a.f;
    const loop = name === 'run' || name === 'idle' || name === 'charge' || name === 'sign';
    let fi = Math.floor(this.animT * a.fps);
    fi = loop ? fi % frames.length : Math.min(frames.length - 1, fi);
    const X = Math.round(isoX(this.x, this.y)), Y = Math.round(isoY(this.x, this.y));
    this.sprite.setFrame(frames[fi]).setFlipX(sx < 0).setPosition(X, Y - Math.round(this.z)).setDepth(depthOf(this.x, this.y) + 1);
    this.shadow.setPosition(X, Y).setVisible(settings().shadows);
    if (this.flash > 0) { this.flash -= 1 / 60; this.sprite.setTintFill(0xffffff); }
    else if (this.inv > 0.05 && (this.state === 'dash' || this.state === 'dodge')) this.sprite.setTint(this.key === 'gojo' ? 0xcfe6ff : 0xffd0d0);
    else this.sprite.clearTint();
  }

  destroy() {
    for (const e of this.effects) e.destroy && e.destroy();
    this.sprite.destroy(); this.shadow.destroy();
  }
}

// ======================= Techniques =======================
const handPos = (pl, d = 0.6) => [pl.x + pl.face[0] * d, pl.y + pl.face[1] * d];

function img(key, scale = 1) { return W.scene.add.image(0, 0, key).setScale(scale).setBlendMode(0); }
function placeImg(im, x, y, z) { im.setPosition(Math.round(isoX(x, y)), Math.round(isoY(x, y) - z)).setDepth(depthOf(x, y) + 6); }

const POWERS = {
  // ---------------- Gojo ----------------
  blue(pl, aim) {
    pl.state = 'cast'; pl.t = 0.35; pl.animT = 0;
    let tx = pl.x + aim[0] * 3.5, ty = pl.y + aim[1] * 3.5;
    W.audio.play('blueCharge');
    const orb = img('orb_blue');
    const fx = W.fx;
    let t = 0, tick = 0;
    const charge = 0.35, dur = 1.9, R = 4.6;
    pl.effects.push({
      update(dt) {
        t += dt;
        const s = t < charge ? 0.4 + (t / charge) * 0.8 : 1.2 + Math.sin(t * 30) * 0.15;
        orb.setScale(Math.round(s * 4) / 4);
        placeImg(orb, tx, ty, 18);
        if (t < charge) { fx.suck(tx, ty, 1.2, 2, 0x9fd0ff); return true; }
        if (t - dt < charge) { W.audio.play('blue'); fx.ring(tx, ty, R, 0.3, 0.5, 0x3d8bff, 2); }
        fx.suck(tx, ty, R, 3, 0x6fb0ff);
        if (Math.random() < dt * 6) fx.ring(tx, ty, R * 0.9, 0.2, 0.35, 0x3d8bff, 1, { top: false, alpha: 0.8 });
        // attraction
        for (const e of W.enemies.list) {
          if (e.dead) continue;
          const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
          if (d > R + e.def.r || d < 0.05) continue;
          const v = (9 * (1 - d / R) + 3) / Math.sqrt(e.def.mass) * (e.elite ? 0.7 : 1);
          e.kvx = (dx / d) * v * Math.min(1, d * 1.5); e.kvy = (dy / d) * v * Math.min(1, d * 1.5);
          e.stun = Math.max(e.stun, 0.3); if (e.state !== 'spawn') e.state = 'hit';
        }
        for (const m of W.city.movablesNear(tx, ty, R)) {
          const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 0.01;
          m.sleep = false;
          const v = 8 * (1 - d / R) + 2;
          m.vx = (dx / d) * v * Math.min(1, d); m.vy = (dy / d) * v * Math.min(1, d);
          if (m.z < 26 && d < 2) m.vz = 140;
        }
        tick -= dt;
        if (tick <= 0) {
          tick = 0.25;
          W.combat.area(tx, ty, 1.5, { dmg: 11, force: 0, stun: 0.4, bld: 70, mov: 12, src: 'blue' });
          W.combat.area(tx, ty, R, { dmg: 3, force: 0, stun: 0.3, prop: true, src: 'blue' });
          fx.shakeCam(1.5);
        }
        if (t >= charge + dur) {
          W.combat.area(tx, ty, 2.3, { dmg: 45, force: 7, lift: 130, stun: 0.6, bld: 220, mov: 30, heavy: true, src: 'blue' });
          fx.ring(tx, ty, 0.2, 2.6, 0.35, 0x9fd0ff, 3);
          fx.energy(tx, ty, 18, 24, 0x6fb0ff, 3, 0.6);
          fx.dust(tx, ty, 8, 2, 1);
          W.ground.crater(tx, ty, 1.2);
          fx.shakeCam(5);
          W.audio.play('implode');
          return false;
        }
        return true;
      },
      destroy() { orb.destroy(); },
    });
  },

  red(pl, aim, aimed) {
    pl.state = 'cast'; pl.t = 0.22; pl.animT = 0.08;
    const fx = W.fx;
    const boom = (x, y) => {
      W.combat.area(x, y, 2.6, { dmg: 75, force: 15, lift: 220, stun: 0.8, bld: 420, mov: 60, heavy: true, src: 'red' });
      fx.explosion(x, y, 2.2, 0xff3b3b);
      fx.ring(x, y, 0.2, 3, 0.3, 0xff6b6b, 3);
      W.ground.crater(x, y, 1.4);
      fx.shakeCam(6); fx.hitstop(0.06);
      W.audio.play('red');
    };
    if (!aimed) {
      // onde de choc radiale autour de Gojo
      W.combat.area(pl.x, pl.y, 3.4, { dmg: 55, force: 13, lift: 160, stun: 0.7, bld: 240, mov: 40, heavy: true, src: 'red' });
      fx.ring(pl.x, pl.y, 0.4, 3.8, 0.35, 0xff3b3b, 3);
      fx.ring(pl.x, pl.y, 0.2, 3.0, 0.3, 0xffd0d0, 2);
      fx.energy(pl.x, pl.y, 16, 20, 0xff3b3b, 4, 0.5);
      fx.dust(pl.x, pl.y, 10, 2, 1.6);
      W.ground.crack(pl.x, pl.y);
      fx.shakeCam(5); fx.hitstop(0.05);
      W.audio.play('red');
      return;
    }
    let [x, y] = handPos(pl, 0.7);
    const orb = img('orb_red');
    let dist = 0;
    pl.effects.push({
      update(dt) {
        const step = 15 * dt;
        x += aim[0] * step; y += aim[1] * step; dist += step;
        placeImg(orb, x, y, 18);
        fx.spawn('px2', x, y, 18, 0, 0, 0, 0.15, { tint: 0xff6b6b, add: true });
        const hitE = W.enemies.nearest(x, y, 0.75);
        const hitM = W.city.movablesNear(x, y, 0.4).length > 0;
        if (hitE || hitM || W.city.solid(x, y) || dist > 9) { boom(x, y); return false; }
        return true;
      },
      destroy() { orb.destroy(); },
    });
  },

  purple(pl, aim) {
    pl.state = 'charge'; pl.t = 1.35; pl.animT = 0; pl.inv = 1.4;
    const fx = W.fx;
    const perp = [-aim[1], aim[0]];
    const blue = img('orb_blue'), red = img('orb_red');
    let t = 0, fired = false;
    W.audio.play('purpleCharge');
    const charge = 1.3;
    let px, py, dist = 0, purple = null;
    const once = new Set(), onceB = new Set(), onceM = new Set();
    pl.effects.push({
      update(dt) {
        t += dt;
        if (!fired) {
          const k = Math.min(1, t / charge);
          const cx = pl.x + aim[0] * 1.0, cy = pl.y + aim[1] * 1.0;
          const sep = 1.6 * (1 - k * k);
          placeImg(blue, cx + perp[0] * sep, cy + perp[1] * sep, 20 + Math.sin(t * 12) * 2);
          placeImg(red, cx - perp[0] * sep, cy - perp[1] * sep, 20 + Math.cos(t * 12) * 2);
          fx.suck(cx, cy, 2.2, 2, k > 0.6 ? 0xc080ff : 0x9fd0ff);
          if (k > 0.6) { W.slowmo = 0.45; W.slowmoT = 0.1; fx.shakeCam(1.5); }
          if (t >= charge) {
            fired = true;
            blue.destroy(); red.destroy();
            purple = img('orb_purple', 1.5);
            px = cx; py = cy;
            fx.ring(px, py, 0.3, 3.5, 0.4, 0xc080ff, 3);
            fx.flash(px, py, 3);
            fx.shakeCam(8); fx.hitstop(0.1);
            W.audio.play('purple');
          }
          return true;
        }
        const step = 17 * dt;
        const ox = px, oy = py;
        px += aim[0] * step; py += aim[1] * step; dist += step;
        placeImg(purple, px, py, 22);
        purple.setScale(1.5 + Math.sin(t * 40) * 0.1);
        W.combat.line(ox, oy, px, py, 1.8, { dmg: 320, force: 10, sideForce: 7, lift: 220, stun: 1, bld: 6000, mov: 500, once, onceB, onceM, heavy: true, src: 'purple' });
        W.ground.crater(px, py, 1.6);
        fx.energy(px, py, 22, 6, 0xa24bff, 2, 0.5);
        fx.debris(px, py, 10, 2, 'concrete', 1.2);
        fx.shakeCam(4);
        const N = W.map.n;
        if (dist > 30 || px < 1 || py < 1 || px > N - 1 || py > N - 1) {
          W.combat.area(px, py, 4.2, { dmg: 220, force: 16, lift: 260, stun: 1.2, bld: 1800, mov: 200, heavy: true, src: 'purple' });
          fx.explosion(px, py, 4, 0xa24bff);
          fx.ring(px, py, 0.5, 5.5, 0.6, 0xc080ff, 4);
          W.ground.crater(px, py, 2.8);
          fx.shakeCam(10); fx.hitstop(0.1);
          W.audio.play('bigBoom');
          return false;
        }
        return true;
      },
      destroy() { if (!fired) { blue.destroy(); red.destroy(); } if (purple) purple.destroy(); },
    });
  },

  domain(pl) {
    W.domain.start(pl.key === 'gojo' ? 'void' : 'shrine', pl);
  },

  // ---------------- Sukuna ----------------
  dismantle(pl, aim) {
    pl.state = 'cast'; pl.t = 0.24; pl.animT = 0;
    const fx = W.fx;
    pl.schedule(0.07, () => {
      W.audio.play('slash');
      const base = Math.atan2(aim[1], aim[0]);
      for (const off of [-0.22, 0, 0.22]) {
        const d = [Math.cos(base + off), Math.sin(base + off)];
        const perp = [-d[1], d[0]];
        let x = pl.x + d[0] * 0.5, y = pl.y + d[1] * 0.5, dist = 0, markT = 0;
        const once = new Set(), onceM = new Set();
        pl.effects.push({
          update(dt) {
            const step = 28 * dt;
            const ox = x, oy = y;
            x += d[0] * step; y += d[1] * step; dist += step;
            const n = W.combat.line(ox, oy, x, y, 0.65, { dmg: 45, force: 3.5, stun: 0.35, mov: 30, once, onceM, src: 'slash' });
            if (n) fx.sparks(x, y, 16, 4, 0xffffff, 3);
            fx.beam(x - perp[0] * 0.7, y - perp[1] * 0.7, 14, x + perp[0] * 0.7, y + perp[1] * 0.7, 14, 0.05, 0xffffff, 1);
            markT -= step;
            if (markT <= 0) { markT = 1.4; W.ground.slash(x - d[0] * 0.5, y - d[1] * 0.5, x + d[0] * 0.3, y + d[1] * 0.3, 1); }
            const b = W.city.buildingAtCell(Math.floor(x), Math.floor(y));
            if (b && b.state < 4) { W.city.damageBuilding(b, 150, x, y); fx.sparks(x, y, 20, 6, 0xffffff, 3); return false; }
            return dist < 9.5 && !W.city.solid(x, y);
          },
        });
      }
    });
  },

  cleave(pl, aim) {
    pl.state = 'cast'; pl.t = 0.32; pl.animT = 0;
    const fx = W.fx;
    pl.schedule(0.12, () => {
      const cx = pl.x + aim[0] * 1.4, cy = pl.y + aim[1] * 1.4;
      W.combat.arc(pl.x, pl.y, aim[0], aim[1], 2.7, 1.2, { dmg: 150, pctMax: 0.12, force: 9, lift: 160, stun: 0.8, bld: 650, mov: 999, heavy: true, src: 'cleave' });
      const p = [-aim[1], aim[0]];
      for (const s of [1, -1]) {
        const a = [cx + (aim[0] + p[0] * s) * 1.2, cy + (aim[1] + p[1] * s) * 1.2], b = [cx - (aim[0] + p[0] * s) * 1.2, cy - (aim[1] + p[1] * s) * 1.2];
        fx.beam(a[0], a[1], 22, b[0], b[1], 4, 0.14, 0xffffff, 3);
        fx.beam(a[0], a[1], 22, b[0], b[1], 4, 0.2, 0xff4040, 1);
        W.ground.slash(a[0], a[1], b[0], b[1], 2);
      }
      fx.sparks(cx, cy, 16, 12, 0xff8080, 4);
      fx.shakeCam(5); fx.hitstop(0.07);
      W.audio.play('cleave');
    });
  },

  fuga(pl, aim) {
    pl.state = 'charge'; pl.t = 0.8; pl.animT = 0; pl.inv = 0.8;
    const fx = W.fx;
    W.audio.play('fireCharge');
    let t = 0, fired = false, x, y, dist = 0, arrow = null;
    const charge = 0.75;
    pl.effects.push({
      update(dt) {
        t += dt;
        if (!fired) {
          const [hx, hy] = handPos(pl, 0.7);
          fx.flames(hx, hy, 1, 0.25);
          if (Math.random() < 0.5) fx.spawn('px2', hx, hy, 20, rand(-0.5, 0.5), rand(-0.5, 0.5), 30, 0.3, { tint: 0xffa22e, add: true });
          if (t >= charge) {
            fired = true; x = hx; y = hy;
            arrow = img('fire_arrow');
            const [sx, sy] = screenDir(aim[0], aim[1]);
            arrow.setRotation(Math.atan2(sy, sx));
            W.audio.play('fireShot');
            fx.shakeCam(3);
          }
          return true;
        }
        const step = 19 * dt;
        x += aim[0] * step; y += aim[1] * step; dist += step;
        placeImg(arrow, x, y, 18);
        fx.flames(x - aim[0] * 0.4, y - aim[1] * 0.4, 1, 0.15);
        const hitE = W.enemies.nearest(x, y, 0.8);
        const hitM = W.city.movablesNear(x, y, 0.4).length > 0;
        if (hitE || hitM || W.city.solid(x, y) || dist > 15) {
          // Explosion géante : rayon de 21,5 cases (5 fois le rayon d'origine de 4,3).
          const R = FUGA_RADIUS;
          W.combat.area(x, y, R, { dmg: 230, force: 17, lift: 280, stun: 1, bld: 1300, mov: 300, heavy: true, src: 'fire' });
          fx.explosion(x, y, 4, 0xff8a1e);
          fx.ring(x, y, 0.4, R * 0.35, 0.35, 0xfff3a0, 5);
          fx.ring(x, y, 0.4, R, 0.9, 0xffd060, 5);
          fx.ring(x, y, 0.4, R * 0.8, 1.1, 0xff6a1e, 3);
          fx.disc(x, y, R * 0.6, R * 0.2, 0.18, 0xffffff, 0.75, { top: true });
          W.ground.scorch(x, y, 3); W.ground.crater(x, y, 2.8);
          for (let i = 0; i < 22; i++) {
            const a = Math.random() * TAU, r = rand(1, R * 0.75);
            W.city.addFire(x + Math.cos(a) * r, y + Math.sin(a) * r, 0.9, rand(5, 9));
            W.ground.scorch(x + Math.cos(a) * r, y + Math.sin(a) * r, rand(1, 3));
          }
          fx.shakeCam(14); fx.hitstop(0.12); fx.slowmo(0.4, 0.25);
          W.audio.play('bigBoom');
          // cascade d'explosions secondaires qui se propage vers l'extérieur
          const cx = x, cy = y;
          let t = 0, next = 0, n = 0;
          pl.effects.push({
            update(dt) {
              t += dt; next -= dt;
              while (next <= 0 && n < 26) {
                next += 0.035; n++;
                const a = Math.random() * TAU, r = R * Math.min(1, (n / 26) * rand(0.6, 1.1));
                const bx = cx + Math.cos(a) * r, by = cy + Math.sin(a) * r;
                fx.explosion(bx, by, 1.6, 0xff8a1e);
                W.ground.scorch(bx, by, 1.5);
                if (n % 6 === 0) W.audio.play('explosion');
              }
              return n < 26;
            },
          });
          return false;
        }
        return true;
      },
      destroy() { if (arrow) arrow.destroy(); },
    });
  },
};
