// Screenshot the over-the-shoulder aim view at the gang.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8089;
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
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const s = window.__selara;
    s.player.giveWeapon('kobra', 48);
    s.player.setWeapon('kobra');
    s.combatAI.spawnGang(s.player.x, s.player.z - 20, 3);
    s.setHour(12);
  });
  await page.waitForTimeout(2000);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const s = window.__selara;
    const g = s.combatAI.members[0].c;
    s.player.camYaw = Math.atan2(g.x - s.player.x, g.z - s.player.z);
    s.player.camPitch = 0;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/aim.png' });
  console.log('saved');
  await page.mouse.up({ button: 'right' });
} finally {
  if (browser) await browser.close();
  server.kill();
}
