// Selara Bay: the city itself. A seeded generator lays out 10x10 blocks
// across five districts, places buildings and landmarks, and fills the
// collision grid. Geometry is built from this data in city-meshes.js; the
// simulation (traffic, pedestrians, missions) reads it from here.
//
// Districts:
//   downtown  — glass towers 40-140 m, plazas, neon (centre)
//   kemuning  — 4-10 storey terracotta and cream mid-rises with awnings
//   bukit     — houses with pitched roofs, gardens, pools (west)
//   docks     — warehouses, containers, gantry cranes (east, Pier 9)
//   beach     — hotels, boardwalk, sand (south, Pantai Selara)
//   park      — grass, paths, a pond, trees (four blocks)

import { makeRng, rngRange, rngInt, rngPick, rngChance, hashString } from '../core/math.js';
import { BLOCK, PITCH, HALF, GRID, streetCoord } from './roads.js';
import { Collision } from './collision.js';

export const DISTRICTS = {
  downtown: { name: 'Downtown / Kota Lama' },
  kemuning: { name: 'Kemuning' },
  bukit: { name: 'Bukit Asri' },
  docks: { name: 'Pier 9 Docks' },
  beach: { name: 'Pantai Selara' },
  park: { name: 'Taman' },
};

const PARK_BLOCKS = [[1, 4], [5, 7], [7, 3], [3, 1]];

const SHOP_NAMES = [
  'Es Cendol', 'Kopi Senja', 'Bengkel Motor', 'Laundry Kilau',
  'Toko Bintang', 'Mie Ombak', 'Pizza Pelangi', 'Bakso Lestari',
];

const SHOP_COLORS = [
  [0.95, 0.35, 0.25], [0.95, 0.65, 0.15], [0.20, 0.75, 0.55],
  [0.95, 0.85, 0.25], [0.45, 0.65, 0.95], [0.95, 0.45, 0.65],
  [0.65, 0.45, 0.95], [0.30, 0.85, 0.85],
];

// Landmark blocks: [bx, bz, id, name, kind]
const LANDMARK_BLOCKS = [
  [4, 3, 'orchidTower', 'Orchid Tower', 'tower'],
  [5, 3, 'bank', 'Bank Samudra', 'bank'],
  [4, 4, 'policeHQ', 'Selara Police HQ', 'police'],
  [2, 5, 'hospital', 'Selara General Hospital', 'hospital'],
  [6, 6, 'garage', "Lin's Garage", 'garage'],
  [1, 6, 'safehouse', 'Safehouse', 'safehouse'],
  [3, 6, 'kedai', 'Kedai Orchid', 'cafe'],
  [8, 4, 'freight', 'Orchid Freight', 'warehouse'],
  [7, 6, 'respray', 'Kilat Respray', 'respray'],
  [6, 4, 'gunshop', 'Bang Bang Arms', 'gunshop'],
  [5, 5, 'dexHome', "Dex's Apartment", 'apartment'],
];

export function blockCenter(bx, bz) {
  return [-HALF + (bx + 0.5) * PITCH, -HALF + (bz + 0.5) * PITCH];
}

