// Street props: one merged geometry per prop type, drawn instanced across
// the city. A lamp is a pole, an arm and a glowing head; a palm is a trunk
// and six drooping fronds; a container is a plain box whose colour varies
// per instance. Placement lists come from the city generator.

import { box, cylinder, sphere, taperBox, emptyGeometry, merge, transformGeometry } from '../engine/mesh.js';
import { mat4Multiply, mat4RotateY, mat4RotateZ, mat4Translate } from '../core/math.js';

const WARM_LAMP = [1.0, 0.72, 0.32];

export function lampGeometry() {
  const g = emptyGeometry();
  cylinder(g, 0, 2.5, 0, 0.09, 0.09, 5, 6, [0.16, 0.17, 0.19]);
  box(g, 0.7, 4.9, 0, 1.5, 0.12, 0.12, [0.16, 0.17, 0.19]);
  box(g, 1.4, 4.8, 0, 0.5, 0.18, 0.3, [0.25, 0.25, 0.28], WARM_LAMP);
  return g;
}

export function leafTreeGeometry() {
  const g = emptyGeometry();
  cylinder(g, 0, 1.4, 0, 0.22, 0.32, 2.8, 6, [0.35, 0.25, 0.16]);
  // Canopy blobs at 4x6 segments (36 tris each, was 80): a tree reads
  // by its silhouette, not by sphere smoothness — Checkpoint 2 perf.
  sphere(g, 0, 3.6, 0, 1.7, 4, 6, [0.20, 0.45, 0.22]);
  sphere(g, 0.9, 3.0, 0.4, 1.1, 4, 6, [0.25, 0.52, 0.25]);
  sphere(g, -0.8, 3.1, -0.3, 1.0, 4, 6, [0.18, 0.42, 0.20]);
  return g;
}

export function palmGeometry() {
  const g = emptyGeometry();
  cylinder(g, 0, 2.6, 0, 0.16, 0.24, 5.2, 6, [0.45, 0.35, 0.24]);
  // Six fronds: flat tapered leaves that stick out from the crown and
  // droop. Built pointing +x, tilted down, then spun around Y.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const f = emptyGeometry();
    taperBox(f, 1.4, 0, 0, 2.8, 0.5, 0.15, 0.4, 0.12, [0.22, 0.55, 0.28]);
    let m = mat4Multiply(mat4RotateY(-a), mat4RotateZ(-0.55));
    m = mat4Multiply(mat4Translate(0, 5.2, 0), m);
    transformGeometry(f, m);
    const merged = merge([g, f]);
    g.positions = merged.positions; g.normals = merged.normals;
    g.colors = merged.colors; g.emissives = merged.emissives; g.indices = merged.indices;
  }
  return g;
}

export function benchGeometry() {
  const g = emptyGeometry();
  box(g, 0, 0.45, 0, 1.8, 0.08, 0.5, [0.45, 0.32, 0.20]);
  box(g, 0, 0.85, -0.24, 1.8, 0.7, 0.08, [0.45, 0.32, 0.20]);
  box(g, -0.8, 0.22, 0, 0.08, 0.44, 0.45, [0.20, 0.20, 0.22]);
  box(g, 0.8, 0.22, 0, 0.08, 0.44, 0.45, [0.20, 0.20, 0.22]);
  return g;
}

export function binGeometry() {
  const g = emptyGeometry();
  cylinder(g, 0, 0.5, 0, 0.3, 0.28, 1.0, 8, [0.22, 0.28, 0.24]);
  return g;
}

export function hydrantGeometry() {
  const g = emptyGeometry();
  cylinder(g, 0, 0.4, 0, 0.16, 0.18, 0.8, 6, [0.80, 0.15, 0.12]);
  sphere(g, 0, 0.85, 0, 0.18, 5, 6, [0.80, 0.15, 0.12]);
  return g;
}

export function busStopGeometry() {
  const g = emptyGeometry();
  cylinder(g, -1.2, 1.3, 0, 0.06, 0.06, 2.6, 6, [0.20, 0.22, 0.25]);
  cylinder(g, 1.2, 1.3, 0, 0.06, 0.06, 2.6, 6, [0.20, 0.22, 0.25]);
  box(g, 0, 2.7, 0, 3.0, 0.1, 1.2, [0.25, 0.45, 0.55]);
  box(g, 0, 0.5, -0.3, 2.4, 0.08, 0.5, [0.45, 0.32, 0.20]);
  return g;
}

export function containerGeometry() {
  const g = emptyGeometry();
  box(g, 0, 1.3, 0, 12, 2.6, 2.6, [1, 1, 1]);
  // Ribs: thin raised strips along the sides.
  for (let i = -2; i <= 2; i++) {
    box(g, i * 2.2, 1.3, 1.32, 0.18, 2.6, 0.06, [0.85, 0.85, 0.85]);
    box(g, i * 2.2, 1.3, -1.32, 0.18, 2.6, 0.06, [0.85, 0.85, 0.85]);
  }
  return g;
}

