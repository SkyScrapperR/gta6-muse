// Vehicles: beveled low-poly cars with arcade physics. Each type is one
// merged body geometry (beveled body, tapered cabin, grille, mirrors, door
// seams, tinted glass, emissive lights) drawn instanced per type, plus one
// shared wheel batch (wheels spin) and one door batch (doors swing open
// when a driver gets in or out).
//
// Arcade physics: throttle/brake/reverse, speed-sensitive steering,
// handbrake drift, mass-based car-car collisions, building collisions.
// Parked cars never roll. Damage runs smoke -> fire -> explosion -> wreck.

import {
  box, cylinder, taperBox, emptyGeometry, merge, transformGeometry,
} from '../engine/mesh.js';
import {
  mat4TRS, mat4Multiply, mat4RotateY, mat4RotateZ, clamp, wrapAngle,
} from '../core/math.js';

const MAX_VEHICLES = 64;

// length, width, body height, cabin length, top speed (m/s), accel, mass.
export const VEHICLE_TYPES = {
  kancil: { name: 'Kancil', len: 3.6, wid: 1.7, bodyH: 0.62, cabLen: 2.0, top: 26, accel: 11, mass: 1.0, color: [0.75, 0.30, 0.25] },
  merpati: { name: 'Merpati', len: 4.6, wid: 1.85, bodyH: 0.68, cabLen: 2.4, top: 32, accel: 13, mass: 1.2, color: [0.55, 0.60, 0.68] },
  taxi: { name: 'Selara Taxi', len: 4.6, wid: 1.85, bodyH: 0.68, cabLen: 2.4, top: 32, accel: 13, mass: 1.2, color: [0.05, 0.55, 0.55], taxi: true },
  vesper: { name: 'Vesper GT', len: 4.4, wid: 1.95, bodyH: 0.50, cabLen: 2.0, top: 44, accel: 17, mass: 1.1, color: [0.90, 0.75, 0.10], spoiler: true },
  bajak: { name: 'Bajak', len: 5.0, wid: 2.0, bodyH: 1.05, cabLen: 2.6, top: 28, accel: 10, mass: 1.6, color: [0.70, 0.70, 0.72] },
  bison: { name: 'Bison', len: 6.4, wid: 2.2, bodyH: 0.80, cabLen: 1.6, top: 24, accel: 8, mass: 2.4, color: [0.35, 0.40, 0.45], truck: true },
  garuda: { name: 'Garuda Patrol', len: 4.6, wid: 1.85, bodyH: 0.68, cabLen: 2.4, top: 36, accel: 15, mass: 1.3, color: [0.90, 0.90, 0.92], police: true },
};

