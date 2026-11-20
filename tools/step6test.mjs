// Step 6 behavior check: traffic moves, peds walk, police respond to wanted.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8095;
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
  const snap = () => page.evaluate(() => {
    const s = window.__selara;
    return {
      traffic: s.traffic.cars.map((c) => [Math.round(c.v.x), Math.round(c.v.z), +c.v.speed.toFixed(1)]),
      peds: s.peds.peds.slice(0, 6).map((p) => [Math.round(p.c.x), Math.round(p.c.z), p.mode]),
      wanted: s.police.wanted,
      copCars: s.police.copCars.length,
      footCops: s.police.footCops.length,
      fps: s.fps,
    };
  });
  const a = await snap();
  await page.waitForTimeout(5000);
  const b = await snap();
  console.log('traffic moved:', a.traffic.map((t, i) => {
    const d = Math.hypot(t[0] - b.traffic[i][0], t[1] - b.traffic[i][1]);
    return `${d.toFixed(0)}m@${b.traffic[i][2]}m/s`;
  }).join(' '));
  console.log('peds moved:', a.peds.map((t, i) => {
    const d = Math.hypot(t[0] - b.peds[i][0], t[1] - b.peds[i][1]);
    return `${d.toFixed(0)}m/${b.peds[i][2]}`;
  }).join(' '));
  // Trigger 2 stars and watch the response.
  await page.evaluate(() => { window.__selara.police.addWanted(2); });
  await page.waitForTimeout(4000);
  const c = await snap();
  console.log('after wanted=2:', JSON.stringify({ wanted: c.wanted, copCars: c.copCars, footCops: c.footCops }));
  await page.waitForTimeout(6000);
  const d = await snap();
  console.log('cop cars 10s later:', JSON.stringify(d.copCars), 'foot cops:', JSON.stringify(d.footCops));
  // Let the heat cool: force no line of sight by teleporting far away.
  await page.evaluate(() => {
    const s = window.__selara;
    s.player.x = -400; s.player.z = -400;
  });
  await page.waitForTimeout(15000);
  const e = await snap();
  console.log('after hiding 15s:', JSON.stringify({ wanted: e.wanted, copCars: e.copCars }));
  console.log('fps:', b.fps, 'errors:', errors.length ? errors : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
