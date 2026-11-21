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
import { NotificationSystem } from './ui/notifications.js';
import { CityMap, Minimap } from './ui/minimap.js';
import { HUD } from './ui/hud.js';
import { BigMap } from './ui/bigmap.js';
import { Menus } from './ui/menus.js';
import { SaveSystem } from './save.js';
import { Sfx } from './audio/sfx.js';
import { makeRng, rngInt } from './core/math.js';

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const hudCtx = hudCanvas.getContext('2d');

const renderer = new Renderer(glCanvas);
renderer.createParticleMesh();

let hour = 17.6; // golden hour for the first smoke test
let deadT = 0;
let wasDead = false;
let lastTime = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
let fps = 0;
let qualityDpr = 1.5;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, qualityDpr));
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
  hud.setBanner('CUFFED', 'Dropped at Police HQ — $100');
};

// --- UI, save and audio. ---
const notifications = new NotificationSystem();
const cityMap = new CityMap(city);
const minimap = new Minimap(cityMap, player);
const hud = new HUD(hudCanvas, player, police, minimap, notifications);
const bigMap = new BigMap(renderer, cityMap, player, minimap);
const save = new SaveSystem(player);
const sfx = new Sfx();

const game = {
  state: 'title', // title | playing | paused | map
  newGame() {
    sfx.ensure();
    save.clear();
    player.money = 250;
    player.health = 100;
    player.armor = 0;
    player.weapons = ['fists'];
    player.weapon = 'fists';
    player.ammo = { kobra: 0, wasp: 0, thunder: 0 };
    player.mag = { kobra: 0, wasp: 0, thunder: 0 };
    hour = 17.6;
    player.spawn(pier.x, pier.z, Math.PI);
    police.clearWanted();
    combatAI.clear();
    this.state = 'playing';
    menus.hideAll();
    notifications.mission('Welcome back to Selara Bay, Kai.');
  },
  continueGame() {
    sfx.ensure();
    save.load();
    this.state = 'playing';
    menus.hideAll();
    notifications.info('Welcome back, Kai.');
  },
  resumeGame() {
    this.state = 'playing';
    menus.hideAll();
  },
  saveAndQuitToTitle() {
    save.save();
    this.state = 'title';
    menus.setHasSave(true);
    menus.show('title');
  },
  quitToTitle() {
    this.state = 'title';
    menus.show('title');
  },
  applyQuality(q) {
    qualityDpr = q === 'low' ? 1 : q === 'high' ? 2 : 1.5;
    resize();
  },
  setVolume(kind, v) { sfx.setVolume(kind, v); },
};
const menus = new Menus(game);
menus.setHasSave(save.hasSave());
menus.show('title');

// Cinematic camera for the title screen: a slow low orbit over the city.
function titleCamera(t) {
  const a = t * 0.045;
  const pos = [Math.cos(a) * 230, 55 + Math.sin(t * 0.1) * 12, Math.sin(a) * 230];
  return { pos, target: [0, 25, 0], fov: (62 * Math.PI) / 180, near: 0.3, far: 3000 };
}

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
  sfx.pickup();
  if (kind === 'health') player.heal(amount);
  else if (kind === 'cash') player.money += amount;
  else if (kind === 'ammo' && player.weapon !== 'fists') player.ammo[player.weapon] = (player.ammo[player.weapon] ?? 0) + amount;
};
vehicles.onWreck = (v) => {
  particles.explosion(v.x, 0.5, v.z);
  sfx.explosion();
  peds.fleeFrom(v.x, v.z, 40);
};

