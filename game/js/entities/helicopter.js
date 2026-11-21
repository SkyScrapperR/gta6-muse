// Rajawali police helicopter (Tier 2): spawns at 3+ stars, follows the
// player at 55-70 m on a slow orbit, sweeps a visible spotlight cone
// over them, and fires bursts at 4+ stars. The spotlight also drops a
// pool of light on the ground through the night-light registry.
//
// Shoot-down (health + falling out of the sky) lands in Tier 3: for
// now the heli is invulnerable — nothing in the game aims at it yet.
import { box, cylinder, sphere, emptyGeometry } from '../engine/mesh.js';
import { mat4TRS } from '../core/math.js';
import { clamp } from '../core/math.js';

const CONE_LOCAL_H = 70; // the cone geometry's local height

export class Helicopter {
  constructor(w) {
    this.w = w;
    const r = w.renderer;
    // Body: fuselage, tail boom, fin, skids, cockpit glass, searchlight.
    const body = emptyGeometry();
    box(body, 0, 0, 0, 2.2, 1.7, 3.4, [0.92, 0.92, 0.90]);
    box(body, 0, 0.1, -3.4, 0.9, 0.7, 3.4, [0.88, 0.88, 0.86]);
    box(body, 0, 0.9, -4.8, 0.12, 1.0, 0.9, [0.88, 0.88, 0.86]);
    box(body, -0.95, -0.95, 0.6, 0.12, 0.12, 3.0, [0.2, 0.2, 0.22]);
    box(body, 0.95, -0.95, 0.6, 0.12, 0.12, 3.0, [0.2, 0.2, 0.22]);
    box(body, 0, 0.35, 1.35, 1.9, 0.7, 0.5, [0.08, 0.12, 0.2], [0.05, 0.08, 0.12]);
    sphere(body, 0, -0.85, 1.4, 0.25, 6, 8, [0.3, 0.3, 0.32], [1, 0.95, 0.7]);
    r.createBatch('heli-body', body, 1);
    // Main rotor: two crossed blades + hub, spun by rotorAngle.
    const rotor = emptyGeometry();
    box(rotor, 0, 0, 0, 0.4, 0.08, 7.6, [0.15, 0.15, 0.16]);
    box(rotor, 0, 0, 0, 7.6, 0.08, 0.4, [0.15, 0.15, 0.16]);
    cylinder(rotor, 0, -0.1, 0, 0.25, 0.25, 0.3, 8, [0.2, 0.2, 0.22]);
    r.createBatch('heli-rotor', rotor, 1);
    // Lightbar: red + blue boxes on the roof, flashing alternately.
    const lr = emptyGeometry();
    box(lr, 0, 0, 0, 0.5, 0.22, 0.3, [0.3, 0.02, 0.02], [1, 0.08, 0.08]);
    r.createBatch('heli-light-r', lr, 1);
    const lb = emptyGeometry();
    box(lb, 0, 0, 0, 0.5, 0.22, 0.3, [0.02, 0.05, 0.3], [0.1, 0.3, 1]);
    r.createBatch('heli-light-b', lb, 1);
    // Spotlight cone: top radius 0.6, bottom radius 9, local height 70.
    // The instance scales Y to the heli's altitude so the pool sits on
    // the ground. Colour comes from the instance colour (cone shader).
    const cone = emptyGeometry();
    cylinder(cone, 0, -CONE_LOCAL_H / 2, 0, 0.6, 9, CONE_LOCAL_H, 12, [1, 1, 1]);
    r.createBatch('cone', cone, 1);

    this.bodyMatrices = new Float32Array(16);
    this.bodyColors = new Float32Array([1, 1, 1, 1]);
    this.rotorMatrices = new Float32Array(16);
    this.rotorColors = new Float32Array([1, 1, 1, 1]);
    this.lightRMatrices = new Float32Array(16);
    this.lightRColors = new Float32Array([1, 1, 1, 1]);
    this.lightBMatrices = new Float32Array(16);
    this.lightBColors = new Float32Array([1, 1, 1, 1]);
    this.coneMatrices = new Float32Array(16);
    this.coneColors = new Float32Array([1, 0.95, 0.75, 0.9]);

    this.active = false;
    this.leaving = false;
    this.x = 0; this.y = 65; this.z = 0;
    this.heading = 0;
    this.rotorAngle = 0;
    this.fireT = 2;
    this.burstLeft = 0;
    this.burstT = 0;
    this.health = 100;
    this.shotDown = false;
    this.fallV = 0;
  }

  spawn(x, z) {
    this.active = true;
    this.leaving = false;
    this.x = x + 30;
    this.z = z + 30;
    this.y = 65;
    this.health = 100;
    this.shotDown = false;
    this.fallV = 0;
    this.burstLeft = 0;
    this.fireT = 2.5;
    this.w.renderer.coneHeight = CONE_LOCAL_H;
  }

  despawn() {
    // Fly up and away instead of vanishing mid-air.
    this.leaving = true;
    this.burstLeft = 0;
  }

