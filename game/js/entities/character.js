// Characters: smooth low-poly humanoids built from primitives, animated
// procedurally. Every body part is one instanced batch (torso, head, hair
// styles, limbs, accessories), so fifty pedestrians cost thirteen draw
// calls, not seven hundred.
//
// A character faces local +Z. Each part geometry is pivot-centred: a limb's
// origin is its joint, so the rig only has to rotate joints. Forward
// kinematics: shoulder -> elbow -> hand, hip -> knee -> foot.
//
// Outfits are per-instance colours: torso and sleeves take the jacket,
// legs the trousers, feet the shoes, head and hands the skin, hair the hair.

import {
  box, cylinder, sphere, taperBox, emptyGeometry, merge,
} from '../engine/mesh.js';
import {
  mat4TRS, mat4Multiply,
} from '../core/math.js';

const MAX_CHARACTERS = 96;

// --- Part geometries (pivot-centred, unit height ~1.8 m) ---

function torsoGeometry() {
  const g = emptyGeometry();
  taperBox(g, 0, 0, 0, 0.46, 0.26, 0.40, 0.22, 0.62, [1, 1, 1]);
  // Shirt panel + collar + belt, as darker multipliers of the jacket.
  box(g, 0, 0.08, 0.14, 0.26, 0.30, 0.03, [0.45, 0.45, 0.45]);
  box(g, 0, 0.30, 0.10, 0.20, 0.06, 0.05, [0.35, 0.35, 0.35]);
  box(g, 0, -0.30, 0, 0.44, 0.06, 0.26, [0.20, 0.20, 0.20]);
  return g;
}

function headGeometry() {
  const g = emptyGeometry();
  sphere(g, 0, 0, 0, 0.16, 7, 10, [1, 1, 1]);
  // Face: eyes, brows, nose, mouth — dark, so they stay dark under any skin.
  const dark = [0.06, 0.05, 0.05];
  box(g, -0.06, 0.03, 0.145, 0.035, 0.025, 0.02, dark);
  box(g, 0.06, 0.03, 0.145, 0.035, 0.025, 0.02, dark);
  box(g, -0.06, 0.075, 0.145, 0.05, 0.015, 0.02, [0.35, 0.25, 0.18]);
  box(g, 0.06, 0.075, 0.145, 0.05, 0.015, 0.02, [0.35, 0.25, 0.18]);
  box(g, 0, -0.01, 0.155, 0.03, 0.05, 0.03, [0.85, 0.65, 0.50]);
  box(g, 0, -0.075, 0.15, 0.07, 0.015, 0.02, [0.35, 0.15, 0.12]);
  return g;
}

function hairGeometry(style) {
  const g = emptyGeometry();
  // A cap sphere, offset up and back so the face stays clear.
  sphere(g, 0, 0.09, -0.03, 0.165, 6, 10, [1, 1, 1]);
  if (style === 'bun') {
    sphere(g, 0, 0.16, -0.14, 0.075, 5, 6, [1, 1, 1]);
  } else if (style === 'ponytail') {
    taperBox(g, 0, -0.08, -0.20, 0.09, 0.07, 0.05, 0.05, 0.35, [1, 1, 1]);
  } else if (style === 'curly') {
    sphere(g, -0.09, 0.18, -0.02, 0.08, 5, 6, [1, 1, 1]);
    sphere(g, 0.09, 0.18, -0.02, 0.08, 5, 6, [1, 1, 1]);
    sphere(g, 0, 0.22, -0.05, 0.08, 5, 6, [1, 1, 1]);
  } else if (style === 'cap') {
    cylinder(g, 0, 0.13, 0, 0.185, 0.185, 0.07, 10, [1, 1, 1]);
    box(g, 0, 0.10, 0.20, 0.22, 0.03, 0.14, [1, 1, 1]);
  }
  return g;
}

function limbGeometry(rTop, rBottom, len, color) {
  const g = emptyGeometry();
  cylinder(g, 0, -len / 2, 0, rTop, rBottom, len, 6, color);
  return g;
}

function handGeometry() {
  const g = emptyGeometry();
  sphere(g, 0, -0.04, 0, 0.07, 5, 6, [1, 1, 1]);
  return g;
}

function footGeometry() {
  const g = emptyGeometry();
  box(g, 0, -0.03, 0.07, 0.11, 0.07, 0.27, [1, 1, 1]);
  return g;
}

