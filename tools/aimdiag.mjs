// Diagnose the aim math: ray from the camera, aim point, bullet path.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8090;
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
    s.combatAI.spawnGang(s.player.x, s.player.z - 25, 1);
  });
  await page.waitForTimeout(1500);
  // Aim: hold right mouse, level pitch, face the gang member.
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(1500);
  const diag = await page.evaluate(() => {
    const s = window.__selara;
    const g = s.combatAI.members[0].c;
    s.player.camYaw = Math.atan2(g.x - s.player.x, g.z - s.player.z);
    s.player.camPitch = 0;
    return {
      aiming: s.player.aiming,
      camPos: s.player.camPos.map((v) => +v.toFixed(2)),
      camTarget: s.player.camTarget.map((v) => +v.toFixed(2)),
      gang: [g.x, g.z, g.y],
      player: [s.player.x, s.player.z],
    };
  });
  console.log('diag:', JSON.stringify(diag));
  await page.waitForTimeout(1200);
  const diag2 = await page.evaluate(() => {
    const s = window.__selara;
    return {
      aiming: s.player.aiming,
      camPos: s.player.camPos.map((v) => +v.toFixed(2)),
      camTarget: s.player.camTarget.map((v) => +v.toFixed(2)),
      camYaw: +s.player.camYaw.toFixed(3),
      camPitch: +s.player.camPitch.toFixed(3),
    };
  });
  console.log('after settle:', JSON.stringify(diag2));
  // Fire via the real path and report the gang health.
  await page.evaluate(() => { window.__selara.player.tryShoot(); });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => {
    const s = window.__selara;
    return { mag: s.player.mag.kobra, gangHp: s.combatAI.members[0].health, gangState: s.combatAI.members[0].state };
  });
  console.log('after tryShoot:', JSON.stringify(after));
  await page.mouse.up({ button: 'right' });
} finally {
  if (browser) await browser.close();
  server.kill();
}
