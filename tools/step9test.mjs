// Step 9 mission check: M1 drive+cutscene, M2 steal, M3 kill+deliver,
// M6 chase+wreck+boss. Teleports stand in for long drives here; the
// full playtest (step 10) drives the routes for real.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8087;
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
      gameState: s.game.state,
      mission: m.mission?.id ?? null,
      stage: m.stage,
      objective: s.hud.objective,
      money: s.player.money,
      weapons: s.player.weapons,
      wanted: s.police.wanted,
      inCar: !!s.player.inCar,
      gang: m.gang.length,
      gangAlive: m.gang.filter((g) => g.health > 0).length,
      cutscene: s.cutscene.playing,
      completed: m.completedIds,
    };
  });
  await page.click('#btn-new');
  await page.waitForTimeout(2000);
  console.log('M1 start:', JSON.stringify(await state()));
  // Walk to the Merpati and press F to enter.
  await page.evaluate(() => {
    const s = window.__selara;
    s.player.x = s.pierCar.x - 2; s.player.z = s.pierCar.z;
  });
  await page.waitForTimeout(800);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);
  console.log('M1 in car:', JSON.stringify(await state()));
  // Drive (teleport the car) to the garage.
  await page.evaluate(() => {
    const s = window.__selara;
    const g = s.city.landmark('garage');
    s.player.inCar.x = g.x; s.player.inCar.z = g.z + 4;
    s.player.x = g.x; s.player.z = g.z + 4;
  });
  await page.waitForTimeout(2500);
  console.log('M1 at garage (cutscene?):', JSON.stringify(await state()));
  await page.screenshot({ path: '/tmp/m1-cutscene.png' });
  // Advance the cutscene lines with clicks.
  for (let i = 0; i < 8; i++) {
    await page.mouse.click(640, 360);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2000);
  console.log('M1 done:', JSON.stringify(await state()));
  // Jump to M2: the next mission auto-starts after 4 game-seconds.
  await page.evaluate(() => { window.__selara.missions.nextMissionT = 0.1; });
  await page.waitForTimeout(3000);
  console.log('M2 start:', JSON.stringify(await state()));
  const vesper = await page.evaluate(() => {
    const s = window.__selara;
    return s.missions.vesper ? [Math.round(s.missions.vesper.x), Math.round(s.missions.vesper.z), s.missions.vesper.color] : null;
  });
  console.log('vesper:', JSON.stringify(vesper));
  // Steal it.
  await page.evaluate(() => {
    const s = window.__selara;
    s.player.x = s.missions.vesper.x - 2; s.player.z = s.missions.vesper.z;
    if (s.player.inCar) { s.player.inCar.driver = null; s.player.inCar = null; }
  });
  await page.waitForTimeout(800);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);
  console.log('M2 stolen:', JSON.stringify(await state()));
  // M3: jump in, go to the kedai, kill the gang, take the bag, deliver.
  await page.evaluate(() => { window.__selara.missions.startMission(2); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const s = window.__selara;
    const k = s.city.landmark('kedai');
    s.player.x = k.x; s.player.z = k.z;
    if (s.player.inCar) { s.player.inCar.driver = null; s.player.inCar = null; }
  });
  await page.waitForTimeout(2500);
  console.log('M3 at kedai:', JSON.stringify(await state()));
  await page.evaluate(() => {
    const s = window.__selara;
    for (const m of s.missions.gang) s.combatAI.damageMember(m, 200);
  });
  await page.waitForTimeout(2000);
  console.log('M3 gang dead:', JSON.stringify(await state()));
  await page.evaluate(() => {
    const s = window.__selara;
    const bag = s.missions.cashBag;
    if (bag) { s.player.x = bag.x; s.player.z = bag.z; }
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const s = window.__selara;
    const g = s.city.landmark('garage');
    s.player.x = g.x; s.player.z = g.z;
  });
  await page.waitForTimeout(2000);
  console.log('M3 done:', JSON.stringify(await state()));
  // M6: jump in, watch Viktor's car drive, then wreck it.
  await page.evaluate(() => { window.__selara.missions.startMission(5); });
  await page.waitForTimeout(2000);
  const v0 = await page.evaluate(() => {
    const s = window.__selara;
    return [Math.round(s.missions.viktorCar.x), Math.round(s.missions.viktorCar.z)];
  });
  await page.waitForTimeout(6000);
  const v1 = await page.evaluate(() => {
    const s = window.__selara;
    return [Math.round(s.missions.viktorCar.x), Math.round(s.missions.viktorCar.z), s.missions.viktorCar.routeIndex, s.missions.viktorCar.route?.length];
  });
  console.log('viktor car moved:', JSON.stringify(v0), '->', JSON.stringify(v1));
  await page.evaluate(() => {
    const s = window.__selara;
    s.missions.viktorCar.damage(500);
  });
  await page.waitForTimeout(2500);
  console.log('M6 boss stage:', JSON.stringify(await state()));
  console.log('errors:', errors.length ? errors : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
