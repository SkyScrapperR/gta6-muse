// The player: Kai Santoso on foot, plus the third-person camera that
// follows him. Movement is camera-relative; the camera orbits with the
// mouse (pointer lock), collides with buildings so it never clips inside
// geometry, and tightens over the shoulder while aiming.
//
// Driving is delegated to the vehicle module (step 5): when Kai is in a
// car, this controller hands its update to the car and only keeps the
// camera and the seated pose.

import { clamp, wrapAngle, angleDelta } from '../core/math.js';
import { OUTFITS } from './character.js';
import { WEAPONS } from '../combat/weapons.js';

const WALK_SPEED = 4.0;
const SPRINT_SPEED = 7.0;
const AIM_SPEED = 2.0;
const JUMP_VELOCITY = 5.2;
const GRAVITY = 14;

export class Player {
  constructor(charSystem, city, input) {
    this.charSystem = charSystem;
    this.city = city;
    this.input = input;
    this.x = 0; this.z = 0; this.y = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.heading = 0;
    this.speed = 0;
    this.onGround = true;
    this.stamina = 1;
    this.health = 100;
    this.armor = 0;
    this.money = 250;
    this.weapon = 'fists';
    this.weapons = ['fists'];
    this.ammo = { kobra: 24, wasp: 0, thunder: 0 };
    this.mag = { kobra: 12, wasp: 0, thunder: 0 };
    this.fireT = 0;
    this.reloadT = 0;
    this.bloom = 0;
    this.punchHitDone = false;
    this.onShoot = null; // (weaponKey) => void, wired by main.js
    this.onPunch = null; // () => void, wired by main.js
    this.aiming = false;
    this.inCar = null; // vehicle object, or null
    this.punchT = 0;
    this.dead = false;
    this.respawnSafeUntil = 0;

    // Camera orbit.
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.camDist = 7;

    this.char = charSystem.add({
      x: 0, z: 0, heading: 0, outfit: OUTFITS.kai, pose: 'idle',
    });
  }

  // Arrested: cuffed, dropped at Police HQ, $100 lighter, weapons gone.
  arrest(x, z) {
    if (this.inCar) {
      this.inCar.driver = null;
      this.inCar = null;
    }
    this.money = Math.max(0, this.money - 100);
    this.weapons = ['fists'];
    this.weapon = 'fists';
    this.ammo = { kobra: 0, wasp: 0, thunder: 0 };
    this.mag = { kobra: 0, wasp: 0, thunder: 0 };
    this.spawn(x, z, 0);
  }

  // Give Kai a weapon (mission rewards, gun shop) with a full magazine.
  giveWeapon(key, reserveAmmo = 0) {
    if (!this.weapons.includes(key)) this.weapons.push(key);
    this.mag[key] = WEAPONS[key].mag;
    this.ammo[key] = (this.ammo[key] ?? 0) + reserveAmmo;
  }

  setWeapon(key) {
    if (!this.weapons.includes(key)) return;
    if (this.reloadT > 0) return;
    this.weapon = key;
    this.fireT = 0;
    this.bloom = 0;
  }

  startReload() {
    const w = WEAPONS[this.weapon];
    if (this.weapon === 'fists' || this.reloadT > 0) return;
    if (this.mag[this.weapon] >= w.mag || (this.ammo[this.weapon] ?? 0) <= 0) return;
    this.reloadT = w.reload;
  }

  finishReload() {
    const w = WEAPONS[this.weapon];
    const need = w.mag - this.mag[this.weapon];
    const take = Math.min(need, this.ammo[this.weapon] ?? 0);
    this.mag[this.weapon] += take;
    this.ammo[this.weapon] -= take;
  }

  // Fire one shot (or start the punch). The actual hitscan lives in
  // main.js via onShoot, so the player never knows about the world.
  tryShoot() {
    const w = WEAPONS[this.weapon];
    if (this.reloadT > 0 || this.fireT > 0) return;
    if (this.weapon === 'fists') {
      if (this.punchT === 0) {
        this.punchT = 0.0001;
        this.char.punchT = 0.0001;
        this.punchHitDone = false;
      }
      return;
    }
    if (this.mag[this.weapon] <= 0) {
      this.startReload();
      return;
    }
    this.fireT = w.rate;
    this.mag[this.weapon]--;
    this.bloom = Math.min(1, this.bloom + (this.weapon === 'wasp' ? 0.12 : 0.25));
    this.camPitch = Math.min(1.1, this.camPitch + 0.012); // recoil kick
    if (this.onShoot) this.onShoot(this.weapon);
  }

  spawn(x, z, heading = 0) {
    this.x = x; this.z = z; this.y = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.heading = heading;
    this.camYaw = heading;
    this.health = 100;
    this.dead = false;
    this.inCar = null;
    this.char.pose = 'idle';
    this.syncChar();
  }

