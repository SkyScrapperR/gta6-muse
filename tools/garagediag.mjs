// Debug: where does the car end up after teleporting to the garage?
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8086;
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
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message, '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.click('#btn-new');
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const s = window.__selara;
    const g = s.city.landmark('garage');
    return { garage: [g.x, g.z, g.w, g.d], pierCar: [s.pierCar.x, s.pierCar.z] };
  });
  console.log('landmarks:', JSON.stringify(info));
  await page.evaluate(() => {
    const s = window.__selara;
    s.player.x = s.pierCar.x - 2; s.player.z = s.pierCar.z;
  });
  await page.waitForTimeout(800);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => {
    const s = window.__selara;
    return { car: [Math.round(s.player.inCar.x), Math.round(s.player.inCar.z)], player: [Math.round(s.player.x), Math.round(s.player.z)] };
  });
  console.log('in car at:', JSON.stringify(before));
  await page.evaluate(() => {
    const s = window.__selara;
    const g = s.city.landmark('garage');
    s.player.inCar.x = g.x; s.player.inCar.z = g.z + 4;
    s.player.x = g.x; s.player.z = g.z + 4;
  });
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1000);
    const pos = await page.evaluate(() => {
      const s = window.__selara;
      const g = s.city.landmark('garage');
      const d = Math.hypot(s.player.x - g.x, s.player.z - g.z);
      return {
        car: [Math.round(s.player.inCar.x), Math.round(s.player.inCar.z)],
        player: [Math.round(s.player.x), Math.round(s.player.z)],
        dist: Math.round(d),
        stage: s.missions.stage,
        near: s.missions.nearLandmark('garage', 12),
      };
    });
    console.log('t+' + (i + 1) + 's:', JSON.stringify(pos));
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
