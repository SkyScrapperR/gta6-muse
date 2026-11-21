// Step 9b: M4 wheelman, M5 low tide, M6 boss kill + ending.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8084;
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
    const m = s.missions;
    return {
      gameState: s.game.state, mission: m.mission?.id ?? null, stage: m.stage,
      objective: s.hud.objective, money: s.player.money,
      weapons: s.player.weapons, wanted: s.police.wanted,
      inCar: !!s.player.inCar, dexInCar: m.dexInCar,
      gangAlive: m.gang.filter((g) => g.health > 0).length,
      cutscene: s.cutscene.playing, completed: m.completedIds,
    };
  });
  await page.click('#btn-new');
  await page.waitForTimeout(1500);
  // --- M4 ---
  await page.evaluate(() => { window.__selara.missions.startMission(3); });
  await page.waitForTimeout(1200);
  // Put the player + a car next to Dex.
  await page.evaluate(() => {
    const s = window.__selara;
    const [dx, dz] = s.missions.sidewalkSpot('dexHome');
    const car = s.vehicles.add('merpati', dx + 6, dz, 0);
    s.player.x = dx + 4; s.player.z = dz;
    s._m4car = car;
  });
  await page.waitForTimeout(1500);
  console.log('M4 at dex:', JSON.stringify(await state()));
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);
  console.log('M4 in car:', JSON.stringify(await state()));
  // Drive to the bank.
  await page.evaluate(() => {
    const s = window.__selara;
    const l = s.city.landmark('bank');
    const [bx, bz] = s.missions.roadSpot(l.x, l.z, 0);
    s.player.inCar.x = bx; s.player.inCar.z = bz;
    s.player.x = bx; s.player.z = bz;
  });
  await page.waitForTimeout(2000);
  console.log('M4 at bank:', JSON.stringify(await state()));
  // The wait is 15 game-seconds; jump it to 14.5 and let the loop finish it.
  await page.evaluate(() => { window.__selara.missions.stageState.waited = 14.5; });
  await page.waitForTimeout(4000);
  console.log('M4 waited:', JSON.stringify(await state()));
  // Lose the cops.
  await page.evaluate(() => { window.__selara.police.clearWanted(); });
  await page.waitForTimeout(2000);
  console.log('M4 cops lost:', JSON.stringify(await state()));
  // Drop Dex home.
  await page.evaluate(() => {
    const s = window.__selara;
    const [dx, dz] = s.missions.sidewalkSpot('dexHome');
    s.player.inCar.x = dx + 6; s.player.inCar.z = dz;
    s.player.x = dx + 6; s.player.z = dz;
  });
  await page.waitForTimeout(2000);
  console.log('M4 done:', JSON.stringify(await state()));
  // --- M5 ---
  await page.evaluate(() => { window.__selara.missions.startMission(4); });
  await page.waitForTimeout(1200);
  console.log('M5 start (hour should be 22):', JSON.stringify(await state()),
    await page.evaluate(() => window.__selara.hud.hour));
  await page.evaluate(() => {
    const s = window.__selara;
    const [gx, gz] = s.missions.sidewalkSpot('garage');
    if (s.player.inCar) { s.player.inCar.x = gx; s.player.inCar.z = gz; }
    s.player.x = gx; s.player.z = gz;
  });
  await page.waitForTimeout(2000);
  console.log('M5 got smg:', JSON.stringify(await state()));
  await page.evaluate(() => {
    const s = window.__selara;
    const [fx, fz] = s.missions.sidewalkSpot('freight');
    if (s.player.inCar) { s.player.inCar.x = fx; s.player.inCar.z = fz; }
    s.player.x = fx; s.player.z = fz;
    if (s.player.inCar) { s.player.inCar.driver = null; s.player.inCar = null; }
  });
  await page.waitForTimeout(2000);
  console.log('M5 at freight:', JSON.stringify(await state()));
  await page.evaluate(() => {
    const s = window.__selara;
    for (const m of s.missions.gang) s.combatAI.damageMember(m, 200);
  });
  await page.waitForTimeout(2000);
  console.log('M5 guards dead:', JSON.stringify(await state()));
  await page.evaluate(() => { window.__selara.missions.truck.damage(500); });
  await page.waitForTimeout(2500);
  console.log('M5 truck wrecked:', JSON.stringify(await state()));
  await page.evaluate(() => { const s = window.__selara; s.player.x = -104; s.player.z = 208; });
  await page.waitForTimeout(2000);
  console.log('M5 done:', JSON.stringify(await state()));
  // --- M6 boss ---
  await page.evaluate(() => { window.__selara.missions.startMission(5); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__selara.missions.viktorCar.damage(500); });
  await page.waitForTimeout(2000);
  console.log('M6 boss cutscene:', JSON.stringify(await state()));
  await page.screenshot({ path: '/tmp/m6-cutscene.png' });
  for (let i = 0; i < 8; i++) {
    await page.mouse.click(640, 360);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1500);
  console.log('M6 boss fight:', JSON.stringify(await state()));
  const bossHp = await page.evaluate(() => {
    const s = window.__selara;
    return s.missions.boss ? s.missions.boss.health : null;
  });
  console.log('boss hp:', bossHp);
  await page.evaluate(() => {
    const s = window.__selara;
    if (s.missions.boss) s.combatAI.damageMember(s.missions.boss, 500);
  });
  await page.waitForTimeout(2500);
  console.log('M6 boss dead:', JSON.stringify(await state()));
  await page.screenshot({ path: '/tmp/m6-ending.png' });
  for (let i = 0; i < 10; i++) {
    await page.mouse.click(640, 360);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2000);
  console.log('M6 done:', JSON.stringify(await state()));
  console.log('errors:', errors.length ? errors : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