  get pos() { return [this.x, this.y, this.z]; }

  damage(amount) {
    if (this.dead) return;
    let rest = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, rest);
      this.armor -= absorbed;
      rest -= absorbed;
    }
    this.health -= rest;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.char.pose = 'dead';
      this.char.deadT = 0;
    }
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
  }

  update(dt, time, vehicles) {
    if (this.dead) {
      this.char.deadT += dt;
      this.syncChar();
      return;
    }
    if (this.inCar) {
      // Chase camera: the mouse can look around, the view re-centres behind
      // the car 1.5 s after the last mouse movement.
      const [mdx, mdy] = input.consumeMouse();
      if (mdx !== 0 || mdy !== 0) this.lastMouseAt = time;
      this.camYaw += mdx * 0.0032;
      this.camPitch = clamp(this.camPitch + mdy * 0.0028, -0.1, 0.9);
      if (time - (this.lastMouseAt ?? -99) > 1.5) {
        this.camYaw += angleDelta(this.camYaw, this.inCar.heading) * Math.min(1, dt * 2.5);
      }
      this.camDist += (9 - this.camDist) * Math.min(1, dt * 4);
      // The car drives; Kai sits. The vehicle module moves us.
      this.inCar.drive(dt, this.input, this);
      this.x = this.inCar.x;
      this.z = this.inCar.z;
      this.heading = this.inCar.heading;
      this.char.pose = 'drive';
      // Seat the character in the driver's seat.
      const [sx, sz] = this.inCar.seatPos();
      this.char.x = sx;
      this.char.z = sz;
      this.char.y = 0.55;
      this.char.heading = this.inCar.heading;
      this.char.speed = 0;
      this.updateCamera(dt);
      return;
    }

    const input = this.input;
    const [mdx, mdy] = input.consumeMouse();
    this.camYaw += mdx * 0.0032;
    this.camPitch = clamp(this.camPitch + mdy * 0.0028, -0.15, 1.1);

    // Aim: right mouse tightens the camera and slows movement.
    this.aiming = input.mouseRight && this.weapon !== 'fists';
    const wantDist = this.aiming ? 4.2 : 7.0;
    this.camDist += (wantDist - this.camDist) * Math.min(1, dt * 8);

    // Move relative to the camera yaw.
    let mx = 0, mz = 0;
    if (input.isDown('KeyW')) mz += 1;
    if (input.isDown('KeyS')) mz -= 1;
    if (input.isDown('KeyA')) mx -= 1;
    if (input.isDown('KeyD')) mx += 1;
    const mag = Math.hypot(mx, mz) || 1;
    mx /= mag; mz /= mag;
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    // Camera forward is (sin(yaw), cos(yaw)) on the ground plane.
    const wx = sin * mz + cos * mx;
    const wz = cos * mz - sin * mx;

    const sprinting = input.isDown('ShiftLeft') && this.stamina > 0.05 && mz > 0;
    if (sprinting) this.stamina = Math.max(0, this.stamina - dt * 0.25);
    else this.stamina = Math.min(1, this.stamina + dt * 0.15);
    const topSpeed = this.aiming ? AIM_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;
    const accel = this.onGround ? 14 : 5;
    this.vx += (wx * topSpeed - this.vx) * Math.min(1, accel * dt);
    this.vz += (wz * topSpeed - this.vz) * Math.min(1, accel * dt);

    // Jump.
    if (input.pressed('Space') && this.onGround) {
      this.vy = JUMP_VELOCITY;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
    }

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const resolved = this.city.collision.resolveCircle(this.x, this.z, 0.45);
    this.x = resolved.x;
    this.z = resolved.z;
    if (vehicles) {
      const pushed = vehicles.resolveWalker(this.x, this.z, 0.45);
      this.x = pushed.x;
      this.z = pushed.z;
    }
    this.speed = Math.hypot(this.vx, this.vz);

    // Face the movement direction; when aiming, face the camera.
    if (this.aiming) {
      this.heading += angleDelta(this.heading, this.camYaw) * Math.min(1, dt * 14);
    } else if (this.speed > 0.5) {
      const target = Math.atan2(this.vx, this.vz);
      this.heading += angleDelta(this.heading, target) * Math.min(1, dt * 10);
    }

    // Punch combo (fists) or gunfire.
    const w = WEAPONS[this.weapon];
    if (w.auto) {
      if (input.mouseLeft) this.tryShoot();
    } else if (input.pressedLeft()) {
      this.tryShoot();
    }
    if (this.punchT > 0) {
      const prev = this.punchT;
      this.punchT += dt / 0.45;
      this.char.punchT = this.punchT;
      if (!this.punchHitDone && prev < 0.3 && this.punchT >= 0.3 && this.onPunch) {
        this.punchHitDone = true;
        this.onPunch();
      }
      if (this.punchT >= 1) { this.punchT = 0; this.char.punchT = 0; }
    }
    // Reload and weapon switching.
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloadT = 0; this.finishReload(); }
    }
    this.bloom = Math.max(0, this.bloom - dt * 1.5);
    if (this.fireT > 0) this.fireT -= dt;
    if (input.pressed('KeyR')) this.startReload();
    if (input.pressed('Digit1')) this.setWeapon('fists');
    if (input.pressed('Digit2')) this.setWeapon('kobra');
    if (input.pressed('Digit3')) this.setWeapon('wasp');
    if (input.pressed('Digit4')) this.setWeapon('thunder');

    // Enter / exit a car.
    if (input.pressed('KeyF') && vehicles) {
      const car = vehicles.nearestEnterable(this.x, this.z, 3.5);
      if (car) this.enterCar(car);
    }

    // Pose.
    this.char.pose = this.punchT > 0 ? 'punch'
      : this.aiming ? 'aim'
      : this.speed > 4.2 ? 'run'
      : this.speed > 0.3 ? 'walk' : 'idle';
    this.char.aimHeading = this.camYaw;
    this.syncChar();
    this.updateCamera(dt);
  }

  enterCar(car) {
    const wasParked = car.parked;
    this.inCar = car;
    car.driver = this;
    car.parked = false;
    car.doorTarget = 1;
    car.doorTimer = 0.9;
    this.char.pose = 'drive';
    if (this.onEnterCar) this.onEnterCar(car, wasParked);
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    car.driver = null;
    car.doorTarget = 1;
    car.doorTimer = 0.9;
    this.inCar = null;
    // Step out to the car's left side.
    const sx = Math.cos(car.heading);
    const sz = -Math.sin(car.heading);
    this.x = car.x + sx * 2.2;
    this.z = car.z + sz * 2.2;
    const resolved = this.city.collision.resolveCircle(this.x, this.z, 0.45);
    this.x = resolved.x;
    this.z = resolved.z;
    this.heading = car.heading;
    this.char.pose = 'idle';
    this.syncChar();
  }

  updateCamera(dt) {
    void dt;
    const pitch = this.camPitch;
    const yaw = this.camYaw;
    const dir = [
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ];

    if (this.aiming) {
      // Over-the-shoulder aim: the camera sits at Kai's right shoulder and
      // looks along the yaw/pitch direction, so the crosshair (screen
      // centre) points at the world and Kai stays in the lower frame.
      const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
      const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
      let bx = this.x + rightX * 0.8 - fwdX * 2.5;
      let bz = this.z + rightZ * 0.8 - fwdZ * 2.5;
      // Pull the camera in if a building is between Kai and the boom.
      const hit = this.city.collision.raycast(this.x, this.z, bx - this.x, bz - this.z, 2.6);
      if (hit && hit.dist < 2.6) {
        const s = Math.max(0.4, hit.dist - 0.3) / 2.6;
        bx = this.x + (bx - this.x) * s;
        bz = this.z + (bz - this.z) * s;
      }
      this.camPos = [bx, this.y + 1.6, bz];
      this.camTarget = [
        bx + dir[0] * 20,
        this.y + 1.6 + dir[1] * 20,
        bz + dir[2] * 20,
      ];
      if (this.camPos[1] < 0.6) this.camPos[1] = 0.6;
      return;
    }

    // Third-person orbit: target just above Kai's head, camera behind and
    // above, looking down at him; pitch > 0 means looking down.
    const target = [this.x, this.y + 1.7, this.z];
    let dist = this.camDist;
    // Keep the camera out of buildings: shorten the boom on a hit.
    const hit = this.city.collision.raycast(
      target[0], target[2],
      -dir[0], -dir[2],
      dist,
    );
    if (hit) dist = Math.max(1.4, hit.dist - 0.4);
    this.camTarget = target;
    this.camPos = [
      target[0] - dir[0] * dist,
      target[1] - dir[1] * dist + 0.4,
      target[2] - dir[2] * dist,
    ];
    // Never let the camera sink below the street.
    if (this.camPos[1] < 0.6) this.camPos[1] = 0.6;
  }

  // Camera for the renderer. In a car the field of view widens with speed.
  cameraForRender() {
    let fovDeg = 62;
    if (this.inCar) fovDeg = 62 + Math.min(Math.abs(this.inCar.speed) * 0.4, 16);
    else if (this.aiming) fovDeg = 50;
    return {
      pos: this.camPos ?? [this.x, this.y + 5, this.z + 8],
      target: this.camTarget ?? [this.x, this.y + 1.5, this.z],
      fov: (fovDeg * Math.PI) / 180,
      near: 0.3,
      far: 3000,
    };
  }

  syncChar() {
    this.char.x = this.x;
    this.char.z = this.z;
    this.char.y = this.y;
    this.char.heading = this.heading;
    this.char.speed = this.speed;
  }
}
