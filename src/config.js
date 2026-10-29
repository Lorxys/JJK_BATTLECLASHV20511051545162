// Constantes de conception. Les valeurs de gameplay sont regroupées ici pour être ajustées après tests.
export const MAP_N = 96;          // carte de 96 x 96 cases
export const CHUNK = 16;          // taille d'un bloc de sol pré-rendu
export const ROADS = [6, 18, 30, 42, 54, 66, 78, 90]; // routes (2 cases de large) dans les deux axes
export const BASE_H = 360;        // hauteur interne visée (pixels)

// Quartiers : grille 7x7 de pâtés de maisons dessinée à la main.
// R = Résidentiel, I = Industriel, C = Centre-ville, K = Commercial, P = Parc
export const DISTRICT_GRID = [
  'RRRIIII',
  'RRRIIII',
  'RRCCCII',
  'KKCCCII',
  'KKCCCPP',
  'KKKPPPP',
  'KKKPPPP',
];
export const DISTRICTS = {
  C: { name: 'Centre-ville', color: '#8fa3c7' },
  R: { name: 'Résidentiel', color: '#d9b77e' },
  I: { name: 'Industriel', color: '#a39a8c' },
  K: { name: 'Commercial', color: '#e08aa8' },
  P: { name: 'Parc et loisirs', color: '#7fc46a' },
};

// Points d'apparition (coordonnées en cases, sur des zones praticables).
export const SPAWNS = [
  { id: 'place', name: 'Place centrale', district: 'C', x: 48.5, y: 48.5 },
  { id: 'sanctuaire', name: 'Sanctuaire du quartier', district: 'R', x: 21.5, y: 31.5 },
  { id: 'docks', name: 'Docks industriels', district: 'I', x: 74.5, y: 19.5 },
  { id: 'galerie', name: 'Galerie marchande', district: 'K', x: 20.5, y: 55.5 },
  { id: 'fontaine', name: 'Fontaine du parc', district: 'P', x: 68.5, y: 74.5 },
];

export const PRESETS = {
  exploration: { name: 'Exploration', density: 0.45, intensity: 0.5, destruction: 1.0, startChaos: 0 },
  chaos: { name: 'Chaos', density: 1.0, intensity: 1.0, destruction: 1.0, startChaos: 8 },
  chaosmax: { name: 'Chaos Max', density: 1.7, intensity: 1.8, destruction: 1.3, startChaos: 32 },
};

// Expansions du territoire (fourchettes du cahier des charges : 20-30 s / 60-90 s).
export const DOMAIN = {
  duration: 25,
  voidRadius: 18,       // 1,5x la taille de base (12)
  shrineRadius: 36,     // 3x la taille de base (12)
  black: 1.8,           // écran noir « 領域展開 » au lancement d'un territoire
  voidCinematic: 5.0,   // Unlimited Void : durée totale (écran noir + plan sur Gojo)
  shrineCinematic: 5.4, // Malevolent Shrine : durée totale (écran noir + plan sur Sukuna)
  voidCooldown: 75,
  shrineCooldown: 80,
  voidEliteStun: 6.5,   // 5-8 s
  shrineEliteStun: 2.5, // 2-3 s
};

// Kits des personnages : temps de recharge par pouvoir (aucune jauge commune).
export const KITS = {
  gojo: {
    name: 'Gojo Satoru', kanji: '五条悟',
    speed: 4.6,
    powers: [
      { id: 'blue', name: 'Bleu', kanji: '蒼', cd: 5, color: '#3d8bff' },
      { id: 'red', name: 'Rouge', kanji: '赫', cd: 2.5, color: '#ff3b3b' },
      { id: 'purple', name: 'Violet', kanji: '茈', cd: 22, color: '#a24bff' },
      { id: 'domain', name: 'Unlimited Void', kanji: '無量空処', cd: DOMAIN.voidCooldown, color: '#6b8cff' },
    ],
    dashCd: 1.0, dodgeCd: 0.7,
  },
  sukuna: {
    name: 'Ryomen Sukuna', kanji: '両面宿儺',
    speed: 4.8,
    powers: [
      { id: 'dismantle', name: 'Démantèlement', kanji: '解', cd: 0, color: '#ff6a6a', hold: true },
      { id: 'cleave', name: 'Clivage', kanji: '捌', cd: 0, color: '#ffd0d0', hold: true },
      { id: 'fuga', name: 'Fuga', kanji: '竈', cd: 16, color: '#ff8a1e' },
      { id: 'domain', name: 'Malevolent Shrine', kanji: '伏魔御廚子', cd: DOMAIN.shrineCooldown, color: '#c4141e' },
    ],
    dashCd: 1.2, dodgeCd: 0.7,
  },
};

// Qualité graphique : limites d'objets actifs simultanés.
export const QUALITY = {
  low: { particles: 140, debris: 40, enemies: 26, shadows: false },
  medium: { particles: 280, debris: 80, enemies: 40, shadows: true },
  high: { particles: 480, debris: 140, enemies: 56, shadows: true },
};

// Multiplicateur des dégâts de Gojo sur les fléaux (coups, Bleu, Rouge, Violet, Unlimited Void).
export const GOJO_DMG = 5;
