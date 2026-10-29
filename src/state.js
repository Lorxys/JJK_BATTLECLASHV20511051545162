// Contexte global partagé entre les systèmes du jeu.
export const W = {
  scene: null,       // scène Phaser
  map: null,         // données de la ville (citygen)
  ground: null,      // blocs de sol pré-rendus
  city: null,        // bâtiments, objets, véhicules
  fx: null,          // particules, débris, anneaux
  player: null,
  enemies: null,
  chaos: null,
  domain: null,
  flow: null,
  audio: null,
  ui: null,
  input: null,
  session: null,     // { char, spawn, preset, density, intensity, destruction }
  mode: 'menu',      // 'menu' | 'play' | 'paused'
  time: 0,           // temps de simulation (s)
  hitstop: 0,        // gel bref à l'impact
  slowmo: 1,         // facteur de ralenti
  slowmoT: 0,
  quality: 'high',
};
