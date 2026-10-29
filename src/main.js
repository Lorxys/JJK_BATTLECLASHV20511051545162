// Point d'entrée : taille interne adaptée à l'écran (agrandissement entier, pixels nets), Phaser, UI, audio.
import { W } from './state.js';
import { loadSettings } from './settings.js';
import { WorldScene } from './scene.js';
import { UI } from './ui/ui.js';
import { Controls } from './ui/controls.js';
import { Audio } from './audio.js';

// Hauteur interne proche de 360 px, choisie pour un facteur d'agrandissement entier en pixels physiques.
function gameSize() {
  const dpr = window.devicePixelRatio || 1;
  const dh = window.innerHeight * dpr, dw = window.innerWidth * dpr;
  const k = Math.max(1, Math.round(dh / 360));
  const h = Math.max(240, Math.min(440, Math.round(dh / k)));
  const w = Math.max(320, Math.min(960, Math.round(dw / k)));
  return [w, h];
}

function boot() {
  loadSettings();
  const ui = document.getElementById('ui');
  W.audio = new Audio();
  W.ui = new UI(ui);
  W.input = new Controls(ui);
  W.input.show(false);

  const [w, h] = gameSize();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: w, height: h,
    backgroundColor: '#0b1430',
    pixelArt: true, roundPixels: true, antialias: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    audio: { noAudio: true },
    banner: false,
    fps: { target: 60, smoothStep: true },
    render: { powerPreference: 'high-performance', batchSize: 4096 },
    scene: [WorldScene],
  });
  W.phaser = game;
  const qs = new URLSearchParams(location.search);
  if (qs.has('ui')) game.events.once('world-ready', () => W.ui.show(qs.get('ui')));
  if (qs.has('test')) game.events.once('world-ready', () => import('./devtest.js').then((m) => m.runTest(qs)));

  let rt = null;
  const onResize = () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const [nw, nh] = gameSize();
      if (nw !== game.scale.width || nh !== game.scale.height) game.scale.setGameSize(nw, nh);
      game.scale.refresh();
    }, 120);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(document.getElementById('game'));
  game.events.once('world-ready', onResize);

  // L'audio ne démarre qu'après un geste de l'utilisateur.
  const unlock = () => W.audio.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchend', unlock, { passive: true });
  window.addEventListener('click', unlock);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && W.mode === 'play') W.game.pause();
  });
  // Empêche le zoom et le défilement par gestes.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.target.type !== 'range') e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

window.addEventListener('error', (e) => {
  const d = document.getElementById('errlog');
  if (d) { d.textContent += (e.message || e) + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno + '\n'; d.classList.remove('hidden'); }
});
boot();
