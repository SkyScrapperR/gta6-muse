// Weather (Tier 2): clear <-> rain. Rain arrives on a slow timer,
// darkens the sky, wets the roads (the lit shader's uWet), spawns
// streaks in the particle system around the camera and fades in a
// filtered-noise rain loop. Roads dry slowly after the rain stops, so
// the wet look lingers a little past the last drop.
//
// The system is deterministic enough for a playtest: the first change
// is scheduled 45-105 seconds after boot, then every 60-180 seconds.
// A shot can force rain with rain.setTarget(1) (the docks firefight
// screenshot does this).
import { clamp } from '../core/math.js';

export class RainSystem {
  constructor(w) {
    this.w = w;
    this.state = 'clear';
    this.amount = 0; // 0..1, ramps toward target over ~8 s
    this.target = 0;
    this.wet = 0; // 0..1, wets fast, dries slowly
    this.changeT = 45 + Math.random() * 60;
  }

  setTarget(v) {
    this.target = v > 0.5 ? 1 : 0;
    this.state = this.target === 1 ? 'rain' : 'clear';
  }

  update(dt, camX, camY, camZ) {
    this.changeT -= dt;
    if (this.changeT <= 0) {
      this.changeT = 60 + Math.random() * 120;
      const next = this.target > 0.5 ? 0 : 1;
      this.setTarget(next);
      if (next === 1) this.w.notifications.info('Rain is coming down over Selara Bay');
    }
    this.amount = clamp(this.amount + Math.sign(this.target - this.amount) * (dt / 8), 0, 1);
    // Wet roads: soak in ~20 s of rain, dry over ~90 s after it stops.
    const wetRate = this.amount > 0.05 ? dt / 20 : dt / 90;
    this.wet = clamp(this.wet + (this.amount > 0.05 ? wetRate : -wetRate), 0, 1);
    if (this.amount > 0.05) this.spawnStreaks(dt, camX, camY, camZ);
    this.w.sfx.setRain(this.amount);
  }

  spawnStreaks(dt, camX, camY, camZ) {
    // ~260 streaks a second at full rain, in a 60 m box around the
    // camera; a few splashes where the drops land.
    const n = Math.round(dt * 260 * this.amount);
    for (let i = 0; i < n; i++) {
      const x = camX + (Math.random() - 0.5) * 60;
      const z = camZ + (Math.random() - 0.5) * 60;
      const y = camY + 8 + Math.random() * 18;
      this.w.particles.streak(x, y, z, 0.05, 0.9 + Math.random() * 0.5, [0.65, 0.72, 0.85], 0.35);
    }
    const s = Math.round(dt * 40 * this.amount);
    for (let i = 0; i < s; i++) {
      const x = camX + (Math.random() - 0.5) * 50;
      const z = camZ + (Math.random() - 0.5) * 50;
      this.w.particles.spawn(x, 0.15, z, 0, 0, 0, 0.35, 0.3, [0.7, 0.75, 0.85], { alpha: 0.25 });
    }
  }
}
