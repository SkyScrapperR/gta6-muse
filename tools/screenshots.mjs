// Capture the four entry screenshots at 1280x720 and check the kit limits
// (each <= 256 KiB). Usage: node screenshots.mjs [shot...]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { statSync, mkdirSync } from 'node:fs';

const SHOTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['title', 'chase', 'cutscene', 'docks'];
const FILES = {
  title: '01-title.jpg',
  chase: '02-night-chase.jpg',
  cutscene: '03-mission-cutscene.jpg',
  docks: '04-docks-firefight.jpg',
};
const PORT = 8082;
const server = spawn('node', ['serve.ts', '--port', String(PORT)], {
  cwd: '/home/hatch/workspace/selara-bay-final-entry',
  stdio: 'pipe',
});
await new Promise((r) => setTimeout(r, 1200));
let browser;
try {
  mkdirSync('/home/hatch/workspace/selara-bay-final-entry/screenshots', { recursive: true });
  browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
    headless: false,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  });
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/?shot=${shot}`, { waitUntil: 'load' });
    // Screenshots are always captured on High at render scale 1.0
    // (prompt section 2). A static capture needs no real-time FPS: the
    // scene is given time to settle below. Adaptive resolution (step 17)
    // is skipped in shot mode, but the cutscene shot returns to
    // 'playing' — so High is re-applied right before the capture.
    await page.evaluate(() => window.__selara.game.applyQuality('high'));
    await page.waitForFunction(() => window.__shotReady, null, { timeout: 20000 });
    // Let the scene settle (traffic moves, the cutscene line shows).
    await page.waitForTimeout(6000);
    await page.evaluate(() => window.__selara.game.applyQuality('high'));
    await page.waitForTimeout(500);
    const out = `/home/hatch/workspace/selara-bay-final-entry/screenshots/${FILES[shot]}`;
    await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
    const size = statSync(out).size;
    console.log(shot, '->', FILES[shot], size, 'bytes',
      size <= 262144 ? 'OK' : 'TOO BIG', errors.length ? 'ERRORS: ' + errors.join('; ') : '');
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