function glassesGeometry() {
  const g = emptyGeometry();
  const dark = [0.08, 0.08, 0.10];
  box(g, -0.065, 0.02, 0.155, 0.07, 0.05, 0.02, dark);
  box(g, 0.065, 0.02, 0.155, 0.07, 0.05, 0.02, dark);
  box(g, 0, 0.02, 0.155, 0.04, 0.015, 0.02, dark);
  return g;
}

function headphonesGeometry() {
  const g = emptyGeometry();
  box(g, 0, 0.14, 0, 0.36, 0.04, 0.06, [0.15, 0.15, 0.18]);
  cylinder(g, -0.175, 0, 0, 0.06, 0.06, 0.05, 8, [0.15, 0.15, 0.18]);
  cylinder(g, 0.175, 0, 0, 0.06, 0.06, 0.05, 8, [0.15, 0.15, 0.18]);
  return g;
}

// --- The rig ---

// Local offsets (metres) of each joint from the character root (feet).
const JOINTS = {
  torso: [0, 1.16, 0],
  head: [0, 1.62, 0],
  hair: [0, 1.62, 0],
  shoulderL: [-0.28, 1.44, 0],
  shoulderR: [0.28, 1.44, 0],
  hipL: [-0.12, 0.96, 0],
  hipR: [0.12, 0.96, 0],
};

const PARTS = [
  'torso', 'head', 'hair', 'armUpL', 'armUpR', 'armLowL', 'armLowR',
  'handL', 'handR', 'legUpL', 'legUpR', 'legLowL', 'legLowR',
  'footL', 'footR', 'glasses', 'headphones',
];

export class CharacterSystem {
  constructor(renderer) {
    this.renderer = renderer;
    this.characters = [];
    this.batches = {};
    const defs = [
      ['torso', torsoGeometry()],
      ['head', headGeometry()],
      ['hair-short', hairGeometry('short')],
      ['hair-bun', hairGeometry('bun')],
      ['hair-cap', hairGeometry('cap')],
      ['hair-ponytail', hairGeometry('ponytail')],
      ['hair-curly', hairGeometry('curly')],
      ['armUp', limbGeometry(0.075, 0.06, 0.34, [1, 1, 1])],
      ['armLow', limbGeometry(0.06, 0.05, 0.32, [1, 1, 1])],
      ['hand', handGeometry()],
      ['legUp', limbGeometry(0.095, 0.075, 0.44, [1, 1, 1])],
      ['legLow', limbGeometry(0.075, 0.055, 0.42, [1, 1, 1])],
      ['foot', footGeometry()],
      ['glasses', glassesGeometry()],
      ['headphones', headphonesGeometry()],
    ];
    for (const [name, geo] of defs) {
      this.batches[name] = {
        batch: renderer.createBatch('char-' + name, geo, MAX_CHARACTERS),
        matrices: new Float32Array(MAX_CHARACTERS * 16),
        colors: new Float32Array(MAX_CHARACTERS * 4),
        count: 0,
      };
    }
  }

  add(def) {
    const c = {
      x: def.x ?? 0, z: def.z ?? 0, y: def.y ?? 0,
      heading: def.heading ?? 0,
      speed: 0,
      pose: def.pose ?? 'idle',
      scale: def.scale ?? 1,
      width: def.width ?? 1,
      outfit: def.outfit ?? defaultOutfit(),
      aimHeading: 0, punchT: 0, deadT: 0,
      bobY: 0,
      ...def,
    };
    // Deterministic phase from position (no Math.random in the build).
    c.phase = ((c.x * 13.7 + c.z * 7.1) % 6.28 + 6.28) % 6.28;
    this.characters.push(c);
    return c;
  }

  remove(c) {
    const i = this.characters.indexOf(c);
    if (i >= 0) this.characters.splice(i, 1);
  }

  // Write one instance into a part batch.
  put(batchName, matrix, color, emissive = 0) {
    const b = this.batches[batchName];
    if (!b || b.count >= MAX_CHARACTERS) return;
    b.matrices.set(matrix, b.count * 16);
    b.colors[b.count * 4] = color[0];
    b.colors[b.count * 4 + 1] = color[1];
    b.colors[b.count * 4 + 2] = color[2];
    b.colors[b.count * 4 + 3] = emissive;
    b.count++;
  }

  update(dt, time) {
    for (const b of Object.values(this.batches)) b.count = 0;
    for (const c of this.characters) {
      this.rigCharacter(c, dt, time);
    }
    for (const [name, b] of Object.entries(this.batches)) {
      if (b.count > 0) {
        this.renderer.setInstances('char-' + name, b.matrices, b.colors, b.count);
      }
    }
  }

