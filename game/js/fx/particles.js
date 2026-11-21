// Particles: muzzle flashes, blood, impact sparks, smoke, fire and
// explosions, drawn as billboarded soft sprites through the renderer's
// particle batch. A fixed pool, no allocation in the hot loop.

const MAX_PARTICLES = 512;

export class ParticleSystem {
  constructor(renderer) {
    this.renderer = renderer;
    this.parts = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.parts.push({
        alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 0.2, height: 0.2, grow: 0, drag: 0, gravity: 0,
        groundKill: false, r: 1, g: 1, b: 1, a: 1,
      });
    }
    this.cursor = 0;
    this.matrices = new Float32Array(MAX_PARTICLES * 16);
    this.colors = new Float32Array(MAX_PARTICLES * 4);
  }

  spawn(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
    const p = this.parts[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.maxLife = life;
    p.size = size;
    // Height is the vertical size the shader reads (aInstance[1][1]).
    // Round sprites use height == size; a tall height makes the shader
    // draw a vertical streak (rain). See streak() below.
    p.height = opts.height ?? size;
    p.grow = opts.grow ?? 0;
    p.drag = opts.drag ?? 0;
    p.gravity = opts.gravity ?? 0;
    p.groundKill = opts.groundKill ?? false;
    p.r = color[0]; p.g = color[1]; p.b = color[2];
    p.a = opts.alpha ?? 1;
    return p;
  }

  // A falling rain streak: thin, tall, fast, dies when it hits the
  // ground. Written through the same pool so rain costs no extra draw.
  streak(x, y, z, width, height, color, alpha = 0.35) {
    this.spawn(x, y, z, 0, -22, 0, 0.6 + Math.random() * 0.5, width, color,
      { height, alpha, groundKill: true });
  }

  muzzleFlash(x, y, z, dir) {
    // One bright core plus two sparks along the barrel.
    this.spawn(x, y, z, 0, 0, 0, 0.07, 0.55, [1, 0.85, 0.4], { alpha: 1 });
    for (let i = 0; i < 2; i++) {
      this.spawn(
        x + dir[0] * 0.3, y + dir[1] * 0.3, z + dir[2] * 0.3,
        dir[0] * 12 + (Math.random() - 0.5) * 2,
        dir[1] * 12 + (Math.random() - 0.5) * 2,
        dir[2] * 12 + (Math.random() - 0.5) * 2,
        0.12, 0.12, [1, 0.7, 0.2],
      );
    }
  }

  blood(x, y, z, dir) {
    for (let i = 0; i < 8; i++) {
      this.spawn(
        x, y, z,
        dir[0] * 3 + (Math.random() - 0.5) * 3,
        1 + Math.random() * 2,
        dir[2] * 3 + (Math.random() - 0.5) * 3,
        0.4 + Math.random() * 0.3, 0.14 + Math.random() * 0.1,
        [0.45, 0.03, 0.03], { gravity: -9, drag: 1.5 },
      );
    }
  }

  impactSpark(x, y, z, nx, ny, nz) {
    for (let i = 0; i < 6; i++) {
      this.spawn(
        x, y, z,
        nx * 2 + (Math.random() - 0.5) * 4,
        ny * 2 + Math.random() * 3,
        nz * 2 + (Math.random() - 0.5) * 4,
        0.25 + Math.random() * 0.2, 0.1, [1, 0.75, 0.25],
        { gravity: -9, drag: 1 },
      );
    }
    // A short grey puff where the bullet struck.
    this.spawn(x, y, z, nx * 0.5, 0.4, nz * 0.5, 0.7, 0.25, [0.5, 0.5, 0.5], { grow: 0.6, alpha: 0.5 });
  }

  tracer(from, to) {
    // Three bright beads along the bullet path, gone in a blink.
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      this.spawn(
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
        0, 0, 0, 0.09, 0.09, [1, 0.95, 0.7],
      );
    }
  }

  smoke(x, y, z, big = false) {
    const n = big ? 10 : 3;
    for (let i = 0; i < n; i++) {
      this.spawn(
        x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8,
        1.2 + Math.random() * 0.8, big ? 0.6 : 0.3, [0.25, 0.25, 0.26],
        { grow: 1.2, alpha: 0.45 },
      );
    }
  }

  explosion(x, y, z) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 6;
      this.spawn(
        x, y + 0.5, z,
        Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s,
        0.4 + Math.random() * 0.4, 0.5 + Math.random() * 0.5,
        [1, 0.55 + Math.random() * 0.3, 0.1], { gravity: -4, drag: 1.5 },
      );
    }
    this.smoke(x, y + 1, z, true);
  }

  update(dt) {
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      const dragF = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragF; p.vz *= dragF;
      p.vy = p.vy * dragF + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) {
        // Rain streaks die on impact; smoke and sparks rest on the ground.
        if (p.groundKill) { p.alive = false; continue; }
        p.y = 0.02; p.vy = 0;
      }
      p.size += p.grow * dt;
    }
  }

  draw() {
    // Particles never rotate, so write the matrix inline: scale on the
    // diagonal, translation in the last column. No allocation per frame.
    let n = 0;
    for (const p of this.parts) {
      if (!p.alive) continue;
      const fade = p.life / p.maxLife;
      const o = n * 16;
      const m = this.matrices;
      m[o] = p.size; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = p.height; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 1; m[o + 11] = 0;
      m[o + 12] = p.x; m[o + 13] = p.y; m[o + 14] = p.z; m[o + 15] = 1;
      this.colors[n * 4] = p.r;
      this.colors[n * 4 + 1] = p.g;
      this.colors[n * 4 + 2] = p.b;
      this.colors[n * 4 + 3] = p.a * fade;
      n++;
    }
    this.renderer.setParticles(this.matrices, this.colors, n);
    this.renderer.drawParticles();
  }
}
