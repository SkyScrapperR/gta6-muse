// Full repro of the playtest's wanted-decay poll (300 s, Bukit hops) then M3.
// Logs loseT + per-cop LOS every 5 s so the decay failure is visible,
// then the M3 reach poll with full state.
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
  await page.evaluate(() => {
    const s = window.__selara;
    s.police.clearWanted();
    s.police.addWanted(2);
    s.player.x = -400; s.player.z = -400;
    if (s.player.inCar) { s.player.inCar.driver = null; s.player.inCar = null; }
  });
  const bukit = [[-400, -400], [-300, -450], [-450, -300], [-350, -350]];
  let decayed = false;
  for (let i = 0; i < 60 && !decayed; i++) {
    await page.waitForTimeout(5000);
    const r = await page.evaluate(() => {
      const s = window.__selara;
      const p = s.player;
      const cops = s.police.copCars.map((c) => {
        const d = Math.round(Math.hypot(p.x - c.v.x, p.z - c.v.z));
        const los = d <= 90 ? s.city.collision.hasLineOfSight(c.v.x, c.v.z, p.x, p.z) : false;
        return { d, los, pos: [Math.round(c.v.x), Math.round(c.v.z)] };
      });
      const feet = s.police.footCops.map((f) => {
        const d = Math.round(Math.hypot(p.x - f.c.x, p.z - f.c.z));
        const los = d <= 50 ? s.city.collision.hasLineOfSight(f.c.x, f.c.z, p.x, p.z) : false;
        return { d, los };
      });
      return {
        wanted: s.police.wanted, loseT: Math.round(s.police.loseT * 10) / 10,
        pos: [Math.round(p.x), Math.round(p.z)], cops, feet,
        mission: s.missions.mission?.id, stage: s.missions.stage,
        mActive: s.missions.active, mFailed: s.missions.failed,
      };
    });
    if (r.wanted === 0) { decayed = true; console.log(`i=${i} DECAYED`, JSON.stringify(r)); break; }
    if (i % 6 === 5) {
      const [cx, cz] = bukit[Math.floor(i / 6) % bukit.length];
      await page.evaluate(([cx, cz]) => {
        const s = window.__selara;
        s.player.x = cx; s.player.z = cz;
      }, [cx, cz]);
      console.log(`i=${i} hop to [${cx},${cz}]`, JSON.stringify(r));
    } else if (i % 6 === 0) {
      console.log(`i=${i}`, JSON.stringify(r));
    }
  }
  console.log('decayed:', decayed);
  await page.evaluate(() => { window.__selara.missions.startMission(2); });
  await page.waitForTimeout(1200);
  const spot = await page.evaluate(() => {
    const s = window.__selara;
    const [gx, gz] = s.missions.sidewalkSpot('kedai');
    s.player.x = gx; s.player.z = gz;
    return { spot: [gx, gz], state: s.game.state };
  });
  console.log('M3 teleported to:', JSON.stringify(spot));
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const s = window.__selara;
      return {
        state: s.game.state, stage: s.missions.stage, mission: s.missions.mission?.id,
        active: s.missions.active, failed: s.missions.failed,
        pos: [Math.round(s.player.x), Math.round(s.player.z)],
        near: s.missions.nearLandmark('kedai', 12), wanted: s.police.wanted,
        copCars: s.police.copCars.length, footCops: s.police.footCops.length,
        health: s.player.health,
      };
    });
    console.log(`M3 t+${(i + 1) * 1.5}s`, JSON.stringify(r));
    if (r.stage >= 1) break;
  }
  console.log('errors:', JSON.stringify(errors));
} finally {
  await browser.close();
}
