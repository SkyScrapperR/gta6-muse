// Quick engine smoke test (throwaway): serve game/, open it in headed
// Chromium under Xvfb, collect console/page errors, wait, screenshot.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT = 8099;
const server = spawn('node', ['serve.ts', '--port', String(PORT)], {
  cwd: '/home/hatch/workspace/selara-bay-final-entry',
  stdio: 'pipe',
});
await new Promise((r) => setTimeout(r, 1200));

const errors = [];
let browser;
try {
  browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
    headless: false,
    args: [
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--window-size=1280,720',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => ({
    fps: window.__selara?.fps,
    gl: !!document.getElementById('gl'),
    version: window.__selara?.version,
  }));
  console.log('PAGE INFO:', JSON.stringify(info));
  await page.screenshot({ path: '/tmp/smoke.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
