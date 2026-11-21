// Police: the wanted system. Crimes raise stars; cop cars chase and ram,
// drop foot cops who chase Kai on foot; at 1 star they arrest (CUFFED),
// at 2+ they punch. Break line of sight long enough and the heat cools
// one star at a time. Cops run red lights.
import {
  findRoute, routeWaypoints, nearestNode, nodePos, HALF,
} from '../world/roads.js';
import { makeRng, clamp } from '../core/math.js';
import { OUTFITS } from '../entities/character.js';

export class PoliceSystem {
  constructor(vehicles, charSystem, city, player, seed = 99) {
    this.vehicles = vehicles;
    this.charSystem = charSystem;
    this.city = city;
    this.player = player;
    this.rng = makeRng(seed);
    this.wanted = 0;
    this.loseT = 0;
    this.time = 0;
    this.searchCenter = null; // last seen position, for the minimap
    this.huntTarget = null; // where the cops drive: last seen, not live pos
    this.copCars = []; // {v, repathT, ramT}
    this.footCops = []; // {c, punchT}
    this.dropT = 0;
    this.onArrest = null;
    this.heli = null; // Rajawali (Tier 2), set by main.js
    this.roadblock = null; // Tier 3: {cars: [v, v], x, z} sealing the road ahead
    this.roadblockT = 0; // cooldown before the next block forms
    this.onRoadblock = null; // (x, z) => void, wired by main.js
  }

  addWanted(n) {
    if (this.wanted >= 5) return;
    this.wanted = Math.min(5, this.wanted + n);
    this.loseT = 0;
    this.searchCenter = [this.player.x, this.player.z];
  }

  clearWanted() {
    this.wanted = 0;
    this.loseT = 0;
    this.searchCenter = null;
  }

  // A node 80-150 m from the player, for spawning a response unit.
  spawnNodeNearPlayer() {
    for (let tries = 0; tries < 12; tries++) {
      const x = this.player.x + (this.rng() * 2 - 1) * 150;
      const z = this.player.z + (this.rng() * 2 - 1) * 150;
      const d = Math.hypot(x - this.player.x, z - this.player.z);
      if (d < 80 || d > 160) continue;
      return nearestNode(clamp(x, -HALF + 20, HALF - 20), clamp(z, -HALF + 20, HALF - 20));
    }
    return nearestNode(this.player.x + 100, this.player.z);
  }

  spawnCopCar() {
    const node = this.spawnNodeNearPlayer();
    const [nx, nz] = nodePos(node);
    const heading = Math.atan2(this.player.x - nx, this.player.z - nz);
    const v = this.vehicles.add('garuda', nx, nz, heading);
    v.parked = false;
    this.copCars.push({ v, repathT: 0, ramT: 0 });
    this.repathCop(this.copCars[this.copCars.length - 1]);
    return v;
  }

  repathCop(c) {
    const from = nearestNode(c.v.x, c.v.z);
    // Hunt the last place Kai was SEEN, never his live position: the
    // spec says police update your position only with line of sight.
    const [hx, hz] = this.huntTarget ?? [this.player.x, this.player.z];
    const to = nearestNode(hx, hz);
    const route = findRoute(from, to);
    if (route.length >= 2) {
      c.v.route = routeWaypoints(route);
      c.v.routeIndex = 0;
    }
    c.repathT = 2;
  }

  spawnFootCop(x, z) {
    const c = this.charSystem.add({
      x, z,
      heading: Math.atan2(this.player.x - x, this.player.z - z),
      outfit: OUTFITS.cop,
      pose: 'run',
      speed: 0,
    });
    this.footCops.push({ c, punchT: 0 });
    return c;
  }

  removeCopCar(i) {
    const c = this.copCars[i];
    this.vehicles.remove(c.v);
    this.copCars.splice(i, 1);
  }

  removeFootCop(i) {
    const c = this.footCops[i];
    this.charSystem.remove(c.c);
    this.footCops.splice(i, 1);
  }

