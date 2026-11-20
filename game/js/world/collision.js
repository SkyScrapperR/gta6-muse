// Collision: a spatial hash grid of building AABBs, plus circle resolution
// for players, cars and pedestrians, and 2D raycasts for shooting and for
// police line-of-sight. Everything is axis-aligned, so the tests are cheap
// and exact. Heights are handled by the caller (a ray only counts a building
// when the shooter and target are both below its roof, which in this city
// they almost always are).

const CELL = 40;

function cellKey(cx, cz) {
  return cx + ',' + cz;
}

export class Collision {
  constructor() {
    this.boxes = []; // {x0, z0, x1, z1, h, solid}
    this.grid = new Map();
  }

  addBox(x0, z0, x1, z1, h, solid = true) {
    const id = this.boxes.length;
    this.boxes.push({ x0, z0, x1, z1, h, solid });
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const key = cellKey(cx, cz);
        let list = this.grid.get(key);
        if (!list) { list = []; this.grid.set(key, list); }
        list.push(id);
      }
    }
    return id;
  }

  // Boxes overlapping a circle, de-duplicated.
  nearby(x, z, r) {
    const seen = new Set();
    const out = [];
    const cx0 = Math.floor((x - r) / CELL), cx1 = Math.floor((x + r) / CELL);
    const cz0 = Math.floor((z - r) / CELL), cz1 = Math.floor((z + r) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.grid.get(cellKey(cx, cz));
        if (!list) continue;
        for (const id of list) {
          if (seen.has(id)) continue;
          seen.add(id);
          out.push(this.boxes[id]);
        }
      }
    }
    return out;
  }

  pointInside(x, z) {
    for (const b of this.nearby(x, z, 1)) {
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b;
    }
    return null;
  }

  // Push a circle out of every solid box it overlaps. Returns the corrected
  // position [x, z] and whether a hit happened.
  resolveCircle(x, z, r) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.nearby(x, z, r + 1)) {
        if (!b.solid) continue;
        const nx = Math.max(b.x0, Math.min(x, b.x1));
        const nz = Math.max(b.z0, Math.min(z, b.z1));
        const dx = x - nx;
        const dz = z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        moved = true;
        if (d2 > 0.000001) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // Centre is inside the box: push out along the smallest overlap.
          const left = x - b.x0, right = b.x1 - x;
          const top = z - b.z0, bottom = b.z1 - z;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = b.x0 - r;
          else if (m === right) x = b.x1 + r;
          else if (m === top) z = b.z0 - r;
          else z = b.z1 + r;
        }
      }
      if (!moved) break;
    }
    return { x, z, hit };
  }

  // 2D raycast against building boxes. Returns {dist, box} for the first
  // hit within maxDist, or null. Used for bullets and police sight lines.
  raycast(x0, z0, dx, dz, maxDist) {
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    let best = null;
    // Step the ray in 2 m increments, testing nearby boxes at each step.
    const steps = Math.ceil(maxDist / 2);
    for (let i = 1; i <= steps; i++) {
      const d = i * 2;
      const x = x0 + dx * d;
      const z = z0 + dz * d;
      for (const b of this.nearby(x, z, 2)) {
        if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) {
          if (!best || d < best.dist) best = { dist: d, box: b };
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Is there a clear line of sight between two ground points?
  hasLineOfSight(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return true;
    return this.raycast(ax, az, dx, dz, dist) === null;
  }
}
