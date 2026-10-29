// Scène Phaser principale : construit la ville, gère la boucle de jeu, la caméra et les sessions.
import { W } from './state.js';
import { KITS, MAP_N } from './config.js';
import { settings } from './settings.js';
import { isoX, isoY } from './util.js';
import { registerArt, warmupStep } from './gfx/registry.js';
import { initGroundArt, Ground } from './world/ground.js';
import { generateCity, nearestWalkable } from './world/citygen.js';
import { City } from './world/city.js';
import { FX } from './game/fx.js';
import { Enemies } from './game/enemies.js';
import { Flow } from './game/flow.js';
import { Domain } from './game/domain.js';
import { Chaos } from './game/chaos.js';
import { Player } from './game/player.js';
import { installCombat } from './game/combat.js';

const NO_INPUT = { mx: 0, my: 0, mag: 0, attackHeld: false, pressed: new Set(), held: new Set(), powerAim: {}, aiming: null };

export class WorldScene extends Phaser.Scene {
  constructor() { super('world'); }

  create() {
    W.scene = this;
    registerArt(this);
    initGroundArt();
    installCombat();
    W.fx = new FX(this);
    W.enemies = new Enemies(this);
    W.domain = new Domain(this);
    this.buildWorld();
    this.camX = isoX(48, 48); this.camY = isoY(48, 48);
    this.menuT = 0;
    this.fpsT = 0; this.goodT = 0;
    this.applySettings();
    W.game = {
      startSession: (o) => this.startSession(o),
      pause: () => this.pause(),
      resume: () => this.resume(),
      switchChar: (k) => this.switchChar(k),
      quit: () => this.quit(),
      applySettings: () => this.applySettings(),
    };
    this.dirty = false;
    W.mode = 'menu';
    W.ui.show('menu');
    W.audio.startMusic('menu');
    const ld = document.getElementById('loading');
    if (ld) ld.remove();
    this.game.events.emit('world-ready');
  }

  buildWorld() {
    W.map = generateCity(1337);
    if (!W.ground) W.ground = new Ground(this, W.map);
    else { W.ground.map = W.map; W.ground.redrawAll(); }
    W.city = new City(this, W.map);
    W.flow = new Flow(MAP_N);
  }

  // Remet la ville dans son état initial.
  resetWorld() {
    if (W.player) { W.player.destroy(); W.player = null; }
    W.enemies.clear();
    W.fx.clear();
    W.domain.clear();
    W.city.destroy();
    this.buildWorld();
    W.chaos = null;
    W.hitstop = 0; W.slowmo = 1; W.slowmoT = 0;
    this.dirty = false;
  }

  startSession(o) {
    if (this.dirty || W.player) this.resetWorld();
    this.dirty = true;
    W.ui.hideScreens();
    W.session = o;
    W.chaos = new Chaos(o);
    const [x, y] = nearestWalkable(W.map, o.spawn.x, o.spawn.y);
    W.player = new Player(this, o.char, x, y);
    this.camX = isoX(x, y); this.camY = isoY(x, y) - 16;
    W.mode = 'play';
    W.ui.showHud(true);
    W.input.setKit(KITS[o.char]);
    W.input.show(true);
    W.audio.setIntensity(W.chaos.level);
    W.audio.startMusic('game');
    W.ui.banner(o.spawn.name.toUpperCase(), o.presetName + ' · ' + KITS[o.char].name);
  }

  pause() {
    if (W.mode !== 'play') return;
    W.mode = 'paused';
    W.input.show(false);
    W.ui.show('pause');
  }
  resume() {
    W.mode = 'play';
    W.input.show(true);
  }
  switchChar(k) {
    if (!W.player) return;
    W.player.setChar(k);
    W.input.setKit(KITS[k]);
    W.fx.energy(W.player.x, W.player.y, 16, 20, k === 'gojo' ? 0x9fd0ff : 0xff6060, 2.5, 0.6);
  }
  quit() {
    this.resetWorld();
    W.mode = 'menu';
    W.ui.showHud(false);
    W.input.show(false);
    W.ui.show('menu');
    W.audio.startMusic('menu');
  }
  applySettings() {
    const s = settings();
    if (s.quality !== 'auto') W.quality = s.quality;
    if (W.city) {
      W.city.shadows = s.shadows;
      for (const m of W.city.movables) m.shadow.setVisible(false);
    }
  }

  autoQuality(dt) {
    if (settings().quality !== 'auto' || W.mode !== 'play') return;
    this.fpsT += dt;
    if (this.fpsT < 2) return;
    this.fpsT = 0;
    const fps = this.game.loop.actualFps;
    const order = ['low', 'medium', 'high'];
    const i = order.indexOf(W.quality);
    if (fps < 42 && i > 0) { W.quality = order[i - 1]; this.goodT = 0; }
    else if (fps > 57) { this.goodT += 2; if (this.goodT > 20 && i < 2) { W.quality = order[i + 1]; this.goodT = 0; } }
    else this.goodT = 0;
  }

  update(time, delta) {
    const real = Math.min(delta, 50) / 1000 * (W.testSpeed || 1);
    const cam = this.cameras.main;
    this.autoQuality(real);
    if (W.mode !== 'play' || (this.warmT = (this.warmT || 0) + 1) % 4 === 0) warmupStep();

    if (W.mode === 'menu') {
      // la ville défile lentement derrière le menu
      this.menuT += real;
      const a = this.menuT * 0.04;
      const tx = isoX(48 + Math.cos(a) * 18, 48 + Math.sin(a) * 18), ty = isoY(48 + Math.cos(a) * 18, 48 + Math.sin(a) * 18);
      cam.centerOn(Math.round(tx), Math.round(ty));
      W.city.update(real, cam);
      W.fx.update(real);
      W.ground.update(cam);
      return;
    }
    if (W.mode !== 'play') { W.ground.update(cam); return; }

    const input = W.input.frame();
    if (input.pressed.has('pause')) { this.pause(); return; }

    let dt = real;
    if (W.hitstop > 0) { W.hitstop -= real; dt = 0; }
    if (W.slowmoT > 0) { W.slowmoT -= real; dt *= W.slowmo; } else W.slowmo = 1;

    const P = W.player;
    const cine = W.domain.cinematic;
    if (dt > 0) {
      if (!cine) W.chaos.update(dt);
      W.flow.update(dt, P.x, P.y);
      P.update(dt, cine ? NO_INPUT : input);
      W.enemies.update(dt);
      W.domain.update(dt);
      W.city.update(dt, cam);
      W.fx.update(dt);
    }
    W.ground.update(cam);

    // caméra qui suit le joueur
    const tx = isoX(P.x, P.y), ty = isoY(P.x, P.y) - 16;
    const k = Math.min(1, real * 7);
    this.camX += (tx - this.camX) * k; this.camY += (ty - this.camY) * k;
    const N = MAP_N, hw = cam.width / 2, hh = cam.height / 2;
    this.camX = Math.max(-N * 16 + hw, Math.min(N * 16 - hw, this.camX));
    this.camY = Math.max(hh - 60, Math.min(N * 16 - hh, this.camY));
    let sx = 0, sy = 0;
    const fx = W.fx;
    if (fx.shake > 0.2) { sx = (Math.random() - 0.5) * fx.shake * 2; sy = (Math.random() - 0.5) * fx.shake * 2; fx.shake *= Math.exp(-9 * real); } else fx.shake = 0;
    cam.centerOn(Math.round(this.camX + sx), Math.round(this.camY + sy));

    W.input.setCooldowns(P.cooldowns());
    W.ui.updateHud(real);
  }
}
