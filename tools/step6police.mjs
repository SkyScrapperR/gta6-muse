// Step 6 police behavior check: foot-cop drop, arrest, wanted decay.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8093;
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
      wanted: s.police.wanted,
      copCars: s.police.copCars.map((c) => [Math.round(c.v.x), Math.round(c.v.z)]),
      footCops: s.police.footCops.map((c) => [Math.round(c.c.x), Math.round(c.c.z)]),
      player: [Math.round(s.player.x), Math.round(s.player.z)],
      money: s.player.money,
      fps: s.fps,
    };
  });
  // 1 star: put a cop car next to Kai so it drops a foot cop.
  await page.evaluate(() => {
    const s = window.__selara;
    s.police.addWanted(1);
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const s = window.__selara;
    const car = s.police.copCars[0];
    if (car) { car.v.x = s.player.x + 8; car.v.z = s.player.z; car.v.speed = 0; }
  });
  await page.waitForTimeout(8000);
  let st = await state();
  console.log('after drop window:', JSON.stringify(st));
  // Wait for the foot cop to reach Kai and arrest him (1 star = arrest).
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(3000);
    st = await state();
    console.log('t+' + (i + 1) * 3 + 's:', JSON.stringify({ player: st.player, money: st.money, wanted: st.wanted, footCops: st.footCops.length }));
    if (st.money === 150) break; // arrested: $250 - $100
  }
  // Wanted decay: set 2 stars, fake a long time unseen, watch it drop.
  await page.evaluate(() => {
    const s = window.__selara;
    s.police.addWanted(2);
    s.police.loseT = 13.9; // decay threshold is 10 + wanted*2 = 14
    // Move all cops far away so nothing sees Kai.
    for (const c of s.police.copCars) { c.v.x = s.player.x + 300; c.v.z = s.player.z + 300; }
    for (const c of s.police.footCops) { c.c.x = s.player.x + 300; c.c.z = s.player.z + 300; }
  });
  await page.waitForTimeout(4000);
  st = await state();
  console.log('after decay window:', JSON.stringify({ wanted: st.wanted }));
  console.log('real fps:', st.fps, 'errors:', errors.length ? errors : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
