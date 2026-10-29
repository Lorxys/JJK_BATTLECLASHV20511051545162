// Audio synthétisé (Web Audio) : effets sonores et musique d'action procédurale.
// Si des fichiers sont déposés dans audio/ (music_menu.mp3, music_game.mp3), ils remplacent la musique synthétisée ;
// ceux de audio/sfx/ remplacent les bruitages du même nom (voir README).
import { settings } from './settings.js';
import { W } from './state.js';

// Seconde de départ de chaque musique fournie (la musique de combat commence à 50 s).
const MUSIC_START = { menu: 0, game: 50 };
// Bruitages remplaçables par un fichier audio/sfx/<nom>.mp3.
const SFX_FILES = ['domain_sukuna', 'domain_gojo', 'ambience', 'slash', 'slashSoft', 'cleave', 'claw', 'shrineOn', 'shrineEnd',
  'fireCharge', 'fireShot', 'bigBoom', 'explosion', 'punch', 'kick', 'heavy', 'whoosh', 'dash', 'hit', 'heavyHit'];

export class Audio {
  constructor() {
    this.ctx = null;
    this.last = {};
    this.intensity = 1;
    this.musicMode = null;
    this.files = {};
    this.el = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor(); this.comp.connect(this.master);
    this.sfx = c.createGain(); this.sfx.connect(this.comp);
    this.music = c.createGain(); this.music.connect(this.master);
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.applyVolumes();
    this.probeFiles();
    // iOS n'autorise la synthèse vocale qu'après un geste : on l'amorce ici avec une phrase muette
    if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); window.speechSynthesis.getVoices(); }
    if (this.musicMode) this.startMusic(this.musicMode, true);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = settings();
    this.sfx.gain.value = s.sfx * 0.9;
    this.music.gain.value = s.music * 0.35;
    if (this.el) this.el.volume = s.music * 0.8;
  }

  async probeFiles() {
    for (const name of ['music_menu.mp3', 'music_game.mp3']) {
      try { const r = await fetch('audio/' + name, { method: 'HEAD' }); this.files[name] = r.ok; } catch (e) { this.files[name] = false; }
    }
    if (this.musicMode) this.startMusic(this.musicMode, true);
    // bruitages fournis : audio/sfx/<nom>.mp3 remplace le son synthétisé du même nom
    this.bufs = {};
    await Promise.all(SFX_FILES.map(async (name) => {
      try {
        const r = await fetch('audio/sfx/' + name + '.mp3');
        if (r.ok) this.bufs[name] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch (e) { /* fichier absent : son synthétisé */ }
    }));
    if (this.musicMode === 'game') this.startAmbience();
  }
  has(name) { return !!(this.bufs && this.bufs[name]); }

  // Joue un fichier décodé ; renvoie la source (pour l'arrêter) ou null.
  playBuf(name, o = {}) {
    const b = this.bufs && this.bufs[name];
    if (!b || !this.ctx) return null;
    const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = !!o.loop;
    src.playbackRate.value = o.rate || 1;
    const g = this.ctx.createGain(); g.gain.value = o.gain ?? 1;
    src.connect(g); g.connect(o.bus || this.sfx);
    src.start();
    return src;
  }

  // Ambiance de combat en boucle (audio/sfx/ambience.mp3, sinon ville de nuit synthétisée), coupée pendant les cinématiques.
  startAmbience() {
    if (!this.ctx) return;
    if (this.has('ambience')) { this.synthAmbience(false); if (!this.amb) this.amb = this.playBuf('ambience', { loop: true, gain: 0.5 }); return; }
    this.synthAmbience(true);
  }
  stopAmbience() {
    if (this.amb) { try { this.amb.stop(); } catch (e) { /* déjà arrêtée */ } this.amb = null; }
    this.synthAmbience(false);
  }

  // Vent dans les rues, bourdonnement lointain, sirènes, grondements et crépitement des incendies.
  synthAmbience(on) {
    const c = this.ctx;
    if (!this.ambBus) {
      if (!on) return;
      this.ambBus = c.createGain(); this.ambBus.gain.value = 0; this.ambBus.connect(this.sfx);
      const wind = c.createBufferSource(); wind.buffer = this.noiseBuf; wind.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.7;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.09;
      const lfoG = c.createGain(); lfoG.gain.value = 220; lfo.connect(lfoG); lfoG.connect(lp.frequency);
      const wg = c.createGain(); wg.gain.value = 0.16;
      wind.connect(lp); lp.connect(wg); wg.connect(this.ambBus);
      const hum = c.createOscillator(); hum.type = 'sine'; hum.frequency.value = 52;
      const hg = c.createGain(); hg.gain.value = 0.035; hum.connect(hg); hg.connect(this.ambBus);
      wind.start(); lfo.start(); hum.start();
      // événements ponctuels
      this.ambIv = setInterval(() => {
        if (!this.ambOn || c.state !== 'running') return;
        const t = c.currentTime + 0.02;
        this.out = this.ambBus;
        const fires = W.city ? W.city.fires.length + W.city.infernos.length * 12 : 0;
        for (let i = 0, n = Math.min(10, Math.round(fires * 0.4 * Math.random())); i < n; i++) {
          this.noise(t + Math.random() * 0.25, 0.012 + Math.random() * 0.03, 'highpass', 1800 + Math.random() * 3000, 1200, 0.08 + Math.random() * 0.12);
        }
        if (fires && Math.random() < 0.3) this.noise(t, 0.5, 'lowpass', 500, 200, 0.12, 0.8); // souffle du brasier
        if (Math.random() < 0.012) { // sirène lointaine
          for (let k = 0; k < 4; k++) this.tone(t + k * 1.1, 1.1, 'triangle', k % 2 ? 640 : 820, k % 2 ? 820 : 640, 0.018, 0.3);
        }
        if (Math.random() < 0.02) this.noise(t, 1.6, 'lowpass', 160, 60, 0.3, 1); // grondement lointain
        this.out = null;
      }, 250);
    }
    this.ambOn = on;
    this.ambBus.gain.setTargetAtTime(on ? 1 : 0, c.currentTime, 0.3);
  }

  // --- voix du territoire : fichier fourni, sinon synthèse vocale japonaise de l'appareil ---
  jaVoice() {
    const S = window.speechSynthesis;
    if (!S) return null;
    const vs = S.getVoices();
    return vs.find((v) => /^ja/i.test(v.lang) && /male|otoya|ichiro|keita|daichi/i.test(v.name)) || vs.find((v) => /^ja/i.test(v.lang)) || null;
  }
  say(text, rate = 0.8, pitch = 0.4) {
    const v = this.jaVoice();
    if (!v) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v; u.lang = v.lang; u.rate = rate; u.pitch = pitch; u.volume = Math.min(1, settings().sfx * 1.2);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  }
  // Écran noir : « Ryōiki tenkai » + montée sonore propre à chaque territoire.
  domainIntro(type) {
    const file = type === 'void' ? 'domain_gojo' : 'domain_sukuna';
    this.domainFile = this.has(file);
    if (this.domainFile) { this.playBuf(file); return; }
    this.play(type === 'void' ? 'voidIntro' : 'shrineIntro');
    setTimeout(() => this.say('りょういき、てんかい', 0.75, type === 'void' ? 0.8 : 0.2), 250);
  }
  // Début du plan : nom du territoire (le fichier fourni contient déjà toute la voix).
  domainName(type) {
    this.play(type === 'void' ? 'voidReveal' : 'shrineReveal');
    if (!this.domainFile) this.say(type === 'void' ? 'むりょうくうしょ' : 'ふくまみずし', 0.7, type === 'void' ? 0.8 : 0.2);
  }

  // Cinématique : coupe la musique et l'ambiance, puis les rétablit.
  duck(on) {
    if (!this.ctx) return;
    const s = settings();
    this.music.gain.value = on ? 0 : s.music * 0.35;
    if (this.el) this.el.volume = on ? 0 : s.music * 0.8;
    this.sfx.gain.value = s.sfx * 0.9;
    if (on) this.stopAmbience(); else if (this.musicMode === 'game') this.startAmbience();
  }

  // --- briques ---
  noise(t, dur, type, f0, f1, gain, q = 1) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out || this.sfx);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  tone(t, dur, type, f0, f1, gain, attack = 0.005) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.045) return;
    this.last[name] = now;
    if (this.has(name)) { this.playBuf(name, { rate: 0.94 + Math.random() * 0.12 }); return; }
    const t = now + 0.005;
    const R = RECIPES[name];
    if (R) R(this, t);
  }

  // --- musique ---
  startMusic(mode, force = false) {
    if (this.musicMode === mode && !force && (this.seq || this.el)) return;
    this.stopMusic();
    this.musicMode = mode;
    if (!this.ctx) return;
    if (mode === 'game') this.startAmbience(); else this.stopAmbience();
    const file = mode === 'menu' ? 'music_menu.mp3' : 'music_game.mp3';
    if (this.files[file]) {
      // la musique de combat démarre (et reboucle) à MUSIC_START.game secondes
      const start = MUSIC_START[mode] || 0;
      const el = this.el = new window.Audio('audio/' + file);
      el.volume = settings().music * 0.8;
      el.loop = !start;
      el.addEventListener('loadedmetadata', () => { if (start < el.duration) el.currentTime = start; }, { once: true });
      el.addEventListener('ended', () => { el.currentTime = start; el.play().catch(() => {}); });
      el.play().catch(() => {});
      return;
    }
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this.seq = setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    if (this.seq) { clearInterval(this.seq); this.seq = null; }
    if (this.el) { this.el.pause(); this.el = null; }
  }
  setIntensity(lv) { this.intensity = lv; }

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const menu = this.musicMode === 'menu';
    const spb = 60 / (menu ? 96 : 132) / 4; // durée d'une double croche
    this.out = this.music;
    while (this.nextT < c.currentTime + 0.12) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % 4, t = this.nextT;
      const lv = menu ? 0 : this.intensity;
      const roots = [110, 87.31, 98, 82.41];
      const root = roots[bar];
      if (!menu) {
        const kick = lv >= 6 ? [0, 3, 6, 8, 10, 12, 14] : [0, 4, 8, 12];
        if (kick.includes(s)) this.tone(t, 0.18, 'sine', 140, 40, 0.9);
        if (s === 4 || s === 12) this.noise(t, 0.14, 'bandpass', 1800, 900, 0.5, 0.8);
        if ((lv >= 3 ? s % 1 === 0 : s % 2 === 0) && s % 4 !== 0) this.noise(t, 0.03, 'highpass', 8000, 8000, 0.12);
        if (s % 2 === 0) this.tone(t, spb * 1.8, 'sawtooth', root * (s % 8 === 6 ? 2 : 1), root * (s % 8 === 6 ? 2 : 1), 0.16);
        if (lv >= 4 && s % 2 === 1) {
          const scale = [1, 1.2, 1.335, 1.5, 1.8, 2];
          const n = scale[(s * 7 + bar * 3) % scale.length];
          this.tone(t, spb * 0.9, 'square', root * 4 * n, root * 4 * n, 0.045);
        }
        if (lv >= 8 && s === 0) this.tone(t, spb * 16, 'sawtooth', root * 2, root * 2, 0.05, 0.3);
      } else {
        if (s === 0) { this.tone(t, spb * 16, 'triangle', root, root, 0.18, 0.4); this.tone(t, spb * 16, 'sine', root * 1.5, root * 1.5, 0.08, 0.6); }
        if (s % 4 === 2) { const n = [2, 2.4, 3, 2.67][(s / 4 | 0)]; this.tone(t, spb * 3, 'square', root * n * 2, root * n * 2, 0.03); }
        if (s === 8) this.noise(t, 0.05, 'highpass', 6000, 6000, 0.05);
      }
      this.nextT += spb;
      this.step++;
    }
    this.out = null;
  }
}

