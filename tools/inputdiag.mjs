// Does a right-mouse hold reach the game? New Game, wait for playing,
// hold right mouse, read aiming/mouseRight/inCar.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  headless: false,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
try {
  await page.goto('http://localhost:8080/', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.click('#btn-new');
  let state = '';
  for (let i = 0; i < 60 && state !== 'playing'; i++) {
    await page.waitForTimeout(2000);
    state = await page.evaluate(() => window.__selara?.game?.state);
  }
  console.log('state:', state);
  const before = await page.evaluate(() => {
    const s = window.__selara;
    s.player.giveWeapon('kobra', 48);
    s.player.setWeapon('kobra');
    return { inCar: !!s.player.inCar, weapon: s.player.weapon, aiming: s.player.aiming };
  });
  console.log('before hold:', JSON.stringify(before));
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(1500);
  const held = await page.evaluate(() => {
    const s = window.__selara;
    return {
      aiming: s.player.aiming, mouseRight: s.player.input.mouseRight,
      locked: s.player.input.locked, inCar: !!s.player.inCar,
      camPos: s.player.cameraForRender().pos.map((v) => Math.round(v * 10) / 10),
    };
  });
  console.log('while held:', JSON.stringify(held));
  await page.mouse.click(640, 360);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({
    mag: window.__selara.player.mag.kobra,
    ammo: window.__selara.player.ammo.kobra,
  }));
  console.log('after click (mag should drop 12->11 if the shot fired):', JSON.stringify(after));
  await page.mouse.up({ button: 'right' });
} finally {
  await browser.close();
}
