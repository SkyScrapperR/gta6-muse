// Pedestrians: sidewalk walkers who turn at intersections, cross the road
// on zebra crossings, flee from gunfire and speeding cars, and get knocked
// down (and sometimes drop cash) when a fast car hits them.
import { makeRng, rngInt, clamp, wrapAngle } from '../core/math.js';
import { randomPedOutfit } from './character.js';
import { streetCoord, HALF, PITCH, GRID, ROAD_W } from '../world/roads.js';

const SIDEWALK = ROAD_W / 2 + 2; // 9 m from the street centre line
const CARDINAL = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

export class PedestrianSystem {
  constructor(charSystem, city, seed = 31337) {
    this.charSystem = charSystem;
    this.city = city;
    this.rng = makeRng(seed);
    this.peds = []; // {c, mode, walkSpeed, turnT, crossTx, crossTz, fleeT, downT}
    this.onPedHit = null; // (ped, vehicle) => void
    this.knockedDown = 0;
  }

  spawn(count) {
    for (let i = 0; i < count; i++) {
      const vertical = this.rng() < 0.5;
      const street = rngInt(this.rng, 0, GRID);
      const along = -HALF + 40 + this.rng() * (2 * HALF - 80);
      const side = this.rng() < 0.5 ? -1 : 1;
      const x = vertical ? streetCoord(street) + side * SIDEWALK : along;
      const z = vertical ? along : streetCoord(street) + side * SIDEWALK;
      const heading = vertical ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const c = this.charSystem.add({
        x, z, heading,
        outfit: randomPedOutfit(this.rng),
        pose: 'walk',
        speed: 0,
      });
      this.peds.push({
        c,
        mode: 'walk',
        walkSpeed: 1.1 + this.rng() * 0.6,
        turnT: 1 + this.rng() * 3,
        crossTx: 0, crossTz: 0,
        fleeT: 0, downT: 0,
      });
    }
  }

  // Make every ped within radius run away from (x, z) for a few seconds.
  fleeFrom(x, z, radius = 25) {
    for (const p of this.peds) {
      if (p.mode === 'down') continue;
      const d = Math.hypot(p.c.x - x, p.c.z - z);
      if (d < radius) {
        p.mode = 'flee';
        p.fleeT = 3;
        p.c.heading = Math.atan2(p.c.x - x, p.c.z - z);
      }
    }
  }

  knockDown(ped, vehicle) {
    if (ped.mode === 'down') return 0;
    ped.mode = 'down';
    ped.downT = 4;
    ped.c.pose = 'dead';
    ped.c.speed = 0;
    this.knockedDown++;
    // A third of victims drop a little cash on the street.
    const dropped = this.rng() < 0.35 ? 10 + rngInt(this.rng, 0, 16) : 0;
    if (this.onPedHit) this.onPedHit(ped, vehicle, dropped);
    return dropped;
  }

  // Is the ped near an intersection (both coordinates close to a street)?
  nearIntersection(x, z) {
    const ix = (x + HALF) / PITCH;
    const iz = (z + HALF) / PITCH;
    const fx = Math.abs(ix - Math.round(ix));
    const fz = Math.abs(iz - Math.round(iz));
    return fx < 0.12 && fz < 0.12;
  }

  update(dt, time, vehicles) {
    void time;
    for (const p of this.peds) {
      const c = p.c;
      if (p.mode === 'down') {
        p.downT -= dt;
        if (p.downT <= 0) {
          p.mode = 'walk';
          c.pose = 'walk';
        }
        continue;
      }
      if (p.mode === 'flee') {
        p.fleeT -= dt;
        c.speed = 4.5;
        c.pose = 'run';
        if (p.fleeT <= 0) { p.mode = 'walk'; c.pose = 'walk'; }
      } else if (p.mode === 'cross') {
        c.speed = 1.6;
        c.pose = 'walk';
        const dx = p.crossTx - c.x, dz = p.crossTz - c.z;
        const d = Math.hypot(dx, dz);
        if (d < 1) {
          p.mode = 'walk';
        } else {
          c.heading = Math.atan2(dx, dz);
        }
      } else {
        c.speed = p.walkSpeed;
        c.pose = 'walk';
        p.turnT -= dt;
        if (p.turnT <= 0) {
          p.turnT = 2 + this.rng() * 4;
          if (this.nearIntersection(c.x, c.z)) {
            // At an intersection: sometimes cross the road, sometimes turn.
            if (this.rng() < 0.18) {
              // Cross to the sidewalk on the other side of the street.
              const alongZ = Math.abs(Math.sin(c.heading)) < 0.5;
              if (alongZ) {
                const streetX = streetCoord(Math.round((c.x + HALF) / PITCH));
                const s = c.x > streetX ? -1 : 1;
                p.crossTx = c.x + s * SIDEWALK * 2;
                p.crossTz = c.z;
              } else {
                const streetZ = streetCoord(Math.round((c.z + HALF) / PITCH));
                const s = c.z > streetZ ? -1 : 1;
                p.crossTx = c.x;
                p.crossTz = c.z + s * SIDEWALK * 2;
              }
              p.mode = 'cross';
            } else if (this.rng() < 0.5) {
              // Turn onto the crossing street.
              const turn = this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
              c.heading = wrapAngle(c.heading + turn);
            }
          }
        }
        // Map edge: turn back into the city.
        if (c.x < -HALF + 15) c.heading = Math.PI / 2;
        else if (c.x > HALF - 15) c.heading = -Math.PI / 2;
        else if (c.z < -HALF + 15) c.heading = Math.PI;
        else if (c.z > HALF - 15) c.heading = 0;
      }

      // Walk the heading, staying on the sidewalk line is implicit: peds
      // only ever walk along the four cardinal directions.
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      let nx = c.x + fx * c.speed * dt;
      let nz = c.z + fz * c.speed * dt;
      const resolved = this.city.collision.resolveCircle(nx, nz, 0.35);
      nx = resolved.x; nz = resolved.z;
      c.x = clamp(nx, -HALF + 8, HALF - 8);
      c.z = clamp(nz, -HALF + 8, HALF - 8);

      // Hit by a fast car?
      if (vehicles) {
        for (const v of vehicles.vehicles) {
          if (v.wreck || Math.abs(v.speed) < 3) continue;
          const d = Math.hypot(v.x - c.x, v.z - c.z);
          if (d < v.type.len * 0.5 + 0.4) {
            this.knockDown(p, v);
            break;
          }
        }
      }
    }
  }
}
