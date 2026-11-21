// Probe Tier 2 rendering: Medium preset at night, rain forced on.
// Prints post/shadow/light state + errors, saves a screenshot.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8098;
const server = spawn('node', ['serve.ts', '--port', String(PORT)], {
  cwd: '/home/hatch/workspace/selara-bay-final-entry',
  stdio: 'pipe',
});
await new Promise((r) => setTimeout(r, 1200));
let browser;
const errors = [];
try {
  browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
    headless: false,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const s = window.__selara;
    s.game.applyQuality('medium');
    s.setHour(22);
    s.rain.setTarget(1);
    s.rain.amount = 1;
    s.rain.wet = 1;
  });
  await page.waitForTimeout(4000);
  const state = await page.evaluate(() => {
    const s = window.__selara;
    return {
      postEnabled: s.renderer.post.enabled,
      postActive: s.renderer.postActive,
      shadowSize: s.renderer.shadowSize,
      shadowTex: !!s.renderer.shadowMap.depthTex,
      lightCount: s.lightRegistry.count,
      lightCap: s.lightRegistry.cap,
      wet: s.rain.wet,
      rainAmount: s.rain.amount,
      fps: s.fps,
      state: s.game.state,
    };
  });
  console.log('STATE:', JSON.stringify(state));
  await page.screenshot({ path: '/tmp/tier2-night-medium.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
