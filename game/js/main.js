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
import { ParticleSystem } from './fx/particles.js';
import { WeaponSystem, WEAPONS } from './combat/weapons.js';
import { PickupSystem } from './combat/pickups.js';
import { CombatAI } from './ai/combat-ai.js';
import { makeRng, rngInt } from './core/math.js';

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const hud = hudCanvas.getContext('2d');

const renderer = new Renderer(glCanvas);
renderer.createParticleMesh();

let hour = 17.6; // golden hour for the first smoke test
let camAngle = 0;
let deadT = 0;
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

// --- Combat: particles, weapons, pickups, gang AI. ---
const particles = new ParticleSystem(renderer);
const weapons = new WeaponSystem(renderer, city, vehicles, charSystem);
const pickups = new PickupSystem(renderer, player);
const combatAI = new CombatAI(charSystem, city, weapons, particles, player);

function damageCharacter(c, dmg, shooter) {
  if (c.faction === 'gang') {
    const m = combatAI.members.find((mm) => mm.c === c);
    if (m) combatAI.damageMember(m, dmg);
    return;
  }
  if (c.faction === 'cop') {
    c.health = (c.health ?? 50) - dmg;
    if (c.health <= 0) {
      c.pose = 'dead';
      c.speed = 0;
      if (shooter === player) police.addWanted(2);
    } else if (shooter === player) {
      police.addWanted(1);
    }
    return;
  }
  // A pedestrian (or anyone else): killing one is a crime.
  c.health = (c.health ?? 30) - dmg;
  if (c.health <= 0) {
    c.pose = 'dead';
    c.speed = 0;
    peds.fleeFrom(c.x, c.z, 30);
    if (shooter === player) police.addWanted(1);
  } else {
    peds.fleeFrom(c.x, c.z, 20);
  }
}

weapons.onCharacterHit = (c, dmg, shooter) => damageCharacter(c, dmg, shooter);
weapons.onPlayerHit = (dmg) => player.damage(dmg);
weapons.onVehicleHit = (v, dmg) => v.damage(dmg);
combatAI.onMemberDown = (m) => {
  // Fallen enforcers drop something useful.
  const roll = Math.random();
  if (roll < 0.4) pickups.add('health', m.c.x + 1, m.c.z, 25);
  else if (roll < 0.7) pickups.add('cash', m.c.x + 1, m.c.z, 20 + Math.floor(Math.random() * 30));
  else pickups.add('ammo', m.c.x + 1, m.c.z, 12);
};
pickups.onCollect = (kind, amount) => {
  if (kind === 'health') player.heal(amount);
  else if (kind === 'cash') player.money += amount;
  else if (kind === 'ammo' && player.weapon !== 'fists') player.ammo[player.weapon] = (player.ammo[player.weapon] ?? 0) + amount;
};
vehicles.onWreck = (v) => {
  particles.explosion(v.x, 0.5, v.z);
  peds.fleeFrom(v.x, v.z, 40);
};

// Player shooting: camera-ray aim point, then a real bullet from the muzzle.
player.onShoot = (weaponKey) => {
  const w = WEAPONS[weaponKey];
  const cam = player.cameraForRender();
  const cdx = cam.target[0] - cam.pos[0];
  const cdy = cam.target[1] - cam.pos[1];
  const cdz = cam.target[2] - cam.pos[2];
  const cl = Math.hypot(cdx, cdy, cdz) || 1;
  const camDir = [cdx / cl, cdy / cl, cdz / cl];
  const aim = weapons.fireHitscan(cam.pos, camDir, w.range, 0, player, { dry: true });
  const [fx, fz] = [Math.sin(player.heading), Math.cos(player.heading)];
  const muzzle = [player.x + fx * 0.5, player.y + 1.35, player.z + fz * 0.5];
  const spread = (player.aiming ? w.spread : w.hipSpread) + player.bloom * 0.03;
  particles.muzzleFlash(muzzle[0], muzzle[1], muzzle[2], camDir);
  for (let i = 0; i < w.pellets; i++) {
    const bx = aim.point[0] - muzzle[0];
    const by = aim.point[1] - muzzle[1];
    const bz = aim.point[2] - muzzle[2];
    const bl = Math.hypot(bx, by, bz) || 1;
    const yaw = Math.atan2(bx, bz) + (Math.random() * 2 - 1) * spread;
    const pitch = Math.asin(Math.max(-1, Math.min(1, by / bl))) + (Math.random() * 2 - 1) * spread;
    const dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const hit = weapons.fireHitscan(muzzle, dir, w.range, w.damage, player, { player });
    particles.tracer(muzzle, hit.point);
    if (hit.kind === 'wall') {
      particles.impactSpark(hit.point[0], hit.point[1], hit.point[2], -dir[0], -dir[1], -dir[2]);
      weapons.addDecal(hit.point, dir);
    } else if (hit.kind === 'char') {
      particles.blood(hit.point[0], hit.point[1], hit.point[2], dir);
    } else if (hit.kind === 'vehicle') {
      particles.impactSpark(hit.point[0], hit.point[1], hit.point[2], -dir[0], -dir[1], -dir[2]);
    }
  }
  peds.fleeFrom(player.x, player.z, 30);
  // A gunshot in public gets reported — unless the heat is already on.
  if (police.wanted === 0) {
    const witness = peds.peds.some((p) => p.mode !== 'down' && Math.hypot(p.c.x - player.x, p.c.z - player.z) < 40);
    if (witness) police.addWanted(1);
  }
};