  draw() {
    for (const name of Object.keys(this.batches)) {
      this.renderer.drawBatch('char-' + name);
    }
  }

  rigCharacter(c, dt, time) {
    const o = c.outfit;
    const moving = c.speed > 0.3;
    const running = c.speed > 4.2;
    if (moving) c.phase += dt * c.speed * 1.55;
    const swing = moving ? Math.sin(c.phase) * (running ? 0.75 : 0.55) : 0;
    const bob = moving ? Math.abs(Math.cos(c.phase)) * 0.045 : Math.sin(time * 2 + c.phase) * 0.008;
    c.bobY = bob;

    // Root: feet position, heading, height/build scale.
    const root = mat4TRS(c.x, c.y + bob, c.z, c.heading, 0, 0, c.width, c.scale, c.width);
    const dead = c.pose === 'dead';
    const rootM = dead
      ? mat4Multiply(root, mat4TRS(0, 0.35, 0, 0, -Math.PI / 2 + Math.min(c.deadT, 1) * 0, 0, 1, 1, 1))
      : root;

    const local = (joint, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const m = mat4TRS(joint[0], joint[1], joint[2], ry, rx, rz, sx, sy, sz);
      return mat4Multiply(rootM, m);
    };
    const child = (parent, offset, rx = 0, ry = 0, rz = 0) => {
      const m = mat4TRS(offset[0], offset[1], offset[2], ry, rx, rz, 1, 1, 1);
      return mat4Multiply(parent, m);
    };

    // Torso (slight lean when running, twist when aiming).
    const torsoTwist = c.pose === 'aim' ? -0.25 : 0;
    const torsoLean = running ? 0.12 : 0;
    this.put('torso', local(JOINTS.torso, torsoLean, torsoTwist), o.jacket);

    // Head: looks where the character aims, or along the heading.
    const headRy = c.pose === 'aim' ? c.aimHeading - c.heading : 0;
    this.put('head', local(JOINTS.head, 0, headRy), o.skin);
    const hairBatch = 'hair-' + (o.hairStyle || 'short');
    this.put(hairBatch, local(JOINTS.hair, 0, headRy), o.hair);
    if (o.glasses) this.put('glasses', local(JOINTS.head, 0, headRy), [1, 1, 1]);
    if (o.headphones) this.put('headphones', local(JOINTS.head, 0, headRy), [1, 1, 1]);

    // Arms: shoulders hang from the torso; elbows hang from the shoulders.
    let armLx = 0, armRx = 0, armLz = 0, armRz = 0, elbowL = -0.25, elbowR = -0.25;
    if (c.pose === 'aim') {
      armRx = -1.35; armLx = -0.95; armLz = 0.35; elbowL = -0.5; elbowR = -0.08;
    } else if (c.pose === 'punch') {
      const ext = Math.sin(Math.min(c.punchT, 1) * Math.PI);
      armRx = -1.5 * ext; elbowR = -0.05;
      armLx = -0.3; elbowL = -0.6;
    } else if (c.pose === 'drive' || c.pose === 'sit') {
      armRx = -1.05; armLx = -1.05; elbowL = -0.35; elbowR = -0.35;
    } else if (moving) {
      armLx = swing * 0.8; armRx = -swing * 0.8;
      armLz = 0.08; armRz = -0.08;
    } else {
      armLx = 0.04; armRx = 0.04; armLz = 0.06; armRz = -0.06;
    }
    const shL = local(JOINTS.shoulderL, armLx, 0, armLz);
    const shR = local(JOINTS.shoulderR, armRx, 0, armRz);
    this.put('armUp', shL, o.jacket);
    this.put('armUp', shR, o.jacket);
    const elL = child(shL, [0, -0.34, 0], elbowL);
    const elR = child(shR, [0, -0.34, 0], elbowR);
    this.put('armLow', elL, o.jacket);
    this.put('armLow', elR, o.jacket);
    this.put('hand', child(elL, [0, -0.32, 0]), o.skin);
    this.put('hand', child(elR, [0, -0.32, 0]), o.skin);

    // Legs: hips swing, knees bend.
    let legLx = 0, legRx = 0, kneeL = 0, kneeR = 0;
    if (c.pose === 'drive' || c.pose === 'sit') {
      legLx = -1.35; legRx = -1.35; kneeL = 1.25; kneeR = 1.25;
    } else if (moving) {
      legLx = -swing; legRx = swing;
      kneeL = Math.max(0, Math.sin(c.phase + 0.6)) * 0.9;
      kneeR = Math.max(0, Math.sin(c.phase + Math.PI + 0.6)) * 0.9;
    }
    const hipL = local(JOINTS.hipL, legLx);
    const hipR = local(JOINTS.hipR, legRx);
    this.put('legUp', hipL, o.pants);
    this.put('legUp', hipR, o.pants);
    const knL = child(hipL, [0, -0.44, 0], kneeL);
    const knR = child(hipR, [0, -0.44, 0], kneeR);
    this.put('legLow', knL, o.pants);
    this.put('legLow', knR, o.pants);
    this.put('foot', child(knL, [0, -0.42, 0]), o.shoes);
    this.put('foot', child(knR, [0, -0.42, 0]), o.shoes);
  }
}

