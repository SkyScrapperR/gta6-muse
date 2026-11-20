// Procedural geometry: every mesh in the game is built from these small
// builders and merged into chunk meshes. Flat-shaded low-poly on purpose:
// one normal per face, so buildings, cars and characters read as clean,
// chunky, modern low-poly. All colours are linear-ish 0..1 triples; emissive
// marks windows, neon and lamps, which glow at night.
//
// A geometry is plain arrays:
//   { positions, normals, colors, emissives, indices }
// merge() concatenates several into one draw call and computes a bounding
// sphere for frustum culling.

import { mat4TransformPoint, v3Norm } from '../core/math.js';

export function emptyGeometry() {
  return { positions: [], normals: [], colors: [], emissives: [], indices: [] };
}

function pushVertex(geo, x, y, z, nx, ny, nz, color, emissive) {
  geo.positions.push(x, y, z);
  geo.normals.push(nx, ny, nz);
  geo.colors.push(color[0], color[1], color[2]);
  geo.emissives.push(emissive[0], emissive[1], emissive[2]);
  return geo.positions.length / 3 - 1;
}

// One quad (two triangles) from four corners, flat normal from the winding.
export function pushQuad(geo, a, b, c, d, color, emissive = [0, 0, 0]) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  n = v3Norm(n);
  const i0 = pushVertex(geo, a[0], a[1], a[2], n[0], n[1], n[2], color, emissive);
  const i1 = pushVertex(geo, b[0], b[1], b[2], n[0], n[1], n[2], color, emissive);
  const i2 = pushVertex(geo, c[0], c[1], c[2], n[0], n[1], n[2], color, emissive);
  const i3 = pushVertex(geo, d[0], d[1], d[2], n[0], n[1], n[2], color, emissive);
  geo.indices.push(i0, i1, i2, i0, i2, i3);
  return geo;
}

export function pushTriangle(geo, a, b, c, color, emissive = [0, 0, 0]) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  n = v3Norm(n);
  const i0 = pushVertex(geo, a[0], a[1], a[2], n[0], n[1], n[2], color, emissive);
  const i1 = pushVertex(geo, b[0], b[1], b[2], n[0], n[1], n[2], color, emissive);
  const i2 = pushVertex(geo, c[0], c[1], c[2], n[0], n[1], n[2], color, emissive);
  geo.indices.push(i0, i1, i2);
  return geo;
}

// Axis-aligned box centred at (cx, cy, cz). topColor paints the roof.
export function box(geo, cx, cy, cz, w, h, d, color, emissive = [0, 0, 0], topColor = null) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const y0 = cy - h / 2, y1 = cy + h / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;
  const roof = topColor ?? color;
  pushQuad(geo, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], roof, emissive); // top
  pushQuad(geo, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, emissive); // bottom
  pushQuad(geo, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, emissive); // front
  pushQuad(geo, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, emissive); // back
  pushQuad(geo, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, emissive); // left
  pushQuad(geo, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, emissive); // right
  return geo;
}

// A box whose top face is smaller than its bottom face: the bevelled look
// used for car bodies, cabins, roofs and podiums.
export function taperBox(geo, cx, cy, cz, wBot, dBot, wTop, dTop, h, color, emissive = [0, 0, 0], topColor = null) {
  const xb0 = cx - wBot / 2, xb1 = cx + wBot / 2;
  const zb0 = cz - dBot / 2, zb1 = cz + dBot / 2;
  const xt0 = cx - wTop / 2, xt1 = cx + wTop / 2;
  const zt0 = cz - dTop / 2, zt1 = cz + dTop / 2;
  const y0 = cy - h / 2, y1 = cy + h / 2;
  const roof = topColor ?? color;
  pushQuad(geo, [xt0, y1, zt1], [xt1, y1, zt1], [xt1, y1, zt0], [xt0, y1, zt0], roof, emissive);
  pushQuad(geo, [xb0, y0, zb0], [xb1, y0, zb0], [xb1, y0, zb1], [xb0, y0, zb1], color, emissive);
  pushQuad(geo, [xb0, y0, zb1], [xb1, y0, zb1], [xt1, y1, zt1], [xt0, y1, zt1], color, emissive);
  pushQuad(geo, [xb1, y0, zb0], [xb0, y0, zb0], [xt0, y1, zt0], [xt1, y1, zt0], color, emissive);
  pushQuad(geo, [xb0, y0, zb0], [xb0, y0, zb1], [xt0, y1, zt1], [xt0, y1, zt0], color, emissive);
  pushQuad(geo, [xb1, y0, zb1], [xb1, y0, zb0], [xt1, y1, zt0], [xt1, y1, zt1], color, emissive);
  return geo;
}