export class City {
  constructor(seed = 20261121) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.collision = new Collision();
    this.blocks = [];
    this.landmarks = {};
    this.buildings = [];
    this.containers = [];
    this.trees = [];
    this.lamps = [];
    this.generate();
  }

  districtOf(bx, bz) {
    if (PARK_BLOCKS.some(([px, pz]) => px === bx && pz === bz)) return 'park';
    if (bz >= 8) return 'beach';
    if (bx >= 8) return 'docks';
    if (bx <= 1) return 'bukit';
    if (bx >= 3 && bx <= 6 && bz >= 2 && bz <= 5) return 'downtown';
    return 'kemuning';
  }

  districtAt(x, z) {
    const bx = Math.floor((x + HALF) / PITCH);
    const bz = Math.floor((z + HALF) / PITCH);
    if (bx < 0 || bx >= GRID || bz < 0 || bz >= GRID) return 'sea';
    return this.districtOf(bx, bz);
  }

  districtNameAt(x, z) {
    const d = this.districtAt(x, z);
    return d === 'sea' ? 'Selara Bay' : DISTRICTS[d].name;
  }

  generate() {
    const rng = this.rng;
    const landmarkAt = new Map();
    for (const [bx, bz, id, name, kind] of LANDMARK_BLOCKS) {
      landmarkAt.set(bx + ',' + bz, { id, name, kind });
    }

    for (let bz = 0; bz < GRID; bz++) {
      for (let bx = 0; bx < GRID; bx++) {
        const district = this.districtOf(bx, bz);
        const [cx, cz] = blockCenter(bx, bz);
        const block = { bx, bz, district, cx, cz, buildings: [] };
        const lm = landmarkAt.get(bx + ',' + bz);
        if (district === 'park') {
          this.makePark(block, rng);
        } else if (lm) {
          this.makeLandmark(block, lm, rng);
        } else if (district === 'downtown') {
          this.makeDowntown(block, rng);
        } else if (district === 'kemuning') {
          this.makeKemuning(block, rng);
        } else if (district === 'bukit') {
          this.makeBukit(block, rng);
        } else if (district === 'docks') {
          this.makeDocks(block, rng);
        } else if (district === 'beach') {
          this.makeBeach(block, rng);
        }
        this.blocks.push(block);
      }
    }
    // Street lamps along every street, trees on sidewalks and in parks.
    this.placeStreetFurniture(rng);
  }

  addBuilding(block, b) {
    block.buildings.push(b);
    this.buildings.push(b);
    this.collision.addBox(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2, b.h);
    return b;
  }

  makeDowntown(block, rng) {
    const { cx, cz } = block;
    const count = rngChance(rng, 0.5) ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const w = rngRange(rng, 26, 40);
      const d = rngRange(rng, 26, 40);
      const h = rngRange(rng, 40, 140);
      const x = cx + (count === 1 ? 0 : (i === 0 ? -22 : 22));
      const z = cz + (count === 1 ? 0 : (i === 0 ? -10 : 14));
      const glass = rngPick(rng, [[0.35, 0.5, 0.65], [0.45, 0.55, 0.7], [0.3, 0.42, 0.6]]);
      const roof = rngChance(rng, 1 / 6) ? 'helipad' : rngPick(rng, ['garden', 'pool', 'ac', 'antenna', 'tank']);
      const shop = rngChance(rng, 0.6) ? {
        name: rngPick(rng, SHOP_NAMES),
        color: rngPick(rng, SHOP_COLORS),
      } : null;
      this.addBuilding(block, { x, z, w, d, h, color: glass, roofColor: [0.18, 0.19, 0.22], roof, shop, floors: Math.floor(h / 4), district: 'downtown' });
    }
  }

  makeKemuning(block, rng) {
    const { cx, cz } = block;
    const spots = [[-20, -20], [20, -20], [-20, 20], [20, 20]];
    const n = rngInt(rng, 2, 4);
    for (let i = 0; i < n; i++) {
      const [ox, oz] = spots[i];
      const w = rngRange(rng, 18, 26);
      const d = rngRange(rng, 18, 26);
      const h = rngRange(rng, 12, 32);
      const warm = rngPick(rng, [
        [0.72, 0.48, 0.32], [0.78, 0.68, 0.52], [0.62, 0.42, 0.30], [0.70, 0.60, 0.45],
      ]);
      const shop = rngChance(rng, 0.55) ? {
        name: rngPick(rng, SHOP_NAMES),
        color: rngPick(rng, SHOP_COLORS),
      } : null;
      this.addBuilding(block, { x: cx + ox, z: cz + oz, w, d, h, color: warm, roofColor: [0.45, 0.30, 0.22], roof: rngPick(rng, ['flat', 'ac', 'tank']), shop, floors: Math.floor(h / 3.5), district: 'kemuning' });
    }
  }

  makeBukit(block, rng) {
    const { cx, cz } = block;
    const spots = [[-24, -22], [22, -22], [-24, 20], [24, 20], [0, 0]];
    const n = rngInt(rng, 3, 5);
    for (let i = 0; i < n; i++) {
      const [ox, oz] = spots[i];
      const w = rngRange(rng, 12, 17);
      const d = rngRange(rng, 12, 17);
      const h = rngRange(rng, 6, 10);
      const paint = rngPick(rng, [
        [0.85, 0.80, 0.70], [0.75, 0.70, 0.80], [0.80, 0.72, 0.60], [0.65, 0.75, 0.70],
      ]);
      const roofColor = rngPick(rng, [[0.55, 0.25, 0.18], [0.45, 0.30, 0.25], [0.35, 0.35, 0.40]]);
      this.addBuilding(block, { x: cx + ox, z: cz + oz, w, d, h, color: paint, roofColor, roof: 'pitched', shop: null, floors: 2, district: 'bukit' });
      // Garden trees around the house.
      this.trees.push({ x: cx + ox + rngRange(rng, -14, 14), z: cz + oz + rngRange(rng, -14, 14), kind: 'leaf', scale: rngRange(rng, 0.8, 1.3) });
    }
  }

  makeDocks(block, rng) {
    const { cx, cz } = block;
    // One warehouse + container stacks.
    const w = rngRange(rng, 34, 44);
    const d = rngRange(rng, 18, 24);
    this.addBuilding(block, { x: cx, z: cz - 12, w, d, h: rngRange(rng, 9, 13), color: [0.45, 0.42, 0.38], roofColor: [0.30, 0.30, 0.32], roof: 'flat', shop: null, floors: 1, district: 'docks' });
    const rows = rngInt(rng, 2, 3);
    for (let r = 0; r < rows; r++) {
      const n = rngInt(rng, 2, 4);
      for (let i = 0; i < n; i++) {
        const c = {
          x: cx - 28 + i * 14,
          z: cz + 14 + r * 9,
          w: 12, d: 2.6, h: 2.6,
          color: rngPick(rng, [[0.85, 0.35, 0.2], [0.2, 0.55, 0.75], [0.85, 0.65, 0.2], [0.35, 0.7, 0.35], [0.75, 0.25, 0.45]]),
          stack: rngInt(rng, 1, 3),
        };
        this.containers.push(c);
        this.collision.addBox(c.x - 6, c.z - 1.3, c.x + 6, c.z + 1.3, 2.6 * c.stack);
      }
    }
  }

  makeBeach(block, rng) {
    const { cx, cz } = block;
    if (block.bz === 9) {
      // Boardwalk row: hotels facing the sea, sand in front.
      const h = rngRange(rng, 18, 38);
      this.addBuilding(block, { x: cx, z: cz - 18, w: rngRange(rng, 30, 44), d: 22, h, color: rngPick(rng, [[0.85, 0.82, 0.72], [0.75, 0.80, 0.85], [0.90, 0.78, 0.62]]), roofColor: [0.35, 0.55, 0.60], roof: rngPick(rng, ['pool', 'garden', 'flat']), shop: null, floors: Math.floor(h / 3.5), district: 'beach' });
      for (let i = 0; i < 5; i++) {
        this.trees.push({ x: cx - 36 + i * 18, z: cz + 12, kind: 'palm', scale: rngRange(rng, 0.9, 1.3) });
      }
      return;
    }
    const h = rngRange(rng, 14, 30);
    this.addBuilding(block, { x: cx, z: cz, w: rngRange(rng, 26, 38), d: 24, h, color: [0.85, 0.80, 0.68], roofColor: [0.40, 0.55, 0.60], roof: 'pool', shop: null, floors: Math.floor(h / 3.5), district: 'beach' });
  }

  makePark(block, rng) {
    const { cx, cz } = block;
    for (let i = 0; i < 9; i++) {
      this.trees.push({
        x: cx + rngRange(rng, -36, 36),
        z: cz + rngRange(rng, -36, 36),
        kind: rngChance(rng, 0.5) ? 'leaf' : 'palm',
        scale: rngRange(rng, 0.9, 1.5),
      });
    }
    block.pond = { x: cx + rngRange(rng, -15, 15), z: cz + rngRange(rng, -15, 15), r: rngRange(rng, 8, 13) };
  }

  makeLandmark(block, lm, rng) {
    const { cx, cz } = block;
    const base = { district: 'landmark', shop: null, floors: 4 };
    let b;
    switch (lm.kind) {
      case 'tower':
        b = { x: cx, z: cz, w: 44, d: 44, h: 180, color: [0.45, 0.30, 0.70], roofColor: [0.30, 0.18, 0.50], roof: 'helipad', floors: 45 };
        break;
      case 'bank':
        b = { x: cx, z: cz, w: 40, d: 30, h: 34, color: [0.75, 0.72, 0.65], roofColor: [0.35, 0.35, 0.38], roof: 'flat', floors: 8 };
        break;
      case 'police':
        b = { x: cx, z: cz, w: 36, d: 28, h: 22, color: [0.25, 0.30, 0.45], roofColor: [0.20, 0.22, 0.32], roof: 'helipad', floors: 5 };
        break;
      case 'hospital':
        b = { x: cx, z: cz, w: 38, d: 26, h: 26, color: [0.85, 0.88, 0.85], roofColor: [0.55, 0.60, 0.62], roof: 'helipad', floors: 6 };
        break;
      case 'garage':
        b = { x: cx, z: cz, w: 34, d: 24, h: 9, color: [0.55, 0.45, 0.35], roofColor: [0.40, 0.32, 0.26], roof: 'flat', floors: 1 };
        break;
      case 'safehouse':
        b = { x: cx, z: cz, w: 16, d: 14, h: 8, color: [0.85, 0.80, 0.70], roofColor: [0.55, 0.25, 0.18], roof: 'pitched', floors: 2 };
        break;
      case 'cafe':
        b = { x: cx, z: cz, w: 20, d: 16, h: 8, color: [0.70, 0.55, 0.40], roofColor: [0.45, 0.30, 0.22], roof: 'flat', floors: 1, shop: { name: 'Kedai Orchid', color: [0.65, 0.45, 0.95] } };
        break;
      case 'warehouse':
        b = { x: cx, z: cz, w: 44, d: 26, h: 12, color: [0.45, 0.40, 0.55], roofColor: [0.30, 0.28, 0.35], roof: 'flat', floors: 1 };
        break;
      case 'respray':
        b = { x: cx, z: cz, w: 22, d: 16, h: 7, color: [0.85, 0.60, 0.25], roofColor: [0.50, 0.35, 0.15], roof: 'flat', floors: 1, shop: { name: 'Kilat Respray', color: [0.95, 0.65, 0.15] } };
        break;
      case 'gunshop':
        b = { x: cx, z: cz, w: 20, d: 16, h: 8, color: [0.40, 0.40, 0.45], roofColor: [0.25, 0.25, 0.30], roof: 'flat', floors: 1, shop: { name: 'Bang Bang Arms', color: [0.85, 0.30, 0.25] } };
        break;
      case 'apartment':
        b = { x: cx, z: cz, w: 22, d: 20, h: 24, color: [0.65, 0.60, 0.55], roofColor: [0.40, 0.38, 0.36], roof: 'ac', floors: 7 };
        break;
      default:
        b = { x: cx, z: cz, w: 20, d: 20, h: 12, color: [0.6, 0.6, 0.6], roofColor: [0.4, 0.4, 0.4], roof: 'flat', floors: 3 };
    }
    const built = this.addBuilding(block, { ...base, ...b, landmark: lm.id });
    this.landmarks[lm.id] = { ...lm, x: built.x, z: built.z, w: built.w, d: built.d, h: built.h };
  }

  placeStreetFurniture(rng) {
    // Lamps at every intersection corner, trees along some sidewalks.
    for (let ix = 0; ix <= GRID; ix++) {
      for (let iz = 0; iz <= GRID; iz++) {
        const x = streetCoord(ix);
        const z = streetCoord(iz);
        if (Math.abs(x) > HALF || Math.abs(z) > HALF) continue;
        this.lamps.push({ x: x + 8, z: z + 8 });
        this.lamps.push({ x: x - 8, z: z - 8 });
        if (rngChance(rng, 0.35)) {
          this.trees.push({ x: x + rngRange(rng, -20, 20), z: z + 9, kind: 'leaf', scale: rngRange(rng, 0.8, 1.2) });
        }
      }
    }
  }

  // Player start: the ferry pier on the south beach.
  get ferryPier() {
    return { x: 0, z: HALF - 30 };
  }

  // Landmark lookup by id.
  landmark(id) {
    return this.landmarks[id];
  }
}