export function craneGeometry() {
  const g = emptyGeometry();
  // Four legs.
  for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    box(g, lx, 7, lz, 0.8, 14, 0.8, [0.85, 0.65, 0.15]);
  }
  // Top beam and jib.
  box(g, 0, 14.5, 0, 8, 1.2, 1.2, [0.85, 0.65, 0.15]);
  box(g, 12, 14.2, 0, 18, 0.8, 0.8, [0.85, 0.65, 0.15]);
  box(g, -6, 14.2, 0, 6, 0.8, 0.8, [0.85, 0.65, 0.15]);
  // Cabin + hook line.
  box(g, 0, 13.2, 0, 2.2, 1.6, 2.0, [0.25, 0.25, 0.30]);
  box(g, 16, 10, 0, 0.12, 8, 0.12, [0.30, 0.30, 0.33]);
  box(g, 16, 5.8, 0, 1.0, 0.8, 1.0, [0.85, 0.65, 0.15]);
  // Warning lights.
  sphere(g, 20, 14.6, 0, 0.25, 5, 6, [0.9, 0.15, 0.1], [1.0, 0.15, 0.1]);
  return g;
}

export function boatGeometry() {
  const g = emptyGeometry();
  taperBox(g, 0, 0.7, 0, 3.0, 8.0, 2.4, 6.5, 1.2, [0.85, 0.85, 0.88]);
  taperBox(g, 0, 1.7, -0.5, 2.2, 3.0, 2.0, 2.6, 1.0, [0.30, 0.55, 0.70]);
  cylinder(g, 0, 2.6, 0.5, 0.08, 0.08, 1.6, 5, [0.40, 0.40, 0.42]);
  return g;
}

export function umbrellaGeometry() {
  const g = emptyGeometry();
  cylinder(g, 0, 1.1, 0, 0.05, 0.05, 2.2, 5, [0.70, 0.60, 0.45]);
  taperBox(g, 0, 2.4, 0, 0.3, 0.3, 3.2, 3.2, 0.7, [0.95, 0.45, 0.30]);
  return g;
}

// Food cart (Tier 3, step 17): a street vendor's gerobak — wooden body,
// a bright striped canopy on two poles, two wheels. Cheap (~30 tris),
// so eight of them cost nothing and the night market reads at a glance.
export function cartGeometry() {
  const g = emptyGeometry();
  box(g, 0, 0.7, 0, 1.7, 0.7, 0.9, [0.55, 0.38, 0.20]); // body
  box(g, 0, 1.15, 0, 1.8, 0.08, 1.0, [0.65, 0.48, 0.26]); // counter top
  cylinder(g, -0.8, 0.3, 0, 0.3, 0.3, 0.12, 8, [0.15, 0.15, 0.16]); // wheels
  cylinder(g, 0.8, 0.3, 0, 0.3, 0.3, 0.12, 8, [0.15, 0.15, 0.16]);
  cylinder(g, -0.7, 1.6, -0.35, 0.04, 0.04, 0.9, 5, [0.30, 0.30, 0.32]); // poles
  cylinder(g, 0.7, 1.6, -0.35, 0.04, 0.04, 0.9, 5, [0.30, 0.30, 0.32]);
  cylinder(g, -0.7, 1.6, 0.35, 0.04, 0.04, 0.9, 5, [0.30, 0.30, 0.32]);
  cylinder(g, 0.7, 1.6, 0.35, 0.04, 0.04, 0.9, 5, [0.30, 0.30, 0.32]);
  box(g, 0, 2.1, 0, 2.0, 0.06, 1.2, [0.95, 0.45, 0.30]); // canopy
  return g;
}

export function billboardGeometry() {
  const g = emptyGeometry();
  box(g, 0, 4, 0, 0.6, 8, 0.6, [0.20, 0.20, 0.22]);
  box(g, 0, 9.5, 0, 12, 5, 0.4, [0.12, 0.12, 0.16], [0.9, 0.35, 0.75]);
  box(g, 0, 9.5, 0.25, 11, 4, 0.1, [0.95, 0.45, 0.80], [1.0, 0.5, 0.85]);
  return g;
}

export function fountainGeometry() {
  const g = emptyGeometry();
  cylinder(g, 0, 0.5, 0, 4.5, 4.5, 1.0, 12, [0.55, 0.55, 0.58]);
  cylinder(g, 0, 0.9, 0, 4.0, 4.0, 0.3, 12, [0.20, 0.45, 0.60]);
  cylinder(g, 0, 1.6, 0, 0.4, 0.5, 2.2, 8, [0.55, 0.55, 0.58]);
  sphere(g, 0, 2.9, 0, 0.5, 6, 8, [0.55, 0.55, 0.58]);
  return g;
}
