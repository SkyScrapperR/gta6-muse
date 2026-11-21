// Quick smoke: page loads clean, Low preset + F3 work, M4 pickup works.
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
  await page.evaluate(() => window.__selara.game.applyQuality('low'));
  await page.waitForTimeout(3000);
  await page.click('#btn-new');
  let state = '';
  for (let i = 0; i < 60 && state !== 'playing'; i++) {
    await page.waitForTimeout(2000);
    state = await page.evaluate(() => window.__selara?.game?.state);
  }
  console.log('state:', state, 'quality:', await page.evaluate(() => window.__selara.game.quality));
  await page.keyboard.press('F3');
  await page.waitForTimeout(1000);
  console.log('showFps after F3:', await page.evaluate(() => window.__selara.game.showFps));
  // M4 with the new playtest block.
  await page.evaluate(() => { window.__selara.missions.startMission(3); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const s = window.__selara;
    if (s.player.inCar) { s.player.inCar.driver = null; s.player.inCar = null; }
    const [dx, dz] = s.missions.sidewalkSpot('dexHome');
    s.player.x = dx; s.player.z = dz;
  });
  let st = 0;
  for (let i = 0; i < 7 && st < 1; i++) {
    await page.waitForTimeout(1500);
    st = await page.evaluate(() => window.__selara.missions.stage);
  }
  console.log('M4 stage after reaching Dex (want >=1):', st);
  await page.evaluate(() => {
    const s = window.__selara;
    const [dx, dz] = s.missions.sidewalkSpot('dexHome');
    const [cx, cz] = s.missions.roadSpot(dx, dz, 0);
    s.vehicles.add('merpati', cx, cz, 0);
    s.player.x = cx; s.player.z = cz + 3;
  });
  await page.waitForTimeout(800);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);
  console.log('inCar after F:', await page.evaluate(() => !!window.__selara.player.inCar));
  for (let i = 0; i < 20 && st < 2; i++) {
    await page.waitForTimeout(1500);
    st = await page.evaluate(() => window.__selara.missions.stage);
    if (i % 4 === 0) {
      const d = await page.evaluate(() => {
        const s = window.__selara;
        return { dexInCar: s.missions.dexInCar, distDex: Math.round(Math.hypot(s.player.x - s.missions.dex.x, s.player.z - s.missions.dex.z)) };
      });
      console.log(`  poll ${i} stage=${st}`, JSON.stringify(d));
    }
  }
  console.log('M4 stage after Dex pickup (want >=2):', st);
  console.log('errors:', JSON.stringify(errors));
} finally {
  await browser.close();
}
