// The road graph: a grid of streets over the city, with lanes, traffic
// lights, and routing. Selara Bay drives on the left.
//
// Streets run along x = -520 + i * 104 and z = -520 + j * 104 for i, j in
// 0..10 (11 streets each way). Intersections are graph nodes; each edge
// carries two lanes, one per direction, offset 3.5 m from the centreline.
// A* over the 121 intersections gives GPS routes, police chases and mission
// driving directions.

import { makeRng } from '../core/math.js';

export const BLOCK = 90;
export const ROAD_W = 14;
export const PITCH = BLOCK + ROAD_W; // 104
export const GRID = 10; // blocks per side
export const HALF = (GRID * PITCH) / 2; // 520
export const LANE_OFFSET = 3.5;

export function streetCoord(i) {
  return -HALF + i * PITCH;
}

export function nodeId(ix, iz) {
  return iz * (GRID + 1) + ix;
}

export function nodePos(id) {
  const ix = id % (GRID + 1);
  const iz = Math.floor(id / (GRID + 1));
  return [streetCoord(ix), streetCoord(iz)];
}

export function nearestNode(x, z) {
  const ix = Math.max(0, Math.min(GRID, Math.round((x + HALF) / PITCH)));
  const iz = Math.max(0, Math.min(GRID, Math.round((z + HALF) / PITCH)));
  return nodeId(ix, iz);
}

// Neighbours of an intersection (up to four, skipping the city edge).
export function nodeNeighbours(id) {
  const ix = id % (GRID + 1);
  const iz = Math.floor(id / (GRID + 1));
  const out = [];
  if (ix > 0) out.push(nodeId(ix - 1, iz));
  if (ix < GRID) out.push(nodeId(ix + 1, iz));
  if (iz > 0) out.push(nodeId(ix, iz - 1));
  if (iz < GRID) out.push(nodeId(ix, iz + 1));
  return out;
}

function heuristic(a, b) {
  const [ax, az] = nodePos(a);
  const [bx, bz] = nodePos(b);
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

// A* over intersections. Returns a list of node ids from start to goal.
export function findRoute(start, goal) {
  if (start === goal) return [start];
  const open = new Map([[start, heuristic(start, goal)]]);
  const came = new Map();
  const cost = new Map([[start, 0]]);
  while (open.size > 0) {
    let current = -1;
    let best = Infinity;
    for (const [id, f] of open) {
      if (f < best) { best = f; current = id; }
    }
    if (current === goal) {
      const path = [current];
      while (came.has(current)) {
        current = came.get(current);
        path.unshift(current);
      }
      return path;
    }
    open.delete(current);
    for (const nb of nodeNeighbours(current)) {
      const [cx, cz] = nodePos(current);
      const [nx, nz] = nodePos(nb);
      const step = Math.abs(cx - nx) + Math.abs(cz - nz);
      const nc = (cost.get(current) ?? Infinity) + step;
      if (nc < (cost.get(nb) ?? Infinity)) {
        cost.set(nb, nc);
        came.set(nb, current);
        open.set(nb, nc + heuristic(nb, goal));
      }
    }
  }
  return [start, goal];
}

// Expand a node route into drivable waypoints with lane offsets for
// left-hand traffic: on a straight run the car keeps to the left of the
// direction of travel.
export function routeWaypoints(route) {
  const points = [];
  for (let i = 0; i < route.length - 1; i++) {
    const [ax, az] = nodePos(route[i]);
    const [bx, bz] = nodePos(route[i + 1]);
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    // Left of travel direction (facing along the edge).
    const lx = (-dz / len) * LANE_OFFSET;
    const lz = (dx / len) * LANE_OFFSET;
    if (i === 0) points.push([ax + lx, az + lz]);
    points.push([bx + lx, bz + lz]);
  }
  return points;
}

// Traffic lights: one per intersection, cycling NS green / EW green with a
// yellow beat. Phase is seeded per intersection so the city doesn't flip
// all at once.
export class TrafficLights {
  constructor(seed) {
    const rng = makeRng(seed);
    this.phase = new Float32Array((GRID + 1) * (GRID + 1));
    for (let i = 0; i < this.phase.length; i++) this.phase[i] = rng() * 16;
    this.cycle = 16; // seconds per full cycle
  }

  // 'ns' means the north-south road has green, 'ew' the east-west road.
  // Returns 'green' | 'yellow' | 'red' for the given travel axis.
  state(node, axis, time) {
    const t = (time + this.phase[node]) % this.cycle;
    const nsGreen = t < 7;
    const nsYellow = t >= 7 && t < 8;
    if (axis === 'ns') return nsGreen ? 'green' : nsYellow ? 'yellow' : 'red';
    const ewGreen = t >= 8 && t < 15;
    const ewYellow = t >= 15 && t < 16;
    return ewGreen ? 'green' : ewYellow ? 'yellow' : 'red';
  }

  // Is the light green for driving from node a to node b right now?
  canGo(a, b, time) {
    const [ax, az] = nodePos(a);
    const [bx, bz] = nodePos(b);
    const axis = ax === bx ? 'ns' : 'ew';
    return this.state(a, axis, time) !== 'red';
  }
}

// Snap a world point to the nearest lane centre on the nearest street.
export function snapToRoad(x, z) {
  const ix = Math.round((x + HALF) / PITCH);
  const iz = Math.round((z + HALF) / PITCH);
  const sx = streetCoord(Math.max(0, Math.min(GRID, ix)));
  const sz = streetCoord(Math.max(0, Math.min(GRID, iz)));
  const dx = Math.abs(x - sx);
  const dz = Math.abs(z - sz);
  if (dx <= dz) return [sx, z];
  return [x, sz];
}
