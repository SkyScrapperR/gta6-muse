// Frustum culling: six planes extracted from the combined projection-view
// matrix, tested against bounding spheres. The city is drawn chunk by chunk
// and every chunk outside the view is skipped before it costs a draw call.

import { v3Dot } from '../core/math.js';

// Each plane is { n: [x, y, z], d: number } with the inside of the frustum
// on the side where dot(n, p) + d >= 0.
export function planesFromMatrix(m) {
  const planes = [];
  const row = (r) => [m[r], m[4 + r], m[8 + r], m[12 + r]];
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  const combos = [
    [r3, r0], [r3, r0, -1], [r3, r1], [r3, r1, -1], [r3, r2], [r3, r2, -1],
  ];
  for (const [a, b, sign] of combos) {
    const s = sign === -1 ? -1 : 1;
    const px = a[0] + s * b[0];
    const py = a[1] + s * b[1];
    const pz = a[2] + s * b[2];
    const pd = a[3] + s * b[3];
    const len = Math.sqrt(px * px + py * py + pz * pz) || 1;
    planes.push({ n: [px / len, py / len, pz / len], d: pd / len });
  }
  return planes;
}

export function sphereVisible(planes, center, radius) {
  for (const p of planes) {
    if (v3Dot(p.n, center) + p.d < -radius) return false;
  }
  return true;
}
