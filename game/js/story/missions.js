// Missions: the six-story arc of Selara Bay. Each mission is a list of
// stages; a stage completes when its check passes. The system spawns
// cars, gang members and pickups, drives the objective text, the map
// markers and the 3D beam, plays cutscenes at the story beats, and
// handles failure and retry. Dying during a mission fails it.
import { DIALOGUE, SPEAKERS } from './dialogue.js';
import { box, emptyGeometry } from '../engine/mesh.js';
import { mat4TRS } from '../core/math.js';
import { OUTFITS } from '../entities/character.js';
import { findRoute, routeWaypoints, nearestNode, snapToRoad, LANE_OFFSET } from '../world/roads.js';

export class MissionSystem {
  constructor(w) {
    this.w = w;
    this.current = -1;
    this.stage = 0;
    this.active = false;
    this.failed = null;
    this.completedIds = [];
    this.stageState = {};
    this.gang = [];
    this.targetCar = null;
    this.dexInCar = false;
    this.marker = null;
    this.sayQueue = [];
    this.sayT = 0;
    this.nextMissionT = 0;
    // Mission beam: a yellow column at the current objective.
    const geo = emptyGeometry();
    box(geo, 0, 0, 0, 1.4, 120, 1.4, [1, 0.8, 0.2], [1, 0.8, 0.2]);
    this.beamBatch = w.renderer.createBatch('mission-beam', geo, 1);
    this.beamMatrices = new Float32Array(16);
    this.beamColors = new Float32Array([1, 1, 1, 0.6]);
    // The persistent cast: Mama Lin at the garage, Dex at his apartment.
    const [linX, linZ] = this.sidewalkSpot('garage');
    this.lin = w.charSystem.add({
      x: linX, z: linZ, heading: Math.PI,
      outfit: OUTFITS.mamaLin, pose: 'idle', faction: 'friend',
    });
    const [dexX, dexZ] = this.sidewalkSpot('dexHome');
    this.dex = w.charSystem.add({
      x: dexX, z: dexZ, heading: 0,
      outfit: OUTFITS.dex, pose: 'idle', faction: 'friend',
    });
    this.viktor = null;
  }

  get mission() { return this.current >= 0 ? MISSIONS[this.current] : null; }
  get stageDef() { return this.mission ? this.mission.stages[this.stage] : null; }

  // Queue dialogue lines as notifications, one at a time.
  say(key) {
    for (const line of DIALOGUE[key] ?? []) {
      const sp = SPEAKERS[line.s];
      this.sayQueue.push(sp?.name ? `${sp.name}: ${line.t}` : line.t);
    }
  }

  // A point just outside a landmark building, on the sidewalk facing the
  // nearest street. Mission characters and items belong here, never inside
  // the building footprint.
  sidewalkSpot(id) {
    const l = this.w.city.landmark(id);
    const h = Math.max(l.w ?? 20, l.d ?? 20) / 2 + 4;
    const sx = Math.round((l.x + 520) / 104) * 104 - 520;
    const sz = Math.round((l.z + 520) / 104) * 104 - 520;
    if (Math.abs(l.x - sx) <= Math.abs(l.z - sz)) {
      return [l.x + Math.sign(sx - l.x || 1) * h, l.z];
    }
    return [l.x, l.z + Math.sign(sz - l.z || 1) * h];
  }

  // A parking spot on the nearest road, in the left lane for the heading.
  // Mission cars must never spawn inside a building footprint, or the
  // building collision pushes Kai away from the door.
  roadSpot(x, z, heading) {
    const [sx, sz] = snapToRoad(x, z);
    const vertical = sx !== x;
    // Pick a heading along the road if the caller's doesn't fit it.
    let h = heading;
    if (vertical && Math.abs(Math.sin(h)) > 0.5) h = 0;
    if (!vertical && Math.abs(Math.cos(h)) > 0.5) h = Math.PI / 2;
    const lx = Math.cos(h), lz = -Math.sin(h);
    return [sx + lx * LANE_OFFSET, sz + lz * LANE_OFFSET, h];
  }

