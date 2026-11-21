// Probe: inspect the player char in ?shot=chase after it settles.
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
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(`http://localhost:${PORT}/?shot=chase`, { waitUntil: 'load' });
  await page.evaluate(() => window.__selara.game.applyQuality('high'));
  await page.waitForFunction(() => window.__shotReady, null, { timeout: 20000 });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const s = window.__selara;
    const c = s.player.char;
    const v = s.player.inCar;
    return {
      char: { pose: c.pose, x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), heading: +c.heading.toFixed(2), speed: c.speed },
      player: { x: +s.player.x.toFixed(2), z: +s.player.z.toFixed(2), heading: +s.player.heading.toFixed(2), inCar: !!v },
      car: v ? { x: +v.x.toFixed(2), z: +v.z.toFixed(2), heading: +v.heading.toFixed(2), seat: v.seatPos().map((n) => +n.toFixed(2)) } : null,
      cam: s.player.cameraForRender(),
      state: s.game.state,
    };
  });
  console.log(JSON.stringify(info, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}
