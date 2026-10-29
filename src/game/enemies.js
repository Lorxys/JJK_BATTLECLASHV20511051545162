// Fléaux : deux types de base et quatre archétypes d'élite (Colosse, Prédateur, Artillerie, Fléau supérieur).
import { W } from '../state.js';
import { isoX, isoY, depthOf, rand, norm, screenDir, TAU } from '../util.js';
import { ART } from '../gfx/registry.js';
import { QUALITY, GOJO_DMG } from '../config.js';

const GOJO_SRC = new Set(['melee', 'player', 'blue', 'red', 'purple', 'void']);
import { settings } from '../settings.js';
import { CHAR_TINT, nightMul } from './night.js';

export const EDEF = {
  larve: { sheet: 'larve', hp: 15, speed: 2.8, r: 0.3, range: 0.9, windup: 0.3, cd: 1.1, mass: 0.5, shadow: 'shadow_s', h: 14 },
  rodeur: { sheet: 'rodeur', hp: 40, speed: 1.9, r: 0.35, range: 1.2, windup: 0.45, cd: 1.4, mass: 1, shadow: 'shadow_s', h: 36 },
  colosse: { elite: true, name: 'Colosse', sheet: 'colosse', hp: 550, speed: 1.15, r: 0.7, range: 2.0, windup: 0.9, cd: 2.4, mass: 6, shadow: 'shadow_l', h: 74 },
  predateur: { elite: true, name: 'Prédateur', sheet: 'predateur', hp: 230, speed: 4.4, r: 0.38, range: 1.3, windup: 0.22, cd: 0.9, mass: 1.3, shadow: 'shadow_m', h: 34 },
  artillerie: { elite: true, name: 'Artillerie', sheet: 'artillerie', hp: 260, speed: 1.7, r: 0.45, range: 9, windup: 0.5, cd: 2.6, mass: 1.6, shadow: 'shadow_m', h: 40, hover: 12 },
  superieur: { elite: true, name: 'Fléau supérieur', sheet: 'superieur', hp: 1400, speed: 2.6, r: 0.45, range: 1.6, windup: 0.45, cd: 1.2, mass: 3, shadow: 'shadow_m', h: 54 },
};
const G = 700;

class Enemy {
  constructor(scene, type, x, y) {
    const def = EDEF[type];
    this.type = type; this.def = def; this.elite = !!def.elite;
    const mult = W.chaos ? 1 + (W.chaos.level - 1) * 0.06 : 1;
    this.max = this.hp = def.hp * mult;
    this.x = x; this.y = y; this.z = 0; this.vz = 0; this.kvx = 0; this.kvy = 0;
    this.state = 'spawn'; this.t = 0.7; this.atkCd = rand(0.3, 1); this.stun = 0; this.stunT = 0;
    this.face = [1, 0]; this.animT = Math.random() * 2; this.flash = 0;
    this.dead = false; this.deadT = 0; this.inDomain = false;
    this.spCd = rand(2, 4); this.dodgeCd = 0; this.held = null; this.camo = false; this.rage = false;
    this.sheet = ART.sheets[def.sheet];
    this.sprite = scene.add.image(0, 0, 'sheet_' + def.sheet, 0).setOrigin(this.sheet.ox / this.sheet.fw, this.sheet.oy / this.sheet.fh);
    this.shadow = scene.add.image(0, 0, def.shadow).setDepth(-8e5).setVisible(settings().shadows);
    this.sprite.setAlpha(0);
  }

  hit(h) {
    if (this.dead) return;
    const E = W.enemies;
    // Gojo frappe beaucoup plus fort (multiplicateur réglable dans config.js)
    const gojo = W.player && W.player.key === 'gojo' && GOJO_SRC.has(h.src);
    this.hp -= gojo ? h.dmg * GOJO_DMG : h.dmg;
    this.flash = 0.08;
    const m = Math.sqrt(this.def.mass);
    this.kvx += h.kx / m; this.kvy += h.ky / m;
    if (h.lift) { this.vz = Math.max(this.vz, h.lift / m); this.z = Math.max(this.z, 1); }
    const st = this.elite ? h.stun * 0.45 : h.stun;
    if (st > 0 && this.state !== 'spawn') { this.stun = Math.max(this.stun, st); if (this.state !== 'down') this.state = 'hit'; }
    if (this.held) this.dropHeld();
    const fx = W.fx;
    if (fx) {
      fx.sparks(this.x, this.y, this.def.h * 0.5, h.heavy ? 8 : 4, h.src === 'fire' ? 0xffa22e : 0xffffff, h.heavy ? 4 : 2.5);
      if (h.heavy && this.elite) { fx.energy(this.x, this.y, this.def.h * 0.5, 10, 0x8a3ad0, 3); fx.ghost(this.sprite, 0xff6b6b, 0.25); }
    }
    if (this.hp <= 0) this.die();
    else if (E) E.lastHit = this;
  }