function buildBodyGeometry(typeKey) {
  const t = VEHICLE_TYPES[typeKey];
  const g = emptyGeometry();
  const L = t.len, W = t.wid;
  const bodyY = 0.55;
  // Beveled body: wide at the bottom, narrower at the belt line.
  taperBox(g, 0, bodyY, 0, W, L, W - 0.18, L - 0.5, t.bodyH, t.color);
  // Cabin: tapered glasshouse, slightly rear of centre.
  const cabY = bodyY + t.bodyH / 2 + 0.28;
  const cabZ = t.truck ? L / 2 - t.cabLen / 2 - 0.3 : -0.25;
  taperBox(g, 0, cabY, cabZ, W - 0.25, t.cabLen, W - 0.45, t.cabLen - 0.5, 0.55, [0.08, 0.10, 0.14]);
  if (t.truck) {
    // Box cargo behind the cab.
    box(g, 0, 1.35, -L / 2 + 1.9, W - 0.1, 2.1, 3.6, [0.75, 0.75, 0.78]);
  }
  // Grille + headlights (front, +z) and taillights (rear).
  box(g, 0, bodyY - 0.05, L / 2 - 0.02, W * 0.5, 0.16, 0.08, [0.12, 0.12, 0.14]);
  box(g, -W * 0.28, bodyY + 0.05, L / 2 - 0.01, 0.42, 0.14, 0.06, [0.15, 0.15, 0.16], [1.0, 0.95, 0.75]);
  box(g, W * 0.28, bodyY + 0.05, L / 2 - 0.01, 0.42, 0.14, 0.06, [0.15, 0.15, 0.16], [1.0, 0.95, 0.75]);
  box(g, -W * 0.28, bodyY + 0.05, -L / 2 + 0.01, 0.42, 0.14, 0.06, [0.15, 0.15, 0.16], [0.9, 0.10, 0.10]);
  box(g, W * 0.28, bodyY + 0.05, -L / 2 + 0.01, 0.42, 0.14, 0.06, [0.15, 0.15, 0.16], [0.9, 0.10, 0.10]);
  // Side mirrors and door seams.
  box(g, -W / 2 - 0.06, cabY - 0.1, L * 0.18, 0.08, 0.08, 0.14, [0.15, 0.15, 0.16]);
  box(g, W / 2 + 0.06, cabY - 0.1, L * 0.18, 0.08, 0.08, 0.14, [0.15, 0.15, 0.16]);
  box(g, -W / 2 - 0.005, bodyY + 0.05, 0, 0.03, 0.5, L * 0.45, [0.10, 0.10, 0.12]);
  box(g, W / 2 + 0.005, bodyY + 0.05, 0, 0.03, 0.5, L * 0.45, [0.10, 0.10, 0.12]);
  if (t.taxi) {
    // Roof sign, glowing teal.
    box(g, 0, cabY + 0.42, 0, 0.9, 0.22, 0.3, [0.10, 0.10, 0.12], [0.1, 0.9, 0.85]);
    box(g, 0, bodyY - 0.28, L / 2 - 0.01, W * 0.6, 0.18, 0.05, [0.95, 0.75, 0.15]);
  }
  if (t.spoiler) {
    box(g, 0, bodyY + 0.42, -L / 2 + 0.25, W - 0.2, 0.06, 0.35, [0.12, 0.12, 0.14]);
    box(g, -W / 2 + 0.2, bodyY + 0.28, -L / 2 + 0.25, 0.08, 0.28, 0.08, [0.12, 0.12, 0.14]);
    box(g, W / 2 - 0.2, bodyY + 0.28, -L / 2 + 0.25, 0.08, 0.28, 0.08, [0.12, 0.12, 0.14]);
  }
  if (t.police) {
    // Lightbar on the roof: red/blue are separate emissive boxes, flashed
    // by the lightbar batch (this geometry keeps the bar itself).
    box(g, 0, cabY + 0.38, 0, 1.1, 0.16, 0.35, [0.15, 0.15, 0.18]);
    // White doors read as a patrol car at a glance.
    box(g, -W / 2 - 0.005, bodyY - 0.05, 0.3, 0.03, 0.3, L * 0.4, [0.10, 0.14, 0.30]);
    box(g, W / 2 + 0.005, bodyY - 0.05, 0.3, 0.03, 0.3, L * 0.4, [0.10, 0.14, 0.30]);
  }
  return g;
}

function buildWheelGeometry() {
  const g = emptyGeometry();
  // Cylinder axis is Y; bake a 90-degree Z rotation so the axle is X.
  cylinder(g, 0, 0, 0, 0.34, 0.34, 0.24, 10, [0.08, 0.08, 0.09]);
  cylinder(g, 0, 0, 0, 0.20, 0.20, 0.26, 8, [0.55, 0.55, 0.58]);
  transformGeometry(g, mat4RotateZ(Math.PI / 2));
  return g;
}

function buildDoorGeometry() {
  const g = emptyGeometry();
  box(g, 0, 0, 0, 0.06, 0.62, 1.05, [1, 1, 1]);
  box(g, 0, 0.18, 0.1, 0.05, 0.22, 0.8, [0.10, 0.12, 0.16]);
  return g;
}

function buildLightbarGeometry() {
  const g = emptyGeometry();
  box(g, -0.28, 0, 0, 0.5, 0.14, 0.3, [1, 1, 1], [1, 0.1, 0.1]);
  box(g, 0.28, 0, 0, 0.5, 0.14, 0.3, [1, 1, 1], [0.15, 0.3, 1]);
  return g;
}

