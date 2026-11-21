// Night point lights (Tier 2): a registry that feeds the lit shader's
// uniform arrays. Static lights come from the city's street lamps
// (built once from city.lamps); dynamic lights are re-registered every
// frame by headlights, taillights, police lightbars, neon signs, muzzle
// flashes, the heli spotlight and cutscene key/rim lights.
//
// Each frame the registry sorts all lights by distance to the camera and
// uploads the nearest N into the shader — 12 on Low, 24 on Medium, 48
// on High — so a dense city never costs more than the preset allows.
// Lights only matter at night: by day the sun drowns them out, so the
// upload is skipped entirely when night < 0.25.
const MAX_LIGHTS = 48;

export class LightRegistry {
  constructor() {
    this.statics = [];
    this.dynamics = [];
    this.pos = new Float32Array(MAX_LIGHTS * 4);
    this.col = new Float32Array(MAX_LIGHTS * 4);
    this.count = 0;
    this.cap = 24;
    this._dist = new Float32Array(0);
  }

  // A static light: x/y/z in world space, rgb colour, intensity (0-1,
  // multiplies the shader's clamp) and radius in metres.
  addStatic(x, y, z, r, g, b, intensity, radius) {
    this.statics.push({ x, y, z, r, g, b, intensity, radius });
  }

  clearDynamics() {
    this.dynamics.length = 0;
  }

  addDynamic(x, y, z, r, g, b, intensity, radius) {
    this.dynamics.push({ x, y, z, r, g, b, intensity, radius });
  }

  // Pick the nearest `cap` lights to the camera and write them into the
  // upload buffers. `night` is 0 by day, 1 at full night.
  update(camX, camY, camZ, cap, night) {
    this.cap = cap;
    if (night < 0.25) { this.count = 0; return; }
    const all = this.statics.concat(this.dynamics);
    const n = all.length;
    if (this._dist.length < n) this._dist = new Float32Array(n);
    const d = this._dist;
    for (let i = 0; i < n; i++) {
      const l = all[i];
      const dx = l.x - camX;
      const dy = l.y - camY;
      const dz = l.z - camZ;
      d[i] = dx * dx + dy * dy + dz * dz;
    }
    // Partial selection sort: only the first `cap` entries need to be
    // the nearest, the rest can stay unsorted.
    const k = Math.min(cap, n);
    for (let i = 0; i < k; i++) {
      let best = i;
      for (let j = i + 1; j < n; j++) {
        if (d[j] < d[best]) best = j;
      }
      if (best !== i) {
        const td = d[i]; d[i] = d[best]; d[best] = td;
        const tl = all[i]; all[i] = all[best]; all[best] = tl;
      }
    }
    this.count = k;
    for (let i = 0; i < k; i++) {
      const l = all[i];
      const o = i * 4;
      this.pos[o] = l.x;
      this.pos[o + 1] = l.y;
      this.pos[o + 2] = l.z;
      this.pos[o + 3] = l.radius;
      this.col[o] = l.r;
      this.col[o + 1] = l.g;
      this.col[o + 2] = l.b;
      this.col[o + 3] = l.intensity;
    }
  }
}
