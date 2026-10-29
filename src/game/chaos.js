// Chaos : monte avec le temps, la destruction et les fléaux éliminés. Pilote les apparitions et les événements.
import { W } from '../state.js';
import { rand, pick, TAU } from '../util.js';
import { WALKABLE } from '../world/citygen.js';

const EVENTS = {
  horde: { name: 'HORDE', sub: 'Une marée de fléaux déferle', min: 2 },
  surprise: { name: 'ATTAQUE SURPRISE', sub: 'Ils surgissent du sol !', min: 3 },
  elites: { name: "VAGUE D'ÉLITES", sub: 'Des fléaux puissants approchent', min: 4 },
  rift: { name: 'FAILLE MAUDITE', sub: 'Une faille vomit des fléaux', min: 6 },
  superior: { name: 'FLÉAU SUPÉRIEUR', sub: 'Une présence écrasante...', min: 7 },
};

export class Chaos {
  constructor(session) {
    this.s = session;
    this.value = session.startChaos || 0;
    this.spawnT = 1.5;
    this.eventT = rand(40, 60) / session.intensity;
    this.lastLevel = this.level;
    this.rifts = [];
    this.time = 0;
  }
  get level() { return Math.min(10, 1 + Math.floor(this.value / 10)); }
  get frac() { return this.level >= 10 ? 1 : (this.value % 10) / 10; }

  add(v) { this.value = Math.min(100, this.value + v * this.s.intensity); }
  addDestruction(n) { this.add(n * 0.3); }
  addKill(elite) { this.add(elite ? 2.2 : 0.22); }

  // Point d'apparition hors champ, sur une case praticable.
  findSpawn(minD = 12, maxD = 17, around = W.player) {
    const city = W.city, N = W.map.n;
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * TAU, d = rand(minD, maxD);
      const x = around.x + Math.cos(a) * d, y = around.y + Math.sin(a) * d;
      if (x < 3 || y < 3 || x > N - 3 || y > N - 3) continue;
      if (city.circleSolid(x, y, 0.4)) continue;
      if (!WALKABLE(W.map.ground[Math.floor(y) * N + Math.floor(x)])) continue;
      return [x, y];
    }
    return null;
  }

  pickType() {
    const lv = this.level;
    const elites = W.enemies.eliteCount;
    const eliteChance = 0.015 + lv * 0.018 * this.s.intensity;
    if (elites < 1 + Math.floor(lv / 3) && Math.random() < eliteChance) {
      const pool = ['colosse', 'predateur', 'artillerie'];
      if (lv >= 6 && !W.enemies.list.some((e) => e.type === 'superieur' && !e.dead) && Math.random() < 0.15) return 'superieur';
      return pick(pool);
    }
    return Math.random() < 0.55 - lv * 0.02 ? 'larve' : 'rodeur';
  }

  update(dt) {
    this.time += dt;
    // le temps fait monter le chaos
    this.add(dt * 0.11);
    const lv = this.level;
    if (lv > this.lastLevel) {
      this.lastLevel = lv;
      W.ui && W.ui.banner('NIVEAU DE CHAOS ' + lv, lv >= 8 ? 'La ville sombre dans le chaos' : 'Les fléaux se multiplient');
      W.audio && W.audio.setIntensity(lv);
      if (lv >= 2 && Math.random() < 0.75) this.trigger(this.randomEvent());
    }
    // apparitions continues
    const target = Math.round((5 + lv * 3.2) * this.s.density);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = Math.max(0.35, 2.4 - lv * 0.18) / Math.max(0.4, this.s.density);
      if (W.enemies.count < target) {
        const p = this.findSpawn();
        if (p) W.enemies.spawn(this.pickType(), p[0], p[1]);
      }
    }
    // événements aléatoires
    this.eventT -= dt;
    if (this.eventT <= 0) {
      this.eventT = rand(45, 80) / this.s.intensity;
      const ev = this.randomEvent();
      if (ev) this.trigger(ev);
    }
    // failles actives
    for (let i = this.rifts.length - 1; i >= 0; i--) {
      const r = this.rifts[i];
      r.t -= dt; r.spawn -= dt;
      if (Math.random() < dt * 20) W.fx.energy(r.x, r.y, rand(0, 50), 1, 0x8a3ad0, 0.8, 0.8);
      if (Math.random() < dt * 3) W.fx.disc(r.x, r.y, 1.4, 0.8, 0.5, 0x1b0a24, 0.7);
      if (r.spawn <= 0) {
        r.spawn = 0.9;
        W.enemies.spawn(Math.random() < 0.12 ? pick(['colosse', 'predateur', 'artillerie']) : pick(['larve', 'rodeur']), r.x + rand(-1, 1), r.y + rand(-1, 1));
      }
      if (r.t <= 0) this.rifts.splice(i, 1);
    }
  }

  randomEvent() {
    const lv = this.level;
    const pool = Object.keys(EVENTS).filter((k) => EVENTS[k].min <= lv);
    if (!pool.length) return null;
    // les événements spectaculaires deviennent plus probables avec le chaos
    const weights = pool.map((k) => (EVENTS[k].min <= 3 ? 3 : 1 + lv * 0.25));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[0];
  }

  trigger(key) {
    if (!key) return;
    const ev = EVENTS[key];
    const lv = this.level, P = W.player, E = W.enemies;
    W.ui && W.ui.banner(ev.name, ev.sub, true);
    W.audio && W.audio.play('alarm');
    const d = this.s.density;
    if (key === 'horde') {
      const a = Math.random() * TAU;
      const cx = P.x + Math.cos(a) * 14, cy = P.y + Math.sin(a) * 14;
      const n = Math.round((10 + lv * 2) * d);
      for (let i = 0; i < n; i++) {
        const p = this.findSpawn(0, 4, { x: cx, y: cy }) || this.findSpawn();
        if (p) E.spawn(Math.random() < 0.6 ? 'larve' : 'rodeur', p[0], p[1]);
      }
    } else if (key === 'surprise') {
      const n = Math.round((6 + lv) * d);
      for (let i = 0; i < n; i++) {
        const p = this.findSpawn(2.5, 5);
        if (p) E.spawn(Math.random() < 0.5 ? 'rodeur' : 'larve', p[0], p[1]);
      }
      W.fx.shakeCam(4);
    } else if (key === 'elites') {
      const n = 2 + (lv >= 7 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const p = this.findSpawn(10, 15);
        if (p) E.spawn(pick(['colosse', 'predateur', 'artillerie']), p[0], p[1]);
      }
    } else if (key === 'rift') {
      const p = this.findSpawn(7, 11);
      if (p) this.rifts.push({ x: p[0], y: p[1], t: 15, spawn: 0.5 });
    } else if (key === 'superior') {
      const p = this.findSpawn(8, 12);
      if (p) {
        E.spawn('superieur', p[0], p[1]);
        W.fx.ring(p[0], p[1], 0.5, 6, 0.8, 0xff3060, 4);
        W.fx.shakeCam(8);
      }
    }
  }
}
