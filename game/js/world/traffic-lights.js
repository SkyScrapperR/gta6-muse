// Traffic light heads (Tier 2): a visible pole + housing + three lamps
// at every intersection, cycling in step with the traffic-light logic
// in roads.js (which the AI traffic already obeys).
//
// One head per corner of each of the 121 intersections — 484 heads.
// The poles and housings never move (matrices written once); only the
// lamp colours change, and only for the heads whose state just flipped,
// so the per-frame cost is a few small colour uploads.
//
// A lamp that is ON glows at emissive 1.6; OFF lamps sit at 0.12, so a
// red light at night is unmistakable and the green reads from a block
// away.
import { box, cylinder, sphere, emptyGeometry } from '../engine/mesh.js';
import { mat4TRS } from '../core/math.js';
import { GRID, nodeId, nodePos } from './roads.js';

const ON = 1.6;
const OFF = 0.12;

// Per corner: pole offset from the node, the direction the lamp face
// points (ry), and which axis' state the head shows.
const CORNERS = [
  { dx: 8, dz: -8, ry: 0, axis: 'ns' }, // NE corner, faces south
  { dx: -8, dz: 8, ry: Math.PI, axis: 'ns' }, // SW corner, faces north
  { dx: -8, dz: -8, ry: Math.PI / 2, axis: 'ew' }, // NW corner, faces east
  { dx: 8, dz: 8, ry: -Math.PI / 2, axis: 'ew' }, // SE corner, faces west
];

export class TrafficLightMeshes {
  constructor(w) {
    this.w = w;
    const r = w.renderer;
    // Pole: a slim dark post, 4.5 m tall.
    const poleGeo = emptyGeometry();
    cylinder(poleGeo, 0, 2.25, 0, 0.09, 0.13, 4.5, 6, [0.16, 0.16, 0.18]);
    // Housing: a dark box at the top of the pole; the lamps sit on its
    // +z face (local space — the instance rotation aims it).
    const housingGeo = emptyGeometry();
    box(housingGeo, 0, 4.6, 0, 0.5, 1.15, 0.42, [0.1, 0.1, 0.11]);
    // Lamp spheres on the housing face (local +z, proud of the face).
    const redGeo = emptyGeometry();
    sphere(redGeo, 0, 4.95, 0.27, 0.15, 6, 8, [0.3, 0.02, 0.02], [1, 0.08, 0.08]);
    const yellowGeo = emptyGeometry();
    sphere(yellowGeo, 0, 4.6, 0.27, 0.15, 6, 8, [0.3, 0.2, 0.02], [1, 0.7, 0.1]);
    const greenGeo = emptyGeometry();
    sphere(greenGeo, 0, 4.25, 0.27, 0.15, 6, 8, [0.02, 0.3, 0.05], [0.1, 1, 0.2]);

    this.heads = [];
    for (let iz = 0; iz <= GRID; iz++) {
      for (let ix = 0; ix <= GRID; ix++) {
        const node = nodeId(ix, iz);
        const [nx, nz] = nodePos(node);
        for (const c of CORNERS) {
          this.heads.push({
            node, axis: c.axis,
            x: nx + c.dx, z: nz + c.dz, ry: c.ry,
            state: null,
          });
        }
      }
    }
    const n = this.heads.length;
    this.poleMatrices = new Float32Array(n * 16);
    this.poleColors = new Float32Array(n * 4);
    this.housingMatrices = new Float32Array(n * 16);
    this.housingColors = new Float32Array(n * 4);
    this.redMatrices = new Float32Array(n * 16);
    this.redColors = new Float32Array(n * 4);
    this.yellowMatrices = new Float32Array(n * 16);
    this.yellowColors = new Float32Array(n * 4);
    this.greenMatrices = new Float32Array(n * 16);
    this.greenColors = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const h = this.heads[i];
      const m = mat4TRS(h.x, 0, h.z, h.ry, 0, 0, 1, 1, 1);
      this.poleMatrices.set(m, i * 16);
      this.housingMatrices.set(m, i * 16);
      this.redMatrices.set(m, i * 16);
      this.yellowMatrices.set(m, i * 16);
      this.greenMatrices.set(m, i * 16);
      for (const arr of [this.poleColors, this.housingColors, this.redColors, this.yellowColors, this.greenColors]) {
        arr[i * 4] = 1; arr[i * 4 + 1] = 1; arr[i * 4 + 2] = 1; arr[i * 4 + 3] = 1;
      }
    }
    r.createBatch('tl-pole', poleGeo, n);
    r.createBatch('tl-housing', housingGeo, n);
    r.createBatch('tl-red', redGeo, n);
    r.createBatch('tl-yellow', yellowGeo, n);
    r.createBatch('tl-green', greenGeo, n);
    r.setInstances('tl-pole', this.poleMatrices, this.poleColors, n);
    r.setInstances('tl-housing', this.housingMatrices, this.housingColors, n);
    this._dirty = true;
    this.update(0);
  }

  // Recompute lamp colours from the logic state. Only uploads when a
  // head actually changed state.
  update(time) {
    const lights = this.w.trafficLights;
    let changed = this._dirty;
    for (let i = 0; i < this.heads.length; i++) {
      const h = this.heads[i];
      const s = lights.state(h.node, h.axis, time);
      if (s === h.state) continue;
      h.state = s;
      changed = true;
      const o = i * 4;
      this.redColors[o + 3] = s === 'red' ? ON : OFF;
      this.yellowColors[o + 3] = s === 'yellow' ? ON : OFF;
      this.greenColors[o + 3] = s === 'green' ? ON : OFF;
    }
    if (!changed) return;
    this._dirty = false;
    const r = this.w.renderer;
    const n = this.heads.length;
    r.setInstances('tl-red', this.redMatrices, this.redColors, n);
    r.setInstances('tl-yellow', this.yellowMatrices, this.yellowColors, n);
    r.setInstances('tl-green', this.greenMatrices, this.greenColors, n);
  }

  draw() {
    const r = this.w.renderer;
    r.drawBatch('tl-pole');
    r.drawBatch('tl-housing');
    r.drawBatch('tl-red');
    r.drawBatch('tl-yellow');
    r.drawBatch('tl-green');
  }
}
