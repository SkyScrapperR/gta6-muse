// World meshes: the ground (roads, sidewalks, beach, crosswalks), the city
// chunked into 5x5 static batches for frustum culling, and every street
// prop as one instanced batch per type. All of it is built once at load from
// the generated city data.

import {
  box, cylinder, sphere, taperBox, gridPlane,
  emptyGeometry, merge,
} from '../engine/mesh.js';
import { mat4TRS, makeRng, rngRange, rngInt, rngPick } from '../core/math.js';
import { BLOCK, PITCH, HALF, GRID, streetCoord } from './roads.js';
import {
  lampGeometry, leafTreeGeometry, palmGeometry, benchGeometry,
  binGeometry, hydrantGeometry, busStopGeometry, containerGeometry,
  craneGeometry, boatGeometry, umbrellaGeometry, cartGeometry,
  billboardGeometry, fountainGeometry,
} from './props.js';

const ROAD_HALF = 7; // half the road width: sidewalks start here

const SIDEWALK_COLORS = {  downtown: [0.42, 0.42, 0.45],
  kemuning: [0.46, 0.43, 0.38],
  bukit: [0.42, 0.48, 0.38],
  docks: [0.38, 0.38, 0.40],
  beach: [0.85, 0.78, 0.60],
  park: [0.25, 0.45, 0.25],
};

function quad(geo, x0, z0, x1, z1, y, color) {
  // A flat quad facing up, as a thin box (avoids a separate plane path).
  box(geo, (x0 + x1) / 2, y, (z0 + z1) / 2, Math.abs(x1 - x0), 0.06, Math.abs(z1 - z0), color);
}

