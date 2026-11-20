// Diagnostic: load the game, list vehicle positions vs player/camera.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8098;
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
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const s = window.__selara;
    return {
      player: [s.player.x, s.player.z, s.player.heading],
      camPos: s.player.camPos,
      camTarget: s.player.camTarget,
      vehicles: s.vehicles.vehicles.map((v) => [v.typeKey, Math.round(v.x), Math.round(v.z), v.heading.toFixed(2)]),
    };
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  if (browser) await browser.close();
  server.kill();
}