  // Roadblock (Tier 3): at 3+ stars the police seal the road ahead of
  // Kai with two parked Garudas across it and a foot cop on each side.
  // The cars are parked, not patrols — they sit in `roadblock`, not in
  // `copCars`, so they never chase and never count toward the patrol
  // cap. The block holds until the heat is gone (or both cars are
  // wrecked — ramming through is a valid way out).
  spawnRoadblock() {
    const p = this.player;
    // Ahead of Kai, along his heading, snapped to the nearest road
    // node so the cars sit on the road, not in a building.
    const heading = p.inCar ? p.inCar.heading : p.heading;
    const ax = p.x + Math.sin(heading) * 70;
    const az = p.z + Math.cos(heading) * 70;
    const node = nearestNode(clamp(ax, -HALF + 20, HALF - 20), clamp(az, -HALF + 20, HALF - 20));
    const [nx, nz] = nodePos(node);
    // Face the player: the cars nose toward the incoming traffic, side
    // by side across the road.
    const h = Math.atan2(p.x - nx, p.z - nz);
    const rx = Math.cos(h), rz = -Math.sin(h);
    const cars = [];
    for (const side of [-2.4, 2.4]) {
      const v = this.vehicles.add('garuda', nx + rx * side, nz + rz * side, h);
      v.parked = true;
      cars.push(v);
    }
    for (const side of [-5, 5]) {
      this.spawnFootCop(nx + rx * side, nz + rz * side);
    }
    this.roadblock = { cars, x: nx, z: nz };
    if (this.onRoadblock) this.onRoadblock(nx, nz);
  }

  removeRoadblock() {
    if (!this.roadblock) return;
    for (const v of this.roadblock.cars) this.vehicles.remove(v);
    this.roadblock = null;
    this.roadblockT = 20;
  }

