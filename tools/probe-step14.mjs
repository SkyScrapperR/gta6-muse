// Probe step 14: music (title theme, radio, chase score, stingers),
// helicopter spawn, GPS routing, weapon models in hand, Thunder pickup.
// Prints a state line per check + errors.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8099;
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

  // 1. A gesture starts the title theme (click a neutral corner so no
  // menu button is hit).
  await page.mouse.click(12, 12);
  await page.waitForTimeout(1500);
  let r = await page.evaluate(() => {
    const m = window.__selara.music;
    return { ctx: !!m.ctx, playing: m.seq?.playing, song: m.seq?.song?.id, mode: m.mode };
  });
  check('title theme after gesture', r.ctx && r.playing && r.song === 'title', JSON.stringify(r));

  // 2. Start a new game from the menu.
  await page.click('#btn-new');
  await page.waitForTimeout(1500);
  r = await page.evaluate(() => ({ state: window.__selara.game.state }));
  check('new game starts', r.state === 'playing', JSON.stringify(r));

  // 3. Weapon model in hand: give the Wasp, aim, check the gun batch.
  r = await page.evaluate(() => {
    const s = window.__selara;
    s.player.giveWeapon('wasp', 64);
    s.player.setWeapon('wasp');
    s.player.syncChar();
    s.player.aiming = true;
    return { weapon: s.player.char.weapon, pose: s.player.char.pose };
  });
  // Give the frame loop time to rig the gun: at ~2 fps a 0.5 s wait
  // can land before a single frame runs with the weapon set.
  await page.waitForTimeout(3000);
  const gun = await page.evaluate(() => {
    const s = window.__selara;
    // Gun batches live in the character system ('char-gun-wasp' in the
    // renderer); the count is the instances written this frame.
    const b = s.charSystem.batches['gun-wasp'];
    const rb = s.renderer.batches.get('char-gun-wasp');
    return { batch: !!b, instances: b ? b.count : 0, rendered: rb ? rb.count : 0 };
  });
  check('wasp in hand', r.weapon === 'wasp' && gun.instances >= 1 && gun.rendered >= 1, JSON.stringify({ ...r, ...gun }));
  await page.screenshot({ path: '/tmp/step14-wasp-aim.png' });

  // 4. Helicopter: 4 stars spawns Rajawali overhead.
  await page.evaluate(() => { window.__selara.police.addWanted(4); });
  await page.waitForTimeout(3000);
  r = await page.evaluate(() => {
    const s = window.__selara;
    return { heli: s.heli.active, y: Math.round(s.heli.y), score: s.music.score.mode, song: s.music.seq.song.id };
  });
  check('heli spawns at 4 stars', r.heli && r.y > 50, JSON.stringify(r));
  check('chase score at 4 stars', r.score === 'chase' && r.song === 'pursuit', JSON.stringify(r));

  // 4b. Wanted clears: the chase hands the bus back, Rajawali leaves.
  // (Long real-time waits: at ~2 fps in SwiftShader, dt is clamped to
  // 0.1 s/frame, so game time runs ~5x slower than real time.)
  await page.evaluate(() => { window.__selara.police.clearWanted(); });
  await page.waitForTimeout(25000);
  r = await page.evaluate(() => {
    const m = window.__selara.music;
    return { score: m.score.mode, song: m.seq.song.id, heli: window.__selara.heli.active };
  });
  check('score back to explore after clear', r.score === 'explore' && r.song === 'title', JSON.stringify(r));
  check('heli leaves after clear', r.heli === false, JSON.stringify(r));

  // 5. Radio: enter a car, R switches station.
  r = await page.evaluate(() => {
    const s = window.__selara;
    const v = s.vehicles.add('merpati', s.player.x + 3, s.player.z, 0);
    s.player.enterCar(v);
    return { inCar: !!s.player.inCar };
  });
  await page.waitForTimeout(1200);
  r = await page.evaluate(() => {
    const m = window.__selara.music;
    return { radioOn: m.radio.on, song: m.seq.song.id, station: m.radio.currentStation.id };
  });
  check('radio starts in car', r.radioOn && r.song === 'neon-tide', JSON.stringify(r));
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(800);
  r = await page.evaluate(() => {
    const m = window.__selara.music;
    return { song: m.seq.song.id, station: m.radio.currentStation.id };
  });
  check('R switches station', r.song === 'rain-kemuning' && r.station === 'ombak', JSON.stringify(r));

  // 6. Exit the car: radio muffles, then fades back to the theme.
  // (The filter ramps in real AudioContext time, but the exit is only
  // noticed on the next frame — ~0.5 s at 2 fps — and the 3 s timer
  // runs in clamped game time, so both waits are generous.)
  await page.evaluate(() => { window.__selara.player.exitCar(); });
  await page.waitForTimeout(3000);
  r = await page.evaluate(() => {
    const m = window.__selara.music;
    return { freq: Math.round(m.fx.radioFilter.frequency.value), radioOn: m.radio.on };
  });
  check('radio muffled on foot', r.freq < 1000 && r.radioOn, JSON.stringify(r));
  await page.waitForTimeout(20000);
  r = await page.evaluate(() => {
    const m = window.__selara.music;
    return { radioOn: m.radio.on, song: m.seq.song.id, score: m.score.mode };
  });
  check('radio off after 3 s, theme back', !r.radioOn && r.song === 'title', JSON.stringify(r));

  // 7. GPS: a waypoint routes the minimap.
  r = await page.evaluate(() => {
    const s = window.__selara;
    s.bigMap.setWaypoint(s.player.x + 300, s.player.z - 200);
    return { route: s.minimap.route ? s.minimap.route.length : 0 };
  });
  check('GPS route from waypoint', r.route > 2, JSON.stringify(r));

  // 8. Thunder pickup: walk over it, the shotgun unlocks + equips.
  r = await page.evaluate(() => {
    const s = window.__selara;
    s.pickups.add('weapon', s.player.x + 0.5, s.player.z, 'thunder');
    return { before: [...s.player.weapons] };
  });
  await page.waitForTimeout(1200);
  r = await page.evaluate(() => {
    const s = window.__selara;
    return { weapons: [...s.player.weapons], weapon: s.player.weapon, ammo: s.player.ammo.thunder };
  });
  check('thunder pickup unlocks + equips', r.weapons.includes('thunder') && r.weapon === 'thunder' && r.ammo > 0, JSON.stringify(r));

  // 9. Stingers do not throw.
  r = await page.evaluate(() => {
    const m = window.__selara.music;
    for (const k of ['passed', 'failed', 'flatlined', 'cuffed']) m.stinger(k);
    return true;
  });
  check('stingers run', r === true);

  // 10. Final state: the game is still running cleanly.
  r = await page.evaluate(() => {
    const s = window.__selara;
    return { state: s.game.state, fps: s.fps, heli: s.heli.active };
  });
  check('game still running', r.state === 'playing', JSON.stringify(r));

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
