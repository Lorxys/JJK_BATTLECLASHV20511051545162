// Commandes tactiles : joystick flottant, boutons d'action déplaçables / redimensionnables, clavier pour les tests.
import { settings, saveSettings } from '../settings.js';
import { worldDirFromScreen } from '../util.js';

// Positions par défaut en unités de hauteur d'écran (vh), depuis le coin bas-droit.
export const DEFAULT_LAYOUT = {
  attack: { r: 0.14, b: 0.08, s: 0.27 },
  dash: { r: 0.44, b: 0.05, s: 0.15 },
  dodge: { r: 0.44, b: 0.23, s: 0.13 },
  p0: { r: 0.38, b: 0.42, s: 0.15 },
  p1: { r: 0.21, b: 0.40, s: 0.15 },
  p2: { r: 0.04, b: 0.38, s: 0.15 },
  p3: { r: 0.04, b: 0.57, s: 0.17 },
};
const LABELS = { attack: '攻', dash: 'DASH', dodge: 'ESQ.' };

export class Controls {
  constructor(root) {
    this.root = root;
    this.mx = 0; this.my = 0; this.mag = 0;
    this.attackHeld = false;
    this.pressed = new Set();
    this.held = new Set(); // techniques maintenues (tir continu)
    this.aiming = {}; // visée en cours par glissement sur un bouton : act -> { id, x, y, dir }
    this.released = {}; // direction choisie au relâchement : act -> dir
    this.modes = {}; // act -> 'aim' (viser puis relâcher), 'hold' (tir continu), 'tap'
    this.keys = new Set();
    this.joy = null;
    this.editing = false;
    this.selected = null;
    this.btns = {};
    this.build();
    this.bindKeys();
  }

  layout() { return Object.assign({}, DEFAULT_LAYOUT, settings().layout || {}); }

  build() {
    const el = document.createElement('div');
    el.id = 'controls';
    el.innerHTML = `
      <div id="joyzone"></div>
      <div id="joybase" class="hidden"><div id="joyknob"></div></div>
      ${Object.keys(DEFAULT_LAYOUT).map((id) => `<div class="cbtn ${id.startsWith('p') ? 'power' : id}" data-act="${id}"><span class="lbl"></span><span class="name"></span><div class="cd"></div><span class="cdt"></span></div>`).join('')}
      <div id="editpanel" class="hidden">
        <div class="ep-title">DISPOSITION DES COMMANDES</div>
        <div class="ep-hint">Glisse un bouton pour le déplacer. Touche-le pour régler sa taille.</div>
        <label class="ep-size">Taille <input type="range" id="ep-size" min="0.08" max="0.36" step="0.01"></label>
        <div class="ep-row"><button class="pbtn small" data-ep="reset">Réinitialiser</button><button class="pbtn small primary" data-ep="done">Terminer</button></div>
      </div>`;
    this.root.appendChild(el);
    this.el = el;
    for (const b of el.querySelectorAll('.cbtn')) {
      this.btns[b.dataset.act] = { el: b, cd: b.querySelector('.cd'), cdt: b.querySelector('.cdt'), lbl: b.querySelector('.lbl'), name: b.querySelector('.name'), lastFrac: -1 };
      b.addEventListener('pointerdown', (e) => this.btnDown(e, b.dataset.act));
      b.addEventListener('pointermove', (e) => this.btnMove(e, b.dataset.act));
      b.addEventListener('pointerup', (e) => this.btnUp(e, b.dataset.act));
      b.addEventListener('pointercancel', (e) => this.btnUp(e, b.dataset.act));
    }
    for (const id of ['attack', 'dash', 'dodge']) this.btns[id].lbl.textContent = LABELS[id];
    const jz = el.querySelector('#joyzone');
    jz.addEventListener('pointerdown', (e) => this.joyDown(e));
    jz.addEventListener('pointermove', (e) => this.joyMove(e));
    jz.addEventListener('pointerup', (e) => this.joyUp(e));
    jz.addEventListener('pointercancel', (e) => this.joyUp(e));
    this.joyBase = el.querySelector('#joybase');
    this.joyKnob = el.querySelector('#joyknob');
    const size = el.querySelector('#ep-size');
    size.addEventListener('input', () => {
      if (!this.selected) return;
      const L = this.layout(); L[this.selected].s = parseFloat(size.value);
      settings().layout = L; this.applyLayout();
    });
    el.querySelector('#editpanel').addEventListener('click', (e) => {
      const a = e.target.dataset.ep;
      if (a === 'reset') { settings().layout = null; this.applyLayout(); }
      if (a === 'done') this.endEdit();
    });
    window.addEventListener('resize', () => this.applyLayout());
    this.applyLayout();
  }

