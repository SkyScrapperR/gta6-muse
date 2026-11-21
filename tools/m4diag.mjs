// M4 geometry + sequence diag: measures roadSpot(bank) vs nearLandmark,
// then walks the M4 stages exactly like the playtest does.
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
  // Geometry: bank + dexHome landmarks, roadSpot, nearLandmark in/out of car.
  const geo = await page.evaluate(() => {
    const s = window.__selara;
    const bank = s.city.landmark('bank');
    const dex = s.city.landmark('dexHome');
    const bankRoad = s.missions.roadSpot(bank.x, bank.z, 0);
    const dexRoad = s.missions.roadSpot(dex.x, dex.z, 0);
    const dexWalk = s.missions.sidewalkSpot('dexHome');
    const bankDist = Math.hypot(bankRoad[0] - bank.x, bankRoad[1] - bank.z);
    const dexDist = Math.hypot(dexRoad[0] - dex.x, dexRoad[1] - dex.z);
    // nearLandmark from the bank road spot, on foot then in a car.
    s.player.x = bankRoad[0]; s.player.z = bankRoad[1];
    const nearFoot = s.missions.nearLandmark('bank', 14);
    const car = s.vehicles.add('merpati', bankRoad[0], bankRoad[1], 0);
    s.player.inCar = car; car.driver = s.player;
    const nearCar = s.missions.nearLandmark('bank', 14);
    return {
      bank: { x: bank.x, z: bank.z, w: bank.w, d: bank.d },
      dex: { x: dex.x, z: dex.z, w: dex.w, d: dex.d },
      bankRoad, bankDist: Math.round(bankDist * 10) / 10,
      dexRoad, dexDist: Math.round(dexDist * 10) / 10, dexWalk,
      nearFoot, nearCar,
    };
  });
  console.log('GEO:', JSON.stringify(geo));
  // Walk the M4 sequence like the playtest.
  const snap = () => page.evaluate(() => {
    const s = window.__selara;
    return {
      mission: s.missions.mission?.id, stage: s.missions.stage, active: s.missions.active,
      failed: s.missions.failed, completed: s.missions.completedIds ?? s.missions.completed,
      pos: [Math.round(s.player.x), Math.round(s.player.z)],
      inCar: !!s.player.inCar, dexInCar: s.missions.dexInCar,
      wanted: s.police.wanted, money: s.player.money ?? s.money,
    };
  });
  await page.evaluate(() => { window.__selara.missions.startMission(3); });
  await page.waitForTimeout(1200);
  console.log('after start:', JSON.stringify(await snap()));
  await page.evaluate(() => {
    const s = window.__selara;
    const [dx, dz] = s.missions.sidewalkSpot('dexHome');
    const [cx, cz] = s.missions.roadSpot(dx, dz, 0);
    s.vehicles.add('merpati', cx, cz, 0);
    s.player.x = cx; s.player.z = cz + 3;
  });
  await page.waitForTimeout(1500);
  console.log('at dexHome:', JSON.stringify(await snap()));
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);
  console.log('after F:', JSON.stringify(await snap()));
  await page.evaluate(() => {
    const s = window.__selara;
    const l = s.city.landmark('bank');
    const [bx, bz] = s.missions.roadSpot(l.x, l.z, 0);
    if (s.player.inCar) { s.player.inCar.x = bx; s.player.inCar.z = bz; }
    s.player.x = bx; s.player.z = bz;
  });
  await page.waitForTimeout(2000);
  console.log('at bank:', JSON.stringify(await snap()));
  await page.evaluate(() => { window.__selara.missions.stageState.waited = 14.5; });
  await page.waitForTimeout(4000);
  console.log('after wait hack:', JSON.stringify(await snap()));
  await page.evaluate(() => { window.__selara.police.clearWanted(); });
  await page.waitForTimeout(2000);
  console.log('after clearWanted:', JSON.stringify(await snap()));
  await page.evaluate(() => {
    const s = window.__selara;
    const [dx, dz] = s.missions.sidewalkSpot('dexHome');
    if (s.player.inCar) { s.player.inCar.x = dx + 6; s.player.inCar.z = dz; }
    s.player.x = dx + 6; s.player.z = dz;
  });
  await page.waitForTimeout(2000);
  console.log('at dexHome return:', JSON.stringify(await snap()));
  console.log('errors:', JSON.stringify(errors));
} finally {
  await browser.close();
}
