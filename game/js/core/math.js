// Core math: small vector/matrix helpers and a seeded random generator.
//
// The game simulates on the ground plane (x east, z south, y up) and renders
// in 3D. Matrices are column-major Float32Arrays, the way WebGL expects
// them. Nothing here reads the clock or Math.random: every random stream
// comes from a mulberry32 generator built from an explicit seed, so a scene
// built from a seed renders exactly the same way every time.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Wrap an angle to (-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// Shortest signed turn from angle a to angle b.
export function angleDelta(a, b) {
  return wrapAngle(b - a);
}

export function dist2D(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

// --- vec3 (plain [x, y, z] arrays; game logic uses these) ---

export function v3(x = 0, y = 0, z = 0) {
  return [x, y, z];
}

export function v3Add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function v3Sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function v3Scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function v3Dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function v3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function v3Len(a) {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export function v3Norm(a) {
  const l = v3Len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

// --- mat4 (Float32Array(16), column-major) ---

export function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

export function mat4Multiply(a, b) {
  // Returns a * b (b applied first).
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

// Orthographic projection, column-major like the rest of the engine.
// Used for the directional shadow map's light camera.
export function mat4Ortho(left, right, bottom, top, near, far) {
  const m = new Float32Array(16);
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = -2 / (far - near);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = -(far + near) / (far - near);
  m[15] = 1;
  return m;
}

export function mat4LookAt(eye, target, up) {
  const z = v3Norm(v3Sub(eye, target));
  const x = v3Norm(v3Cross(up, z));
  const y = v3Cross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
  m[12] = -v3Dot(x, eye);
  m[13] = -v3Dot(y, eye);
  m[14] = -v3Dot(z, eye);
  m[15] = 1;
  return m;
}

export function mat4Translate(x, y, z) {
  const m = mat4Identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

export function mat4Scale(x, y, z) {
  const m = mat4Identity();
  m[0] = x; m[5] = y; m[10] = z;
  return m;
}

export function mat4RotateY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = mat4Identity();
  m[0] = c; m[2] = -s;
  m[8] = s; m[10] = c;
  return m;
}

export function mat4RotateX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = mat4Identity();
  m[5] = c; m[6] = s;
  m[9] = -s; m[10] = c;
  return m;
}

export function mat4RotateZ(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = mat4Identity();
  m[0] = c; m[1] = s;
  m[4] = -s; m[5] = c;
  return m;
}

// Compose translation * rotationY * rotationX * rotationZ * scale in one go.
// Used for every entity transform in the game.
export function mat4TRS(x, y, z, ry, rx, rz, sx, sy, sz) {
  let m = mat4Translate(x, y, z);
  m = mat4Multiply(m, mat4RotateY(ry));
  if (rx) m = mat4Multiply(m, mat4RotateX(rx));
  if (rz) m = mat4Multiply(m, mat4RotateZ(rz));
  m = mat4Multiply(m, mat4Scale(sx, sy, sz));
  return m;
}

// Transform a point by a mat4.
export function mat4TransformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

// --- Seeded random: mulberry32 ---

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function rngInt(rng, lo, hi) {
  return Math.floor(rngRange(rng, lo, hi + 1));
}

export function rngPick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function rngChance(rng, p) {
  return rng() < p;
}

// Deterministic string hash, for turning names into seeds.
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