  applyLayout() {
    const L = this.layout();
    const vh = window.innerHeight / 100;
    for (const [id, b] of Object.entries(this.btns)) {
      const l = L[id];
      const s = l.s * 100 * vh;
      Object.assign(b.el.style, { right: l.r * 100 * vh + 'px', bottom: l.b * 100 * vh + 'px', width: s + 'px', height: s + 'px', fontSize: Math.max(9, s * 0.3) + 'px' });
      b.el.classList.toggle('selected', this.editing && this.selected === id);
    }
  }

  setKit(kit) {
    kit.powers.forEach((p, i) => {
      const b = this.btns['p' + i];
      b.lbl.textContent = p.kanji.length > 2 ? p.kanji.slice(0, 2) : p.kanji;
      b.name.textContent = p.name;
      b.el.style.setProperty('--pc', p.color);
      b.el.classList.toggle('domainbtn', p.id === 'domain');
      this.modes['p' + i] = p.id === 'domain' ? 'tap' : p.hold ? 'hold' : 'aim';
    });
  }

  // Affichage des recharges : remplissage vertical (lisible et sans dégradé).
  setCooldowns(cd) {
    const set = (id, frac, left) => {
      const b = this.btns[id];
      const f = Math.round(frac * 40) / 40;
      if (f !== b.lastFrac) { b.cd.style.height = f * 100 + '%'; b.el.classList.toggle('ready', f <= 0); b.lastFrac = f; }
      const txt = left > 0.05 ? (left >= 10 ? Math.ceil(left) : left.toFixed(1)) : '';
      if (b.cdt.textContent !== String(txt)) b.cdt.textContent = txt;
    };
    set('dash', cd.dash, 0); set('dodge', cd.dodge, 0);
    cd.p.forEach((p, i) => set('p' + i, p.frac, p.left));
  }

  show(v) { this.el.classList.toggle('hidden', !v); if (!v) this.reset(); }
  reset() {
    this.mx = this.my = this.mag = 0; this.attackHeld = false; this.joy = null; this.joyBase.classList.add('hidden'); this.pressed.clear();
    this.held.clear(); this.aiming = {}; this.released = {};
    for (const b of Object.values(this.btns)) { b.el.classList.remove('down', 'aiming'); b.lbl.style.transform = ''; }
  }

