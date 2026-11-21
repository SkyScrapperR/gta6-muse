// Quick drive check: new game -> enter Merpati -> autopilot-drive to the
// garage (W pulsed by speed), printing position every 2 s. Exits 0 when
// the M1 stage advances, 1 on timeout.
import { chromium } from 'playwright-core';

const errors = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  headless: false,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.click('#btn-new'); // New Game
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const s = window.__selara;
  s.player.x = s.pierCar.x - 2; s.player.z = s.pierCar.z;
});
await page.waitForTimeout(800);
await page.keyboard.press('KeyF');
await page.waitForTimeout(1200);
const ok = await page.evaluate(async () => {
  const s = window.__selara;
  const car = s.player.inCar;
  if (!car) return false;
  const g = s.city.landmark('garage');
  const roads = await import('/js/world/roads.js');
  const route = roads.routeWaypoints(roads.findRoute(roads.nearestNode(car.x, car.z), roads.nearestNode(g.x, g.z)));
  route.push([g.x, g.z]); // Final waypoint: the garage itself.
  car.route = route;
  car.routeIndex = 0;
  car.parked = false;
  return true;
});
console.log('route set:', ok);
const t0 = Date.now();
let reached = false;
let wDown = false;
while (Date.now() - t0 < 240000) {
  const st = await page.evaluate(() => {
    const s = window.__selara;
    const car = s.player.inCar;
    if (!car) return { lost: true, stage: s.missions.stage, x: Math.round(s.player.x), z: Math.round(s.player.z) };
    car.autopilot(0.1, null, performance.now() / 1000);
    return { x: Math.round(car.x), z: Math.round(car.z), speed: Math.round(car.speed * 10) / 10, idx: car.routeIndex, total: car.route.length, stage: s.missions.stage, health: Math.round(car.health) };
  });
  console.log(JSON.stringify(st));
  if (st.stage >= 2) { reached = true; break; }
  if (st.lost) { reached = false; break; }
  // Pulse W to keep the speed in a sane band (the frame loop's input
  // drive brakes the car when no key is held).
  if (!wDown && st.speed < 12) { await page.keyboard.down('KeyW'); wDown = true; }
  else if (wDown && st.speed > 20) { await page.keyboard.up('KeyW'); wDown = false; }
  await page.waitForTimeout(100);
}
await page.keyboard.up('KeyW');
console.log('reached:', reached, 'errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(reached ? 0 : 1);