export function defaultOutfit() {
  return {
    skin: [0.82, 0.62, 0.45],
    hair: [0.12, 0.10, 0.08],
    hairStyle: 'short',
    jacket: [0.35, 0.40, 0.45],
    pants: [0.25, 0.25, 0.30],
    shoes: [0.15, 0.15, 0.15],
  };
}

export const OUTFITS = {
  kai: {
    skin: [0.80, 0.60, 0.44], hair: [0.10, 0.08, 0.07], hairStyle: 'short',
    jacket: [0.05, 0.55, 0.55], pants: [0.16, 0.16, 0.20], shoes: [0.12, 0.12, 0.12],
  },
  cop: {
    skin: [0.75, 0.58, 0.42], hair: [0.15, 0.12, 0.10], hairStyle: 'cap',
    jacket: [0.10, 0.14, 0.30], pants: [0.10, 0.14, 0.30], shoes: [0.08, 0.08, 0.08],
  },
  gang: {
    skin: [0.78, 0.60, 0.44], hair: [0.08, 0.08, 0.08], hairStyle: 'short',
    jacket: [0.45, 0.20, 0.60], pants: [0.20, 0.18, 0.25], shoes: [0.12, 0.12, 0.12],
  },
  mamaLin: {
    skin: [0.82, 0.65, 0.50], hair: [0.55, 0.55, 0.55], hairStyle: 'bun',
    jacket: [0.85, 0.45, 0.15], pants: [0.30, 0.28, 0.25], shoes: [0.20, 0.18, 0.15],
    glasses: true,
  },
  dex: {
    skin: [0.70, 0.55, 0.40], hair: [0.10, 0.10, 0.10], hairStyle: 'curly',
    jacket: [0.25, 0.35, 0.45], pants: [0.20, 0.22, 0.28], shoes: [0.85, 0.85, 0.85],
    headphones: true,
  },
  viktor: {
    skin: [0.85, 0.68, 0.52], hair: [0.20, 0.18, 0.15], hairStyle: 'short',
    jacket: [0.92, 0.92, 0.90], pants: [0.92, 0.92, 0.90], shoes: [0.10, 0.10, 0.10],
  },
  ped: null, // generated per pedestrian
};

export function randomPedOutfit(rng) {
  const skins = [[0.85, 0.65, 0.48], [0.70, 0.52, 0.38], [0.60, 0.45, 0.33], [0.90, 0.72, 0.55]];
  const hairs = [[0.10, 0.08, 0.06], [0.25, 0.18, 0.10], [0.45, 0.45, 0.45], [0.15, 0.10, 0.05]];
  const jackets = [[0.70, 0.30, 0.25], [0.25, 0.45, 0.65], [0.85, 0.70, 0.35], [0.35, 0.55, 0.35], [0.75, 0.75, 0.75], [0.20, 0.20, 0.25]];
  const pants = [[0.25, 0.25, 0.30], [0.35, 0.30, 0.25], [0.15, 0.20, 0.35], [0.45, 0.45, 0.45]];
  const styles = ['short', 'short', 'bun', 'ponytail', 'curly', 'cap'];
  return {
    skin: skins[Math.floor(rng() * skins.length)],
    hair: hairs[Math.floor(rng() * hairs.length)],
    hairStyle: styles[Math.floor(rng() * styles.length)],
    jacket: jackets[Math.floor(rng() * jackets.length)],
    pants: pants[Math.floor(rng() * pants.length)],
    shoes: [0.12, 0.12, 0.12],
  };
}