// A tapered cylinder (limbs, trunks, poles, wheels): sides-gon prism with
// flat caps. Axis is Y.
export function cylinder(geo, cx, cy, cz, rTop, rBottom, h, sides, color, emissive = [0, 0, 0]) {
  const y0 = cy - h / 2, y1 = cy + h / 2;
  const ring = (r, y) => {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
    }
    return pts;
  };
  const bot = ring(rBottom, y0);
  const top = ring(rTop, y1);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    pushQuad(geo, bot[i], bot[j], top[j], top[i], color, emissive);
  }
  // Caps as fans around the centre point.
  const cTop = [cx, y1, cz];
  const cBot = [cx, y0, cz];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    pushTriangle(geo, cTop, top[j], top[i], color, emissive);
    pushTriangle(geo, cBot, bot[i], bot[j], color, emissive);
  }
  return geo;
}

// Low-poly sphere (lat-long), for heads, lamps and buoys.
export function sphere(geo, cx, cy, cz, r, latSegs, lonSegs, color, emissive = [0, 0, 0]) {
  const at = (lat, lon) => {
    const phi = (lat / latSegs) * Math.PI;
    const theta = (lon / lonSegs) * Math.PI * 2;
    return [
      cx + r * Math.sin(phi) * Math.cos(theta),
      cy + r * Math.cos(phi),
      cz + r * Math.sin(phi) * Math.sin(theta),
    ];
  };
  for (let lat = 0; lat < latSegs; lat++) {
    for (let lon = 0; lon < lonSegs; lon++) {
      const a = at(lat, lon), b = at(lat, lon + 1);
      const c = at(lat + 1, lon + 1), d = at(lat + 1, lon);
      if (lat === 0) pushTriangle(geo, a, b, c, color, emissive);
      else if (lat === latSegs - 1) pushTriangle(geo, a, b, c, color, emissive);
      else pushQuad(geo, a, b, c, d, color, emissive);
    }
  }
  return geo;
}

// Flat grid plane facing up, subdivided for the water waves.
export function gridPlane(geo, cx, cy, cz, w, d, segX, segZ, color, emissive = [0, 0, 0]) {
  for (let ix = 0; ix < segX; ix++) {
    for (let iz = 0; iz < segZ; iz++) {
      const x0 = cx - w / 2 + (ix / segX) * w;
      const x1 = cx - w / 2 + ((ix + 1) / segX) * w;
      const z0 = cz - d / 2 + (iz / segZ) * d;
      const z1 = cz - d / 2 + ((iz + 1) / segZ) * d;
      pushQuad(geo, [x0, cy, z1], [x1, cy, z1], [x1, cy, z0], [x0, cy, z0], color, emissive);
    }
  }
  return geo;
}

// A unit quad in the XY plane, centred on the origin: the particle sprite.
export function unitQuad() {
  const geo = emptyGeometry();
  pushQuad(geo, [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0], [1, 1, 1]);
  return geo;
}

// Apply a mat4 to a geometry in place (positions and normals).
export function transformGeometry(geo, m) {
  for (let i = 0; i < geo.positions.length; i += 3) {
    const p = mat4TransformPoint(m, [geo.positions[i], geo.positions[i + 1], geo.positions[i + 2]]);
    geo.positions[i] = p[0]; geo.positions[i + 1] = p[1]; geo.positions[i + 2] = p[2];
    // Normal transform: upper 3x3, then renormalise.
    const nx = geo.normals[i], ny = geo.normals[i + 1], nz = geo.normals[i + 2];
    const tx = m[0] * nx + m[4] * ny + m[8] * nz;
    const ty = m[1] * nx + m[5] * ny + m[9] * nz;
    const tz = m[2] * nx + m[6] * ny + m[10] * nz;
    const l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    geo.normals[i] = tx / l; geo.normals[i + 1] = ty / l; geo.normals[i + 2] = tz / l;
  }
  return geo;
}

// Merge several geometries into one, with index offsets, and compute a
// bounding sphere {center, radius} for frustum culling.
export function merge(parts) {
  const out = emptyGeometry();
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const part of parts) {
    const base = out.positions.length / 3;
    for (let i = 0; i < part.positions.length; i++) out.positions.push(part.positions[i]);
    for (let i = 0; i < part.normals.length; i++) out.normals.push(part.normals[i]);
    for (let i = 0; i < part.colors.length; i++) out.colors.push(part.colors[i]);
    for (let i = 0; i < part.emissives.length; i++) out.emissives.push(part.emissives[i]);
    for (const idx of part.indices) out.indices.push(idx + base);
    for (let i = 0; i < part.positions.length; i += 3) {
      const x = part.positions[i], y = part.positions[i + 1], z = part.positions[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  if (out.positions.length === 0) {
    out.bounds = { center: [0, 0, 0], radius: 0 };
    return out;
  }
  const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  let radius = 0;
  for (let i = 0; i < out.positions.length; i += 3) {
    const dx = out.positions[i] - center[0];
    const dy = out.positions[i + 1] - center[1];
    const dz = out.positions[i + 2] - center[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > radius) radius = d;
  }
  out.bounds = { center, radius };
  return out;
}