export function buildGround(city) {
  const g = emptyGeometry();
  // Island base slab.
  quad(g, -HALF - 8, -HALF - 8, HALF + 8, HALF + 8, -0.05, [0.30, 0.30, 0.32]);
  // Sand ring beyond the south edge (the beach) and a seawall elsewhere.
  quad(g, -HALF - 60, HALF, HALF + 60, HALF + 70, 0.02, [0.85, 0.78, 0.58]);
  quad(g, -HALF - 60, -HALF - 60, HALF + 60, -HALF, 0.02, [0.35, 0.35, 0.38]);
  quad(g, -HALF - 60, -HALF, -HALF, HALF, 0.02, [0.35, 0.35, 0.38]);
  quad(g, HALF, -HALF, HALF + 60, HALF, 0.02, [0.35, 0.35, 0.38]);
  // Block sidewalks, raised a hand's breadth above the road.
  for (const block of city.blocks) {
    const x0 = -HALF + block.bx * PITCH + ROAD_HALF;
    const x1 = -HALF + (block.bx + 1) * PITCH - ROAD_HALF;
    const z0 = -HALF + block.bz * PITCH + ROAD_HALF;
    const z1 = -HALF + (block.bz + 1) * PITCH - ROAD_HALF;
    quad(g, x0, z0, x1, z1, 0.10, SIDEWALK_COLORS[block.district]);
    if (block.pond) {
      cylinder(g, block.pond.x, 0.14, block.pond.z, block.pond.r, block.pond.r, 0.08, 12, [0.15, 0.40, 0.55]);
    }
  }
  // Roads: vertical strips at y 0.02, horizontal at 0.03 (the hair of
  // difference stops z-fighting where they cross).
  for (let i = 0; i <= GRID; i++) {
    const c = streetCoord(i);
    quad(g, c - 7, -HALF, c + 7, HALF, 0.02, [0.13, 0.13, 0.15]);
    quad(g, -HALF, c - 7, HALF, c + 7, 0.03, [0.13, 0.13, 0.15]);
  }
  // Lane markings: dashed yellow centrelines and white edge lines.
  for (let i = 0; i <= GRID; i++) {
    const c = streetCoord(i);
    for (let s = -HALF + 10; s < HALF - 10; s += 12) {
      quad(g, c - 0.15, s, c + 0.15, s + 4, 0.045, [0.85, 0.70, 0.20]);
      quad(g, s, c - 0.15, s + 4, c + 0.15, 0.05, [0.85, 0.70, 0.20]);
    }
    quad(g, c - 6.6, -HALF, c - 6.3, HALF, 0.045, [0.75, 0.75, 0.75]);
    quad(g, c + 6.3, -HALF, c + 6.6, HALF, 0.045, [0.75, 0.75, 0.75]);
    quad(g, -HALF, c - 6.6, HALF, c - 6.3, 0.05, [0.75, 0.75, 0.75]);
    quad(g, -HALF, c + 6.3, HALF, c + 6.6, 0.05, [0.75, 0.75, 0.75]);
  }
  // Crosswalks: four stripes across each approach at every intersection.
  for (let ix = 0; ix <= GRID; ix++) {
    for (let iz = 0; iz <= GRID; iz++) {
      const cx = streetCoord(ix);
      const cz = streetCoord(iz);
      for (let k = -2; k <= 1; k++) {
        quad(g, cx - 5.5, cz + 8 + k * 1.6, cx - 2.5, cz + 8 + k * 1.6 + 0.9, 0.055, [0.85, 0.85, 0.85]);
        quad(g, cx + 2.5, cz - 8 - k * 1.6 - 0.9, cx + 5.5, cz - 8 - k * 1.6, 0.055, [0.85, 0.85, 0.85]);
        quad(g, cx + 8 + k * 1.6, cz - 5.5, cx + 8 + k * 1.6 + 0.9, cz - 2.5, 0.06, [0.85, 0.85, 0.85]);
        quad(g, cx - 8 - k * 1.6 - 0.9, cz + 2.5, cx - 8 - k * 1.6, cz + 5.5, 0.06, [0.85, 0.85, 0.85]);
      }
    }
  }
  // The east pier: a wooden deck into the sea with posts.
  quad(g, HALF, 288, HALF + 90, 312, 0.45, [0.45, 0.32, 0.20]);
  for (let x = HALF + 10; x <= HALF + 85; x += 15) {
    box(g, x, 0.2, 290, 0.5, 0.9, 0.5, [0.35, 0.25, 0.16]);
    box(g, x, 0.2, 310, 0.5, 0.9, 0.5, [0.35, 0.25, 0.16]);
  }
  return g;
}

