// Trace ped movement frame by frame.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8094;
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
  for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => {
      const peds = window.__selara.peds.peds.slice(0, 4);
      return peds.map((p) => [
        Math.round(p.c.x), Math.round(p.c.z),
        p.mode, p.c.pose, +p.c.speed.toFixed(1), +p.c.heading.toFixed(2),
      ]);
    });
    console.log(JSON.stringify(s));
    await page.waitForTimeout(1000);
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
