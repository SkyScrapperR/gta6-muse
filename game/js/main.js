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
import { VehicleSystem } from './entities/vehicle.js';
import { TrafficLights } from './world/roads.js';
import { TrafficManager } from './ai/traffic.js';
import { PedestrianSystem } from './entities/pedestrian.js';
import { PoliceSystem } from './ai/police.js';
import { makeRng, rngInt } from './core/math.js';

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

// --- Vehicles: one mission car by the pier, parked cars, and traffic. ---
const vehicles = new VehicleSystem(renderer, city, charSystem);
const pierCar = vehicles.add('merpati', 4, pier.z - 24, Math.PI);
pierCar.mission = 'm1';
const vRng = makeRng(4242);
const parkedTypes = ['kancil', 'merpati', 'bajak', 'taxi', 'vesper'];
for (let i = 0; i < 8; i++) {
  const px = -300 + vRng() * 600;
  const pz = -300 + vRng() * 600;
  const [rx, rz] = [Math.round(px / 104) * 104, Math.round(pz / 104) * 104];
  vehicles.add(parkedTypes[i % parkedTypes.length], rx + 10, rz + rngInt(vRng, -30, 30), vRng() * Math.PI * 2);
}

// --- Traffic, pedestrians, police. ---
const lights = new TrafficLights(20261121);
const traffic = new TrafficManager(vehicles, lights, city);
traffic.spawn(6);
const peds = new PedestrianSystem(charSystem, city);
peds.spawn(24);
const police = new PoliceSystem(vehicles, charSystem, city, player);
peds.onPedHit = (ped, vehicle) => {
  peds.fleeFrom(ped.c.x, ped.c.z, 30);
  if (vehicle.driver === player) police.addWanted(1);
};
player.onEnterCar = (car, wasParked) => {
  // Stealing a stranger's parked car in front of a witness is a crime.
  if (car.mission || !wasParked) return;
  const nearCop = police.copCars.some((c) => Math.hypot(c.v.x - car.x, c.v.z - car.z) < 80)
    || police.footCops.some((c) => Math.hypot(c.c.x - car.x, c.c.z - car.z) < 40);
  if (nearCop) police.addWanted(1);
};
police.onArrest = () => {
  const hq = city.landmark('policeHQ');
  player.arrest(hq.x, hq.z);
  police.clearWanted();
};

const PROP_BATCHES = [
  'prop-lamp', 'prop-tree', 'prop-palm', 'prop-bench', 'prop-bin',
  'prop-hydrant', 'prop-busstop', 'prop-crane', 'prop-boat',
  'prop-umbrella', 'prop-billboard', 'prop-fountain',
];

function frame(now) {
  const realDt = (now - lastTime) / 1000;
  const dt = Math.min(realDt, 0.1);
  lastTime = now;
  fpsFrames++;
  fpsTime += realDt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }

  camAngle += dt * 0.08;
  void camAngle;
  player.update(dt, now / 1000, vehicles);
  traffic.update(dt, now / 1000, player);
  peds.update(dt, now / 1000, vehicles);
  police.update(dt, now / 1000);
  vehicles.update(dt, now / 1000);
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
  vehicles.draw();
  renderer.drawWater(palette, t, 520);
  renderer.endFrame();

  hud.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hud.fillStyle = 'rgba(255,255,255,0.9)';
  hud.font = 'bold 20px sans-serif';
  hud.fillText(`SELARA BAY — driving — ${fps} fps`, 16, 30);
  hud.font = '14px sans-serif';
  const carInfo = player.inCar ? ` — ${player.inCar.name} ${(Math.abs(player.inCar.speed) * 3.6).toFixed(0)} km/h` : '';
  const stars = '★'.repeat(police.wanted) + '☆'.repeat(5 - police.wanted);
  hud.fillText(`draw calls ${renderer.drawCalls} — tris ${renderer.triangles} — ${city.districtNameAt(player.x, player.z)} — ${player.speed.toFixed(1)} m/s${carInfo} — ${stars} — peds ${peds.peds.length}`, 16, 54);
  input.endFrame();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Debug hook for the automated playtest: real state, never a stub.
window.__selara = {
  version: 'traffic-0',
  renderer,
  player,
  city,
  input,
  vehicles,
  traffic,
  peds,
  police,
  lights,
  get fps() { return fps; },
  get hour() { return hour; },
  setHour(h) { hour = h; },
};
