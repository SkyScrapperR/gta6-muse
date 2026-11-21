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
import { TrafficLightMeshes } from './world/traffic-lights.js';
import { TrafficManager } from './ai/traffic.js';
import { PedestrianSystem } from './entities/pedestrian.js';
import { PoliceSystem } from './ai/police.js';
import { ParticleSystem } from './fx/particles.js';
import { LightRegistry } from './fx/lights.js';
import { RainSystem } from './fx/rain.js';
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
import { CutscenePlayer } from './story/cutscene.js';
import { MissionSystem } from './story/missions.js';
import { setupShot } from './debug/shots.js';
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
// Quality presets (prompt section 2): Low renders at ~0.6 scale with no
// shadow/bloom and 12 lights; Medium at full scale with 1024^2 shadows,
// half-resolution bloom and 24 lights; High is the full look and the
// screenshot quality. The shadow/bloom/light counts apply once those
// systems land in Tier 2; the render scale applies now. Never lower the
// High visuals to fit a weak machine — scale with the preset instead.
let qualityDpr = 1.5;
let renderScale = 1;
let currentQuality = 'medium';
let showFps = false;
const QUALITY_KEY = 'selara-bay-quality-v1';
function loadQuality() {
  try { return localStorage.getItem(QUALITY_KEY); } catch { return null; }
}
function saveQuality(q) {
  try { localStorage.setItem(QUALITY_KEY, q); } catch { /* storage blocked: keep running */ }
}
// First-run FPS probe: runs only when no quality choice is saved yet.
let probeActive = !loadQuality();
let probeFrames = 0;
let probeTime = 0;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, qualityDpr) * renderScale);
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
// Tier 2: visible traffic-light heads, one per corner of each
// intersection, cycling with the logic above.
const trafficLightMeshes = new TrafficLightMeshes({ renderer, trafficLights: lights });
// Tier 2: night point lights. Static lamps from the city generator
// (head height ~4.8 m, warm sodium); dynamics are re-registered every
// frame in the render section below.
const lightRegistry = new LightRegistry();
for (const lamp of city.lamps) {
  lightRegistry.addStatic(lamp.x, 4.8, lamp.z, 1.0, 0.72, 0.32, 0.55, 16);
}
renderer.lights = lightRegistry;
let lightCap = 24; // point lights per frame, by preset (see applyQuality)
let muzzleFlash = null; // {x, y, z, t} — one-frame light from a gunshot
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
    missions.completedIds = [];
    missions.nextMissionT = 0;
    this.state = 'playing';
    menus.hideAll();
    notifications.mission('Welcome back to Selara Bay, Kai.');
    missions.startMission(0);
  },
  continueGame() {
    sfx.ensure();
    const data = save.load();
    if (data) {
      missions.completedIds = data.missions ?? [];
      const next = missions.completedIds.length;
      if (next < 6) missions.startMission(next);
    }
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
    const preset = q === 'low' ? 'low' : q === 'high' ? 'high' : 'medium';
    qualityDpr = preset === 'low' ? 1 : preset === 'high' ? 2 : 1.5;
    renderScale = preset === 'low' ? 0.6 : 1;
    currentQuality = preset;
    // Tier 2: shadow map size, post chain and light cap follow the
    // preset. Low renders direct (no shadow, no bloom, 12 lights);
    // Medium gets a 1024 shadow map + bloom + 24 lights; High the full
    // 2048 map + bloom + 48 lights.
    renderer.shadowSize = preset === 'low' ? 0 : preset === 'high' ? 2048 : 1024;
    renderer.postWanted = preset !== 'low';
    lightCap = preset === 'low' ? 12 : preset === 'high' ? 48 : 24;
    saveQuality(preset);
    // Keep the Settings select showing the preset that is actually on.
    const sel = document.getElementById('setting-quality');
    if (sel) sel.value = preset;
    resize();
  },
  get quality() { return currentQuality; },
  get showFps() { return showFps; },
  setVolume(kind, v) { sfx.setVolume(kind, v); },
};
const menus = new Menus(game);
menus.setHasSave(save.hasSave());
menus.show('title');
// A saved quality choice wins over the Settings default; with no saved
// choice the 2-second probe in frame() picks one for this machine.
const savedQuality = loadQuality();
if (savedQuality) game.applyQuality(savedQuality);

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
    } else {
      charSystem.flinch(c);
      if (shooter === player) police.addWanted(1);
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
    charSystem.flinch(c);
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
  // One frame of warm light at the muzzle, for the night-light pass.
  muzzleFlash = { x: muzzle[0], y: muzzle[1], z: muzzle[2], t: performance.now() / 1000 };
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

const cutscene = new CutscenePlayer(city.collision);
// Tier 2: weather — clear <-> rain, wet roads, rain streaks and sound.
// Created here (not with the traffic section) because it needs the
// notifications, particles and sfx systems declared above.
const rain = new RainSystem({ notifications, particles, sfx });
const missions = new MissionSystem({
  renderer, player, vehicles, combatAI, police, pickups, city,
  minimap, hud, notifications, sfx, save, cutscene, charSystem,
  peds, traffic, game, pierCar,
  setHour: (h) => { hour = h; },
});

// --- Screenshot scenes (?shot=title|chase|cutscene|docks). ---
let shotInfo = { camera: null, hud: false, cutscene: false };
const shotName = new URLSearchParams(location.search).get('shot');
if (shotName) {
  shotInfo = setupShot(shotName, {
    renderer, player, vehicles, combatAI, police, pickups, city,
    minimap, hud, notifications, sfx, save, cutscene, charSystem,
    peds, traffic, game, pierCar, missions,
    setHour: (h) => { hour = h; },
  });
  menus.hideAll();
}

const PROP_BATCHES = [
  'prop-lamp', 'prop-tree', 'prop-palm', 'prop-bench', 'prop-bin',
  'prop-hydrant', 'prop-busstop', 'prop-crane', 'prop-boat',
  'prop-umbrella', 'prop-billboard', 'prop-fountain',
];

function frame(now) {
  // Schedule the next frame FIRST: if anything below throws, the game
  // logs the error and keeps running instead of freezing forever.
  requestAnimationFrame(frame);
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
  // First-run preset probe: measure the real frame rate for 2 s on the
  // title screen and pick a preset that fits this machine. A choice saved
  // meanwhile (Settings, playtest, screenshot tool) wins over the probe.
  if (probeActive) {
    probeFrames++;
    probeTime += realDt;
    if (probeTime >= 2) {
      probeActive = false;
      const probeFps = probeFrames / probeTime;
      if (!loadQuality()) {
        game.applyQuality(probeFps < 25 ? 'low' : probeFps < 45 ? 'medium' : 'high');
      }
    }
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
  // F3 toggles the FPS counter (prompt section 2).
  if (input.pressed('F3')) showFps = !showFps;
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
  // Retry a failed mission with Enter.
  if (missions.failed && input.pressed('Enter')) missions.retry();
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

  // --- Simulation. The city stays alive behind the title screen and
  // during cutscenes; the game freezes while paused or while the map is
  // open. Combat freezes during cutscenes so nobody shoots Kai mid-line.
  // In 'shot' mode the city simulates but Kai is posed by the shot.
  const simulating = game.state === 'playing' || game.state === 'title' || game.state === 'cutscene' || game.state === 'shot';
  if (simulating) {
    if (game.state === 'playing') {
      player.update(dt, t, vehicles);
      missions.update(dt, t);
      combatAI.update(dt, t);
      // The clock advances: one game hour per four real minutes.
      hour = (hour + dt / 240) % 24;
      // Safehouse: press E near the marker to save.
      const sh = city.landmark('safehouse');
      if (!player.inCar && Math.hypot(player.x - sh.x, player.z - sh.z) < 8) {
        hud.objectiveSub = 'Safehouse — press E to save';
        if (input.pressed('KeyE')) {
          save.save({ missions: missions.completedIds });
          notifications.success('Game saved at the safehouse');
          sfx.pickup();
        }
      } else if (!missions.active) {
        hud.objectiveSub = '';
      }
    }
    if (game.state === 'cutscene') cutscene.update(dt, input);
    // In shot mode the gang keeps shooting, so tracers fly for the photo.
    if (game.state === 'shot') combatAI.update(dt, t);
    traffic.update(dt, t, player);
    peds.update(dt, t, vehicles);
    police.update(dt, t);
    particles.update(dt);
    pickups.update(dt, t);
    vehicles.update(dt, t);
    charSystem.update(dt, t);
    // Tier 2: weather and the visible traffic lights live in the same
    // simulation step as the traffic they belong to.
    rain.update(dt, player.x, player.y + 2, player.z);
    trafficLightMeshes.update(t);
    // FLATLINED: a mission in progress fails; free roam wakes up at the
    // hospital after a beat on the ground.
    if (player.dead && !wasDead) {
      hud.setBanner('FLATLINED', 'You woke up at Selara General — $100', 3);
      if (missions.active) missions.onPlayerDeath();
    }
    wasDead = player.dead;
    // The player wakes up at the hospital even when the death failed a
    // mission: gating this on !missions.failed left Kai dead on the ground
    // forever after any mid-mission death (the mission stays failed until
    // the player presses Enter to retry).
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
  const camera = game.state === 'title' ? titleCamera(t)
    : game.state === 'cutscene' && cutscene.camera ? cutscene.camera
    : game.state === 'shot' && shotInfo.camera ? shotInfo.camera
    : player.cameraForRender();
  const palette = skyPalette(game.state === 'title' ? titleHour : hour);

  // Tier 2: night point lights. Statics (street lamps) are registered
  // once at boot; dynamics are re-registered every frame and the
  // nearest `lightCap` to the player are uploaded to the lit shader.
  // Rain darkens the sky a little and wets the roads (uWet).
  lightRegistry.clearDynamics();
  for (const v of vehicles.vehicles) {
    if (v.wreck) continue;
    const dx = v.x - player.x, dz = v.z - player.z;
    if (dx * dx + dz * dz > 150 * 150) continue;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const half = (v.type.len ?? 4) / 2;
    lightRegistry.addDynamic(v.x + fx * half, 0.8, v.z + fz * half, 1, 0.95, 0.8, 0.5, 18);
    lightRegistry.addDynamic(v.x - fx * half, 0.8, v.z - fz * half, 1, 0.08, 0.08, 0.35, 8);
  }
  for (const c of police.copCars) {
    const flash = Math.sin(t * 9) > 0;
    if (flash) lightRegistry.addDynamic(c.v.x, 2.2, c.v.z, 1, 0.1, 0.1, 0.9, 25);
    else lightRegistry.addDynamic(c.v.x, 2.2, c.v.z, 0.1, 0.3, 1, 0.9, 25);
  }
  if (muzzleFlash && t - muzzleFlash.t < 0.12) {
    lightRegistry.addDynamic(muzzleFlash.x, muzzleFlash.y, muzzleFlash.z, 1, 0.85, 0.4, 1.2, 12);
  }
  // Cutscene lighting (Tier 2): a warm key from the camera side and a
  // cool rim from behind the speaker, so faces read in the dark.
  if (game.state === 'cutscene' && cutscene.camera) {
    const sp = cutscene.speaker;
    if (sp) {
      const cam = cutscene.camera;
      const dx = cam.pos[0] - sp.x, dz = cam.pos[2] - sp.z;
      const dl = Math.hypot(dx, dz) || 1;
      lightRegistry.addDynamic(sp.x + (dx / dl) * 3, 3.2, sp.z + (dz / dl) * 3, 1, 0.8, 0.55, 0.7, 10);
      lightRegistry.addDynamic(sp.x - (dx / dl) * 3, 3.5, sp.z - (dz / dl) * 3, 0.4, 0.6, 1, 0.5, 8);
    }
  }
  lightRegistry.update(player.x, player.y + 2, player.z, lightCap, palette.night);
  renderer.wet = rain.wet;
  // Rain also dims the sky itself (the palette is built from the hour,
  // so scale it here: darker zenith/horizon, dimmer sun).
  if (rain.amount > 0.05) {
    const dim = 1 - rain.amount * 0.45;
    palette.sunColor = palette.sunColor.map((c) => c * dim);
    palette.zenith = palette.zenith.map((c) => c * (1 - rain.amount * 0.35));
    palette.horizon = palette.horizon.map((c) => c * (1 - rain.amount * 0.25));
    palette.fogColor = palette.fogColor.map((c) => c * (1 - rain.amount * 0.2));
  }

  // --- Render. ---
  renderer.cameraPos = camera.pos;
  renderer.beginFrame(camera, palette, t);
  renderer.drawSky(palette, t);
  renderer.drawBatch('ground');
  for (const [name, bounds] of world.chunkBounds) renderer.drawChunk(name, bounds);
  for (const name of PROP_BATCHES) renderer.drawBatch(name);
  trafficLightMeshes.draw();
  charSystem.draw();
  vehicles.draw();
  weapons.drawDecals();
  pickups.draw();
  bigMap.drawBeam();
  missions.drawBeam();
  renderer.drawWater(palette, t, 520);
  particles.draw();
  renderer.endFrame();

  // --- 2D overlay. ---
  hud.hour = game.state === 'title' ? titleHour : hour;
  hud.district = city.districtNameAt(player.x, player.z);
  hud.weather = rain.state;
  hud.inCutscene = game.state === 'cutscene';
  hud.fps = fps;
  hud.showFps = showFps;
  hud.quality = currentQuality;
  minimap.searchCenter = police.searchCenter;
  if (game.state === 'playing') {
    hud.draw(dt);
  } else if (game.state === 'cutscene') {
    // Cinematic: clear the HUD, then letterbox + subtitles only.
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    cutscene.draw(hudCtx, hudCanvas.width, hudCanvas.height);
  } else if (game.state === 'shot' && shotInfo.hud) {
    hud.draw(dt);
  } else {
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  }
  if (game.state === 'map') {
    bigMap.draw(hudCtx, hudCanvas.width, hudCanvas.height);
  }
  sfx.update(camera, player, police.copCars);
  input.endFrame();
}

requestAnimationFrame(frame);

// Debug hook for the automated playtest: real state, never a stub.
window.__selara = {
  version: 'story-0',
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
  cutscene,
  missions,
  pierCar,
  charSystem,
  rain,
  lightRegistry,
  trafficLightMeshes,
  get fps() { return fps; },
  get hour() { return hour; },
  setHour(h) { hour = h; },
};
