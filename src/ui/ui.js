// Interface (DOM) : menus, sélection, paramètres, pause, HUD, mini-carte, bannières.
import { W } from '../state.js';
import { KITS, PRESETS, SPAWNS, DISTRICTS, MAP_N } from '../config.js';
import { settings, saveSettings } from '../settings.js';
import { ART } from '../gfx/registry.js';
import { T, districtAt } from '../world/citygen.js';

const $ = (s, r = document) => r.querySelector(s);
const CODES = 'CRIKP';

export class UI {
  constructor(root) {
    this.root = root;
    this.screen = null;
    this.back = null;
    this.ctxPause = false;
    this.mmT = 0;
    this.build();
  }

  build() {
    const r = this.root;
    r.insertAdjacentHTML('beforeend', `
      <div id="hud" class="hidden">
        <button id="pausebtn" class="iconbtn" aria-label="Pause">II</button>
        <div id="chaos"><div class="c-lbl">CHAOS <b id="c-lv">1</b></div><div id="c-bar">${'<i></i>'.repeat(10)}</div></div>
        <div id="mm"><canvas id="mmc" width="192" height="96"></canvas><div id="mm-d"></div></div>
        <div id="fps" class="hidden"></div>
      </div>
      <div id="banner" class="hidden"><div class="b-t"></div><div class="b-s"></div></div>
      <div id="domainfx" class="hidden"><div class="d-k1">領域展開</div><div class="d-k2"></div><div class="d-n"></div></div>
      <div id="screens"></div>
      <div id="confirm" class="hidden"><div class="panel small"><div class="c-msg"></div><div class="row"><button class="pbtn" data-c="no">Annuler</button><button class="pbtn primary" data-c="yes">Confirmer</button></div></div></div>
    `);
    $('#pausebtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); W.game.pause(); });
    $('#confirm').addEventListener('click', (e) => {
      const c = e.target.dataset.c;
      if (!c) return;
      $('#confirm').classList.add('hidden');
      const fn = this.confirmFn; this.confirmFn = null;
      if (c === 'yes' && fn) fn();
    });
    this.screens = $('#screens');
    this.screens.addEventListener('click', (e) => this.onClick(e));
    this.mm = $('#mmc').getContext('2d');
    this.mmBase = document.createElement('canvas');
    this.mmBase.width = 192; this.mmBase.height = 96;
  }

  click() { W.audio && W.audio.play('ui'); }

  confirm(msg, fn) {
    $('#confirm .c-msg').textContent = msg;
    this.confirmFn = fn;
    $('#confirm').classList.remove('hidden');
  }

  show(name) {
    this.screen = name;
    const html = this['scr_' + name] ? this['scr_' + name]() : '';
    this.screens.innerHTML = html;
    this.screens.classList.toggle('hidden', !html);
    if (this['after_' + name]) this['after_' + name]();
  }
  hideScreens() { this.screen = null; this.screens.innerHTML = ''; this.screens.classList.add('hidden'); this.stopPreview(); }

  onClick(e) {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    this.click();
    const a = t.dataset.a, v = t.dataset.v;
    const s = settings();
    switch (a) {
      case 'play': W.audio.unlock(); this.goFullscreen(); this.show('mode'); break;
      case 'chars': this.ctxPause = false; this.show('chars'); break;
      case 'settings': this.back = this.screen; this.show('settings'); break;
      case 'back': this.show(this.backTarget()); break;
      case 'pickchar':
        s.character = v; saveSettings();
        if (this.ctxPause) { this.ctxPause = false; W.game.switchChar(v); this.hideScreens(); W.game.resume(); }
        else this.show('chars');
        break;
      case 'preset': s.lastPreset = v; saveSettings(); this.show('mode'); break;
      case 'tospawn': this.show('spawn'); break;
      case 'spawn': this.startGame(v); break;
      case 'resume': this.hideScreens(); W.game.resume(); break;
      case 'pchar': this.ctxPause = true; this.show('chars'); break;
      case 'restart': this.confirm('Redémarrer la session ? La ville et le chaos seront réinitialisés.', () => { this.show('spawn'); this.restarting = true; }); break;
      case 'quit': this.confirm('Quitter vers le menu principal ? La session en cours sera perdue.', () => W.game.quit()); break;
      case 'set': {
        const opts = { quality: ['auto', 'low', 'medium', 'high'], effects: ['reduced', 'normal', 'max'], debris: ['few', 'normal', 'many'] };
        if (opts[v]) { const o = opts[v]; s[v] = o[(o.indexOf(s[v]) + 1) % o.length]; }
        else s[v] = !s[v];
        saveSettings(); W.game.applySettings(); this.show('settings');
        break;
      }
      case 'layout': this.hideScreens(); W.input.startEdit(() => { W.input.show(W.mode === 'paused' ? false : W.mode === 'play'); this.show('settings'); }); break;
    }
  }

  backTarget() {
    if (this.screen === 'settings') return this.back || 'menu';
    if (this.screen === 'chars') return this.ctxPause ? 'pause' : 'menu';
    if (this.screen === 'mode') return 'menu';
    if (this.screen === 'spawn') return this.restarting ? 'pause' : 'mode';
    return 'menu';
  }

  goFullscreen() {
    const d = document.documentElement;
    try {
      if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch (e) { /* non pris en charge (iPhone) */ }
  }

  startGame(spawnId) {
    const s = settings();
    const preset = s.lastPreset === 'custom' ? { name: 'Personnalisé', ...s.custom, startChaos: 0 } : PRESETS[s.lastPreset];
    const sp = SPAWNS.find((x) => x.id === spawnId) || SPAWNS[0];
    this.hideScreens();
    this.restarting = false;
    W.game.startSession({ char: s.character, spawn: sp, density: preset.density, intensity: preset.intensity, destruction: preset.destruction, startChaos: preset.startChaos, presetName: preset.name });
  }

  // ====================== Écrans ======================
  scr_menu() {
    return `<div class="scr menu">
      <div class="m-left">
        <div class="title"><div class="t-k">五条 対 宿儺</div><div class="t-1">GOJO</div><div class="t-vs">CONTRE</div><div class="t-2">SUKUNA</div></div>
        <div class="col">
          <button class="pbtn primary big" data-a="play">Jouer</button>
          <button class="pbtn" data-a="chars">Personnages</button>
          <button class="pbtn" data-a="settings">Paramètres</button>
        </div>
      </div>
      <div class="m-right"><canvas id="hero" width="48" height="58"></canvas><div class="hero-name"></div></div>
    </div>`;
  }
  after_menu() { this.startPreview($('#hero'), settings().character, 'idle'); $('.hero-name').textContent = KITS[settings().character].name; }

  scr_chars() {
    const cur = settings().character;
    const card = (k) => {
      const kit = KITS[k];
      return `<div class="card ${cur === k ? 'sel' : ''}" data-a="pickchar" data-v="${k}">
        <canvas class="portrait" data-char="${k}" width="48" height="58"></canvas>
        <div class="c-name">${kit.name}<span class="kj">${kit.kanji}</span></div>
        <ul>${kit.powers.map((p) => `<li><b style="color:${p.color}">${p.kanji}</b> ${p.name}</li>`).join('')}</ul>
        ${k === 'gojo' ? '<div class="passive">Passif : Infini</div>' : '<div class="passive">Corps du Roi des fléaux</div>'}
      </div>`;
    };
    return `<div class="scr"><div class="panel wide"><div class="p-title">${this.ctxPause ? 'Changer de personnage' : 'Personnages'}</div>
      <div class="cards">${card('gojo')}${card('sukuna')}</div>
      <div class="row"><button class="pbtn" data-a="back">Retour</button></div></div></div>`;
  }
  after_chars() { for (const c of this.screens.querySelectorAll('.portrait')) drawFrame(c, c.dataset.char, 'idle', 0); }

  scr_mode() {
    const s = settings();
    const card = (k, p) => `<div class="card mode ${s.lastPreset === k ? 'sel' : ''}" data-a="preset" data-v="${k}"><div class="c-name">${p.name}</div><div class="desc">${p.desc}</div></div>`;
    const descs = { exploration: 'Peu de fléaux, intensité douce. Pour explorer la ville.', chaos: 'Combats fréquents, le chaos monte peu à peu.', chaosmax: 'Hordes denses, élites et événements spectaculaires.' };
    const c = s.custom;
    return `<div class="scr"><div class="panel wide"><div class="p-title">Mode de jeu</div>
      <div class="cards four">
        ${Object.entries(PRESETS).map(([k, p]) => card(k, { ...p, desc: descs[k] })).join('')}
        <div class="card mode ${s.lastPreset === 'custom' ? 'sel' : ''}" data-a="preset" data-v="custom"><div class="c-name">Personnalisé</div>
          <label>Densité <input type="range" min="0.2" max="2" step="0.1" value="${c.density}" data-cust="density"></label>
          <label>Intensité <input type="range" min="0.3" max="2" step="0.1" value="${c.intensity}" data-cust="intensity"></label>
          <label>Destruction <input type="range" min="0.3" max="2" step="0.1" value="${c.destruction}" data-cust="destruction"></label>
        </div>
      </div>
      <div class="row"><button class="pbtn" data-a="back">Retour</button><button class="pbtn primary" data-a="tospawn">Suivant</button></div></div></div>`;
  }
  after_mode() {
    for (const i of this.screens.querySelectorAll('[data-cust]')) {
      i.addEventListener('click', (e) => e.stopPropagation());
      i.addEventListener('input', () => { settings().custom[i.dataset.cust] = parseFloat(i.value); settings().lastPreset = 'custom'; saveSettings(); for (const c of this.screens.querySelectorAll('.card.mode')) c.classList.toggle('sel', c.dataset.v === 'custom'); });
    }
  }

  scr_spawn() {
    return `<div class="scr"><div class="panel wide"><div class="p-title">Point d'apparition</div>
      <div class="spawnwrap">
        <div class="spawnlist">${SPAWNS.map((s) => `<button class="pbtn spawn" data-a="spawn" data-v="${s.id}"><i style="background:${DISTRICTS[s.district].color}"></i>${s.name}<small>${DISTRICTS[s.district].name}</small></button>`).join('')}</div>
        <div class="spawnmap"><canvas id="spmap" width="192" height="96"></canvas>
          <div class="legend">${Object.values(DISTRICTS).map((d) => `<span><i style="background:${d.color}"></i>${d.name}</span>`).join('')}</div></div>
      </div>
      <div class="row"><button class="pbtn" data-a="back">Retour</button></div></div></div>`;
  }
  after_spawn() {
    const c = $('#spmap');
    if (!c || !W.map) return;
    const ctx = c.getContext('2d');
    this.renderMinimapBase();
    ctx.drawImage(this.mmBase, 0, 0);
    for (const s of SPAWNS) {
      const [x, y] = mmPos(s.x, s.y);
      ctx.fillStyle = '#1b1424'; ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  scr_settings() {
    const s = settings();
    const L = { auto: 'Auto', low: 'Basse', medium: 'Moyenne', high: 'Haute', reduced: 'Réduits', normal: 'Normaux', max: 'Maximum', few: 'Peu', many: 'Beaucoup' };
    const dl = { few: 'Peu', normal: 'Normal', many: 'Beaucoup' };
    const row = (lbl, key, val) => `<div class="srow"><span>${lbl}</span><button class="pbtn small" data-a="set" data-v="${key}">${val}</button></div>`;
    return `<div class="scr"><div class="panel wide"><div class="p-title">Paramètres</div>
      <div class="settings">
        ${row('Qualité', 'quality', L[s.quality])}
        ${row('Effets', 'effects', L[s.effects])}
        ${row('Ombres', 'shadows', s.shadows ? 'Oui' : 'Non')}
        ${row('Débris', 'debris', dl[s.debris])}
        ${row('Tremblements', 'shake', s.shake ? 'Oui' : 'Non')}
        ${row('Afficher les FPS', 'fps', s.fps ? 'Oui' : 'Non')}
        <div class="srow"><span>Musique</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-vol="music"></div>
        <div class="srow"><span>Effets sonores</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-vol="sfx"></div>
        <div class="srow"><span>Commandes tactiles</span><button class="pbtn small" data-a="layout">Modifier</button></div>
      </div>
      <div class="row"><button class="pbtn" data-a="back">Retour</button></div></div></div>`;
  }
  after_settings() {
    for (const i of this.screens.querySelectorAll('[data-vol]')) {
      i.addEventListener('input', () => { settings()[i.dataset.vol] = parseFloat(i.value); W.audio.applyVolumes(); });
      i.addEventListener('change', () => saveSettings());
    }
  }

  scr_pause() {
    return `<div class="scr dim"><div class="panel small"><div class="p-title">Pause</div>
      <div class="col">
        <button class="pbtn primary" data-a="resume">Reprendre</button>
        <button class="pbtn" data-a="pchar">Changer de personnage</button>
        <button class="pbtn" data-a="settings">Paramètres</button>
        <button class="pbtn" data-a="restart">Redémarrer</button>
        <button class="pbtn" data-a="quit">Quitter</button>
      </div></div></div>`;
  }

  // ====================== Aperçu animé du personnage ======================
  startPreview(canvas, key, anim) {
    this.stopPreview();
    let f = 0;
    drawFrame(canvas, key, anim, 0);
    this.prevTimer = setInterval(() => { f++; drawFrame(canvas, key, anim, f); }, 250);
  }
  stopPreview() { if (this.prevTimer) { clearInterval(this.prevTimer); this.prevTimer = null; } }

  // ====================== HUD ======================
  showHud(v) { $('#hud').classList.toggle('hidden', !v); }

  updateHud(dt) {
    const c = W.chaos;
    if (c) {
      const lv = c.level;
      if (this.lastLv !== lv) {
        $('#c-lv').textContent = lv;
        $('#chaos').className = lv >= 8 ? 'hot' : lv >= 5 ? 'warm' : '';
        this.lastLv = lv;
      }
      const seg = Math.floor(c.frac * 4);
      const key = lv * 10 + seg;
      if (this.lastSeg !== key) {
        const is = $('#c-bar').children;
        for (let i = 0; i < 10; i++) is[i].className = i < lv - 1 ? 'on' : i === lv - 1 ? 'p' + seg : '';
        this.lastSeg = key;
      }
    }
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 0.15; this.drawMinimap(); }
    if (settings().fps) {
      $('#fps').classList.remove('hidden');
      this.fpsAcc = (this.fpsAcc || 0) * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
      $('#fps').textContent = Math.round(W.scene.game.loop.actualFps) + ' FPS · ' + W.quality;
    } else $('#fps').classList.add('hidden');
  }

  renderMinimapBase() {
    const map = W.map, city = W.city;
    if (!map) return;
    const ctx = this.mmBase.getContext('2d');
    const img = ctx.createImageData(192, 96);
    const d = new Uint32Array(img.data.buffer);
    const col = (h) => { const n = parseInt(h.slice(1), 16); return (0xff << 24 | (n & 0xff) << 16 | (n & 0xff00) | (n >> 16)) >>> 0; };
    const dc = Object.fromEntries(Object.entries(DISTRICTS).map(([k, v]) => [k, col(v.color)]));
    const dark = (c, f) => (0xff << 24 | (((c >> 16 & 255) * f) << 16) | (((c >> 8 & 255) * f) << 8) | ((c & 255) * f)) >>> 0;
    const water = col('#3d7fc4'), road = col('#3b3d46'), rubble = col('#7a746c');
    const N = map.n;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const t = map.ground[i];
      let c;
      if (t === T.WATER || t === T.POND) c = water;
      else if (t === T.ROAD) c = road;
      else {
        const dist = CODES[map.district[i]];
        c = dc[dist];
        const b = city && city.cellB[i] >= 0 ? city.buildings[city.cellB[i]] : null;
        if (b) c = b.state >= 4 ? rubble : dark(c, 0.62);
      }
      const px = x - y + 95, py = (x + y) >> 1;
      if (px >= 0 && px < 191) { d[py * 192 + px] = c; d[py * 192 + px + 1] = c; }
    }
    ctx.putImageData(img, 0, 0);
  }

  drawMinimap() {
    if (!W.map) return;
    this.mmBaseT = (this.mmBaseT || 0) - 1;
    if (this.mmBaseT <= 0) { this.renderMinimapBase(); this.mmBaseT = 12; }
    const ctx = this.mm;
    ctx.drawImage(this.mmBase, 0, 0);
    const D = W.domain && W.domain.zone;
    if (D) {
      const [x, y] = mmPos(D.x, D.y);
      ctx.strokeStyle = D.type === 'void' ? '#cfe0ff' : '#ff3030';
      ctx.beginPath(); ctx.ellipse(x, y, D.r * 1.41, D.r * 0.71, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (W.enemies) for (const e of W.enemies.list) {
      if (e.dead) continue;
      const [x, y] = mmPos(e.x, e.y);
      ctx.fillStyle = e.elite ? (e.type === 'superieur' ? '#ff3060' : '#c040ff') : '#e83a3a';
      const s = e.elite ? 3 : 2;
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    }
    const P = W.player;
    if (P) {
      const [x, y] = mmPos(P.x, P.y);
      ctx.fillStyle = '#1b1424'; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
      ctx.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ffffff' : '#ffe14a';
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      const dn = DISTRICTS[districtAt(P.x, P.y)].name;
      if (this.lastD !== dn) { $('#mm-d').textContent = dn; this.lastD = dn; }
    }
  }

  banner(title, sub, big = false) {
    const b = $('#banner');
    b.querySelector('.b-t').textContent = title;
    b.querySelector('.b-s').textContent = sub || '';
    b.className = big ? 'big' : '';
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.add('hidden'), 2800);
  }

  domainTitle(type) {
    const d = $('#domainfx');
    d.className = type;
    d.querySelector('.d-k2').textContent = type === 'void' ? '無量空処' : '伏魔御廚子';
    d.querySelector('.d-n').textContent = type === 'void' ? 'EXTENSION DU TERRITOIRE · UNLIMITED VOID' : 'EXTENSION DU TERRITOIRE · MALEVOLENT SHRINE';
    void d.offsetWidth;
    d.classList.add('show');
    clearTimeout(this.domT);
    this.domT = setTimeout(() => d.classList.add('hidden'), 2600);
  }
}

const mmPos = (x, y) => [x - y + 96, (x + y) / 2];

// Dessine une image d'animation d'une planche dans un petit canvas (affiché en pixels nets par le CSS).
function drawFrame(canvas, key, anim, f) {
  const sh = ART.sheets[key];
  if (!sh) return;
  const a = sh.anims[anim] || sh.anims.idle;
  const idx = a.f[f % a.f.length];
  const ctx = canvas.getContext('2d');
  canvas.width = sh.fw; canvas.height = sh.fh;
  ctx.clearRect(0, 0, sh.fw, sh.fh);
  ctx.drawImage(sh.canvas, (idx % sh.cols) * sh.fw, Math.floor(idx / sh.cols) * sh.fh, sh.fw, sh.fh, 0, 0, sh.fw, sh.fh);
}
