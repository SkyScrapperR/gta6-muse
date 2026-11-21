// Does F enter/exit a car reliably at ~2 fps? New Game, spawn a Merpati
// next to Kai, press F to enter, press F again to exit, log inCar each time.
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
  await page.evaluate(() => {
    const s = window.__selara;
    const car = s.vehicles.add('merpati', s.player.x + 3, s.player.z, 0);
    console.log('car at', car.x, car.z);
  });
  await page.waitForTimeout(1000);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);
  console.log('after F #1 (enter):', await page.evaluate(() => ({
    inCar: !!window.__selara.player.inCar,
    car: window.__selara.player.inCar?.type?.name ?? window.__selara.player.inCar?.kind ?? null,
  })));
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);
  console.log('after F #2 (exit):', await page.evaluate(() => ({
    inCar: !!window.__selara.player.inCar,
    pos: [Math.round(window.__selara.player.x), Math.round(window.__selara.player.z)],
  })));
  // And once more, fast: F to enter, F to exit with a short wait.
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(800);
  console.log('after F #3 (enter, 800ms):', await page.evaluate(() => !!window.__selara.player.inCar));
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(800);
  console.log('after F #4 (exit, 800ms):', await page.evaluate(() => !!window.__selara.player.inCar));
} finally {
  await browser.close();
}