  // Distance to a landmark building's edge (buildings are big; measuring
  // from the centre would ask the player to drive inside the building).
  // In a car Kai stops on the road, ~30 m from the building front, so the
  // driving radius is looser.
  nearLandmark(id, radius) {
    const l = this.w.city.landmark(id);
    const half = Math.max(l.w ?? 20, l.d ?? 20) / 2;
    const d = Math.hypot(this.w.player.x - l.x, this.w.player.z - l.z) - half;
    return d < radius + (this.w.player.inCar ? 35 : 0);
  }

  setTarget(x, z, radius) {
    this.marker = { x, z, radius };
    this.w.minimap.markers = [{ x, z, color: '#ffcf3f' }];
    const m = mat4TRS(x, 60, z, 0, 0, 0, 1, 1, 1);
    this.beamMatrices.set(m);
  }

  clearTarget() {
    this.marker = null;
    this.w.minimap.markers = [];
  }

  startMission(i) {
    this.current = i;
    this.stage = 0;
    this.active = true;
    this.failed = null;
    this.stageState = {};
    this.gang = [];
    this.dexInCar = false;
    const m = this.mission;
    if (m.setup) m.setup(this);
    this.enterStage();
    this.w.notifications.mission(`Mission: ${m.name}`);
    this.w.sfx.sting();
  }

  enterStage() {
    const s = this.stageDef;
    if (!s) { this.completeMission(); return; }
    this.stageState = {};
    this.w.hud.objective = s.objective;
    this.w.hud.objectiveSub = s.sub ?? '';
    this.w.hud.progress = null;
    if (s.target) {
      const [x, z] = s.target(this);
      this.setTarget(x, z, s.radius ?? 10);
    } else {
      this.clearTarget();
    }
    if (s.enter) s.enter(this);
  }

  completeStage() {
    const s = this.stageDef;
    if (s && s.exit) s.exit(this);
    this.stage++;
    if (this.stage >= this.mission.stages.length) this.completeMission();
    else this.enterStage();
  }

  completeMission() {
    const m = this.mission;
    this.completedIds.push(m.id);
    this.active = false;
    this.clearTarget();
    this.w.hud.objective = '';
    this.w.hud.objectiveSub = '';
    this.w.hud.progress = null;
    if (m.reward) {
      if (m.reward.money) this.w.player.money += m.reward.money;
      if (m.reward.weapon) {
        this.w.player.giveWeapon(m.reward.weapon, m.reward.ammo ?? 48);
        this.w.player.setWeapon(m.reward.weapon);
      }
    }
    this.w.notifications.success(`Mission complete: ${m.name} — ${m.rewardText ?? ''}`);
    this.w.sfx.sting();
    this.w.save.save({ missions: this.completedIds });
    // The next mission starts after a breath.
    if (this.current + 1 < MISSIONS.length) {
      this.nextMissionT = 4;
    } else {
      this.w.notifications.success('All missions complete — Selara Bay is yours. Free roam!');
      this.w.hud.objective = 'Free roam — explore Selara Bay';
    }
  }

  failMission(reason) {
    if (!this.active) return;
    this.active = false;
    this.failed = reason;
    this.clearTarget();
    this.w.hud.setBanner('MISSION FAILED', reason, 999);
    this.w.hud.objective = '';
    this.w.hud.objectiveSub = 'Press Enter to retry';
    this.w.hud.progress = null;
  }

