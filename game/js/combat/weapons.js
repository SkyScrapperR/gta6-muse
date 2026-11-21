// Weapons: data and hitscan shooting. Fists and the Kobra 9 pistol in
// Tier 1; the Wasp SMG and Thunder shotgun arrive in Tier 2 with their
// own models, but their stats live here so the AI can already use them.
import { box, emptyGeometry } from '../engine/mesh.js';
import { mat4TRS, clamp } from '../core/math.js';

export const WEAPONS = {
  fists: {
    name: 'Fists', damage: 12, range: 2.2, rate: 0.45, mag: 0,
    spread: 0, reload: 0, pellets: 1, auto: false,
  },
  kobra: {
    name: 'Kobra 9', damage: 18, range: 70, rate: 0.28, mag: 12,
    spread: 0.012, hipSpread: 0.045, reload: 1.2, pellets: 1, auto: false,
  },
  wasp: {
    name: 'Wasp SMG', damage: 12, range: 55, rate: 0.09, mag: 32,
    spread: 0.02, hipSpread: 0.06, reload: 1.6, pellets: 1, auto: true,
  },
  thunder: {
    name: 'Thunder 12', damage: 9, range: 28, rate: 0.9, mag: 6,
    spread: 0.055, hipSpread: 0.09, reload: 2.2, pellets: 8, auto: false,
  },
};

// Ray vs sphere. Returns the distance along the ray, or -1 on a miss.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  return tca - thc;
}

export class WeaponSystem {
  constructor(renderer, city, vehicles, charSystem) {
    this.renderer = renderer;
    this.city = city;
    this.vehicles = vehicles;
    this.charSystem = charSystem;
    // Bullet-hole decals: thin dark boxes stuck to walls, ring buffer.
    const geo = emptyGeometry();
    box(geo, 0, 0, 0, 0.28, 0.28, 0.02, [0.05, 0.05, 0.05]);
    this.decalBatch = renderer.createBatch('decal', geo, 128);
    this.decalMatrices = new Float32Array(128 * 16);
    this.decalColors = new Float32Array(128 * 4);
    this.decalCount = 0;
    this.decalCursor = 0;
    this.onCharacterHit = null; // (char, damage, shooter) => void
    this.onPlayerHit = null; // (damage, shooter) => void
    this.onVehicleHit = null; // (vehicle, damage, shooter) => void
    this.heli = null; // Rajawali (Tier 3), set by main.js
    this.onHelicopterHit = null; // (heli, damage, shooter) => void
  }

  // One hitscan shot. Returns {kind, point, dist, target} where kind is
  // 'wall' | 'char' | 'vehicle' | 'heli' | 'player' | 'none'.
  fireHitscan(origin, dir, range, damage, shooter, opts = {}) {
    const [ox, oy, oz] = origin;
    const [dx, dy, dz] = dir;
    let bestDist = range;
    let best = { kind: 'none', point: [ox + dx * range, oy + dy * range, oz + dz * range], dist: range, target: null };

    // Walls: 2D raycast, but only if the bullet is below the roofline.
    const wall = this.city.collision.raycast(ox, oz, dx, dz, range);
    if (wall) {
      const wy = oy + dy * wall.dist;
      if (wy <= wall.box.h + 0.5) {
        bestDist = wall.dist;
        best = { kind: 'wall', point: [ox + dx * wall.dist, wy, oz + dz * wall.dist], dist: wall.dist, target: wall.box };
      }
    }

    // Characters (peds, cops, gang). The shooter's own character is skipped,
    // and so is anyone on the shooter's side (no gang-on-gang friendly fire).
    const shooterFaction = shooter?.char?.faction;
    for (const c of this.charSystem.characters) {
      if (c === shooter?.char) continue;
      if (shooterFaction && c.faction === shooterFaction) continue;
      if (c.pose === 'dead') continue;
      const t = raySphere(ox, oy, oz, dx, dy, dz, c.x, c.y + 1.1, c.z, 0.55);
      if (t > 0 && t < bestDist) {
        bestDist = t;
        best = { kind: 'char', point: [ox + dx * t, oy + dy * t, oz + dz * t], dist: t, target: c };
      }
    }

    // Vehicles: 2D circle test plus a height check at the impact point.
    for (const v of this.vehicles.vehicles) {
      if (v.wreck) continue;
      const t = raySphere(ox, oy, oz, dx, dy, dz, v.x, 0.8, v.z, v.type.len * 0.45);
      if (t > 0 && t < bestDist) {
        const hy = oy + dy * t;
        if (hy < 1.9) {
          bestDist = t;
          best = { kind: 'vehicle', point: [ox + dx * t, hy, oz + dz * t], dist: t, target: v };
        }
      }
    }

    // Rajawali (Tier 3): a big slow target ~40 m up. The rotor disc
    // makes the sphere generous — hitting the heli feels fair, and the
    // damage() hook + falling logic already exist on the heli.
    const h = this.heli;
    if (h && h.active && !h.shotDown) {
      const t = raySphere(ox, oy, oz, dx, dy, dz, h.x, h.y, h.z, 3.5);
      if (t > 0 && t < bestDist) {
        bestDist = t;
        best = { kind: 'heli', point: [ox + dx * t, oy + dy * t, oz + dz * t], dist: t, target: h };
      }
    }

    // The player (for AI shooters).
    const p = opts.player;
    if (p && !p.dead && shooter !== p) {
      const t = raySphere(ox, oy, oz, dx, dy, dz, p.x, p.y + 1.2, p.z, 0.55);
      if (t > 0 && t < bestDist) {
        bestDist = t;
        best = { kind: 'player', point: [ox + dx * t, oy + dy * t, oz + dz * t], dist: t, target: p };
      }
    }

    if (best.kind === 'char' && this.onCharacterHit && !opts.dry) this.onCharacterHit(best.target, damage, shooter);
    if (best.kind === 'vehicle' && this.onVehicleHit && !opts.dry) this.onVehicleHit(best.target, damage, shooter);
    if (best.kind === 'heli' && this.onHelicopterHit && !opts.dry) this.onHelicopterHit(best.target, damage, shooter);
    if (best.kind === 'player' && this.onPlayerHit && !opts.dry) this.onPlayerHit(damage, shooter);
    return best;
  }

  // A bullet hole on the wall at the hit point, facing back along the shot.
  addDecal(point, dir) {
    const i = this.decalCursor;
    this.decalCursor = (this.decalCursor + 1) % 128;
    this.decalCount = Math.min(this.decalCount + 1, 128);
    const yaw = Math.atan2(-dir[0], -dir[2]);
    const pitch = Math.asin(clamp(-dir[1], -1, 1));
    const m = mat4TRS(point[0] - dir[0] * 0.03, point[1], point[2] - dir[2] * 0.03, yaw, pitch, 0, 1, 1, 1);
    this.decalMatrices.set(m, i * 16);
    this.decalColors[i * 4] = 1;
    this.decalColors[i * 4 + 1] = 1;
    this.decalColors[i * 4 + 2] = 1;
    this.decalColors[i * 4 + 3] = 1;
  }

  drawDecals() {
    if (this.decalCount === 0) return;
    this.renderer.setInstances('decal', this.decalMatrices, this.decalColors, this.decalCount);
    this.renderer.drawBatch('decal');
  }
}