  update(dt, time) {
    this.time = time;
    const p = this.player;

    if (this.wanted > 0 && !p.dead) {
      // Line of sight FIRST, on the current positions: do the cops see
      // Kai right now? Everything below hunts the answer, not Kai.
      // Sight radii are short on purpose: a cop car a block away cannot
      // keep eyes on Kai through the streets, so hopping between covered
      // Bukit spots actually breaks the chase and the heat can cool.
      let seen = false;
      for (const c of this.copCars) {
        if (Math.hypot(p.x - c.v.x, p.z - c.v.z) > 60) continue;
        if (this.city.collision.hasLineOfSight(c.v.x, c.v.z, p.x, p.z)) { seen = true; break; }
      }
      if (!seen) {
        for (const fc of this.footCops) {
          if (Math.hypot(p.x - fc.c.x, p.z - fc.c.z) > 35) continue;
          if (this.city.collision.hasLineOfSight(fc.c.x, fc.c.z, p.x, p.z)) { seen = true; break; }
        }
      }
      if (seen) {
        this.loseT = 0;
        this.searchCenter = [p.x, p.z];
      } else {
        this.loseT += dt;
        if (this.loseT > 10 + this.wanted * 2) {
          this.wanted--;
          this.loseT = 0;
          if (this.wanted === 0) this.searchCenter = null;
        }
      }
      // Cops navigate to the last place they saw Kai. While he is seen
      // that is his live position; once he breaks line of sight they
      // drive to the stale spot and search there — which is what makes
      // hiding actually lose the heat.
      const hunt = seen ? [p.x, p.z] : (this.searchCenter ?? [p.x, p.z]);
      this.huntTarget = hunt;

      // Keep the right number of patrol cars on the street.
      const wantCars = Math.min(1 + Math.floor(this.wanted / 2), 4);
      while (this.copCars.length < wantCars) this.spawnCopCar();

      // Cop cars: chase, ram, and drop foot cops.
      for (let i = this.copCars.length - 1; i >= 0; i--) {
        const c = this.copCars[i];
        const v = c.v;
        if (v.wreck) { this.removeCopCar(i); continue; }
        const dPlayer = Math.hypot(p.x - v.x, p.z - v.z);
        c.repathT -= dt;
        if (dPlayer < 14 && p.inCar) {
          // Ram mode: aim straight at the player's car.
          v.route = [[p.x, p.z]];
          v.routeIndex = 0;
          c.repathT = 0.5;
        } else if (c.repathT <= 0) {
          this.repathCop(c);
        }
        v.autopilot(dt, null, time);
        // Grinding against the player's car damages it.
        if (p.inCar && dPlayer < 4.5) {
          p.inCar.damage(9 * dt);
        }
        // Drop a foot cop when Kai is on foot and close by.
        this.dropT -= dt;
        if (!p.inCar && dPlayer < 12 && this.footCops.length < 2 + this.wanted && this.dropT <= 0) {
          const [dx, dz] = v.doorPos();
          this.spawnFootCop(dx, dz);
          this.dropT = 1.5;
        }
        // Despawn a cop car that fell far behind.
        if (dPlayer > 400) this.removeCopCar(i);
      }

      // Foot cops: run Kai down — or to the last place they saw him.
      for (let i = this.footCops.length - 1; i >= 0; i--) {
        const fc = this.footCops[i];
        const c = fc.c;
        const tx = seen ? p.x : hunt[0];
        const tz = seen ? p.z : hunt[1];
        const dx = tx - c.x, dz = tz - c.z;
        const d = Math.hypot(dx, dz);
        const dPlayer = Math.hypot(p.x - c.x, p.z - c.z);
        if (dPlayer > 120) { this.removeFootCop(i); continue; }
        c.heading = Math.atan2(dx, dz);
        if (d > 1.6) {
          c.speed = 5;
          c.pose = 'run';
          const nx = c.x + Math.sin(c.heading) * c.speed * dt;
          const nz = c.z + Math.cos(c.heading) * c.speed * dt;
          const resolved = this.city.collision.resolveCircle(nx, nz, 0.4);
          c.x = resolved.x; c.z = resolved.z;
        } else if (!p.inCar && dPlayer <= 1.6) {
          fc.punchT -= dt;
          if (this.wanted === 1) {
            if (this.onArrest) this.onArrest();
          } else if (fc.punchT <= 0) {
            fc.punchT = 1;
            c.punchT = 0.4;
            c.pose = 'punch';
            p.damage(6);
          }
        } else {
          // Reached the search spot and Kai is not here: stand and look.
          c.speed = 0;
          c.pose = 'idle';
        }
      }

      // Roadblocks (Tier 3): at 3+ stars the police seal the road
      // ahead. If both block cars are wrecked the block is breached
      // and a new one may form after the cooldown.
      this.roadblockT -= dt;
      if (this.wanted >= 3 && !this.roadblock && this.roadblockT <= 0) {
        this.spawnRoadblock();
      } else if (this.roadblock && this.roadblock.cars.every((v) => v.wreck)) {
        this.roadblock = null;
        this.roadblockT = 15;
      }
    } else {
      // No heat: units drive off and stand down — and the roadblock
      // packs up.
      if (this.roadblock) this.removeRoadblock();
      for (let i = this.copCars.length - 1; i >= 0; i--) {
        const c = this.copCars[i];
        const dPlayer = Math.hypot(p.x - c.v.x, p.z - c.v.z);
        if (dPlayer > 250) { this.removeCopCar(i); continue; }
        if (!c.v.route || c.v.routeIndex >= c.v.route.length) {
          const from = nearestNode(c.v.x, c.v.z);
          const to = nearestNode(c.v.x + (this.rng() * 2 - 1) * 300, c.v.z + (this.rng() * 2 - 1) * 300);
          const route = findRoute(from, to);
          if (route.length >= 2) { c.v.route = routeWaypoints(route); c.v.routeIndex = 0; }
        }
        c.v.autopilot(dt, null, time);
      }
      for (let i = this.footCops.length - 1; i >= 0; i--) {
        const fc = this.footCops[i];
        if (Math.hypot(p.x - fc.c.x, p.z - fc.c.z) > 100) this.removeFootCop(i);
      }
    }
    // Rajawali (Tier 2): the helicopter joins at 3+ stars and leaves
    // when the heat is gone. Its own update (follow, spotlight, fire)
    // runs from main.js.
    if (this.heli) {
      // A heli that was flying away comes straight back when the heat
      // returns — otherwise it climbs to 130 m first (~40 s at 2 fps)
      // and Kai fights 4 stars with no heli overhead.
      if (this.wanted >= 3 && (!this.heli.active || this.heli.leaving)) this.heli.spawn(p.x, p.z);
      else if (this.wanted === 0 && this.heli.active && !this.heli.leaving) this.heli.despawn();
    }
  }
}
