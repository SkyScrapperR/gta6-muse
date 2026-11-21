// Precise steady-state measurement: settle 6 s after load, then count
// rAF callbacks for 8 s. Also reports drawCalls/triangles/lightCount.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  headless: false,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  window.__frames = 0;
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => orig((t) => { window.__frames++; cb(t); });
});
const mode = process.argv[2] || 'base';
try {
  await page.goto('http://localhost:8080/', { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  if (mode === 'nolights') await page.evaluate(() => { window.__selara.renderer.lights = null; });
  if (mode === 'nolights-notl') await page.evaluate(() => { window.__selara.renderer.lights = null; window.__selara.trafficLightMeshes.draw = () => {}; });
  await page.evaluate(() => { window.__frames = 0; window.__t0 = performance.now(); });
  await page.waitForTimeout(8000);
  const r = await page.evaluate(() => {
    const s = window.__selara;
    const dt = (performance.now() - window.__t0) / 1000;
    return { steadyFps: (window.__frames / dt).toFixed(2), frames: window.__frames, drawCalls: s.renderer.drawCalls, triangles: s.renderer.triangles, lightCount: s.lightRegistry.count };
  });
  console.log(mode + ' ' + JSON.stringify(r));
} finally { await browser.close(); }