  // Tier 3 hook: shooting the heli down. Nothing calls this yet.
  damage(dmg) {
    if (!this.active || this.shotDown) return;
    this.health -= dmg;
    if (this.health <= 0) {
      this.shotDown = true;
      this.fallV = 0;
      this.burstLeft = 0;
    }
  }

  update(dt, time) {
    if (!this.active) return;
    const p = this.w.player;
    this.rotorAngle += dt * 22;
    if (this.shotDown) {
      // Tier 3: falling out of the sky.
      this.fallV += 20 * dt;
      this.y -= this.fallV * dt;
      this.rotorAngle += dt * 4;
      if (this.y <= 1) {
        this.w.particles.explosion(this.x, 0.5, this.z);
        this.w.sfx.explosion();
        this.active = false;
      }
      return;
    }
    if (this.leaving) {
      this.y += dt * 18;
      this.x += (this.x - p.x) * dt * 0.5;
      this.z += (this.z - p.z) * dt * 0.5;
      if (this.y > 130) this.active = false;
      return;
    }
    // Slow orbit around the player, 55-70 m up.
    const tx = p.x + Math.sin(time * 0.12) * 25;
    const tz = p.z + Math.cos(time * 0.12) * 25;
    const ty = 62 + Math.sin(time * 0.4) * 5;
    const k = Math.min(1, dt * 0.8);
    this.x += (tx - this.x) * k;
    this.z += (tz - this.z) * k;
    this.y += (ty - this.y) * Math.min(1, dt * 0.5);
    this.heading = Math.atan2(p.x - this.x, p.z - this.z);
    // Spotlight pool of light on the ground under the player.
    this.w.lightRegistry.addDynamic(p.x, 1, p.z, 1, 0.95, 0.75, 0.8, 20);
    // Fire bursts at 4+ stars — never in shot mode or at a dead player.
    if (this.w.police.wanted >= 4 && !p.dead && this.w.game.state !== 'shot') {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 2.5 + Math.random() * 1.5;
        this.burstLeft = 5;
        this.burstT = 0;
      }
    }
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstT = 0.08;
        this.burstLeft--;
        this.fireRound();
      }
    }
  }

  fireRound() {
    const p = this.w.player;
    const from = [this.x, this.y - 1, this.z];
    const dx = p.x - from[0], dy = (p.y + 1.2) - from[1], dz = p.z - from[2];
    const dist = Math.hypot(dx, dy, dz) || 1;
    // Inaccurate by design: a heli 60 m up should pressure, not shred.
    const spread = 0.06;
    const yaw = Math.atan2(dx, dz) + (Math.random() * 2 - 1) * spread;
    const pitch = Math.atan2(dy, Math.hypot(dx, dz)) + (Math.random() * 2 - 1) * spread;
    const dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const hit = this.w.weapons.fireHitscan(from, dir, 120, 6, this, { player: p });
    this.w.particles.tracer(from, hit.point);
    this.w.sfx.blipAt(from[0], from[1], from[2], 140, 0.1, 'square', 0.15, 60);
    if (hit.kind === 'wall') {
      this.w.particles.impactSpark(hit.point[0], hit.point[1], hit.point[2], -dir[0], -dir[1], -dir[2]);
    }
  }

  draw(time) {
    if (!this.active) return;
    const r = this.w.renderer;
    this.bodyMatrices.set(mat4TRS(this.x, this.y, this.z, this.heading, 0, 0, 1, 1, 1));
    this.rotorMatrices.set(mat4TRS(this.x, this.y + 1.1, this.z, this.heading + this.rotorAngle, 0, 0, 1, 1, 1));
    const flash = Math.sin(time * 9) > 0;
    this.lightRMatrices.set(mat4TRS(this.x - 0.55, this.y + 0.95, this.z, this.heading, 0, 0, 1, 1, 1));
    this.lightBMatrices.set(mat4TRS(this.x + 0.55, this.y + 0.95, this.z, this.heading, 0, 0, 1, 1, 1));
    this.lightRColors[3] = flash ? 1.6 : 0.15;
    this.lightBColors[3] = flash ? 0.15 : 1.6;
    // Cone: top at the heli, bottom on the ground (scale Y by altitude).
    this.coneMatrices.set(mat4TRS(this.x, this.y, this.z, 0, 0, 0, 1, Math.max(0.1, this.y / CONE_LOCAL_H), 1));
    r.setInstances('heli-body', this.bodyMatrices, this.bodyColors, 1);
    r.setInstances('heli-rotor', this.rotorMatrices, this.rotorColors, 1);
    r.setInstances('heli-light-r', this.lightRMatrices, this.lightRColors, 1);
    r.setInstances('heli-light-b', this.lightBMatrices, this.lightBColors, 1);
    r.setInstances('cone', this.coneMatrices, this.coneColors, 1);
    r.drawBatch('heli-body');
    r.drawBatch('heli-rotor');
    r.drawBatch('heli-light-r');
    r.drawBatch('heli-light-b');
  }
}
