// Traffic: AI cars that drive the road graph on the left-hand side, obey
// traffic lights, brake for the car ahead, honk when the player blocks the
// road, and re-route when they reach their destination or get stuck.
import {
  findRoute, routeWaypoints, nearestNode, nodePos, HALF,
} from '../world/roads.js';
import { makeRng } from '../core/math.js';

const TRAFFIC_TYPES = ['kancil', 'merpati', 'bajak', 'taxi', 'vesper'];

export class TrafficManager {
  constructor(vehicles, lights, city, seed = 777) {
    this.vehicles = vehicles;
    this.lights = lights;
    this.city = city;
    this.rng = makeRng(seed);
    this.cars = []; // {v, stuckT, lastX, lastZ, checkT, honkT, honk}
  }

  randomNode() {
    const x = -HALF + 40 + this.rng() * (2 * HALF - 80);
    const z = -HALF + 40 + this.rng() * (2 * HALF - 80);
    return nearestNode(x, z);
  }

  spawn(count) {
    for (let i = 0; i < count; i++) {
      const from = this.randomNode();
      const to = this.randomNode();
      const route = findRoute(from, to);
      if (route.length < 2) continue;
      const pts = routeWaypoints(route);
      const heading = Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
      const v = this.vehicles.add(TRAFFIC_TYPES[i % TRAFFIC_TYPES.length], pts[0][0], pts[0][1], heading);
      v.parked = false;
      v.route = pts;
      v.routeIndex = 1;
      this.cars.push({ v, stuckT: 0, lastX: v.x, lastZ: v.z, checkT: 0, honkT: 0, honk: false });
    }
  }

  retarget(c) {
    const from = nearestNode(c.v.x, c.v.z);
    const to = this.randomNode();
    const route = findRoute(from, to);
    if (route.length < 2) return;
    const pts = routeWaypoints(route);
    c.v.route = pts;
    c.v.routeIndex = 0;
    c.stuckT = 0;
    c.lastX = c.v.x;
    c.lastZ = c.v.z;
  }

  // True when the car is rolling toward a red light at the next intersection.
  redAhead(v, time) {
    const node = nearestNode(v.x, v.z);
    const [nx, nz] = nodePos(node);
    const dx = nx - v.x, dz = nz - v.z;
    const d = Math.hypot(dx, dz);
    if (d > 16 || d < 0.01) return false;
    const [fx, fz] = v.forward();
    if ((dx * fx + dz * fz) / d <= 0.2) return false; // driving away from it
    // The street the car is on: closer in x than in z to the node = NS street.
    const axis = Math.abs(v.x - nx) < Math.abs(v.z - nz) ? 'ns' : 'ew';
    return this.lights.state(node, axis, time) === 'red';
  }

  // True when something slower is directly ahead (another car, or Kai on foot).
  blockedAhead(v, player) {
    const [fx, fz] = v.forward();
    for (const o of this.vehicles.vehicles) {
      if (o === v || o.wreck) continue;
      const dx = o.x - v.x, dz = o.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d > 12 || d < 0.01) continue;
      if ((dx * fx + dz * fz) / d < 0.85) continue;
      if (o.speed < v.speed + 1) return o;
    }
    if (player && !player.inCar && !player.dead) {
      const dx = player.x - v.x, dz = player.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d < 10 && d > 0.01 && (dx * fx + dz * fz) / d > 0.85) return player;
    }
    return null;
  }

  update(dt, time, player) {
    for (const c of this.cars) {
      const v = c.v;
      if (v.wreck) continue;
      if (!v.route || v.routeIndex >= v.route.length) { this.retarget(c); continue; }

      const blocker = this.blockedAhead(v, player);
      v.stopForLight = this.redAhead(v, time) || !!blocker;
      // Honk when the player sits in the way for a while.
      if (blocker === player || (blocker && blocker === player?.inCar)) {
        c.honkT += dt;
        v.honk = c.honkT > 2;
      } else {
        c.honkT = 0;
        v.honk = false;
      }

      v.autopilot(dt, this.lights, time);

      // Deadlock breaker: if the car barely moved in 2 s and is not waiting
      // at a light, give it a fresh route.
      c.checkT += dt;
      if (c.checkT >= 2) {
        const moved = Math.hypot(v.x - c.lastX, v.z - c.lastZ);
        c.lastX = v.x; c.lastZ = v.z;
        c.checkT = 0;
        if (moved < 1 && v.speed < 0.5) {
          c.stuckT += 2;
          if (c.stuckT >= 4 && !v.stopForLight) this.retarget(c);
        } else {
          c.stuckT = 0;
        }
      }
    }
  }
}
