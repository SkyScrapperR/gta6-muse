// Probe step 17: adaptive resolution, slow motion (focus), camera shake,
// food carts. Prints a state line per check + errors.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8102;
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
  await page.mouse.click(12, 12);
  await page.waitForTimeout(1500);
  await page.click('#btn-new');
  await page.waitForTimeout(1500);

  // 1. Food carts: 7 instances in the prop batch.
  let r = await page.evaluate(() => {
    const b = window.__selara.renderer.batches.get('prop-cart');
    return { count: b ? b.count : 0 };
  });
  check('7 food carts rendered', r.count === 7, JSON.stringify(r));

  // 2. Adaptive resolution: on this slow machine the scale steps down
  // from the Low preset (0.5) to the 0.4 floor within a few seconds.
  // (The first-run probe picks Low at ~2 s; the adapt fires after it.)
  await page.waitForTimeout(6000);
  r = await page.evaluate(() => {
    const s = window.__selara;
    return { quality: s.game.quality, scale: s.renderScale, fps: s.fps };
  });
  check('adaptive scale steps down on a slow machine',
    r.quality === 'low' && r.scale === 0.4, JSON.stringify(r));

  // 3. Slow motion: timePlayed advances at ~0.35x while aiming + Shift.
  // (Aiming comes from the real right mouse button — player.update
  // overwrites player.aiming from it every frame.)
  const t0 = await page.evaluate(() => window.__selara.stats.timePlayed);
  await page.waitForTimeout(4000);
  const t1 = await page.evaluate(() => window.__selara.stats.timePlayed);
  await page.evaluate(() => {
    const s = window.__selara;
    s.player.giveWeapon('wasp', 64);
    s.player.setWeapon('wasp');
  });
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(4000);
  const t2 = await page.evaluate(() => window.__selara.stats.timePlayed);
  await page.keyboard.up('ShiftLeft');
  await page.mouse.up({ button: 'right' });
  r = { normal: +(t1 - t0).toFixed(2), slow: +(t2 - t1).toFixed(2) };
  check('slow-mo runs the world at ~0.35x',
    r.normal > 0.3 && r.slow < r.normal * 0.6, JSON.stringify(r));

  // 4. Slow-mo indicator: the HUD shows it while aiming + Shift.
  await page.mouse.down({ button: 'right' });
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(1500);
  r = await page.evaluate(() => ({ slowMo: window.__selara.hud.slowMo }));
  check('HUD shows slow-mo', r.slowMo === true, JSON.stringify(r));
  await page.keyboard.up('ShiftLeft');
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(1500);
  r = await page.evaluate(() => ({ slowMo: window.__selara.hud.slowMo }));
  check('HUD clears slow-mo', r.slowMo === false, JSON.stringify(r));

  // 5. Camera shake: a wreck jolts the frame (shakeAmp spikes, then decays).
  r = await page.evaluate(() => {
    const s = window.__selara;
    const v = s.vehicles.add('merpati', s.player.x + 5, s.player.z, 0);
    v.damage(500);
    return { amp: s.shakeAmp };
  });
  check('wreck shakes the camera', r.amp >= 0.5, JSON.stringify(r));
  await page.waitForTimeout(1500);
  r = await page.evaluate(() => ({ amp: window.__selara.shakeAmp }));
  check('shake decays', r.amp === 0, JSON.stringify(r));

  // 6. Final state: the game is still running cleanly.
  r = await page.evaluate(() => {
    const s = window.__selara;
    return { state: s.game.state, fps: s.fps, scale: s.renderScale };
  });
  check('game still running', r.state === 'playing', JSON.stringify(r));

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