// Player shooting: camera-ray aim point, then a real bullet from the muzzle.
player.onShoot = (weaponKey) => {
  sfx.shot();
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
player.onReload = () => sfx.reload();

// Player punching: anything close in front takes the hit.
player.onPunch = () => {
  sfx.punch();
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
  const t = now / 1000;

  // --- State keys. Esc exits pointer lock first in the browser, so P
  // also pauses. ---
  if (input.pressed('Escape') || input.pressed('KeyP')) {
    if (game.state === 'playing') {
      game.state = 'paused';
      menus.show('pause');
      input.exitLock();
    } else if (game.state === 'paused') {
      game.resumeGame();
    } else if (game.state === 'map') {
      game.state = 'playing';
      bigMap.open = false;
    }
  }
  if (input.pressed('KeyM') && (game.state === 'playing' || game.state === 'map')) {
    if (game.state === 'playing') {
      game.state = 'map';
      bigMap.open = true;
      input.exitLock();
    } else {
      game.state = 'playing';
      bigMap.open = false;
    }
  }
  // Click on the big map to set a waypoint.
  if (game.state === 'map' && input.pressedLeft()) {
    const wp = bigMap.clickToWorld(input.mouseX, input.mouseY, hudCanvas.width, hudCanvas.height);
    if (wp) {
      bigMap.setWaypoint(wp.x, wp.z);
      notifications.info('Waypoint set');
      sfx.click();
    }
  }
  // Click the 3D view to lock the pointer while playing.
  if (game.state === 'playing' && input.pressedLeft()) input.requestLock();

  // --- Simulation. The city stays alive behind the title screen; the
  // game freezes while paused or while the map is open. ---
  const simulating = game.state === 'playing' || game.state === 'title';
  if (simulating) {
    if (game.state === 'playing') {
      player.update(dt, t, vehicles);
      // The clock advances: one game hour per four real minutes.
      hour = (hour + dt / 240) % 24;
      // Safehouse: press E near the marker to save.
      const sh = city.landmark('safehouse');
      if (!player.inCar && Math.hypot(player.x - sh.x, player.z - sh.z) < 8) {
        hud.objectiveSub = 'Safehouse — press E to save';
        if (input.pressed('KeyE')) {
          save.save();
          notifications.success('Game saved at the safehouse');
          sfx.pickup();
        }
      } else {
        hud.objectiveSub = '';
      }
    }
    traffic.update(dt, t, player);
    peds.update(dt, t, vehicles);
    police.update(dt, t);
    combatAI.update(dt, t);
    particles.update(dt);
    pickups.update(dt, t);
    vehicles.update(dt, t);
    charSystem.update(dt, t);
    // FLATLINED: after a beat on the ground, Kai wakes up at the hospital.
    if (player.dead && !wasDead) {
      hud.setBanner('FLATLINED', 'You woke up at Selara General — $100', 3);
    }
    wasDead = player.dead;
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
    // Traffic horns: a short honk every couple of seconds while blocked.
    for (const c of traffic.cars) {
      if (c.v.honk && t - (c.lastHonkAt ?? -99) > 2) {
        c.lastHonkAt = t;
        sfx.horn();
      }
    }
  }

  // --- Camera. ---
  const titleHour = 18.2;
  const camera = game.state === 'title' ? titleCamera(t) : player.cameraForRender();
  const palette = skyPalette(game.state === 'title' ? titleHour : hour);

  // --- Render. ---
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
  bigMap.drawBeam();
  renderer.drawWater(palette, t, 520);
  particles.draw();
  renderer.endFrame();

  // --- 2D overlay. ---
  hud.hour = game.state === 'title' ? titleHour : hour;
  hud.district = city.districtNameAt(player.x, player.z);
  minimap.searchCenter = police.searchCenter;
  if (game.state === 'playing') {
    hud.draw(dt);
  } else {
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  }
  if (game.state === 'map') {
    bigMap.draw(hudCtx, hudCanvas.width, hudCanvas.height);
  }
  sfx.update(camera, player, police.copCars);
  input.endFrame();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Debug hook for the automated playtest: real state, never a stub.
window.__selara = {
  version: 'ui-0',
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
  hud,
  minimap,
  bigMap,
  menus,
  save,
  sfx,
  notifications,
  game,
  get fps() { return fps; },
  get hour() { return hour; },
  setHour(h) { hour = h; },
};