  // --- Joystick ---
  joyDown(e) {
    if (this.editing || this.joy) return;
    e.preventDefault();
    e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
    this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY };
    const R = window.innerHeight * 0.13;
    Object.assign(this.joyBase.style, { left: e.clientX - R + 'px', top: e.clientY - R + 'px', width: R * 2 + 'px', height: R * 2 + 'px' });
    this.joyBase.classList.remove('hidden');
    this.joyMove(e);
  }
  joyMove(e) {
    if (!this.joy || e.pointerId !== this.joy.id) return;
    const R = window.innerHeight * 0.13;
    let dx = e.clientX - this.joy.x, dy = e.clientY - this.joy.y;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    this.joyKnob.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
    const m = Math.min(1, l / R);
    if (m < 0.12) { this.mag = 0; return; }
    const [wx, wy] = worldDirFromScreen(dx, dy);
    this.mx = wx; this.my = wy; this.mag = m;
  }
  joyUp(e) {
    if (!this.joy || e.pointerId !== this.joy.id) return;
    this.joy = null; this.mag = 0;
    this.joyKnob.style.transform = '';
    this.joyBase.classList.add('hidden');
  }

  // --- Boutons ---
  btnDown(e, act) {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
    if (this.editing) {
      const L = this.layout()[act];
      this.drag = { act, id: e.pointerId, x: e.clientX, y: e.clientY, r: L.r, b: L.b, moved: false };
      return;
    }
    this.btns[act].el.classList.add('down');
    const mode = this.modes[act];
    if (mode === 'aim' || mode === 'hold') {
      // glisser depuis le bouton choisit la direction de la technique
      this.aiming[act] = { id: e.pointerId, x: e.clientX, y: e.clientY, dir: null };
      if (mode === 'hold') this.held.add(act);
      return;
    }
    this.pressed.add(act);
    if (act === 'attack') this.attackHeld = true;
  }
  btnMove(e, act) {
    const am = this.aiming[act];
    if (!this.editing && am && am.id === e.pointerId) {
      const dx = e.clientX - am.x, dy = e.clientY - am.y, l = Math.hypot(dx, dy);
      const vh = window.innerHeight, b = this.btns[act];
      if (l > vh * 0.035) { am.dir = worldDirFromScreen(dx, dy); b.el.classList.add('aiming'); }
      else { am.dir = null; b.el.classList.remove('aiming'); }
      const m = Math.min(l, vh * 0.06) / (l || 1);
      b.lbl.style.transform = `translate(${Math.round(dx * m)}px, ${Math.round(dy * m)}px)`;
      return;
    }
    if (!this.editing || !this.drag || this.drag.id !== e.pointerId) return;
    const vh = window.innerHeight;
    const dx = (e.clientX - this.drag.x) / vh, dy = (e.clientY - this.drag.y) / vh;
    if (Math.abs(dx) + Math.abs(dy) > 0.01) this.drag.moved = true;
    const L = this.layout();
    const s = L[act].s;
    L[act].r = Math.max(0, Math.min(window.innerWidth / vh - s, this.drag.r - dx));
    L[act].b = Math.max(0, Math.min(1 - s, this.drag.b - dy));
    settings().layout = L;
    this.applyLayout();
  }
  btnUp(e, act) {
    if (this.editing) {
      if (this.drag && !this.drag.moved) { this.selected = act; this.el.querySelector('#ep-size').value = this.layout()[act].s; this.applyLayout(); }
      this.drag = null;
      return;
    }
    if (act === 'attack') this.attackHeld = false;
    const b = this.btns[act];
    b.el.classList.remove('down', 'aiming');
    const am = this.aiming[act];
    if (am && am.id === e.pointerId) {
      delete this.aiming[act];
      b.lbl.style.transform = '';
      this.held.delete(act);
      if (this.modes[act] === 'aim' && e.type !== 'pointercancel') { this.released[act] = am.dir; this.pressed.add(act); }
    }
  }

  startEdit(onDone) {
    this.editing = true; this.onDone = onDone; this.selected = 'attack';
    this.el.classList.add('editing');
    this.el.querySelector('#editpanel').classList.remove('hidden');
    this.el.querySelector('#ep-size').value = this.layout().attack.s;
    this.show(true);
    this.applyLayout();
  }
  endEdit() {
    this.editing = false;
    this.el.classList.remove('editing');
    this.el.querySelector('#editpanel').classList.add('hidden');
    saveSettings();
    this.applyLayout();
    this.onDone && this.onDone();
  }

  // --- Clavier (tests sur ordinateur) ---
  bindKeys() {
    const map = { KeyJ: 'attack', Space: 'attack', KeyK: 'dash', KeyL: 'dodge', ShiftLeft: 'dodge', KeyU: 'p0', KeyI: 'p1', KeyO: 'p2', KeyP: 'p3', Digit1: 'p0', Digit2: 'p1', Digit3: 'p2', Digit4: 'p3', Escape: 'pause' };
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = map[e.code];
      if (a) { this.pressed.add(a); if (a === 'attack') this.attackHeld = true; }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (map[e.code] === 'attack') this.attackHeld = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.attackHeld = false; });
  }

  // Instantané des entrées pour l'image en cours.
  frame() {
    let { mx, my, mag } = this;
    const k = this.keys;
    let sx = 0, sy = 0;
    if (k.has('KeyW') || k.has('KeyZ') || k.has('ArrowUp')) sy -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) sy += 1;
    if (k.has('KeyA') || k.has('KeyQ') || k.has('ArrowLeft')) sx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) sx += 1;
    if (sx || sy) { [mx, my] = worldDirFromScreen(sx, sy * 0.5 * 2); mag = 1; }
    const pressed = this.pressed;
    this.pressed = new Set();
    // directions de visée : glissement en cours ou choisie au relâchement
    const powerAim = Object.assign({}, this.released);
    let aiming = null;
    for (const [act, am] of Object.entries(this.aiming)) { powerAim[act] = am.dir; if (am.dir) aiming = { act, dir: am.dir }; }
    this.released = {};
    const held = new Set(this.held);
    for (const [code, act] of [['KeyU', 'p0'], ['Digit1', 'p0'], ['KeyI', 'p1'], ['Digit2', 'p1']]) if (k.has(code) && this.modes[act] === 'hold') held.add(act);
    return { mx, my, mag, attackHeld: this.attackHeld, pressed, held, powerAim, aiming };
  }
}
