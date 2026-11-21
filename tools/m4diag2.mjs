// Clean M4 repro: fresh new game, EXACT playtest M4 block, verbose snapshots.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  headless: false,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto('http://localhost:8080/', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.click('#btn-new');
  let state = '';
  for (let i = 0; i < 60 && state !== 'playing'; i++) {
    await page.waitForTimeout(2000);
    state = await page.evaluate(() => window.__selara?.game?.state);
  }
  console.log('state after new game:', state);
  const snap = (label) => page.evaluate((label) => {
    const s = window.__selara;
    const dex = s.missions.dex;
    return {
      label,
      mission: s.missions.mission?.id, stage: s.missions.stage, active: s.missions.active,
      failed: s.missions.failed, completed: s.missions.completed,
      pos: [Math.round(s.player.x), Math.round(s.player.z)],
      inCar: !!s.player.inCar, dexInCar: s.missions.dexInCar,
      dexPos: dex ? [Math.round(dex.x), Math.round(dex.z)] : null,
      distDex: dex ? Math.round(Math.hypot(s.player.x - dex.x, s.player.z - dex.z)) : null,
      nearDexHome8: s.missions.nearLandmark('dexHome', 8),
      nearBank14: s.missions.nearLandmark('bank', 14),
      wanted: s.police.wanted, money: s.player.money,
    };
  }, label).then((r) => console.log(JSON.stringify(r)));
  // Exact playtest M4 block.
  await page.evaluate(() => { window.__selara.missions.startMission(3); });
  await page.waitForTimeout(1200);
  await snap('after startMission(3)');
  await page.evaluate(() => {
    const s = window.__selara;
    const [dx, dz] = s.missions.sidewalkSpot('dexHome');
    const [cx, cz] = s.missions.roadSpot(dx, dz, 0);
    s.vehicles.add('merpati', cx, cz, 0);
    s.player.x = cx; s.player.z = cz + 3;
  });
  await page.waitForTimeout(1500);
  await snap('at dexHome road spot');
  let entered = false;
  for (let attempt = 0; attempt < 2 && !entered; attempt++) {
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(1500);
    entered = await page.evaluate(() => !!window.__selara.player.inCar);
    if (!entered) console.log(`M4 enter attempt ${attempt} failed`);
  }
  await snap('after F');
  await page.waitForTimeout(2000);
  await snap('after F +2s');
  await page.evaluate(() => {
    const s = window.__selara;
    const l = s.city.landmark('bank');
    const [bx, bz] = s.missions.roadSpot(l.x, l.z, 0);
    if (s.player.inCar) { s.player.inCar.x = bx; s.player.inCar.z = bz; }
    s.player.x = bx; s.player.z = bz;
  });
  await page.waitForTimeout(2000);
  await snap('at bank');
  await page.evaluate(() => { window.__selara.missions.stageState.waited = 14.5; });
  await page.waitForTimeout(4000);
  await snap('after wait hack');
  await page.evaluate(() => { window.__selara.police.clearWanted(); });
  await page.waitForTimeout(2000);
  await snap('after clearWanted');
  await page.evaluate(() => {
    const s = window.__selara;
    const [dx, dz] = s.missions.sidewalkSpot('dexHome');
    if (s.player.inCar) { s.player.inCar.x = dx + 6; s.player.inCar.z = dz; }
    s.player.x = dx + 6; s.player.z = dz;
  });
  await page.waitForTimeout(2000);
  await snap('at dexHome return');
  console.log('errors:', JSON.stringify(errors));
} finally {
  await browser.close();
}
