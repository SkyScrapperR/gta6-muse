// One-off: does the gun batch actually get an instance? Gives the
// Wasp, waits 3 s (several frames even at 2 fps), reads the count.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8099;
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
  await page.mouse.click(12, 12);
  await page.click('#btn-new');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const s = window.__selara;
    s.player.giveWeapon('wasp', 64);
    s.player.setWeapon('wasp');
    s.player.syncChar();
    s.player.camDist = 2.5; // close-up on Kai
    s.setHour(17.6);
  });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const s = window.__selara;
    const b = s.charSystem.batches['gun-wasp'];
    const rb = s.renderer.batches.get('char-gun-wasp');
    return {
      charWeapon: s.player.char.weapon,
      charPose: s.player.char.pose,
      charInSystem: s.charSystem.characters.includes(s.player.char),
      sysCount: b ? b.count : -1,
      rendererCount: rb ? rb.count : -1,
    };
  });
  console.log('GUN:', JSON.stringify(r));
  await page.screenshot({ path: '/tmp/step14-gun-closeup.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
