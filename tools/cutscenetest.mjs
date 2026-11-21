// Cutscene visuals: M1 two-shot at the garage, M6 ending at the pier.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8083;
const server = spawn('node', ['serve.ts', '--port', String(PORT)], {
  cwd: '/home/hatch/workspace/selara-bay-final-entry',
  stdio: 'pipe',
});
await new Promise((r) => setTimeout(r, 1200));
let browser;
try {
  browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
    headless: false,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.click('#btn-new');
  await page.waitForTimeout(1500);
  // M1: enter the Merpati, drive to the garage, screenshot the cutscene.
  await page.evaluate(() => {
    const s = window.__selara;
    s.player.x = s.pierCar.x - 2; s.player.z = s.pierCar.z;
  });
  await page.waitForTimeout(800);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const s = window.__selara;
    const [gx, gz] = s.missions.sidewalkSpot('garage');
    s.player.inCar.x = gx; s.player.inCar.z = gz;
    s.player.x = gx; s.player.z = gz;
  });
  await page.waitForTimeout(2500);
  const cam1 = await page.evaluate(() => {
    const s = window.__selara;
    const hc = document.getElementById('hud');
    return {
      state: s.game.state,
      cam: s.cutscene.camera?.pos.map((v) => Math.round(v)),
      line: s.cutscene.currentLine(),
      canvas: [hc.width, hc.height],
      inner: [window.innerWidth, window.innerHeight],
    };
  });
  console.log('M1 cutscene cam:', JSON.stringify(cam1));
  await page.screenshot({ path: '/tmp/m1-cutscene2.png' });
  // Advance past the M1 cutscene, then jump to the M6 ending: put the
  // player at the pier and play the ending lines directly.
  for (let i = 0; i < 8; i++) { await page.mouse.click(640, 360); await page.waitForTimeout(500); }
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const s = window.__selara;
    s.player.x = 565; s.player.z = 300;
    s.player.char.x = 565; s.player.char.z = 300;
    if (s.player.inCar) { s.player.inCar.driver = null; s.player.inCar = null; }
    const lines = [{ s: 'narrator', t: 'The sun comes up over Selara Bay, and for the first time in five years, the island belongs to the people who live on it.' }];
    s.game.state = 'cutscene';
    s.cutscene.play(lines, { a: s.player.char, b: s.missions.lin }, () => { s.game.state = 'playing'; });
  });
  await page.waitForTimeout(2000);
  const cam2 = await page.evaluate(() => {
    const s = window.__selara;
    return {
      state: s.game.state,
      cam: s.cutscene.camera?.pos.map((v) => Math.round(v)),
      tgt: s.cutscene.camera?.target.map((v) => Math.round(v)),
      a: [Math.round(s.cutscene.cast.a.x), Math.round(s.cutscene.cast.a.z)],
      b: s.cutscene.cast.b ? [Math.round(s.cutscene.cast.b.x), Math.round(s.cutscene.cast.b.z)] : null,
      line: s.cutscene.currentLine()?.s,
    };
  });
  console.log('M6 ending cam:', JSON.stringify(cam2));
  await page.screenshot({ path: '/tmp/m6-ending2.png' });
  console.log('errors:', errors.length ? errors : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