// One building's contribution to its chunk: the box, roof furniture,
// window strips on the two street faces, and the shopfront if it has one.
function buildingGeometry(b) {
  const g = emptyGeometry();
  box(g, b.x, b.h / 2, b.z, b.w, b.h, b.d, b.color, [0, 0, 0], b.roofColor);
  const top = b.h;
  if (b.roof === 'helipad') {
    cylinder(g, b.x, top + 0.15, b.z, 7, 7, 0.3, 10, [0.12, 0.12, 0.14]);
    for (const [ox, oz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      box(g, b.x + ox, top + 0.4, b.z + oz, 0.5, 0.3, 0.5, [0.2, 0.2, 0.2], [1.0, 0.3, 0.2]);
    }
  } else if (b.roof === 'garden') {
    box(g, b.x, top + 0.5, b.z, b.w * 0.6, 1.0, b.d * 0.6, [0.25, 0.45, 0.25]);
    sphere(g, b.x - b.w * 0.2, top + 1.8, b.z, 1.2, 5, 6, [0.22, 0.50, 0.25]);
  } else if (b.roof === 'pool') {
    box(g, b.x, top + 0.25, b.z, b.w * 0.5, 0.5, b.d * 0.4, [0.15, 0.45, 0.65]);
  } else if (b.roof === 'ac') {
    for (let i = 0; i < 3; i++) {
      box(g, b.x - b.w * 0.25 + i * b.w * 0.25, top + 0.5, b.z, 2.2, 1.0, 1.6, [0.55, 0.55, 0.58]);
    }
  } else if (b.roof === 'tank') {
    cylinder(g, b.x + b.w * 0.25, top + 1.2, b.z, 1.3, 1.3, 2.4, 8, [0.60, 0.60, 0.62]);
  } else if (b.roof === 'antenna') {
    cylinder(g, b.x, top + 4, b.z, 0.12, 0.2, 8, 5, [0.30, 0.30, 0.33]);
    sphere(g, b.x, top + 8.2, b.z, 0.3, 5, 6, [0.8, 0.1, 0.1], [1.0, 0.15, 0.1]);
  } else if (b.roof === 'pitched') {
    taperBox(g, b.x, top + 1.3, b.z, b.w + 1, b.d + 1, 1.5, 1.5, 2.6, b.roofColor);
  }
  // Window strips on the front and back faces, every second floor (every
  // third on tall towers), warm emissive so the city glows at night.
  const step = b.h > 60 ? 3 : 2;
  for (let f = 1; f < b.floors; f += step) {
    const y = 3 + f * 3.2;
    if (y > b.h - 2) break;
    const strip = [0.06, 0.06, 0.08];
    const glow = [1.0, 0.72, 0.32];
    box(g, b.x, y, b.z + b.d / 2 + 0.06, b.w - 3, 0.9, 0.12, strip, glow);
    box(g, b.x, y, b.z - b.d / 2 - 0.06, b.w - 3, 0.9, 0.12, strip, glow);
  }
  // Shopfront: awning + glowing sign on the street face.
  if (b.shop) {
    const fz = b.z + b.d / 2;
    box(g, b.x, 3.4, fz + 1.1, b.w * 0.8, 0.18, 2.4, b.shop.color);
    box(g, b.x, 4.6, fz + 0.15, b.w * 0.7, 1.1, 0.25, [0.10, 0.10, 0.12], b.shop.color);
  }
  return g;
}

export function buildChunks(renderer, city) {
  const chunkBounds = new Map();
  for (let cx = 0; cx < 5; cx++) {
    for (let cz = 0; cz < 5; cz++) {
      const parts = [];
      for (const block of city.blocks) {
        if (Math.floor(block.bx / 2) !== cx || Math.floor(block.bz / 2) !== cz) continue;
        for (const b of block.buildings) parts.push(buildingGeometry(b));
      }
      for (const c of city.containers) {
        const bx = Math.floor((c.x + HALF) / PITCH);
        const bz = Math.floor((c.z + HALF) / PITCH);
        if (Math.floor(bx / 2) !== cx || Math.floor(bz / 2) !== cz) continue;
        for (let s = 0; s < c.stack; s++) {
          const g = emptyGeometry();
          box(g, c.x, 1.3 + s * 2.6, c.z, 12, 2.6, 2.6, c.color);
          parts.push(g);
        }
      }
      if (parts.length === 0) continue;
      const merged = merge(parts);
      const name = `chunk-${cx}-${cz}`;
      renderer.createBatch(name, merged, 1);
      renderer.setInstances(name, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), new Float32Array([1, 1, 1, 1]), 1);
      chunkBounds.set(name, merged.bounds);
    }
  }
  return chunkBounds;
}

// Fill one instanced batch from a list of {x, z, ry, scale, color}.
function fillInstances(renderer, name, items) {
  const matrices = new Float32Array(items.length * 16);
  const colors = new Float32Array(items.length * 4);
  items.forEach((it, i) => {
    const m = mat4TRS(it.x, it.y ?? 0, it.z, it.ry ?? 0, 0, 0, it.scale ?? 1, it.scale ?? 1, it.scale ?? 1);
    matrices.set(m, i * 16);
    const c = it.color ?? [1, 1, 1];
    colors[i * 4] = c[0]; colors[i * 4 + 1] = c[1]; colors[i * 4 + 2] = c[2];
    colors[i * 4 + 3] = it.emissive ?? 1;
  });
  renderer.setInstances(name, matrices, colors, items.length);
}

