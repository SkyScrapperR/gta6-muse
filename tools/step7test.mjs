// Step 7 combat check: player shoots a gang member (real click), gang
// shoots back, player dies and respawns at the hospital minus $100.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8091;
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const state = () => page.evaluate(() => {
    const s = window.__selara;
    return {
      hp: Math.round(s.player.health),
      money: s.player.money,
      weapon: s.player.weapon,
      mag: s.player.mag.kobra,
      gang: s.combatAI.members.map((m) => [Math.round(m.health), m.state, m.c.pose]),
      player: [Math.round(s.player.x), Math.round(s.player.z)],
      pickups: s.pickups.pickups.length,
      decals: s.weapons.decalCount,
      wanted: s.police.wanted,
    };
  });
  // Arm Kai and put 3 enforcers 25 m ahead of him, facing him.
  await page.evaluate(() => {
    const s = window.__selara;
    s.player.giveWeapon('kobra', 48);
    s.player.setWeapon('kobra');
    s.combatAI.spawnGang(s.player.x, s.player.z - 25, 3);
  });
  await page.waitForTimeout(2000);
  console.log('before:', JSON.stringify(await state()));
  // Aim the camera at the gang (debug assist) and click to fire for real:
  // hold right mouse to aim, level the pitch, then left-click.
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await page.evaluate(() => {
    const s = window.__selara;
    const g = s.combatAI.members[0].c;
    s.player.camYaw = Math.atan2(g.x - s.player.x, g.z - s.player.z);
    s.player.camPitch = 0;
  });
  await page.waitForTimeout(1200);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(1500);
  console.log('after 1 shot:', JSON.stringify(await state()));
  await page.mouse.click(640, 360);
  await page.waitForTimeout(1500);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(1500);
  console.log('after 3 shots:', JSON.stringify(await state()));
  await page.mouse.up({ button: 'right' });
  // Let the gang shoot back for a while.
  await page.waitForTimeout(20000);
  console.log('after gang returns fire:', JSON.stringify(await state()));
  // Force death and watch the hospital respawn.
  await page.evaluate(() => { window.__selara.player.damage(200); });
  await page.waitForTimeout(20000);
  console.log('after death+respawn:', JSON.stringify(await state()));
  console.log('errors:', errors.length ? errors : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
