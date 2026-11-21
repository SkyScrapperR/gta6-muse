// FPS per quality preset, headed Chrome on the title screen.
// Honest numbers for the DEVLOG: this VM has no GPU (SwiftShader), so
// expect low single digits on every preset — that is the machine, not
// the game. Usage: node tools/fpsdiag.mjs
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
  for (const preset of ['low', 'medium', 'high']) {
    await page.evaluate((p) => window.__selara.game.applyQuality(p), preset);
    await page.waitForTimeout(2000);
    const samples = [];
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(1000);
      samples.push(await page.evaluate(() => window.__selara.fps));
    }
    const backing = await page.evaluate(() => {
      const c = document.getElementById('gl');
      return { w: c.width, h: c.height };
    });
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    console.log(`${preset}: fps samples [${samples.join(', ')}] mean ${mean.toFixed(1)} min ${Math.min(...samples)} max ${Math.max(...samples)} backing ${backing.w}x${backing.h}`);
  }
  console.log('errors:', JSON.stringify(errors));
} finally {
  await browser.close();
}
