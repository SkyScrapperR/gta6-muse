// Probe step 16: soundtrack + score wiring, heli shoot-down, roadblocks,
// Orchid tags, Kilat Respray, Bang Bang Arms, stats screen, save/load.
// Prints a state line per check + errors.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8100;
const server = spawn('node', ['serve.ts', '--port', String(PORT)], {
  cwd: '/home/hatch/workspace/selara-bay-final-entry',
  stdio: 'pipe',
});
await new Promise((r) => setTimeout(r, 1200));
let browser;
const errors = [];
const check = (name, ok, extra = '') =>
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
try {
  browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
    headless: false,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  // A gesture starts the title theme.
  await page.mouse.click(12, 12);
  await page.waitForTimeout(1500);
  await page.click('#btn-new');
  await page.waitForTimeout(1500);

  // 1. Stats object: all counters start at zero, getters work.
  let r = await page.evaluate(() => {
    const s = window.__selara.stats;
    return { moneyEarned: s.moneyEarned, kills: s.kills, shotsFired: s.shotsFired,
      accuracy: s.accuracy, playTime: s.playTime, heliDowns: s.heliDowns,
      tagsFound: s.tagsFound, carsResprayed: s.carsResprayed, shopSpent: s.shopSpent };
  });
  check('stats start at zero', r.moneyEarned === 0 && r.kills === 0 && r.shotsFired === 0
    && r.accuracy === 0 && r.playTime === '0m 00s' && r.heliDowns === 0
    && r.tagsFound === 0 && r.carsResprayed === 0 && r.shopSpent === 0, JSON.stringify(r));

  // 2. Twelve Orchid tags, all unfound, all rendered.
  r = await page.evaluate(() => {
    const s = window.__selara;
    const batch = s.renderer.batches.get('tag');
    return { tags: s.side.tags.length, found: s.side.tagsFoundCount,
      rendered: batch ? batch.count : 0 };
  });
  check('12 tags, none found, all rendered', r.tags === 12 && r.found === 0 && r.rendered === 12, JSON.stringify(r));

  // 3. Soundtrack: the three stations carry all nine Tier 3 songs.
  r = await page.evaluate(() => {
    const m = window.__selara.music;
    const songs = m.radio.stations.flatMap((st) => st.songs.map((sg) => sg.id));
    return { songs, playCredits: typeof m.score.playCredits, cutsceneTheme: m.score.cutsceneTheme };
  });
  const want = ['neon-tide', 'coastline-run', 'orchid-after-dark', 'midnight-merpati',
    'rain-kemuning', 'warung-2am', 'slow-waves', 'bukit-sunrise', 'pier-9', 'kecak-circuit'];
  check('radio carries all 10 songs', want.every((id) => r.songs.includes(id)) && r.playCredits === 'function', JSON.stringify(r));

  // 4. Score: Viktor's theme plays when he speaks, Lin's otherwise.
  r = await page.evaluate(() => {
    const m = window.__selara.music;
    m.score.update({ wanted: 0, inCutscene: true, cutsceneTheme: 'viktor' });
    const viktor = m.seq.song.id;
    m.score.update({ wanted: 0, inCutscene: true, cutsceneTheme: 'lin' });
    const lin = m.seq.song.id;
    m.score.update({ wanted: 0, inCutscene: false, cutsceneTheme: null });
    return { viktor, lin };
  });
  check('cutscene theme follows the speaker', r.viktor === 'viktor-theme' && r.lin !== 'viktor-theme', JSON.stringify(r));

  // 5. Tag collect: walk to the garage tag, press E.
  r = await page.evaluate(() => {
    const s = window.__selara;
    const t = s.side.tags[0];
    s.player.spawn(t.x, t.z, 0);
    return { money: s.player.money, tag: t.name };
  });
  await page.waitForTimeout(2500);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(2500);
  r = await page.evaluate(() => {
    const s = window.__selara;
    return { found: s.side.tags[0].found, tagsFound: s.stats.tagsFound,
      money: s.player.money, earned: s.stats.moneyEarned };
  });
  check('tag collect pays $50', r.found && r.tagsFound === 1 && r.money === 300 && r.earned === 50, JSON.stringify(r));

  // 6. Gun shop: E opens it, Digit1 buys Kobra ammo, Esc closes.
  r = await page.evaluate(() => {
    const s = window.__selara;
    s.player.money = 1000;
    s.player.giveWeapon('kobra', 64);
    const [x, z] = s.side.gunshopSpot;
    s.player.spawn(x, z, 0);
    return { ammoBefore: s.player.ammo.kobra, money: s.player.money };
  });
  await page.waitForTimeout(2500);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(2500);
  r = await page.evaluate(() => ({
    state: window.__selara.game.state,
    shop: window.__selara.side.shop?.title,
    items: window.__selara.side.shop?.items.length,
  }));
  check('gun shop opens (E)', r.state === 'shop' && r.shop === 'Bang Bang Arms' && r.items === 5, JSON.stringify(r));
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(1500);
  r = await page.evaluate(() => {
    const s = window.__selara;
    return { ammo: s.player.ammo.kobra, money: s.player.money, spent: s.stats.shopSpent };
  });
  check('kobra ammo +24 for $40', r.ammo === 88 && r.money === 960 && r.spent === 40, JSON.stringify(r));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  r = await page.evaluate(() => ({ state: window.__selara.game.state, shop: window.__selara.side.shop }));
  check('shop closes (Esc)', r.state === 'playing' && r.shop === null, JSON.stringify(r));

  // 7. Respray: drive in, E opens it, Digit1 repaints + repairs.
  r = await page.evaluate(() => {
    const s = window.__selara;
    const [x, z] = s.side.respraySpot;
    const v = s.vehicles.add('merpati', x, z, 0);
    v.damage(40);
    s.player.spawn(x, z, 0);
    s.player.enterCar(v);
    return { health: v.health, money: s.player.money };
  });
  await page.waitForTimeout(2500);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(2500);
  r = await page.evaluate(() => ({
    state: window.__selara.game.state,
    shop: window.__selara.side.shop?.title,
    items: window.__selara.side.shop?.items.length,
  }));
  check('respray opens (E, in car)', r.state === 'shop' && r.shop?.startsWith('Kilat Respray') && r.items === 6, JSON.stringify(r));
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(1500);
  r = await page.evaluate(() => {
    const s = window.__selara;
    const v = s.player.inCar;
    return { color: v.color, health: v.health, money: s.player.money,
      resprayed: s.stats.carsResprayed };
  });
  check('respray repaints + repairs for $150',
    JSON.stringify(r.color) === JSON.stringify([0.95, 0.45, 0.1]) && r.health === 100
    && r.money === 810 && r.resprayed === 1, JSON.stringify(r));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  r = await page.evaluate(() => ({ state: window.__selara.game.state }));
  check('respray closes (Esc)', r.state === 'playing', JSON.stringify(r));

  // 8. Roadblock: 3 stars seals the road ahead, clearing the heat lifts it.
  await page.evaluate(() => { window.__selara.police.addWanted(3); });
  await page.waitForTimeout(3000);
  r = await page.evaluate(() => {
    const s = window.__selara;
    const rb = s.police.roadblock;
    return { block: !!rb, cars: rb ? rb.cars.length : 0,
      garuda: rb ? rb.cars.every((v) => v.typeKey === 'garuda' && v.parked) : false };
  });
  check('roadblock forms at 3 stars', r.block && r.cars === 2 && r.garuda, JSON.stringify(r));
  await page.evaluate(() => { window.__selara.police.clearWanted(); });
  await page.waitForTimeout(3000);
  r = await page.evaluate(() => ({ block: window.__selara.police.roadblock }));
  check('roadblock lifts at 0 stars', r.block === null, JSON.stringify(r));

  // 9. Heli shoot-down: two Wasp-range hits bring Rajawali down, $500 bounty.
  await page.evaluate(() => { window.__selara.police.addWanted(4); });
  await page.waitForTimeout(3000);
  r = await page.evaluate(() => {
    const s = window.__selara;
    return { heli: s.heli.active, y: Math.round(s.heli.y) };
  });
  check('heli active at 4 stars', r.heli && r.y > 30 && r.y < 55, JSON.stringify(r));
  r = await page.evaluate(() => {
    const s = window.__selara;
    const moneyBefore = s.player.money;
    // Stand under the heli and fire straight up — the ray clears the
    // rooftops, and the hit runs the real onHelicopterHit callback.
    s.player.exitCar();
    s.player.spawn(s.heli.x, s.heli.z, 0);
    for (let i = 0; i < 2; i++) {
      const o = [s.player.x, s.player.y + 1.5, s.player.z];
      const d = [s.heli.x - o[0], s.heli.y - o[1], s.heli.z - o[2]];
      const l = Math.hypot(...d) || 1;
      s.weapons.fireHitscan(o, [d[0] / l, d[1] / l, d[2] / l], 70, 60, s.player, { player: s.player });
    }
    return { down: s.heli.shotDown, heliDowns: s.stats.heliDowns,
      money: s.player.money, gained: s.player.money - moneyBefore };
  });
  check('heli shot down, $500 bounty', r.down && r.heliDowns === 1 && r.gained === 500, JSON.stringify(r));

  // 10. Hit marker + accuracy: aim at a parked car and fire.
  r = await page.evaluate(() => {
    const s = window.__selara;
    s.police.clearWanted();
    s.player.giveWeapon('wasp', 64);
    s.player.setWeapon('wasp');
    s.player.aiming = true;
    s.player.camPitch = 0; // level the aim — the default pitch looks down
    s.player.spawn(0, 0, Math.PI); // face north, down the street
    s.vehicles.add('garuda', 0, -10, 0);
    return { fired: s.stats.shotsFired, hit: s.stats.shotsHit, markerT: s.hud.hitMarkerT };
  });
  // The camera swings behind the player after a teleport — give it
  // time, or the aim ray points where the camera was, not at the car.
  await page.waitForTimeout(5000);
  const markerBefore = r.markerT;
  await page.evaluate(() => { window.__selara.player.onShoot('wasp'); });
  await page.waitForTimeout(1500);
  r = await page.evaluate((before) => {
    const s = window.__selara;
    return { fired: s.stats.shotsFired, hit: s.stats.shotsHit,
      marker: s.hud.hitMarkerT > before, accuracy: s.stats.accuracy };
  }, markerBefore);
  check('shot counts + hit marker', r.fired === 1 && r.hit >= 1 && r.marker && r.accuracy === 100, JSON.stringify(r));

  // 11. Stats screen: Tab toggles it.
  await page.keyboard.press('Tab');
  await page.waitForTimeout(800);
  r = await page.evaluate(() => ({ show: window.__selara.hud.showStats }));
  check('stats screen opens (Tab)', r.show === true, JSON.stringify(r));
  await page.keyboard.press('Tab');
  await page.waitForTimeout(800);
  r = await page.evaluate(() => ({ show: window.__selara.hud.showStats }));
  check('stats screen closes (Tab)', r.show === false, JSON.stringify(r));

  // 12. Save/load round-trip keeps stats + tags.
  r = await page.evaluate(() => {
    const s = window.__selara;
    s.save.save({ missions: [], stats: s.stats.toJSON(), tags: s.side.toJSON() });
    const savedTags = s.stats.tagsFound, savedHelis = s.stats.heliDowns;
    s.stats.reset();
    s.side.fromJSON([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    s.save.load();
    return { tags: s.stats.tagsFound, helis: s.stats.heliDowns,
      tag0: s.side.tags[0].found, savedTags, savedHelis };
  });
  check('save/load restores stats + tags',
    r.tags === r.savedTags && r.helis === r.savedHelis && r.tag0 === true, JSON.stringify(r));

  // 13. Final state: the game is still running cleanly.
  r = await page.evaluate(() => {
    const s = window.__selara;
    return { state: s.game.state, fps: s.fps };
  });
  check('game still running', r.state === 'playing', JSON.stringify(r));

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
