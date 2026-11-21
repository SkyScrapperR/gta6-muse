// Pickups: health, cash and ammo dropped by fallen enemies and peds, or
// placed by missions. Walk over one to collect it.
import { box, emptyGeometry } from '../engine/mesh.js';

const PICKUP_DEFS = {
  health: { color: [0.9, 0.15, 0.15], emissive: [0.4, 0.05, 0.05], size: 0.5 },
  cash: { color: [0.95, 0.8, 0.2], emissive: [0.4, 0.3, 0.05], size: 0.4 },
  ammo: { color: [0.85, 0.85, 0.85], emissive: [0.2, 0.2, 0.2], size: 0.4 },
};

export class PickupSystem {
  constructor(renderer, player) {
    this.renderer = renderer;
    this.player = player;
    this.pickups = []; // {x, z, kind, amount, bob}
    this.batches = {};
    for (const [kind, def] of Object.entries(PICKUP_DEFS)) {
      const geo = emptyGeometry();
      box(geo, 0, 0, 0, def.size, def.size * 0.6, def.size, def.color, def.emissive);
      this.batches[kind] = {
        batch: renderer.createBatch('pickup-' + kind, geo, 32),
        matrices: new Float32Array(32 * 16),
        colors: new Float32Array(32 * 4),
      };
    }
    this.onCollect = null; // (kind, amount) => void
  }

  add(kind, x, z, amount) {
    this.pickups.push({ x, z, kind, amount, bob: Math.random() * 6.28 });
    return this.pickups[this.pickups.length - 1];
  }

  update(dt, time) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.bob += dt * 3;
      if (!p.dead && !p.inCar && Math.hypot(p.x - pk.x, p.z - pk.z) < 1.6) {
        this.pickups.splice(i, 1);
        if (this.onCollect) this.onCollect(pk.kind, pk.amount);
      }
    }
  }

  draw() {
    for (const [kind, b] of Object.entries(this.batches)) {
      let n = 0;
      for (const pk of this.pickups) {
        if (pk.kind !== kind || n >= 32) continue;
        const y = 0.35 + Math.sin(pk.bob) * 0.12;
        // A slow spin so the pickup catches the eye.
        const c = Math.cos(pk.bob * 0.5), s = Math.sin(pk.bob * 0.5);
        const o = n * 16;
        const m = b.matrices;
        m[o] = c; m[o + 1] = 0; m[o + 2] = -s; m[o + 3] = 0;
        m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = s; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0;
        m[o + 12] = pk.x; m[o + 13] = y; m[o + 14] = pk.z; m[o + 15] = 1;
        b.colors[n * 4] = 1; b.colors[n * 4 + 1] = 1; b.colors[n * 4 + 2] = 1; b.colors[n * 4 + 3] = 1;
        n++;
      }
      if (n > 0) {
        this.renderer.setInstances('pickup-' + kind, b.matrices, b.colors, n);
        this.renderer.drawBatch('pickup-' + kind);
      }
    }
  }
}
