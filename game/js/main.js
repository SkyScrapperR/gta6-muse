// SELARA BAY — boot, main loop, state machine.
//
// The game simulates on the ground plane (x east, z south, y up) and renders
// in full 3D with a custom WebGL2 renderer. States: loading, title,
// playing, paused, map, cutscene. This file wires the systems together;
// each system lives in its own module under js/.

import { Renderer } from './engine/renderer.js';
import { skyPalette } from './engine/sky.js';
import { City } from './world/city.js';
import { buildWorld } from './world/city-meshes.js';
import { Input } from './core/input.js';
import { CharacterSystem } from './entities/character.js';
import { Player } from './entities/player.js';

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

// --- The real city, generated from a fixed seed. ---
const city = new City(20261121);
const world = buildWorld(renderer, city);
const input = new Input(glCanvas);
const charSystem = new CharacterSystem(renderer);
const player = new Player(charSystem, city, input);
const pier = city.ferryPier;
player.spawn(pier.x, pier.z, Math.PI);

const PROP_BATCHES = [
  'prop-lamp', 'prop-tree', 'prop-palm', 'prop-bench', 'prop-bin',
  'prop-hydrant', 'prop-busstop', 'prop-crane', 'prop-boat',
  'prop-umbrella', 'prop-billboard', 'prop-fountain',
];

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
  void camAngle;
  player.update(dt, now / 1000, null);
  charSystem.update(dt, now / 1000);
  const camera = player.cameraForRender();
  const palette = skyPalette(hour);
  const t = now / 1000;

  renderer.cameraPos = camera.pos;
  renderer.beginFrame(camera, palette, t);
  renderer.drawSky(palette, t);
  renderer.drawBatch('ground');
  for (const [name, bounds] of world.chunkBounds) renderer.drawChunk(name, bounds);
  for (const name of PROP_BATCHES) renderer.drawBatch(name);
  charSystem.draw();
  renderer.drawWater(palette, t, 520);
  renderer.endFrame();

  hud.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hud.fillStyle = 'rgba(255,255,255,0.9)';
  hud.font = 'bold 20px sans-serif';
  hud.fillText(`SELARA BAY — on foot — ${fps} fps`, 16, 30);
  hud.font = '14px sans-serif';
  hud.fillText(`draw calls ${renderer.drawCalls} — tris ${renderer.triangles} — ${city.districtNameAt(player.x, player.z)} — ${player.speed.toFixed(1)} m/s`, 16, 54);
  input.endFrame();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Debug hook for the automated playtest: real state, never a stub.
window.__selara = {
  version: 'walk-0',
  renderer,
  player,
  city,
  input,
  get fps() { return fps; },
  get hour() { return hour; },
  setHour(h) { hour = h; },
};
