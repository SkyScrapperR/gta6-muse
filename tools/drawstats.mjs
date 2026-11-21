// Sample renderer.drawCalls / triangles / fps on the title screen.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  headless: false,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
try {
  await page.goto('http://localhost:8080/', { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  for (let i = 0; i < 3; i++) {
    const r = await page.evaluate(() => {
      const s = window.__selara;
      return { fps: s.fps, drawCalls: s.renderer.drawCalls, triangles: s.renderer.triangles, batches: s.renderer.batches ? [...s.renderer.batches.keys()].length : null };
    });
    console.log(JSON.stringify(r));
    await page.waitForTimeout(2000);
  }
} finally {
  await browser.close();
}