// Player punching: anything close in front takes the hit.
player.onPunch = () => {
  const [fx, fz] = [Math.sin(player.heading), Math.cos(player.heading)];
  for (const c of charSystem.characters) {
    if (c === player.char || c.pose === 'dead') continue;
    const dx = c.x - player.x, dz = c.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.2 && (dx * fx + dz * fz) / (d || 1) > 0.5) {
      damageCharacter(c, 12, player);
      c.x += (dx / (d || 1)) * 0.8;
      c.z += (dz / (d || 1)) * 0.8;
    }
  }
  for (const v of vehicles.vehicles) {
    if (v.wreck) continue;
    const dx = v.x - player.x, dz = v.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < v.type.len * 0.5 + 1 && (dx * fx + dz * fz) / (d || 1) > 0.5) v.damage(6);
  }
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
  combatAI.update(dt, now / 1000);
  particles.update(dt);
  pickups.update(dt, now / 1000);
  vehicles.update(dt, now / 1000);
  charSystem.update(dt, now / 1000);
  // FLATLINED: after a beat on the ground, Kai wakes up at the hospital.
  if (player.dead) {
    deadT += dt;
    if (deadT > 2.5) {
      deadT = 0;
      const hosp = city.landmark('hospital');
      player.money = Math.max(0, player.money - 100);
      player.weapons = ['fists'];
      player.weapon = 'fists';
      player.ammo = { kobra: 0, wasp: 0, thunder: 0 };
      player.mag = { kobra: 0, wasp: 0, thunder: 0 };
      player.spawn(hosp.x, hosp.z, 0);
      police.clearWanted();
    }
  }
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
  weapons.drawDecals();
  pickups.draw();
  renderer.drawWater(palette, t, 520);
  particles.draw();
  renderer.endFrame();

  hud.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hud.fillStyle = 'rgba(255,255,255,0.9)';
  hud.font = 'bold 20px sans-serif';
  hud.fillText(`SELARA BAY — driving — ${fps} fps`, 16, 30);
  hud.font = '14px sans-serif';
  const carInfo = player.inCar ? ` — ${player.inCar.name} ${(Math.abs(player.inCar.speed) * 3.6).toFixed(0)} km/h` : '';
  const stars = '★'.repeat(police.wanted) + '☆'.repeat(5 - police.wanted);
  const w = WEAPONS[player.weapon];
  const ammoInfo = player.weapon === 'fists' ? 'fists' : `${w.name} ${player.mag[player.weapon]}/${player.ammo[player.weapon] ?? 0}${player.reloadT > 0 ? ' reloading' : ''}`;
  hud.fillText(`draw calls ${renderer.drawCalls} — tris ${renderer.triangles} — ${city.districtNameAt(player.x, player.z)} — ${player.speed.toFixed(1)} m/s${carInfo} — ${stars} — peds ${peds.peds.length}`, 16, 54);
  hud.fillText(`HP ${Math.ceil(player.health)} — $${player.money} — ${ammoInfo}${player.dead ? ' — FLATLINED' : ''}`, 16, 76);
  input.endFrame();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Debug hook for the automated playtest: real state, never a stub.
window.__selara = {
  version: 'combat-0',
  renderer,
  player,
  city,
  input,
  vehicles,
  traffic,
  peds,
  police,
  lights,
  particles,
  weapons,
  pickups,
  combatAI,
  get fps() { return fps; },
  get hour() { return hour; },
  setHour(h) { hour = h; },
};