  retry() {
    if (!this.failed) return;
    this.failed = null;
    this.w.hud.banner = null;
    const m = this.mission;
    // Clean up anything the failed attempt left behind.
    for (const mem of this.gang) this.w.charSystem.remove(mem.c);
    this.gang = [];
    if (this.boss) {
      const bi = this.w.combatAI.members.indexOf(this.boss);
      if (bi >= 0) this.w.combatAI.members.splice(bi, 1);
      this.boss = null;
    }
    if (this.viktor) { this.w.charSystem.remove(this.viktor); this.viktor = null; }
    if (this.targetCar && !this.targetCar.wreck) this.w.vehicles.remove(this.targetCar);
    this.targetCar = null;
    this.dexInCar = false;
    const [sx, sz] = m.startPos(this);
    this.w.player.spawn(sx, sz, 0);
    this.w.player.health = 100;
    this.w.police.clearWanted();
    this.startMission(this.current);
  }

  // The player died: a mission in progress fails.
  onPlayerDeath() {
    if (this.active) this.failMission('You were flatlined');
  }

  update(dt, time) {
    // Dialogue queue: one line every few seconds.
    if (this.sayQueue.length > 0) {
      this.sayT -= dt;
      if (this.sayT <= 0) {
        this.sayT = 4;
        this.w.notifications.info(this.sayQueue.shift());
      }
    }
    // Next mission auto-start.
    if (!this.active && !this.failed && this.nextMissionT > 0) {
      this.nextMissionT -= dt;
      if (this.nextMissionT <= 0) {
        this.nextMissionT = 0;
        this.startMission(this.current + 1);
      }
    }
    if (!this.active || this.failed) return;
    // Viktor's escape car drives itself while the chase is on.
    if (this.mission?.id === 'm6' && this.stage === 0 && this.viktorCar && !this.viktorCar.wreck) {
      this.viktorCar.autopilot(dt, null, time);
    }
    const s = this.stageDef;
    if (!s) return;
    // Kill counter in the objective line.
    if (s.type === 'kill') {
      const alive = this.gang.filter((m) => m.health > 0).length;
      this.w.hud.objectiveSub = `Enforcers left: ${alive}`;
      if (alive === 0) { this.completeStage(); return; }
    }
    if (s.check && s.check(this, dt)) this.completeStage();
  }

  drawBeam() {
    if (!this.active || !this.marker) return;
    this.w.renderer.setInstances('mission-beam', this.beamMatrices, this.beamColors, 1);
    this.w.renderer.drawBatch('mission-beam');
  }
}

