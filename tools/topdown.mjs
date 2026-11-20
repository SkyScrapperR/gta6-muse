// Top-down screenshot to verify vehicles render.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8096;
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
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const s = window.__selara;
    s.player.x = 4; s.player.z = 466; s.player.heading = Math.PI;
    s.player.camYaw = Math.PI; s.player.camPitch = 0.9; s.player.camDist = 25;
    s.setHour(12);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/topdown.png' });
  console.log('saved');
} finally {
  if (browser) await browser.close();
  server.kill();
}