export class Vehicle {
  constructor(system, typeKey, x, z, heading, color = null) {
    this.system = system;
    this.typeKey = typeKey;
    this.type = VEHICLE_TYPES[typeKey];
    this.x = x; this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.health = 100;
    this.wreck = false;
    this.driver = null; // Player or AI driver
    this.parked = true;
    this.color = color ?? this.type.color;
    this.doorAngle = 0; // 0 closed .. 1 open
    this.doorTarget = 0;
    this.smokeT = 0;
    this.mission = null; // mission id that owns this car
    this.route = null; // waypoint list for autopilot
    this.routeIndex = 0;
    this.autoSpeed = 0;
  }

  get name() { return this.type.name; }

  forward() {
    return [Math.sin(this.heading), Math.cos(this.heading)];
  }

  // Arcade step with direct inputs: throttle -1..1, steer -1..1, handbrake.
  step(dt, throttle, steer, handbrake) {
    if (this.wreck) return;
    const t = this.type;
    const target = throttle * t.top;
    const accel = throttle !== 0 ? t.accel : 6;
    if (this.speed < target) this.speed = Math.min(target, this.speed + accel * dt);
    else if (this.speed > target) this.speed = Math.max(target, this.speed - accel * 1.6 * dt);
    if (handbrake) this.speed *= Math.max(0, 1 - dt * 1.8);
    const maxSteer = 0.55 * (1 - Math.min(Math.abs(this.speed) / t.top, 1) * 0.55);
    this.steer += (steer * maxSteer - this.steer) * Math.min(1, dt * 10);
    const wheelbase = t.len * 0.62;
    this.heading += (this.speed / wheelbase) * Math.tan(this.steer) * dt;
    const [fx, fz] = this.forward();
    let nx = this.x + fx * this.speed * dt;
    let nz = this.z + fz * this.speed * dt;
    if (handbrake && Math.abs(this.speed) > 6) {
      // Drift: a little sideways slide.
      const sx = Math.cos(this.heading), sz = -Math.sin(this.heading);
      nx += sx * this.speed * 0.12 * dt * (steer || 0.3);
      nz += sz * this.speed * 0.12 * dt * (steer || 0.3);
    }
    const r = t.wid * 0.62;
    const resolved = this.system.city.collision.resolveCircle(nx, nz, r);
    if (resolved.hit) {
      const impact = Math.abs(this.speed);
      if (impact > 4) this.damage(impact * 0.9);
      this.speed *= 0.45;
      nx = resolved.x; nz = resolved.z;
    }
    this.x = nx; this.z = nz;
    this.wheelSpin += (this.speed / 0.34) * dt;
    this.doorAngle += (this.doorTarget - this.doorAngle) * Math.min(1, dt * 5);
  }

  // Follow waypoints (traffic / police / mission autopilot).
  autopilot(dt, trafficLights, time) {
    if (!this.route || this.routeIndex >= this.route.length) return;
    const [tx, tz] = this.route[this.routeIndex];
    const dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) { this.routeIndex++; return; }
    const want = Math.atan2(dx, dz);
    const delta = wrapAngle(want - this.heading);
    const steer = clamp(delta * 1.6, -1, 1);
    let throttle = 0.55;
    // Brake for a red light at the next intersection (checked by caller).
    if (this.stopForLight) throttle = -0.4;
    this.step(dt, throttle, steer, false);
  }

  damage(amount) {
    if (this.wreck) return;
    this.health -= amount;
    if (this.health <= 50 && this.smokeT === 0) this.smokeT = 0.0001;
    if (this.health <= 0) {
      this.health = 0;
      this.wreck = true;
      this.speed = 0;
      this.system.onWreck(this);
    }
  }

  // Called by the player when Kai is driving this car.
  drive(dt, input, player) {
    const result = this.system.driveVehicle(this, dt, input);
    if (result === 'exit') player.exitCar();
  }

  // World position of the driver's seat.
  seatPos() {
    const [fx, fz] = this.forward();
    const sx = Math.cos(this.heading), sz = -Math.sin(this.heading);
    return [this.x - sx * 0.35, this.z - sz * 0.35];
  }

  // World position of the driver-side door hinge.
  doorPos() {
    const sx = Math.cos(this.heading), sz = -Math.sin(this.heading);
    return [this.x - sx * (this.type.wid / 2), this.z - sz * (this.type.wid / 2)];
  }
}

