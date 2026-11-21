// Boot check: load the page, print every console error + whether
// window.__selara exists after 5 s.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8097;
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
  await page.waitForTimeout(5000);
  const has = await page.evaluate(() => !!window.__selara);
  console.log('SELARA:', has);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
