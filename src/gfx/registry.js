// Enregistre les canvas générés comme textures Phaser et mémorise leurs points d'ancrage.
// En rendu HD, chaque canvas est agrandi x2 (Scale2x) mais la texture garde sa taille logique :
// positions, ancrages, découpes et images de planche restent exprimés dans la taille d'origine.
import { makePropArt } from './propArt.js';
import { buildSheet, SHEET_KEYS } from './puppet.js';
import { drawBuilding, VARIANTS } from './buildingArt.js';
import { scale2x } from './pixel.js';
import { settings } from '../settings.js';

export const ART = { anchors: {}, sheets: {} };
let scene = null;

export function registerArt(sc) {
  scene = sc;
  const props = makePropArt();
  for (const [key, a] of Object.entries(props)) add(key, a.canvas, a.ox, a.oy);
  for (const key of SHEET_KEYS) {
    const sh = buildSheet(key);
    const tex = addTex('sheet_' + key, sh.canvas);
    for (let i = 0; i < sh.count; i++) tex.add(i, 0, (i % sh.cols) * sh.fw, Math.floor(i / sh.cols) * sh.fh, sh.fw, sh.fh);
    ART.sheets[key] = sh;
  }
}

// Ajoute une texture ; en HD la source est 2x plus définie que sa taille logique.
// hd = false : texture lumineuse floue par nature (fenêtres), gardée telle quelle mais filtrée en douceur.
function addTex(key, canvas, hd = true) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  if (!settings().hd || !hd) return scene.textures.addCanvas(key, canvas);
  const w = canvas.width, h = canvas.height;
  const tex = scene.textures.addCanvas(key, scale2x(canvas));
  const src = tex.source[0];
  src.width = w; src.height = h; // la texture GPU reste en 2x, les UV sont recalculées en taille logique
  tex.frames.__BASE.setSize(w, h, 0, 0);
  return tex;
}

function add(key, canvas, ox, oy, hd = true) {
  addTex(key, canvas, hd);
  ART.anchors[key] = { ox, oy, w: canvas.width, h: canvas.height };
}

// Origine Phaser (0..1) correspondant au point au sol de la texture.
export function originOf(key) {
  const a = ART.anchors[key];
  return a ? [a.ox / a.w, a.oy / a.h] : [0.5, 1];
}

// Texture d'un bâtiment dans un état donné, générée à la demande puis mise en cache.
export function buildingTex(variant, state) {
  const key = `b_${variant}_${state}`;
  if (!ART.anchors[key]) {
    const b = drawBuilding(variant, state);
    add(key, b.canvas, b.ox, b.oy);
    if (b.glow) add(key + '_glow', b.glow, b.ox, b.oy, false);
  }
  return key;
}

// Pré-génère peu à peu les états de destruction (une texture par appel) pour éviter les saccades au premier impact.
let warmQueue = null;
export function warmupStep() {
  if (!warmQueue) {
    warmQueue = [];
    for (const state of [1, 2, 3, 4]) for (const v of Object.keys(VARIANTS)) warmQueue.push([v, state]);
  }
  const job = warmQueue.shift();
  if (job) buildingTex(job[0], job[1]);
}