const RECIPES = {
  hit: (a, t) => { a.noise(t, 0.08, 'bandpass', 1400, 600, 0.5, 1.2); a.tone(t, 0.09, 'sine', 190, 60, 0.6); },
  heavyHit: (a, t) => { a.noise(t, 0.22, 'lowpass', 1200, 200, 0.9); a.tone(t, 0.25, 'sine', 130, 35, 0.9); },
  punch: (a, t) => { a.noise(t, 0.06, 'bandpass', 1000, 500, 0.25); },
  kick: (a, t) => { a.noise(t, 0.07, 'bandpass', 800, 400, 0.25); },
  heavy: (a, t) => { a.noise(t, 0.15, 'bandpass', 600, 200, 0.4); },
  whoosh: (a, t) => { a.noise(t, 0.16, 'bandpass', 500, 2400, 0.25, 1.5); },
  claw: (a, t) => { a.noise(t, 0.09, 'highpass', 6000, 1800, 0.32); a.tone(t, 0.12, 'sine', 2600, 2500, 0.03); },
  blink: (a, t) => { a.tone(t, 0.12, 'sine', 1200, 2600, 0.25); a.noise(t, 0.08, 'highpass', 5000, 3000, 0.12); },
  dash: (a, t) => { a.noise(t, 0.22, 'lowpass', 700, 150, 0.6); a.tone(t, 0.2, 'sine', 100, 40, 0.5); },
  blueCharge: (a, t) => { a.tone(t, 0.35, 'sine', 200, 650, 0.35); a.tone(t, 0.35, 'triangle', 300, 950, 0.15); },
  blue: (a, t) => { a.tone(t, 1.9, 'sine', 95, 55, 0.5, 0.05); a.noise(t, 1.9, 'lowpass', 500, 150, 0.3, 2); a.tone(t, 1.9, 'triangle', 190, 110, 0.12, 0.1); },
  implode: (a, t) => { a.tone(t, 0.4, 'sine', 320, 40, 0.8); a.noise(t, 0.35, 'lowpass', 2000, 200, 0.6); },
  red: (a, t) => { a.noise(t, 0.55, 'lowpass', 2200, 150, 1.0); a.tone(t, 0.4, 'sawtooth', 170, 30, 0.45); a.tone(t, 0.08, 'square', 900, 300, 0.2); },
  purpleCharge: (a, t) => { a.tone(t, 1.3, 'sawtooth', 90, 700, 0.18, 0.2); a.tone(t, 1.3, 'sine', 140, 1300, 0.25, 0.2); a.noise(t, 1.3, 'bandpass', 300, 3000, 0.15, 3); },
  purple: (a, t) => { a.noise(t, 1.6, 'lowpass', 2500, 100, 1.0); a.tone(t, 1.4, 'sine', 65, 22, 1.0); a.tone(t, 0.6, 'sawtooth', 400, 60, 0.3); },
  bigBoom: (a, t) => { a.noise(t, 1.7, 'lowpass', 1100, 60, 1.0); a.tone(t, 1.4, 'sine', 75, 20, 1.0); },
  explosion: (a, t) => { a.noise(t, 0.85, 'lowpass', 1400, 80, 0.9); a.tone(t, 0.5, 'sine', 110, 30, 0.8); },
  // taillades : « shing » métallique (souffle aigu qui descend + résonance de lame inharmonique)
  slash: (a, t) => {
    for (let i = 0; i < 3; i++) a.noise(t + i * 0.035, 0.08, 'highpass', 9000, 2600, 0.38);
    a.tone(t, 0.32, 'sine', 3150, 3050, 0.07); a.tone(t, 0.26, 'sine', 4730, 4600, 0.05); a.tone(t, 0.07, 'sawtooth', 1800, 300, 0.1);
  },
  slashSoft: (a, t) => { const f = 5000 + Math.random() * 4000; a.noise(t, 0.06, 'highpass', f, f * 0.4, 0.17); if (Math.random() < 0.4) a.tone(t, 0.16, 'sine', f * 0.5, f * 0.48, 0.03); },
  cleave: (a, t) => {
    a.noise(t, 0.12, 'highpass', 10000, 3000, 0.5); a.noise(t + 0.02, 0.34, 'bandpass', 5200, 500, 0.85, 1.4);
    a.tone(t, 0.5, 'sine', 2100, 2050, 0.09); a.tone(t, 0.45, 'sine', 3270, 3200, 0.06); a.tone(t, 0.3, 'sine', 120, 40, 0.6);
  },
  fireCharge: (a, t) => { a.noise(t, 0.75, 'bandpass', 500, 2200, 0.4, 1.2); a.tone(t, 0.75, 'sawtooth', 80, 160, 0.15, 0.3); },
  fireShot: (a, t) => { a.noise(t, 0.45, 'lowpass', 3500, 400, 0.7); a.tone(t, 0.3, 'sawtooth', 420, 90, 0.3); },
  domain: (a, t) => { a.tone(t, 3, 'sine', 55, 50, 0.7, 0.3); a.tone(t, 3, 'triangle', 110, 100, 0.25, 0.5); a.noise(t, 2.6, 'lowpass', 320, 120, 0.35, 2); },
  // écran noir du Shrine : battements de cœur, bourdon grave, souffle qui monte
  shrineIntro: (a, t) => {
    for (const d of [0, 0.32, 0.9, 1.22]) a.tone(t + d, 0.22, 'sine', 70, 38, 0.9);
    a.tone(t, 1.9, 'sawtooth', 41, 41, 0.12, 0.6); a.tone(t, 1.9, 'sawtooth', 43.5, 43.5, 0.12, 0.6);
    a.noise(t + 0.6, 1.2, 'bandpass', 200, 1800, 0.35, 1.2);
  },
  // apparition du sanctuaire : impact + gong grave inharmonique
  shrineReveal: (a, t) => {
    a.noise(t, 0.6, 'lowpass', 1800, 80, 1.0); a.tone(t, 0.5, 'sine', 90, 30, 1.0);
    for (const [f, g] of [[98, 0.3], [151, 0.2], [233, 0.14], [367, 0.08]]) a.tone(t, 3.2, 'sine', f, f * 0.99, g, 0.01);
  },
  // écran noir de Gojo : cristaux aigus qui s'empilent et souffle aspiré
  voidIntro: (a, t) => {
    [1568, 2093, 2637, 3136, 4186].forEach((f, i) => a.tone(t + i * 0.22, 1.4, 'sine', f, f, 0.06, 0.05));
    a.tone(t, 1.9, 'sine', 55, 48, 0.4, 0.8); a.noise(t + 0.4, 1.4, 'highpass', 400, 6000, 0.22, 0.8);
  },
  // ouverture du vide infini : choc profond + accord de verre
  voidReveal: (a, t) => {
    a.tone(t, 1.2, 'sine', 70, 28, 1.0, 0.01); a.noise(t, 0.9, 'lowpass', 3000, 100, 0.6);
    for (const f of [523, 784, 1047, 1568, 2093]) a.tone(t + 0.05, 3, 'triangle', f, f, 0.07, 0.02);
  },
  voidPulse: (a, t) => { a.tone(t, 0.5, 'sine', 1760, 1700, 0.06); a.tone(t, 0.4, 'sine', 110, 60, 0.3); },
  voidOn: (a, t) => { for (const [i, f] of [880, 1320, 1760, 2640].entries()) a.tone(t + i * 0.08, 1.6, 'sine', f, f, 0.18); },
  shrineOn: (a, t) => { a.tone(t, 1.6, 'sawtooth', 55, 55, 0.25, 0.1); a.tone(t, 1.6, 'sawtooth', 58, 58, 0.25, 0.1); a.noise(t, 1, 'lowpass', 600, 100, 0.5); },
  voidEnd: (a, t) => { a.tone(t, 0.6, 'sine', 120, 900, 0.4); },
  shrineEnd: (a, t) => { a.tone(t, 0.6, 'sawtooth', 100, 500, 0.3); },
  collapse: (a, t) => { a.noise(t, 2.2, 'lowpass', 500, 60, 1.0); a.tone(t, 1.6, 'sine', 55, 28, 0.8, 0.05); },
  crumble: (a, t) => { a.noise(t, 0.8, 'lowpass', 800, 120, 0.7); },
  glass: (a, t) => { for (let i = 0; i < 4; i++) a.tone(t + i * 0.025, 0.12, 'sine', 3000 + Math.random() * 2500, 2500, 0.06); a.noise(t, 0.1, 'highpass', 6000, 4000, 0.15); },
  metal: (a, t) => { a.tone(t, 0.14, 'square', 320, 140, 0.15); a.noise(t, 0.1, 'bandpass', 2200, 900, 0.25, 3); },
  impact: (a, t) => { a.noise(t, 0.16, 'lowpass', 800, 120, 0.7); a.tone(t, 0.15, 'sine', 100, 40, 0.6); },
  infinity: (a, t) => { a.tone(t, 0.15, 'sine', 1600, 1900, 0.1); },
  hurt: (a, t) => { a.tone(t, 0.12, 'square', 230, 110, 0.18); },
  dissolve: (a, t) => { a.noise(t, 0.4, 'bandpass', 1600, 300, 0.3, 2); a.tone(t, 0.3, 'triangle', 420, 90, 0.2); },
  eliteDie: (a, t) => { a.noise(t, 0.9, 'bandpass', 900, 120, 0.6, 2); a.tone(t, 0.8, 'sawtooth', 160, 40, 0.4); },
  eliteSpawn: (a, t) => { a.tone(t, 0.8, 'sawtooth', 85, 55, 0.35, 0.1); a.noise(t, 0.8, 'bandpass', 300, 150, 0.4, 2); },
  roar: (a, t) => { a.tone(t, 0.7, 'sawtooth', 110, 60, 0.4, 0.05); a.noise(t, 0.7, 'bandpass', 400, 200, 0.5, 1.5); },
  slam: (a, t) => { a.noise(t, 0.5, 'lowpass', 600, 80, 0.9); a.tone(t, 0.5, 'sine', 65, 25, 0.9); },
  curseShot: (a, t) => { a.tone(t, 0.15, 'triangle', 520, 240, 0.15); },
  alarm: (a, t) => { a.tone(t, 0.14, 'square', 440, 440, 0.12); a.tone(t + 0.18, 0.14, 'square', 660, 660, 0.12); a.tone(t + 0.36, 0.2, 'square', 440, 440, 0.12); },
  ui: (a, t) => { a.tone(t, 0.05, 'square', 880, 880, 0.08); },
};
