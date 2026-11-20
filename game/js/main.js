// SELARA BAY — boot, main loop, state machine.
//
// The game simulates on the ground plane (x east, z south, y up) and renders
// in full 3D with a custom WebGL2 renderer. States: loading, title,
// playing, paused, map, cutscene. This file wires the systems together;
// each system lives in its own module under js/.

import { Renderer } from './engine/renderer.js';
import { skyPalette } from './engine/sky.js';
import { box, taperBox, gridPlane, merge, emptyGeometry } from './engine/mesh.js';
import { makeRng } from './core/math.js';

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const hud = hudCanvas.getContext('2d');

const renderer = new Renderer(glCanvas);
renderer.createParticleMesh();

let hour = 17.6; // golden hour for the first smoke test
let camAngle = 0;
let lastTime = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
let fps = 0;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  hudCanvas.width = w;
  hudCanvas.height = h;
}
window.addEventListener('resize', resize);
resize();

// --- Smoke-test scene: a small city block, a car, and the sea. Replaced by
// the real generated city in step 3. ---
function buildSmokeScene() {
  const rng = makeRng(1337);
  const parts = [];
  // Ground slab.
  const ground = emptyGeometry();
  gridPlane(ground, 0, 0, 0, 300, 300, 1, 1, [0.16, 0.16, 0.18]);
  parts.push(ground);
  // A row of towers with glowing windows.
  for (let i = 0; i < 8; i++) {
    const g = emptyGeometry();
    const h = 20 + rng() * 55;
    const shade = 0.25 + rng() * 0.25;
    box(g, -90 + i * 26, h / 2, -40, 18, h, 18, [shade, shade * 1.1, shade * 1.3], [0, 0, 0], [shade * 1.2, shade * 1.2, shade * 1.4]);
    // Window strips: thin emissive quads on the front face.
    for (let f = 0; f < Math.floor(h / 6); f++) {
      const wg = emptyGeometry();
      box(wg, -90 + i * 26, 4 + f * 6, -30.8, 14, 1.6, 0.2, [0.05, 0.05, 0.06], [1.0, 0.75, 0.35]);
      parts.push(wg);
    }
    parts.push(g);
  }
  // A beveled car.
  const car = emptyGeometry();
  taperBox(car, 0, 0.55, 30, 2.0, 4.6, 1.8, 4.2, 0.7, [0.9, 0.75, 0.1]);
  taperBox(car, 0, 1.2, 29.6, 1.7, 2.4, 1.5, 2.0, 0.55, [0.12, 0.12, 0.16]);
  parts.push(car);
  const merged = merge(parts);
  renderer.createBatch('smoke-city', merged, 1);
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  renderer.setInstances('smoke-city', identity, new Float32Array([1, 1, 1, 1]), 1);

  // Water ring around the slab.
  const water = emptyGeometry();
  gridPlane(water, 0, -0.4, 0, 1600, 1600, 48, 48, [0.02, 0.12, 0.18]);
  renderer.setWaterMesh(water);
}

buildSmokeScene();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }

  camAngle += dt * 0.08;
  const camPos = [Math.sin(camAngle) * 130, 55, Math.cos(camAngle) * 130];
  const camera = {
    pos: camPos,
    target: [0, 8, 0],
    fov: (62 * Math.PI) / 180,
    near: 0.5,
    far: 3000,
  };
  const palette = skyPalette(hour);
  const t = now / 1000;

  renderer.cameraPos = camPos;
  renderer.beginFrame(camera, palette, t);
  renderer.drawSky(palette, t);
  renderer.drawBatch('smoke-city');
  renderer.drawWater(palette, t, 150);
  renderer.endFrame();

  hud.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hud.fillStyle = 'rgba(255,255,255,0.9)';
  hud.font = 'bold 20px sans-serif';
  hud.fillText(`SELARA BAY — engine smoke test — ${fps} fps`, 16, 30);
  hud.font = '14px sans-serif';
  hud.fillText(`draw calls ${renderer.drawCalls} — hour ${hour.toFixed(1)}`, 16, 54);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Debug hook for the automated playtest: real state, never a stub.
window.__selara = {
  version: 'smoke-0',
  renderer,
  get fps() { return fps; },
  get hour() { return hour; },
  setHour(h) { hour = h; },
};
