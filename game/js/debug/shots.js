// Debug screenshot scenes: ?shot=title|chase|cutscene|docks stages a
// composed scene for the entry screenshots (shots.json) and exposes
// window.__shotReady once it has settled. Never used in normal play.
import { findRoute, routeWaypoints, nearestNode } from '../world/roads.js';

export function setupShot(name, w) {
  const s = { camera: null, hud: false, cutscene: false };
  if (name === 'title') {
    // Dusk, low camera on a kemuning shopping street, dense traffic and
    // people, neon signs catching the last light. The camera looks north
    // down the road, towers ahead, shops on both sides.
    w.setHour(18.2);
    s.camera = {
      pos: [-104, 1.8, 210],
      target: [-104, 3, 0],
      fov: (55 * Math.PI) / 180, near: 0.3, far: 3000,
    };
    // Fill the street with traffic.
    for (let i = 0; i < 6; i++) {
      const v = w.vehicles.add(i % 2 ? 'merpati' : 'kancil', -107.5 + (i % 2) * 7, 180 - i * 22, 0);
      v.parked = true;
    }
    w.game.state = 'shot';
  } else if (name === 'chase') {
    // Night, four stars, a yellow Vesper tearing downtown with Garuda
    // patrols on its tail. (Rain and the helicopter arrive in Tier 2.)
    w.setHour(22);
    const l = w.city.landmark('bank');
    const [vx, vz, vh] = w.missions.roadSpot(l.x, l.z, 0);
    const v = w.vehicles.add('vesper', vx, vz, vh, [0.95, 0.8, 0.1]);
    w.player.spawn(vx - 2, vz, vh);
    w.player.enterCar(v);
    // Seat Kai (the player does not update in shot mode, so seat him here).
    const [sx, sz] = v.seatPos();
    w.player.char.x = sx; w.player.char.z = sz;
    w.player.char.y = 0.55; w.player.char.heading = vh;
    w.player.char.pose = 'drive';
    w.police.addWanted(4);
    // Two patrols ahead as a roadblock, headlights on the Vesper.
    for (let i = 0; i < 2; i++) {
      const c = w.vehicles.add('garuda', vx + 3.5 - i * 7, vz - 40 - i * 4, Math.PI);
      c.parked = true;
      w.police.copCars.push({ v: c, repathT: 2, ramT: 0 });
    }
    s.hud = true;
    w.game.state = 'shot';
  } else if (name === 'cutscene') {
    // Golden hour at Lin's Garage: Kai and Mama Lin, letterbox, portrait
    // card, subtitle — the M1 reunion.
    w.setHour(17.5);
    const [lx, lz] = w.missions.sidewalkSpot('garage');
    w.player.spawn(lx + 5, lz, Math.atan2(-5, 0));
    w.player.char.heading = w.player.heading;
    w.player.syncChar();
    w.game.state = 'cutscene';
    w.cutscene.play(
      [{ s: 'lin', t: 'Kai Santoso. You got taller. Or the island got smaller.' }],
      { a: w.player.char, b: w.missions.lin },
      () => { w.game.state = 'playing'; },
    );
    s.cutscene = true;
  } else if (name === 'docks') {
    // Dusk at Orchid Freight: Kai aiming over his shoulder, gang behind
    // the containers, the Bison truck burning beyond them. (A true night
    // version with floodlights comes in Tier 2.)
    w.setHour(18.5);
    const [fx, fz] = w.missions.sidewalkSpot('freight');
    const gx = fx + 14, gz = fz - 10;
    w.missions.gang = w.combatAI.spawnGang(gx, gz, 6);
    // Kai takes cover, aiming at the gang; the truck sits beyond them.
    const px = fx - 2, pz = fz + 6;
    const adx = gx - px, adz = gz - pz;
    const alen = Math.hypot(adx, adz) || 1;
    const truck = w.vehicles.add('bison', gx + (adx / alen) * 10, gz + (adz / alen) * 10, Math.atan2(adx, adz) + Math.PI, [0.9, 0.55, 0.15]);
    truck.damage(60); // smoking, about to go up
    w.player.spawn(px, pz, Math.atan2(adx, adz));
    w.player.giveWeapon('wasp', 64);
    w.player.setWeapon('wasp');
    w.player.aiming = true;
    w.player.syncChar();
    w.hud.objective = 'Blow up the Bison truck';
    w.hud.objectiveSub = 'Guards left: 6';
    s.hud = true;
    s.camera = null; // use the player's aim camera
    w.game.state = 'shot';
  }
  window.__shotReady = true;
  return s;
}
