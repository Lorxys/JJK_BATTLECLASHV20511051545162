// Génération de la ville : hybride entre lieux placés à la main et pâtés modulaires.
import { MAP_N, ROADS, DISTRICT_GRID } from '../config.js';
import { makeRng, pick } from '../util.js';

export const T = {
  WATER: 0, PROM: 1, ROAD: 2, SIDEWALK: 3, GRASS: 4, PLAZA: 5, CONCRETE: 6,
  PARKING: 7, PATH: 8, FIELD: 9, SAND: 10, POND: 11,
};
export const WALKABLE = (t) => t !== T.WATER && t !== T.POND;

const N = MAP_N;
const inRoadBand = (v) => ROADS.some((r) => v === r || v === r + 1);
const roadLane = (v) => { for (const r of ROADS) { if (v === r) return 0; if (v === r + 1) return 1; } return -1; };
const sideBand = (v) => ROADS.some((r) => v === r - 1 || v === r + 2);

export function blockIndex(v) {
  return Math.max(0, Math.min(6, Math.floor((v - 6) / 12)));
}
export function districtAt(x, y) {
  return DISTRICT_GRID[blockIndex(Math.floor(y))][blockIndex(Math.floor(x))];
}

export function generateCity(seed = 1337) {
  const rng = makeRng(seed);
  const ground = new Uint8Array(N * N);
  const road = new Uint8Array(N * N); // bit0 : route selon x, bit1 : route selon y, bits2-3 : voie
  const blocked = new Uint8Array(N * N);
  const buildings = [];
  const props = [];
  const movables = [];
  const idx = (x, y) => y * N + x;

  // 1. Sol de base : eau en bordure, promenade, routes, trottoirs.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let t;
      const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
      if (edge <= 1) t = T.WATER;
      else if (edge <= 4 && !(inRoadBand(x) || inRoadBand(y))) t = T.PROM;
      else if (inRoadBand(x) || inRoadBand(y)) {
        t = T.ROAD;
        let bits = 0;
        if (inRoadBand(y)) bits |= 1 | (roadLane(y) << 2);
        if (inRoadBand(x)) bits |= 2 | (roadLane(x) << 3);
        road[idx(x, y)] = bits;
      } else if (sideBand(x) || sideBand(y)) t = T.SIDEWALK;
      else t = T.GRASS;
      ground[idx(x, y)] = t;
    }
  }
  // Routes qui débouchent sur l'eau : on garde la promenade au bord.
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
    if (edge <= 1) ground[idx(x, y)] = T.WATER;
    else if (edge <= 2 && ground[idx(x, y)] === T.ROAD) { ground[idx(x, y)] = T.PROM; road[idx(x, y)] = 0; }
  }

  const setRect = (x0, y0, w, h, t) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) ground[idx(x, y)] = t;
  };
  const addB = (x, y, s, variant) => {
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      if (blocked[idx(x + i, y + j)]) return false;
    }
    buildings.push({ x, y, s, variant });
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) blocked[idx(x + i, y + j)] = 1;
    return true;
  };
  const addP = (x, y, type) => props.push({ x, y, type });
  const addM = (x, y, type, orient, color = Math.floor(rng() * 6)) => movables.push({ x, y, type, orient, color });
  const free = (x, y) => !blocked[idx(x | 0, y | 0)];

  // 2. Remplissage des pâtés selon le quartier.
  for (let by = 0; by < 7; by++) {
    for (let bx = 0; bx < 7; bx++) {
      const ox = ROADS[bx] + 3, oy = ROADS[by] + 3;
      const d = DISTRICT_GRID[by][bx];
      const key = bx + ',' + by;
      fillBlock(d, key, ox, oy);
    }
  }

  function fillBlock(d, key, ox, oy) {
    // Lieux remarquables placés à la main.
    if (key === '3,3') { // Place centrale + monument
      setRect(ox, oy, 8, 8, T.PLAZA);
      addB(ox + 3, oy + 3, 2, 'monument2');
      for (const [i, j] of [[1, 1], [6, 1], [1, 6], [6, 6]]) addP(ox + i + 0.5, oy + j + 0.5, 'tree_round');
      for (const [i, j] of [[3, 1], [1, 4], [6, 3], [4, 6]]) addP(ox + i + 0.5, oy + j + 0.5, 'bench');
      return;
    }
    if (key === '3,2') { setRect(ox, oy, 8, 8, T.PLAZA); addB(ox + 1, oy + 1, 6, 'skytower'); return; }
    if (key === '1,1') { // Sanctuaire
      setRect(ox, oy, 8, 8, T.GRASS);
      setRect(ox + 3, oy, 2, 8, T.PATH);
      addB(ox + 2, oy + 1, 4, 'temple4');
      addP(ox + 4, oy + 6.5, 'torii');
      addP(ox + 1.5, oy + 6.5, 'tree_cherry'); addP(ox + 6.5, oy + 6.5, 'tree_cherry');
      addP(ox + 0.8, oy + 1.5, 'tree_pine'); addP(ox + 7, oy + 2, 'tree_pine');
      return;
    }
    if (key === '5,0') { // Docks : grues et conteneurs
      setRect(ox, oy, 8, 8, T.CONCRETE);
      addB(ox + 1, oy + 1, 2, 'crane2'); addB(ox + 5, oy + 1, 2, 'crane2');
      for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) addM(ox + 1.5 + i * 3.2, oy + 4.2 + j * 1.2, 'container', 0);
      return;
    }
    if (key === '1,4') { setRect(ox, oy, 8, 8, T.PLAZA); addB(ox, oy, 7, 'mall7'); addP(ox + 7.5, oy + 7.5, 'tree_round'); return; }
    if (key === '5,5') { // Fontaine du parc
      setRect(ox, oy, 8, 8, T.GRASS);
      setRect(ox + 1, oy + 1, 6, 6, T.PLAZA);
      addB(ox + 3, oy + 3, 2, 'fountain2');
      for (const [i, j] of [[0, 0], [7, 0], [0, 7], [7, 7]]) addP(ox + i + 0.5, oy + j + 0.5, 'tree_cherry');
      for (const [i, j] of [[2, 1.2], [5.5, 1.2], [1.2, 4], [6.6, 4]]) addP(ox + i, oy + j, 'bench');
      return;
    }
    if (key === '4,6') { // Terrain de sport
      setRect(ox, oy, 8, 8, T.FIELD);
      for (let i = 0; i < 8; i++) { addP(ox + i + 0.5, oy + 0.2, 'fence_x'); addP(ox + i + 0.5, oy + 7.8, 'fence_x'); }
      return;
    }
    if (key === '6,6' || key === '2,6') { // Étangs
      setRect(ox, oy, 8, 8, T.GRASS);
      setRect(ox + 2, oy + 2, 4, 4, T.POND);
      for (let j = oy + 2; j < oy + 6; j++) for (let i = ox + 2; i < ox + 6; i++) blocked[idx(i, j)] = 1;
      for (const [i, j] of [[0.6, 0.6], [7.3, 1], [1, 7.2], [6.8, 7]]) addP(ox + i, oy + j, 'tree_pine');
      return;
    }

    const r = rng();
    if (d === 'C') {
      setRect(ox, oy, 8, 8, T.PLAZA);
      if (r < 0.3) { addB(ox + 1, oy + 1, 6, pick(['tower_glass6', 'office6'], rng)); }
      else if (r < 0.6) { addB(ox, oy, 5, 'tower_glass5'); addB(ox + 6, oy + 6, 2, 'office2'); addB(ox + 6, oy, 2, 'office2'); }
      else { for (const [i, j] of [[0, 0], [5, 0], [0, 5], [5, 5]]) addB(ox + i, oy + j, 3, pick(['office3', 'tower_glass3', 'office3b'], rng)); addP(ox + 4, oy + 4, 'tree_round'); }
      addP(ox + 0.3, oy + 7.7, 'lamp');
    } else if (d === 'R') {
      setRect(ox, oy, 8, 8, T.GRASS);
      if (r < 0.55) {
        for (const [i, j] of [[0, 0], [5, 0], [0, 5], [5, 5]]) addB(ox + i, oy + j, 3, pick(['house3a', 'house3b', 'house3c'], rng));
        setRect(ox + 3, oy, 2, 8, T.PATH);
        addP(ox + 4, oy + 3.8, 'tree_round');
      } else if (r < 0.85) {
        addB(ox, oy, 4, pick(['apart4', 'apart4b'], rng));
        addB(ox + 5, oy, 3, pick(['house3a', 'house3b'], rng));
        addB(ox + 5, oy + 5, 3, 'house3c');
        setRect(ox, oy + 5, 4, 3, T.PARKING);
        addM(ox + 0.8, oy + 6.5, 'car', 1); addM(ox + 2.4, oy + 6.5, 'car', 1);
      } else {
        addB(ox + 1, oy + 1, 3, 'apart3'); addB(ox + 4, oy + 4, 4, 'apart4');
        addP(ox + 5, oy + 1.5, 'tree_round'); addP(ox + 1.5, oy + 5.5, 'tree_round');
      }
      addP(ox + 0.3, oy + 3.5, 'bush'); addP(ox + 7.6, oy + 3.5, 'bush');
    } else if (d === 'I') {
      setRect(ox, oy, 8, 8, T.CONCRETE);
      if (r < 0.35) { addB(ox + 1, oy + 1, 6, 'warehouse6'); }
      else if (r < 0.7) {
        addB(ox, oy, 5, 'factory5'); addB(ox + 5, oy + 5, 3, 'tank3');
        addM(ox + 6, oy + 1.2, 'container', 1); addM(ox + 1.5, oy + 6.6, 'container', 0);
      } else {
        addB(ox, oy, 4, 'shed4'); addB(ox + 4, oy + 4, 4, 'shed4');
        addM(ox + 5.8, oy + 1, 'truck', 0); addM(ox + 1.6, oy + 5.6, 'container', 0); addM(ox + 1.6, oy + 6.8, 'container', 0);
      }
    } else if (d === 'K') {
      setRect(ox, oy, 8, 8, T.PLAZA);
      if (r < 0.5) {
        for (const [i, j] of [[0, 0], [5, 0], [0, 5], [5, 5]]) addB(ox + i, oy + j, 3, pick(['shop3a', 'shop3b', 'shop3c'], rng));
        addM(ox + 3.6, oy + 1, 'vending', 0); addM(ox + 4.4, oy + 6.8, 'vending', 0);
      } else if (r < 0.8) {
        addB(ox, oy, 4, 'shop4'); addB(ox + 4, oy + 4, 4, 'shop4b');
        addB(ox + 5, oy, 3, 'shop3a'); addB(ox, oy + 5, 3, 'shop3c');
      } else {
        setRect(ox, oy, 8, 8, T.PARKING);
        addB(ox + 5, oy + 5, 3, 'shop3b');
        for (let i = 0; i < 4; i++) addM(ox + 0.8 + i * 1.1, oy + 1.4, 'car', 1);
        for (let i = 0; i < 3; i++) addM(ox + 0.8 + i * 1.1, oy + 4.2, 'car', 1);
      }
    } else if (d === 'P') {
      setRect(ox, oy, 8, 8, T.GRASS);
      setRect(ox + 3, oy, 2, 8, T.PATH); setRect(ox, oy + 3, 8, 2, T.PATH);
      if (r < 0.4) addB(ox + 5, oy + 5, 2, 'kiosk2');
      else if (r < 0.6) addB(ox + 5, oy + 5, 3, 'gym3');
      for (const [i, j] of [[1, 1], [6, 1], [1, 6], [1.5, 2.4], [6.5, 2.2]]) {
        if (free(ox + i, oy + j)) addP(ox + i + 0.2, oy + j + 0.2, pick(['tree_round', 'tree_pine', 'tree_cherry'], rng));
      }
      addP(ox + 2.5, oy + 3.5, 'bench'); addP(ox + 5.5, oy + 4.5, 'bench');
    }
  }

  // 3. Mobilier sur les trottoirs et véhicules garés le long des routes.
  for (let y = 2; y < N - 2; y++) {
    for (let x = 2; x < N - 2; x++) {
      const t = ground[idx(x, y)];
      if (t === T.SIDEWALK && !blocked[idx(x, y)]) {
        const corner = sideBand(x) && sideBand(y);
        const d = districtAt(x, y);
        if (corner) { const k = rng(); if (k < 0.35) addP(x + 0.5, y + 0.5, 'sign'); else if (k < 0.7) addP(x + 0.5, y + 0.5, 'traffic'); continue; }
        if ((x + y) % 6 === 0) addP(x + 0.5, y + 0.5, 'lamp');
        else if ((x + y) % 6 === 3 && (d === 'R' || d === 'K' || d === 'I')) addP(x + 0.5, y + 0.5, 'pole');
        else if ((d === 'R' || d === 'P') && (x * 7 + y * 3) % 9 === 0) addP(x + 0.5, y + 0.5, d === 'P' ? 'tree_cherry' : 'tree_round');
        else if (d === 'K' && rng() < 0.05) addM(x + 0.5, y + 0.5, 'vending', 0);
        else if (rng() < 0.025) addP(x + 0.5, y + 0.5, 'hydrant');
        else if (rng() < 0.02) addP(x + 0.5, y + 0.5, 'bin');
        else if ((d === 'C' || d === 'K') && rng() < 0.04) addP(x + 0.5, y + 0.5, 'plant');
        else if ((d === 'R' || d === 'K' || d === 'P') && rng() < 0.03) addP(x + 0.5, y + 0.5, 'bike');
        else if (rng() < 0.012) addP(x + 0.5, y + 0.5, 'mailbox');
      } else if (t === T.PROM && rng() < 0.08 && Math.min(x, y, N - 1 - x, N - 1 - y) === 2) {
        addP(x + 0.5, y + 0.5, 'lamp');
      }
    }
  }
  // Voitures garées sur la voie extérieure, hors carrefours.
  for (const r of ROADS) {
    for (let v = 3; v < N - 3; v++) {
      if (inRoadBand(v) || inRoadBand(v - 1) || inRoadBand(v + 1)) continue;
      if (rng() < 0.12) {
        const d = districtAt(v, r);
        const type = d === 'I' && rng() < 0.4 ? 'truck' : rng() < 0.18 ? 'van' : 'car';
        // route selon x (y = r ou r+1)
        addM(v + 0.5, (rng() < 0.5 ? r : r + 1) + (rng() < 0.5 ? 0.3 : 0.7), type, 0);
      }
      if (rng() < 0.12) {
        const d = districtAt(r, v);
        const type = d === 'I' && rng() < 0.4 ? 'truck' : rng() < 0.18 ? 'van' : 'car';
        addM((rng() < 0.5 ? r : r + 1) + (rng() < 0.5 ? 0.3 : 0.7), v + 0.5, type, 1);
      }
    }
  }

  // Rambardes le long de la promenade.
  for (let v = 2; v < N - 2; v++) {
    if (v % 2) continue;
    addP(v + 0.5, 2.15, 'fence_x'); addP(v + 0.5, N - 2.15, 'fence_x');
    addP(2.15, v + 0.5, 'fence_y'); addP(N - 2.15, v + 0.5, 'fence_y');
  }

  const district = new Uint8Array(N * N);
  const codes = 'CRIKP';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) district[idx(x, y)] = codes.indexOf(districtAt(x, y));

  return { n: N, ground, road, blocked, district, buildings, props, movables };
}

// Case praticable la plus proche (recherche en spirale).
export function nearestWalkable(map, x, y) {
  const N = map.n;
  const ok = (i, j) => i >= 0 && j >= 0 && i < N && j < N && !map.blocked[j * N + i] && WALKABLE(map.ground[j * N + i]);
  const cx = Math.floor(x), cy = Math.floor(y);
  if (ok(cx, cy)) return [x, y];
  for (let r = 1; r < 20; r++) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      if (ok(cx + i, cy + j)) return [cx + i + 0.5, cy + j + 0.5];
    }
  }
  return [x, y];
}