export function buildProps(renderer, city) {
  const rng = makeRng(city.seed + 77);

  renderer.createBatch('prop-lamp', lampGeometry(), Math.max(1, city.lamps.length));
  fillInstances(renderer, 'prop-lamp', city.lamps.map((l) => ({ ...l, ry: rng() * Math.PI * 2 })));

  const leafTrees = city.trees.filter((t) => t.kind === 'leaf');
  const palmTrees = city.trees.filter((t) => t.kind === 'palm');
  renderer.createBatch('prop-tree', leafTreeGeometry(), Math.max(1, leafTrees.length));
  fillInstances(renderer, 'prop-tree', leafTrees.map((t) => ({ ...t, ry: rng() * Math.PI * 2 })));
  renderer.createBatch('prop-palm', palmGeometry(), Math.max(1, palmTrees.length));
  fillInstances(renderer, 'prop-palm', palmTrees.map((t) => ({ ...t, ry: rng() * Math.PI * 2 })));

  // Benches in parks, bins and hydrants on random corners, bus stops on
  // the main avenues.
  const benches = [];
  const bins = [];
  const hydrants = [];
  const busStops = [];
  for (const block of city.blocks) {
    if (block.district === 'park') {
      benches.push({ x: block.cx - 10, z: block.cz, ry: Math.PI / 2 });
      benches.push({ x: block.cx + 12, z: block.cz - 8, ry: -Math.PI / 2 });
    }
  }
  for (let i = 0; i < 30; i++) {
    const x = streetCoord(rngInt(rng, 0, GRID)) + rngPick(rng, [-8, 8]);
    const z = streetCoord(rngInt(rng, 0, GRID)) + rngPick(rng, [-8, 8]);
    bins.push({ x, z, ry: rng() * Math.PI * 2 });
  }
  for (let i = 0; i < 20; i++) {
    const x = streetCoord(rngInt(rng, 0, GRID)) + rngPick(rng, [-8, 8]);
    const z = streetCoord(rngInt(rng, 0, GRID)) + rngPick(rng, [-8, 8]);
    hydrants.push({ x, z, ry: 0 });
  }
  for (const [ix, iz] of [[2, 5], [5, 2], [7, 7], [3, 8], [8, 3], [5, 6]]) {
    busStops.push({ x: streetCoord(ix) + 8, z: streetCoord(iz) + 8, ry: 0 });
  }
  renderer.createBatch('prop-bench', benchGeometry(), Math.max(1, benches.length));
  fillInstances(renderer, 'prop-bench', benches);
  renderer.createBatch('prop-bin', binGeometry(), Math.max(1, bins.length));
  fillInstances(renderer, 'prop-bin', bins);
  renderer.createBatch('prop-hydrant', hydrantGeometry(), Math.max(1, hydrants.length));
  fillInstances(renderer, 'prop-hydrant', hydrants);
  renderer.createBatch('prop-busstop', busStopGeometry(), Math.max(1, busStops.length));
  fillInstances(renderer, 'prop-busstop', busStops);

  // Cranes over the docks, boats at the pier, umbrellas on the beach,
  // billboards downtown, fountains in two parks.
  const cranes = [
    { x: -HALF + 8.5 * PITCH, z: -HALF + 2.5 * PITCH, ry: 0 },
    { x: -HALF + 9.5 * PITCH, z: -HALF + 5.5 * PITCH, ry: Math.PI / 2 },
    { x: -HALF + 8.5 * PITCH, z: -HALF + 6.5 * PITCH, ry: Math.PI },
  ];
  renderer.createBatch('prop-crane', craneGeometry(), cranes.length);
  fillInstances(renderer, 'prop-crane', cranes);

  const boats = [
    { x: HALF + 30, z: 292, ry: Math.PI / 2 },
    { x: HALF + 55, z: 306, ry: -Math.PI / 2 },
    { x: HALF + 70, z: 295, ry: Math.PI / 2 },
    { x: HALF + 15, z: 308, ry: Math.PI },
  ];
  renderer.createBatch('prop-boat', boatGeometry(), boats.length);
  fillInstances(renderer, 'prop-boat', boats);

  const umbrellas = [];
  for (let i = 0; i < 8; i++) {
    umbrellas.push({ x: -HALF + (i + 0.5) * 110, z: HALF + 22, ry: rng() * Math.PI * 2, color: rngPick(rng, [[0.95, 0.45, 0.30], [0.30, 0.70, 0.90], [0.95, 0.85, 0.25]]) });
  }
  renderer.createBatch('prop-umbrella', umbrellaGeometry(), umbrellas.length);
  fillInstances(renderer, 'prop-umbrella', umbrellas);

  const billboards = [];
  for (const [ix, iz, ry] of [[4, 2, 0], [5, 4, Math.PI / 2], [3, 5, 0], [6, 3, -Math.PI / 2], [4, 5, Math.PI], [6, 2, Math.PI / 2]]) {
    billboards.push({ x: streetCoord(ix) + 10, z: streetCoord(iz) + 10, ry });
  }
  renderer.createBatch('prop-billboard', billboardGeometry(), billboards.length);
  fillInstances(renderer, 'prop-billboard', billboards);

  const fountains = [];
  for (const block of city.blocks) {
    if (block.district === 'park' && fountains.length < 2) {
      fountains.push({ x: block.cx, z: block.cz, ry: 0 });
    }
  }
  renderer.createBatch('prop-fountain', fountainGeometry(), Math.max(1, fountains.length));
  fillInstances(renderer, 'prop-fountain', fountains);

  // Food carts (Tier 3, step 17): a night-market row by the kedai, a
  // couple at the ferry pier, two downtown. The kedai carts sit on the
  // sidewalk outside the shop, clear of the building wall.
  const carts = [];
  const kedai = city.landmark('kedai');
  if (kedai) {
    const [kx, kz] = [kedai.x, kedai.z];
    carts.push({ x: kx - 14, z: kz + 4, ry: Math.PI / 2, color: [0.95, 0.45, 0.30] });
    carts.push({ x: kx - 14, z: kz - 4, ry: Math.PI / 2, color: [0.30, 0.70, 0.90] });
    carts.push({ x: kx + 14, z: kz, ry: -Math.PI / 2, color: [0.95, 0.85, 0.25] });
  }
  carts.push({ x: -20, z: HALF + 14, ry: 0, color: [0.95, 0.45, 0.30] });
  carts.push({ x: 24, z: HALF + 14, ry: Math.PI, color: [0.30, 0.70, 0.90] });
  carts.push({ x: streetCoord(4) + 10, z: streetCoord(4) + 10, ry: 0, color: [0.95, 0.85, 0.25] });
  carts.push({ x: streetCoord(6) - 10, z: streetCoord(3) + 10, ry: Math.PI / 2, color: [0.95, 0.45, 0.30] });
  renderer.createBatch('prop-cart', cartGeometry(), carts.length);
  fillInstances(renderer, 'prop-cart', carts);
}

export function buildWorld(renderer, city) {
  const ground = buildGround(city);
  renderer.createBatch('ground', ground, 1);
  renderer.setInstances('ground', new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), new Float32Array([1, 1, 1, 1]), 1);
  const water = emptyGeometry();
  gridPlane(water, 0, -0.4, 0, 3200, 3200, 48, 48, [0.02, 0.12, 0.18]);
  renderer.setWaterMesh(water);
  const chunkBounds = buildChunks(renderer, city);
  buildProps(renderer, city);
  return { chunkBounds, groundBounds: ground.bounds };
}
