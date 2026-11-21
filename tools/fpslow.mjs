// Quick Low-only FPS probe for perf iteration: load the title screen,
// apply Low, sample window.__selara.fps for 6 s, print mean.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  headless: false,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto('http://localhost:8080/', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__selara.game.applyQuality('low'));
  await page.waitForTimeout(2000);
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1000);
    samples.push(await page.evaluate(() => window.__selara.fps));
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log(`low samples [${samples.join(', ')}] mean ${mean.toFixed(2)}`);
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
} finally {
  await browser.close();
}