export class VehicleSystem {
  constructor(renderer, city, charSystem) {
    this.renderer = renderer;
    this.city = city;
    this.charSystem = charSystem;
    this.vehicles = [];
    this.onWreck = () => {};
    this.batches = {};
    for (const key of Object.keys(VEHICLE_TYPES)) {
      this.batches[key] = {
        batch: renderer.createBatch('veh-' + key, buildBodyGeometry(key), MAX_VEHICLES),
        matrices: new Float32Array(MAX_VEHICLES * 16),
        colors: new Float32Array(MAX_VEHICLES * 4),
        count: 0,
      };
    }
    this.wheelBatch = renderer.createBatch('veh-wheel', buildWheelGeometry(), MAX_VEHICLES * 4);
    this.wheelMatrices = new Float32Array(MAX_VEHICLES * 4 * 16);
    this.wheelColors = new Float32Array(MAX_VEHICLES * 4 * 4);
    this.wheelCount = 0;
    this.doorBatch = renderer.createBatch('veh-door', buildDoorGeometry(), MAX_VEHICLES);
    this.doorMatrices = new Float32Array(MAX_VEHICLES * 16);
    this.doorColors = new Float32Array(MAX_VEHICLES * 4);
    this.doorCount = 0;
    this.lightbarBatch = renderer.createBatch('veh-lightbar', buildLightbarGeometry(), MAX_VEHICLES);
    this.lightMatrices = new Float32Array(MAX_VEHICLES * 16);
    this.lightColors = new Float32Array(MAX_VEHICLES * 4);
    this.lightCount = 0;
  }

  add(typeKey, x, z, heading, color = null) {
    const v = new Vehicle(this, typeKey, x, z, heading, color);
    this.vehicles.push(v);
    return v;
  }

  remove(v) {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
  }