  die() {
    this.dead = true; this.deadT = 0.55; this.state = 'dead';
    this.sprite.setTint(0x6a2a9a);
    W.fx && W.fx.dissolve(this.x, this.y, this.def.h, this.elite);
    W.chaos && W.chaos.addKill(this.elite);
    W.audio && W.audio.play(this.elite ? 'eliteDie' : 'dissolve');
    if (this.elite) { W.fx && W.fx.shakeCam(4); W.fx && W.fx.hitstop(0.08); }
  }

  dropHeld() {
    if (!this.held) return;
    this.held.held = false; this.held.z = 40; this.held.sleep = false;
    this.held = null;
  }

  anim(name, loop = true) {
    const sh = this.sheet;
    let a = sh.anims[name] || sh.anims.idle;
    const [sx, sy] = screenDir(this.face[0], this.face[1]);
    const back = sy < -0.05;
    const frames = back ? a.b : a.f;
    let i = Math.floor(this.animT * a.fps);
    i = loop ? i % frames.length : Math.min(frames.length - 1, i);
    this.sprite.setFrame(frames[i]);
    this.sprite.setFlipX(sx < 0);
  }
  setState(s, t = 0) { this.state = s; this.t = t; this.animT = 0; }
}

export class Enemies {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.proj = [];
    this.bars = scene.add.graphics().setDepth(9e5 - 2);
    this.grid = new Map();
    this.lastHit = null;
  }
  get count() { return this.list.filter((e) => !e.dead).length; }
  get eliteCount() { return this.list.filter((e) => !e.dead && e.elite).length; }
  cap() { return (QUALITY[W.quality] || QUALITY.medium).enemies; }

  spawn(type, x, y) {
    if (this.count >= this.cap() + (EDEF[type].elite ? 4 : 0)) return null;
    const e = new Enemy(this.scene, type, x, y);
    this.list.push(e);
    W.fx && W.fx.disc(x, y, 0.2, e.def.r * 2 + 0.6, 0.7, 0x1b0a24, 0.85);
    W.fx && W.fx.energy(x, y, 4, e.elite ? 16 : 6, 0x8a3ad0, 1.5, 0.7);
    if (e.elite) W.audio && W.audio.play('eliteSpawn');
    return e;
  }

  // Dégâts de zone sans recul (flammes au sol).
  burn(x, y, r, dmg) {
    for (const e of this.list) if (!e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 < (r + e.def.r) ** 2) { e.hp -= dmg; if (Math.random() < 0.02) e.flash = 0.04; if (e.hp <= 0) e.die(); }
  }

  // Un objet projeté (voiture, conteneur...) percute les fléaux.
  hitByObject(m, sp) {
    if (m.thrower === 'enemy') return;
    for (const e of this.list) {
      if (e.dead || (m.hitSet && m.hitSet.has(e))) continue;
      const rr = m.def.r + e.def.r;
      if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 > rr * rr || m.z > e.def.h + 10) continue;
      const k = norm(m.vx, m.vy);
      e.hit({ dmg: sp * m.def.mass * 7 + m.z * 0.3, kx: k[0] * sp * 0.8, ky: k[1] * sp * 0.8, lift: 120, stun: 0.8, heavy: true, src: 'object' });
      m.hitSet && m.hitSet.add(e);
    }
  }

  nearest(x, y, maxD = 99, dirX = 0, dirY = 0, cone = -2) {
    let best = null, bd = maxD;
    for (const e of this.list) {
      if (e.dead || e.state === 'spawn') continue;
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
      if (d >= bd) continue;
      if (cone > -2 && d > 0.2 && (dx * dirX + dy * dirY) / d < cone) continue;
      bd = d; best = e;
    }
    return best;
  }

  fireOrb(e, tx, ty, big = false, speed = 6) {
    const [dx, dy] = norm(tx - e.x, ty - e.y);
    const img = this.scene.add.image(0, 0, big ? 'orb_curse_big' : 'orb_curse');
    this.proj.push({ x: e.x + dx * 0.5, y: e.y + dy * 0.5, z: (e.def.hover || 0) + e.def.h * 0.5, vx: dx * speed, vy: dy * speed, t: 3.2, img, big });
    W.audio && W.audio.play('curseShot');
  }

  clear() {
    for (const e of this.list) { e.sprite.destroy(); e.shadow.destroy(); if (e.held) e.dropHeld(); }
    for (const p of this.proj) p.img.destroy();
    this.list = []; this.proj = [];
    this.bars.clear();
  }

  update(dt) {
    const P = W.player, city = W.city, flow = W.flow, D = W.domain && W.domain.zone;
    const cinematic = W.domain && W.domain.cinematic;
    // grille de séparation
    this.grid.clear();
    for (const e of this.list) {
      if (e.dead) continue;
      const k = (e.x | 0) + ',' + (e.y | 0);
      let l = this.grid.get(k); if (!l) this.grid.set(k, l = []); l.push(e);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead) {
        e.deadT -= dt;
        e.sprite.setVisible(Math.floor(e.deadT * 24) % 2 === 0);
        if (e.deadT <= 0) { e.sprite.destroy(); e.shadow.destroy(); this.list.splice(i, 1); }
        continue;
      }
      if (cinematic) { this.render(e, dt * 0); continue; }
      this.step(e, dt, P, city, flow, D);
      this.render(e, dt);
    }
    this.updateProj(dt, P, city);
    this.drawBars();
  }

  step(e, dt, P, city, flow, D) {
    const def = e.def;
    e.animT += dt;
    e.flash -= dt;
    if (e.dodgeCd > 0) e.dodgeCd -= dt;
    // --- physique (recul, projection, gravité) ---
    const ksp = Math.hypot(e.kvx, e.kvy);
    if (ksp > 0.05) {
      const hit = city.moveCircle(e, e.kvx * dt, e.kvy * dt, def.r * 0.8);
      if (hit) {
        if (ksp > 5) {
          const b = city.buildingAtCell(hit[0], hit[1]);
          if (b) city.damageBuilding(b, ksp * def.mass * 14, e.x, e.y);
          e.hp -= ksp * 3; e.flash = 0.08;
          W.fx && W.fx.dust(e.x, e.y, 4, 2, 0.6);
          W.fx && W.fx.debris(e.x, e.y, 10, 4, 'concrete', 0.8);
          W.fx && W.fx.shakeCam(Math.min(5, ksp * 0.25));
          W.audio && W.audio.play('impact');
          if (e.hp <= 0) { e.die(); return; }
        }
        const cx = hit[0] + 0.5, cy = hit[1] + 0.5;
        if (Math.abs(e.x - cx) > Math.abs(e.y - cy)) e.kvx = -e.kvx * 0.3; else e.kvy = -e.kvy * 0.3;
      }
      // projeté à grande vitesse : renverse le mobilier
      if (ksp > 6) for (const p of city.propsInCircle(e.x, e.y, def.r + 0.2)) city.breakProp(p, 1);
    }
    if (e.z > 0 || e.vz > 0) {
      e.z += e.vz * dt; e.vz -= G * dt;
      if (e.z <= 0) {
        const hard = e.vz < -220;
        e.z = 0; e.vz = 0;
        W.fx && W.fx.dust(e.x, e.y, hard ? 5 : 2, hard ? 2 : 1, 0.6);
        if (hard && e.state !== 'frozen') { e.setState('down', e.elite ? 0.5 : 0.9); e.stun = 0; }
      }
    }
    const fr = Math.exp(-(e.z > 0 ? 0.6 : 5.5) * dt);
    e.kvx *= fr; e.kvy *= fr;

    // --- territoire : confinement et gel ---
    if (D && D.phase !== 'fade') {
      const dx = e.x - D.x, dy = e.y - D.y, d = Math.hypot(dx, dy);
      if (d < D.r - 0.2) e.inDomain = true;
      if (e.inDomain && d > D.r - 0.4) { e.x = D.x + (dx / d) * (D.r - 0.4); e.y = D.y + (dy / d) * (D.r - 0.4); e.kvx *= -0.3; e.kvy *= -0.3; }
      if (D.phase === 'active' && e.inDomain) { e.frozen = D.type; } // paralysie dans les deux territoires
      else e.frozen = false;
    } else { e.inDomain = false; e.frozen = false; }
    if (e.frozen) { if (e.held) e.dropHeld(); e.state = 'frozen'; return; }
    if (e.state === 'frozen') e.setState('move');

    // --- états ---
    if (e.stunT > 0) { e.stunT -= dt; e.state = 'stunned'; if (e.stunT <= 0) e.setState('move'); return; }
    if (e.state === 'spawn') { e.t -= dt; if (e.t <= 0) e.setState('move'); return; }
    if (e.state === 'hit') { e.stun -= dt; if (e.stun <= 0) e.setState('move'); return; }
    if (e.state === 'down') { e.t -= dt; if (e.t <= 0) e.setState('move'); return; }
    if (e.z > 2) return;
    if (!P) return;

    const dxp = P.x - e.x, dyp = P.y - e.y, dp = Math.hypot(dxp, dyp);
    const toP = dp > 0.01 ? [dxp / dp, dyp / dp] : [1, 0];
    e.atkCd -= dt; e.spCd -= dt;
    const speed = def.speed * (e.rage ? 1.3 : 1) * (W.session ? 0.85 + W.session.intensity * 0.15 : 1);

    const moveDir = (dir, mult = 1) => {
      let [mx, my] = dir;
      // séparation avec les voisins
      const cx = e.x | 0, cy = e.y | 0;
      for (let gy = cy - 1; gy <= cy + 1; gy++) for (let gx = cx - 1; gx <= cx + 1; gx++) {
        const l = this.grid.get(gx + ',' + gy);
        if (!l) continue;
        for (const o of l) {
          if (o === e) continue;
          const ox = e.x - o.x, oy = e.y - o.y, dd = Math.hypot(ox, oy), rr = e.def.r + o.def.r;
          if (dd < rr && dd > 0.001) { mx += (ox / dd) * (1 - dd / rr) * 1.5; my += (oy / dd) * (1 - dd / rr) * 1.5; }
        }
      }
      const [nx, ny] = norm(mx, my);
      city.moveCircle(e, nx * speed * mult * dt, ny * speed * mult * dt, def.r * 0.8);
      if (Math.abs(nx) + Math.abs(ny) > 0.1) e.face = [nx, ny];
    };
    const chase = (mult = 1) => {
      const dir = dp < 2.5 ? toP : (flow.dirAt(e.x, e.y) || toP);
      moveDir(dir, mult);
    };

    switch (e.type) {
      case 'artillerie': return this.aiArtillery(e, dt, P, dp, toP, moveDir, chase);
      case 'predateur': if (this.aiPredator(e, dt, P, dp, toP, moveDir)) return; break;
      case 'colosse': if (this.aiColossus(e, dt, P, dp, toP, chase, city)) return; break;
      case 'superieur': if (this.aiSuperior(e, dt, P, dp, toP)) return; break;
    }
    this.aiMelee(e, dt, P, dp, toP, chase);
  }

  aiMelee(e, dt, P, dp, toP, chase) {
    const def = e.def;
    if (e.state === 'windup') {
      e.t -= dt; e.face = toP;
      if (e.t <= 0) {
        e.setState('strike', 0.25);
        const fx = W.fx;
        const ax = e.x + e.face[0] * def.range * 0.6, ay = e.y + e.face[1] * def.range * 0.6;
        if (e.type === 'colosse' || (e.type === 'superieur' && e.slam)) {
          // frappe au sol : onde de choc qui détruit le décor
          const r = e.type === 'colosse' ? 2.4 : 3;
          fx && fx.ring(ax, ay, 0.3, r, 0.4, 0xd8d0c2, 3);
          fx && fx.dust(ax, ay, 10, 3, 1.4);
          fx && fx.shakeCam(6);
          W.ground && W.ground.crater(ax, ay, 1.2);
          W.combat.area(ax, ay, r, { bld: 260, mov: 30, force: 8, lift: 160, filter: null, src: 'enemy' });
          if (Math.hypot(P.x - ax, P.y - ay) < r + 0.3) P.hurt({ kx: toP[0] * 9, ky: toP[1] * 9, heavy: true, src: e });
          W.audio && W.audio.play('slam');
          e.slam = false;
        } else {
          fx && fx.spawn('swipe_red', ax, ay, def.h * 0.5, 0, 0, 0, 0.12, { rot: Math.atan2(screenDir(...e.face)[1], screenDir(...e.face)[0]), scale: e.elite ? 1.4 : 1, blink: false });
          if (dp < def.range + 0.45) P.hurt({ kx: toP[0] * (e.elite ? 7 : 3), ky: toP[1] * (e.elite ? 7 : 3), heavy: e.elite, src: e });
          W.audio && W.audio.play('claw');
        }
      }
      return;
    }
    if (e.state === 'strike') { e.t -= dt; if (e.t <= 0) e.setState('recover', 0.3); return; }
    if (e.state === 'recover') { e.t -= dt; if (e.t <= 0) e.setState('move'); return; }
    if (dp <= def.range * 0.9 && e.atkCd <= 0) {
      e.setState('windup', def.windup * (e.rage ? 0.7 : 1));
      e.atkCd = def.cd * (e.rage ? 0.7 : 1);
      e.face = toP;
      return;
    }
    if (dp > def.range * 0.8) { chase(); e.state = 'move'; }
    else { e.face = toP; e.state = 'idle'; }
  }

  aiColossus(e, dt, P, dp, toP, chase, city) {
    // Lance un véhicule sur le joueur.
    if (e.state === 'lift') {
      e.t -= dt; e.face = toP;
      if (e.held) { e.held.x = e.x; e.held.y = e.y; e.held.z = 70; }
      if (e.t <= 0 && e.held) {
        const m = e.held; e.held = null; m.held = false;
        m.x = e.x + toP[0] * 0.9; m.y = e.y + toP[1] * 0.9; m.z = 60;
        city.push(m, toP[0] * 15 * m.def.mass, toP[1] * 15 * m.def.mass, 60 * m.def.mass, 0, 'enemy');
        e.setState('recover', 0.6);
        W.audio && W.audio.play('whoosh');
      }
      return true;
    }
    if (e.spCd <= 0 && dp > 3.5 && dp < 11 && e.state === 'move') {
      const near = city.movablesNear(e.x, e.y, 2.2).filter((m) => !m.held && m.z <= 0);
      if (near.length) {
        const m = near[0];
        m.held = true; m.sleep = true; m.vx = m.vy = m.vz = 0;
        e.held = m; e.spCd = rand(7, 11);
        e.setState('lift', 0.9);
        W.audio && W.audio.play('roar');
        return true;
      }
      e.spCd = 2;
    }
    if (e.state === 'windup' && !e.slamSet) { e.slam = true; e.slamSet = true; }
    if (e.state !== 'windup') e.slamSet = false;
    return false;
  }

  aiPredator(e, dt, P, dp, toP, moveDir) {
    // camouflage à distance, esquives et bonds
    const camo = dp > 7 && e.state === 'move';
    e.sprite.setAlpha(camo ? 0.3 : 1);
    if (e.state === 'lunge') {
      e.t -= dt;
      if (e.t <= 0) { e.setState('windup', 0.05); }
      return true;
    }
    if (e.state === 'crouch') {
      e.t -= dt; e.face = toP;
      if (e.t <= 0) {
        e.kvx = toP[0] * Math.min(16, dp * 3.2); e.kvy = toP[1] * Math.min(16, dp * 3.2); e.vz = 140; e.z = 1;
        e.setState('lunge', 0.32);
        W.fx && W.fx.ghost(e.sprite, 0xa070ff, 0.3);
        W.audio && W.audio.play('whoosh');
      }
      return true;
    }
    const ps = P.state;
    if (e.dodgeCd <= 0 && dp < 2.8 && (ps === 'attack' || ps === 'cast') && Math.random() < 0.5) {
      const side = Math.random() < 0.5 ? 1 : -1;
      e.kvx = -toP[1] * side * 13 - toP[0] * 4; e.kvy = toP[0] * side * 13 - toP[1] * 4;
      e.dodgeCd = 1.6;
      W.fx && W.fx.ghost(e.sprite, 0xa070ff, 0.3);
      return true;
    }
    if (e.dodgeCd <= 0.4) e.dodgeCd = Math.max(e.dodgeCd, 0);
    if (e.spCd <= 0 && dp > 2.5 && dp < 6.5 && e.state === 'move') {
      e.spCd = rand(2.5, 4);
      e.setState('crouch', 0.3);
      return true;
    }
    return false;
  }

  aiArtillery(e, dt, P, dp, toP, moveDir, chase) {
    if (e.state === 'volley') {
      e.t -= dt; e.face = toP;
      e.shotT -= dt;
      if (e.shotT <= 0 && e.shots > 0) {
        e.shots--; e.shotT = 0.22;
        this.fireOrb(e, P.x + rand(-0.8, 0.8), P.y + rand(-0.8, 0.8), false, 6.5);
      }
      if (e.shots <= 0 && e.t <= 0) e.setState('move');
      return;
    }
    if (e.atkCd <= 0 && dp < 10) {
      e.setState('volley', 0.8); e.shots = 3; e.shotT = 0.25; e.atkCd = e.def.cd;
      return;
    }
    if (dp < 5) moveDir([-toP[0], -toP[1]], 0.9);
    else if (dp > 8.5) chase();
    else moveDir([-toP[1], toP[0]], 0.5);
    e.face = toP;
    e.state = 'move';
  }

  aiSuperior(e, dt, P, dp, toP) {
    if (!e.rage && e.hp < e.max * 0.5) { e.rage = true; W.fx && W.fx.ring(e.x, e.y, 0.5, 4, 0.6, 0xff3060, 3); W.audio && W.audio.play('roar'); }
    if (e.state === 'vanish') {
      e.t -= dt;
      if (e.t <= 0) {
        // réapparaît derrière le joueur
        const bx = P.x - P.face[0] * 1.4, by = P.y - P.face[1] * 1.4;
        if (!W.city.solid(bx, by)) { e.x = bx; e.y = by; }
        e.sprite.setAlpha(1);
        W.fx && W.fx.energy(e.x, e.y, 20, 14, 0x8a3ad0, 2);
        e.setState('windup', 0.3); e.face = [P.x - e.x, P.y - e.y];
      }
      return true;
    }
    if (e.state === 'cast') {
      e.t -= dt; e.face = toP;
      if (e.t <= 0) {
        for (let k = -3; k <= 3; k++) {
          const a = Math.atan2(toP[1], toP[0]) + k * 0.2;
          this.fireOrb(e, e.x + Math.cos(a) * 5, e.y + Math.sin(a) * 5, true, 5.5);
        }
        e.setState('recover', 0.5);
      }
      return true;
    }
    if (e.spCd <= 0 && e.state === 'move') {
      e.spCd = rand(4, 6) * (e.rage ? 0.7 : 1);
      const r = Math.random();
      if (r < 0.35 && dp > 3) { e.setState('cast', 0.7); return true; }
      if (r < 0.65) { e.setState('vanish', 0.5); e.sprite.setAlpha(0.15); W.fx && W.fx.energy(e.x, e.y, 20, 14, 0x8a3ad0, 2); return true; }
      if (dp < 4) { e.slam = true; e.setState('windup', 0.6); e.atkCd = e.def.cd; return true; }
    }
    return false;
  }

  updateProj(dt, P, city) {
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const p = this.proj[i];
      p.t -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.z = Math.max(4, p.z - dt * 6);
      let boom = p.t <= 0;
      if (!boom && P && Math.hypot(P.x - p.x, P.y - p.y) < 0.55) {
        P.hurt({ kx: p.vx * 0.8, ky: p.vy * 0.8, heavy: p.big, src: 'orb' });
        boom = true;
      }
      if (!boom && city.solid(p.x, p.y)) {
        const b = city.buildingAtCell(Math.floor(p.x), Math.floor(p.y));
        if (b) city.damageBuilding(b, p.big ? 120 : 50, p.x, p.y);
        boom = true;
      }
      if (boom) {
        W.fx && W.fx.energy(p.x, p.y, p.z, 8, 0x8a3ad0, 2);
        W.fx && W.fx.ring(p.x, p.y, 0.1, p.big ? 1.2 : 0.7, 0.25, 0x8a3ad0, 2);
        p.img.destroy(); this.proj.splice(i, 1);
        continue;
      }
      p.img.setPosition(Math.round(isoX(p.x, p.y)), Math.round(isoY(p.x, p.y) - p.z)).setDepth(depthOf(p.x, p.y) + 5);
    }
    // objets lancés par un Colosse
    if (!P) return;
    for (const m of city.movables) {
      if (m.thrower !== 'enemy' || m.sleep) continue;
      if (Math.hypot(P.x - m.x, P.y - m.y) < m.def.r + 0.4 && m.z < 40) {
        const k = norm(m.vx, m.vy);
        P.hurt({ kx: k[0] * 10, ky: k[1] * 10, heavy: true, src: 'object' });
        m.thrower = null;
        m.vx *= -0.3; m.vy *= -0.3;
      }
    }
  }

  render(e, dt) {
    const sx = Math.round(isoX(e.x, e.y)), sy = Math.round(isoY(e.x, e.y));
    const hover = e.def.hover ? e.def.hover + Math.sin(e.animT * 3) * 2 : 0;
    let jitter = 0;
    const st = e.state;
    if (st === 'spawn') e.sprite.setAlpha(Math.min(1, 1 - e.t / 0.7));
    else if (e.type !== 'predateur' && st !== 'vanish') e.sprite.setAlpha(1);
    if (e.frozen) jitter = Math.random() < 0.5 ? -1 : 1;
    e.sprite.setPosition(sx + jitter, sy - e.z - hover).setDepth(depthOf(e.x, e.y));
    e.shadow.setPosition(sx, sy).setVisible(settings().shadows && e.sprite.visible);
    if (e.flash > 0) e.sprite.setTintFill(0xffffff);
    else if (e.frozen) e.sprite.setTint(e.frozen === 'shrine' ? (Math.random() < 0.5 ? 0xff3030 : 0xff7070) : 0x9fb0ff);
    else if (st === 'stunned') e.sprite.setTint(Math.floor(e.animT * 8) % 2 ? 0xffe14a : 0xffffff);
    else if (e.rage) e.sprite.setTint(nightMul(0xffb0b0, CHAR_TINT));
    else e.sprite.setTint(CHAR_TINT);
    const map = { move: 'run', idle: 'idle', windup: 'attack', strike: 'attack', recover: 'idle', hit: 'hit', down: 'down', stunned: 'hit',
      frozen: 'hit', spawn: 'idle', lift: 'cast', crouch: 'attack', lunge: 'attack', volley: 'cast', cast: 'cast', vanish: 'idle' };
    let name = map[st] || 'idle';
    if (e.type === 'larve' && name === 'cast') name = 'attack';
    if (name === 'attack' && st === 'windup') { e.animT = Math.min(e.animT, 0.05); }
    if (st === 'strike' && e.animT < 0.1) e.animT = 0.1;
    if (!e.frozen) this.animate(e, name);
  }

  animate(e, name) {
    const loop = name === 'run' || name === 'idle';
    e.anim(name, loop);
  }

  drawBars() {
    const g = this.bars;
    g.clear();
    for (const e of this.list) {
      if (e.dead || !e.elite || !e.sprite.visible || e.sprite.alpha < 0.5) continue;
      const w = e.type === 'colosse' || e.type === 'superieur' ? 30 : 22;
      const x = Math.round(isoX(e.x, e.y) - w / 2), y = Math.round(isoY(e.x, e.y) - e.z - e.def.h - (e.def.hover || 0) - 8);
      g.fillStyle(0x1b1424, 1); g.fillRect(x - 1, y - 1, w + 2, 5);
      g.fillStyle(e.type === 'superieur' ? 0xff3060 : 0xc040ff, 1); g.fillRect(x, y, Math.max(0, Math.round(w * e.hp / e.max)), 3);
      if (e.stunT > 0) { g.fillStyle(0xffe14a, 1); g.fillRect(x, y + 4, Math.round(w * Math.min(1, e.stunT / 8)), 1); }
    }
  }
}