// --- Mission definitions. ---
// `target` returns [x, z] for the beam and the minimap marker.
const MISSIONS = [
  {
    id: 'm1', name: 'Homecoming',
    startPos: (m) => { const p = m.w.city.ferryPier; return [p.x, p.z]; },
    setup(m) {
      m.say('m1-intro');
    },
    stages: [
      {
        objective: 'Get in the Merpati', type: 'enterCar',
        target: (m) => [m.w.pierCar.x, m.w.pierCar.z], radius: 6,
        check: (m) => m.w.player.inCar === m.w.pierCar,
      },
      {
        objective: "Drive to Lin's Garage", type: 'reach',
        target: (m) => { const l = m.w.city.landmark('garage'); return [l.x, l.z]; }, radius: 12,
        check: (m) => m.w.player.inCar && m.nearLandmark('garage', 12),
      },
      {
        objective: 'Talk to Mama Lin', type: 'cutscene',
        enter(m) {
          // Kai gets out of the car and walks up to Lin, then they talk.
          const p = m.w.player;
          let car = null;
          if (p.inCar) { car = p.inCar; p.exitCar(); }
          // Stage the scene: Kai five metres from Lin, on the street
          // side, facing her. Park the car down the street so it does
          // not block the shot.
          const [lx, lz] = m.sidewalkSpot('garage');
          p.x = lx + 5; p.z = lz;
          p.heading = Math.atan2(lx - p.x, lz - p.z);
          p.char.heading = p.heading;
          p.syncChar();
          if (car) { car.x = lx + 2; car.z = lz - 12; car.heading = 0; }
          m.w.game.state = 'cutscene';
          m.w.cutscene.play(DIALOGUE['m1-meet-lin'], { a: m.w.player.char, b: m.lin }, () => {
            m.w.game.state = 'playing';
            m.completeStage();
          });
        },
        check: () => false,
      },
    ],
    reward: { money: 200 },
    rewardText: '+$200, safehouse unlocked',
  },
  {
    id: 'm2', name: 'Yellow Fever',
    startPos: (m) => { const l = m.w.city.landmark('garage'); return [l.x, l.z]; },
    setup(m) {
      m.say('m2-intro');
      // Rendy's yellow Vesper, parked on the road by the bank.
      const bank = m.w.city.landmark('bank');
      const [vx, vz, vh] = m.roadSpot(bank.x + 14, bank.z + 8, 0);
      const v = m.w.vehicles.add('vesper', vx, vz, vh, [0.95, 0.8, 0.1]);
      v.mission = 'm2';
      m.targetCar = v;
      m.vesper = v;
    },
    stages: [
      {
        objective: "Find Rendy's yellow Vesper downtown", type: 'reach',
        target: (m) => [m.vesper.x, m.vesper.z], radius: 10,
        check: (m) => Math.hypot(m.w.player.x - m.vesper.x, m.w.player.z - m.vesper.z) < 10,
      },
      {
        objective: 'Steal the Vesper', type: 'enterCar',
        target: (m) => [m.vesper.x, m.vesper.z], radius: 6,
        check: (m) => m.w.player.inCar === m.vesper,
        exit(m) {
          m.w.police.addWanted(1);
          m.w.notifications.warning('1 star — the cops saw you take it!');
        },
      },
      {
        objective: "Deliver the Vesper to Lin's Garage (keep it above 25% health)", type: 'deliver',
        target: (m) => { const l = m.w.city.landmark('garage'); return [l.x, l.z]; }, radius: 12,
        check: (m) => {
          if (m.vesper.wreck) { m.failMission('The Vesper was wrecked'); return false; }
          return m.w.player.inCar === m.vesper
            && m.nearLandmark('garage', 12)
            && m.vesper.health >= 25;
        },
      },
    ],
    reward: { money: 100, weapon: 'kobra', ammo: 48 },
    rewardText: '+$100, Kobra 9',
  },
  {
    id: 'm3', name: 'Collections',
    startPos: (m) => { const l = m.w.city.landmark('garage'); return [l.x, l.z]; },
    setup(m) { m.say('m3-intro'); },
    stages: [
      {
        objective: 'Go to Kedai Orchid', type: 'reach',
        target: (m) => { const l = m.w.city.landmark('kedai'); return [l.x, l.z]; }, radius: 12,
        check: (m) => m.nearLandmark('kedai', 12),
        exit(m) {
          const [gx, gz] = m.sidewalkSpot('kedai');
          m.gang = m.w.combatAI.spawnGang(gx, gz, 4);
        },
      },
      {
        objective: 'Defeat the Orchid enforcers', type: 'kill',
        target: (m) => { const l = m.w.city.landmark('kedai'); return [l.x, l.z]; }, radius: 20,
        check: () => false,
        exit(m) {
          const [bx, bz] = m.sidewalkSpot('kedai');
          m.cashBag = m.w.pickups.add('cash', bx, bz, 500);
        },
      },
      {
        objective: 'Take the cash bag', type: 'pickup',
        target: (m) => [m.cashBag.x, m.cashBag.z], radius: 6,
        check: (m) => !m.w.pickups.pickups.includes(m.cashBag),
      },
      {
        objective: "Bring the cash to Lin's Garage", type: 'reach',
        target: (m) => { const l = m.w.city.landmark('garage'); return [l.x, l.z]; }, radius: 12,
        check: (m) => m.nearLandmark('garage', 12),
      },
    ],
    reward: { money: 500 },
    rewardText: '+$500',
  },
  {
    id: 'm4', name: 'Wheelman',
    startPos: (m) => { const l = m.w.city.landmark('dexHome'); return [l.x, l.z]; },
    setup(m) { m.say('m4-intro'); },
    stages: [
      {
        objective: "Pick up Dex at his apartment", type: 'reach',
        target: (m) => { const l = m.w.city.landmark('dexHome'); return [l.x, l.z]; }, radius: 8,
        check: (m) => m.nearLandmark('dexHome', 8),
      },
      {
        objective: 'Get in a car — Dex is getting in', type: 'dex-in',
        target: (m) => [m.dex.x, m.dex.z], radius: 10,
        check: (m) => {
          if (m.dexInCar) return true;
          const p = m.w.player;
          if (p.inCar && Math.hypot(p.x - m.dex.x, p.z - m.dex.z) < 8) {
            m.dexInCar = true;
            m.w.charSystem.remove(m.dex);
            m.w.notifications.info('Dex is in the car. Drive!');
            return true;
          }
          return false;
        },
      },
      {
        objective: 'Drive Dex to Bank Samudra', type: 'reach',
        target: (m) => { const l = m.w.city.landmark('bank'); return [l.x, l.z]; }, radius: 14,
        check: (m) => {
          const arrived = m.w.player.inCar && m.nearLandmark('bank', 14);
          if (arrived) {
            m.w.police.addWanted(3);
            m.say('m4-bank');
          }
          return arrived;
        },
      },
      {
        objective: 'Wait for Dex — keep the engine running (15 s)', type: 'wait',
        target: (m) => { const l = m.w.city.landmark('bank'); return [l.x, l.z]; }, radius: 14,
        enter(m) { m.stageState.waited = 0; },
        check: (m, dt) => {
          const inside = m.nearLandmark('bank', 14);
          if (inside) m.stageState.waited = (m.stageState.waited ?? 0) + dt;
          m.w.hud.progress = { frac: Math.min(1, (m.stageState.waited ?? 0) / 15), label: 'Dex is inside the bank…' };
          if (m.w.player.inCar?.wreck && m.dexInCar) { m.failMission('The car blew up with Dex inside'); return false; }
          return (m.stageState.waited ?? 0) >= 15;
        },
      },
      {
        objective: 'Lose the cops', type: 'loseCops',
        check: (m) => m.w.police.wanted === 0,
      },
      {
        objective: "Drop Dex off at home", type: 'reach',
        target: (m) => { const l = m.w.city.landmark('dexHome'); return [l.x, l.z]; }, radius: 10,
        check: (m) => m.nearLandmark('dexHome', 10),
        exit(m) {
          m.say('m4-done');
          // Dex is back home.
          const [dx, dz] = m.sidewalkSpot('dexHome');
          m.dex = m.w.charSystem.add({ x: dx, z: dz, heading: 0, outfit: OUTFITS.dex, pose: 'idle', faction: 'friend' });
          m.dexInCar = false;
        },
      },
    ],
    reward: { money: 800 },
    rewardText: '+$800',
  },
  {
    id: 'm5', name: 'Low Tide',
    startPos: (m) => { const l = m.w.city.landmark('garage'); return [l.x, l.z]; },
    setup(m) {
      m.say('m5-intro');
      m.w.setHour(22); // night job
      const fr = m.w.city.landmark('freight');
      const [tx, tz, th] = m.roadSpot(fr.x + 10, fr.z - 6, 0);
      const truck = m.w.vehicles.add('bison', tx, tz, th);
      truck.mission = 'm5';
      m.truck = truck;
    },
    stages: [
      {
        objective: 'Pick up the Wasp SMG at the garage', type: 'reach',
        target: (m) => { const l = m.w.city.landmark('garage'); return [l.x, l.z]; }, radius: 10,
        check: (m) => m.nearLandmark('garage', 10),
        exit(m) {
          m.w.player.giveWeapon('wasp', 64);
          m.w.player.setWeapon('wasp');
          m.w.notifications.info('Wasp SMG acquired');
        },
      },
      {
        objective: 'Go to Orchid Freight, Pier 9', type: 'reach',
        target: (m) => { const l = m.w.city.landmark('freight'); return [l.x, l.z]; }, radius: 14,
        check: (m) => m.nearLandmark('freight', 14),
        exit(m) {
          const [gx, gz] = m.sidewalkSpot('freight');
          m.gang = m.w.combatAI.spawnGang(gx, gz, 6);
        },
      },
      {
        objective: 'Defeat the Orchid guards', type: 'kill',
        target: (m) => { const l = m.w.city.landmark('freight'); return [l.x, l.z]; }, radius: 24,
        check: () => false,
      },
      {
        objective: 'Blow up the Bison truck', type: 'wreck',
        target: (m) => [m.truck.x, m.truck.z], radius: 16,
        check: (m) => m.truck.wreck,
      },
      {
        objective: 'Escape the docks', type: 'reach',
        target: () => [-104, 208], radius: 14,
        check: (m) => Math.hypot(m.w.player.x + 104, m.w.player.z - 208) < 14,
      },
    ],
    reward: { money: 1200 },
    rewardText: '+$1,200',
  },
  {
    id: 'm6', name: 'Orchid Falls',
    startPos: (m) => { const l = m.w.city.landmark('orchidTower'); return [l.x, l.z]; },
    setup(m) {
      m.say('m6-intro');
      // Viktor flees the tower in a black Vesper, heading for the east pier.
      const tower = m.w.city.landmark('orchidTower');
      const [vx, vz, vh] = m.roadSpot(tower.x + 16, tower.z + 4, Math.PI);
      const v = m.w.vehicles.add('vesper', vx, vz, vh, [0.05, 0.05, 0.06]);
      v.mission = 'm6';
      const route = findRoute(nearestNode(v.x, v.z), nearestNode(565, 300));
      v.route = routeWaypoints(route);
      v.routeIndex = 0;
      v.parked = false;
      m.targetCar = v;
      m.viktorCar = v;
      m.escaped = false;
    },
    stages: [
      {
        objective: "Stop Viktor's escape — wreck his Vesper", type: 'wreck',
        target: (m) => [m.viktorCar.x, m.viktorCar.z], radius: 20,
        check: (m) => {
          if (m.viktorCar.wreck) return true;
          if (!m.viktorCar.route || m.viktorCar.routeIndex >= m.viktorCar.route.length) {
            m.failMission('Viktor escaped on the boat');
            return false;
          }
          return false;
        },
      },
      {
        objective: 'Defeat Viktor Raza', type: 'boss',
        target: () => [565, 300], radius: 20,
        enter(m) {
          const v = m.viktorCar;
          m.viktor = m.w.charSystem.add({
            x: v.x + 3, z: v.z + 3, heading: Math.atan2(m.w.player.x - v.x, m.w.player.z - v.z),
            outfit: OUTFITS.viktor, pose: 'idle', faction: 'gang', health: 200,
          });
          const boss = { c: m.viktor, char: m.viktor, health: 200, state: 'cover', stateT: 0.5, coverX: v.x, coverZ: v.z, burstLeft: 0, aimT: 0, strafeDir: 1, fireT: 0, boss: true, weapon: 'wasp' };
          m.w.combatAI.members.push(boss);
          m.boss = boss;
          m.w.game.state = 'cutscene';
          m.w.cutscene.play(DIALOGUE['m6-boss'], { a: m.w.player.char, b: m.viktor }, () => {
            m.w.game.state = 'playing';
          });
        },
        check: (m) => m.boss && m.boss.health <= 0,
      },
      {
        objective: 'Sunrise over Selara Bay', type: 'cutscene',
        enter(m) {
          m.w.setHour(6.5);
          m.w.game.state = 'cutscene';
          m.w.cutscene.play(DIALOGUE['m6-ending'], { a: m.w.player.char, b: m.lin }, () => {
            m.w.game.state = 'playing';
            m.completeStage();
          });
        },
        check: () => false,
      },
    ],
    reward: { money: 2000 },
    rewardText: '+$2,000 — the island is yours',
  },
];
