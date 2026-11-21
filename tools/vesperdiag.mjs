// Debug: why doesn't F enter the yellow Vesper in M2?
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8085;
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
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.click('#btn-new');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__selara.missions.startMission(1); });
  await page.waitForTimeout(1500);
  const pre = await page.evaluate(() => {
    const s = window.__selara;
    const v = s.missions.vesper;
    const [dx, dz] = v.doorPos();
    return {
      vesper: [Math.round(v.x), Math.round(v.z), 'heading', v.heading.toFixed(2), 'driver', !!v.driver, 'wreck', v.wreck],
      door: [Math.round(dx), Math.round(dz)],
      player: [Math.round(s.player.x), Math.round(s.player.z)],
      inCar: !!s.player.inCar,
    };
  });
  console.log('before:', JSON.stringify(pre));
  // Stand exactly at the door and press F.
  await page.evaluate(() => {
    const s = window.__selara;
    const [dx, dz] = s.missions.vesper.doorPos();
    s.player.x = dx; s.player.z = dz;
  });
  await page.waitForTimeout(1000);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(2000);
  const post = await page.evaluate(() => {
    const s = window.__selara;
    const list = s.vehicles.vehicles.map((v) => ({
      type: v.typeKey, x: Math.round(v.x), z: Math.round(v.z),
      d: Math.round(Math.hypot(v.x - s.player.x, v.z - s.player.z)),
      wreck: v.wreck, driver: !!v.driver,
    }));
    return {
      inCar: !!s.player.inCar,
      player: [Math.round(s.player.x), Math.round(s.player.z)],
      vesperInList: s.vehicles.vehicles.includes(s.missions.vesper),
      count: s.vehicles.vehicles.length,
      list,
    };
  });
  console.log('after F at door:', JSON.stringify(post));
} finally {
  if (browser) await browser.close();
  server.kill();
}