  nearestEnterable(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const v of this.vehicles) {
      if (v.wreck) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  // Push a walker out of every car circle (so Kai can't walk through cars).
  resolveWalker(x, z, r) {
    for (const v of this.vehicles) {
      const cr = v.type.len * 0.5;
      const dx = x - v.x, dz = z - v.z;
      const d = Math.hypot(dx, dz);
      const min = cr + r;
      if (d < min && d > 0.001) {
        x = v.x + (dx / d) * min;
        z = v.z + (dz / d) * min;
      }
    }
    return { x, z };
  }

  // Player driving: called from Player.update through the vehicle's drive.
  driveVehicle(v, dt, input) {
    let throttle = 0;
    if (input.isDown('KeyW')) throttle += 1;
    if (input.isDown('KeyS')) throttle -= 1;
    let steer = 0;
    if (input.isDown('KeyA')) steer -= 1;
    if (input.isDown('KeyD')) steer += 1;
    const handbrake = input.isDown('Space');
    v.step(dt, throttle, steer, handbrake);
    if (input.pressed('KeyF')) return 'exit';
    return null;
  }

  update(dt, time) {
    // Car-car collisions (circle vs circle, mass-based push).
    const list = this.vehicles;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.wreck && b.wreck) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = (a.type.wid + b.type.wid) * 0.62;
        if (d < min && d > 0.001) {
          const push = (min - d) / 2;
          const nx = dx / d, nz = dz / d;
          const am = a.type.mass, bm = b.type.mass;
          const total = am + bm;
          a.x -= nx * push * (bm / total) * 2 * 0.5;
          a.z -= nz * push * (bm / total) * 2 * 0.5;
          b.x += nx * push * (am / total) * 2 * 0.5;
          b.z += nz * push * (am / total) * 2 * 0.5;
          const impact = Math.abs(a.speed - b.speed);
          if (impact > 5) {
            a.damage(impact * 0.5);
            b.damage(impact * 0.5);
            a.speed *= 0.6; b.speed *= 0.6;
          }
        }
      }
    }
    // Smoke from damaged cars, and doors swinging shut after entry/exit.
    for (const v of list) {
      if (v.smokeT > 0 && !v.wreck) v.smokeT += dt;
      if (v.doorTimer > 0) {
        v.doorTimer -= dt;
        if (v.doorTimer <= 0) v.doorTarget = 0;
      }
    }
    this.upload(time);
  }

  upload(time) {
    for (const b of Object.values(this.batches)) b.count = 0;
    this.wheelCount = 0;
    this.doorCount = 0;
    this.lightCount = 0;
    for (const v of this.vehicles) {
      const b = this.batches[v.typeKey];
      if (b.count >= MAX_VEHICLES) continue;
      const idx = b.count++;
      const wreckScale = v.wreck ? 0.96 : 1;
      const m = mat4TRS(v.x, 0, v.z, v.heading, 0, 0, wreckScale, wreckScale, wreckScale);
      b.matrices.set(m, idx * 16);
      const dark = v.wreck ? 0.25 : 1;
      b.colors[idx * 4] = v.color[0] * dark;
      b.colors[idx * 4 + 1] = v.color[1] * dark;
      b.colors[idx * 4 + 2] = v.color[2] * dark;
      b.colors[idx * 4 + 3] = 1;
      // Wheels.
      const t = v.type;
      const wheelY = 0.34;
      const wx = t.wid / 2 - 0.05;
      const wzF = t.len / 2 - 0.85;
      const wzR = -t.len / 2 + 0.85;
      for (const [ox, oz] of [[-wx, wzF], [wx, wzF], [-wx, wzR], [wx, wzR]]) {
        if (this.wheelCount >= MAX_VEHICLES * 4) break;
        const wm = mat4Multiply(m, mat4TRS(ox, wheelY, oz, 0, v.wheelSpin, 0, 1, 1, 1));
        this.wheelMatrices.set(wm, this.wheelCount * 16);
        this.wheelColors[this.wheelCount * 4] = 1;
        this.wheelColors[this.wheelCount * 4 + 1] = 1;
        this.wheelColors[this.wheelCount * 4 + 2] = 1;
        this.wheelColors[this.wheelCount * 4 + 3] = 1;
        this.wheelCount++;
      }
      // Driver-side door, swung by doorAngle.
      if (v.doorAngle > 0.01) {
        const [dx, dz] = v.doorPos();
        const hinge = mat4Multiply(
          mat4TRS(dx, 0.75, dz, v.heading, 0, 0, 1, 1, 1),
          mat4RotateY(v.doorAngle * 1.2),
        );
        const dm = mat4Multiply(hinge, mat4TRS(0, 0, 0.55, 0, 0, 0, 1, 1, 1));
        this.doorMatrices.set(dm, this.doorCount * 16);
        this.doorColors[this.doorCount * 4] = v.color[0];
        this.doorColors[this.doorCount * 4 + 1] = v.color[1];
        this.doorColors[this.doorCount * 4 + 2] = v.color[2];
        this.doorColors[this.doorCount * 4 + 3] = 1;
        this.doorCount++;
      }
      // Police lightbar flash.
      if (v.type.police && !v.wreck) {
        const flash = Math.sin(time * 9) > 0 ? 1 : 0;
        const lm = mat4TRS(v.x, 1.55, v.z, v.heading, 0, 0, 1, 1, 1);
        this.lightMatrices.set(lm, this.lightCount * 16);
        this.lightColors[this.lightCount * 4] = 1;
        this.lightColors[this.lightCount * 4 + 1] = 1;
        this.lightColors[this.lightCount * 4 + 2] = 1;
        this.lightColors[this.lightCount * 4 + 3] = flash ? 1.6 : 0.4;
        this.lightCount++;
      }
    }
    for (const [key, b] of Object.entries(this.batches)) {
      if (b.count > 0) this.renderer.setInstances('veh-' + key, b.matrices, b.colors, b.count);
    }
    if (this.wheelCount > 0) this.renderer.setInstances('veh-wheel', this.wheelMatrices, this.wheelColors, this.wheelCount);
    if (this.doorCount > 0) this.renderer.setInstances('veh-door', this.doorMatrices, this.doorColors, this.doorCount);
    if (this.lightCount > 0) this.renderer.setInstances('veh-lightbar', this.lightMatrices, this.lightColors, this.lightCount);
  }

  draw() {
    for (const key of Object.keys(this.batches)) this.renderer.drawBatch('veh-' + key);
    this.renderer.drawBatch('veh-wheel');
    this.renderer.drawBatch('veh-door');
    this.renderer.drawBatch('veh-lightbar');
  }
}
