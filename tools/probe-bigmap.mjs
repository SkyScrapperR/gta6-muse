// Probe: big-map waypoint — step through M open -> click -> waypoint.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8082;
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
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.evaluate(() => window.__selara.game.applyQuality('low'));
  await page.waitForTimeout(3000);
  await page.click('#btn-new');
  await page.waitForTimeout(1500);
  const snap = () => page.evaluate(() => {
    const s = window.__selara;
    return {
      state: s.game.state, mapOpen: s.bigMap.open, waypoint: s.bigMap.waypoint,
      mouse: [s.input?.mouseX ?? null, s.input?.mouseY ?? null],
      hudSize: [s.hudCanvas?.width ?? null, s.hudCanvas?.height ?? null],
      fps: s.game.fps ?? null,
    };
  });
  console.log('before M:', JSON.stringify(await snap()));
  await page.keyboard.press('KeyM');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    const st = await snap();
    console.log(`after M +${(i + 1) * 500}ms:`, JSON.stringify(st));
    if (st.mapOpen) break;
  }
  await page.mouse.click(640, 360);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    const st = await snap();
    console.log(`after click +${(i + 1) * 500}ms:`, JSON.stringify(st));
    if (st.waypoint) break;
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
