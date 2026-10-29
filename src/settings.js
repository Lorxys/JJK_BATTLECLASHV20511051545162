// Paramètres et disposition des commandes, conservés entre les sessions (localStorage).
const KEY = 'gojo-sukuna-settings-v1';

export const DEFAULTS = {
  hd: true,             // rendu HD lisse (true) ou pixel art brut (false)
  quality: 'auto',      // auto | low | medium | high
  effects: 'normal',    // reduced | normal | max
  shadows: true,
  debris: 'normal',     // few | normal | many
  shake: true,
  music: 0.6,
  sfx: 0.8,
  fps: false,
  character: 'gojo',
  lastPreset: 'chaos',
  custom: { density: 1, intensity: 1, destruction: 1 },
  layout: null,         // { id: { x, y, s } } en fractions de l'écran
};

let data = null;

export function loadSettings() {
  data = JSON.parse(JSON.stringify(DEFAULTS));
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(data, JSON.parse(raw));
  } catch (e) { /* stockage indisponible : on garde les valeurs par défaut */ }
  return data;
}

export function settings() {
  return data || loadSettings();
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignoré */ }
}
