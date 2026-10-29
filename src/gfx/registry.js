// Enregistre les canvas générés comme textures Phaser et mémorise leurs points d'ancrage.
import { makePropArt } from './propArt.js';
import { buildSheet, SHEET_KEYS } from './puppet.js';
import { drawBuilding, VARIANTS } from './buildingArt.js';

export const ART = { anchors: {}, sheets: {} };
let scene = null;

export function registerArt(sc) {
  scene = sc;
  const props = makePropArt();
  for (const [key, a] of Object.entries(props)) add(key, a.canvas, a.ox, a.oy);
  for (const key of SHEET_KEYS) {
    const sh = buildSheet(key);
    const tex = scene.textures.addCanvas('sheet_' + key, sh.canvas);
    for (let i = 0; i < sh.count; i++) tex.add(i, 0, (i % sh.cols) * sh.fw, Math.floor(i / sh.cols) * sh.fh, sh.fw, sh.fh);
    ART.sheets[key] = sh;
  }
}

function add(key, canvas, ox, oy) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
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
