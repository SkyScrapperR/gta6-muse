// Diagnose the firefight aim and the M3 kedai reach in isolation.
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
await page.click('#btn-new');
await page.waitForTimeout(1500);

// --- Aim: replicate the playtest's post-M2 geometry.
const aim = await page.evaluate(() => {
  const s = window.__selara;
  s.player.x = 204; s.player.z = 117;
  s.player.syncChar();
  s.player.giveWeapon('kobra', 48);
  s.player.setWeapon('kobra');
  const gang = s.combatAI.spawnGang(216, 109, 1);
  const g = gang[0];
  const dx = g.c.x - s.player.x, dz = g.c.z - s.player.z;
  s.player.camYaw = Math.atan2(dx, dz);
  s.player.heading = s.player.camYaw;
  s.player.aiming = true;
  const cam = s.player.cameraForRender();
  // Dry-run the camera ray to see what it hits.
  const cdx = cam.target[0] - cam.pos[0];
  const cdy = cam.target[1] - cam.pos[1];
  const cdz = cam.target[2] - cam.pos[2];
  const cl = Math.hypot(cdx, cdy, cdz) || 1;
  const dir = [cdx / cl, cdy / cl, cdz / cl];
  const hit = s.weapons.fireHitscan(cam.pos, dir, 70, 0, s.player, { dry: true });
  return {
    player: [Math.round(s.player.x), Math.round(s.player.z)],
    gang: [Math.round(g.c.x * 10) / 10, Math.round(g.c.z * 10) / 10, g.health],
    camPos: cam.pos.map((v) => Math.round(v * 10) / 10),
    camTarget: cam.target.map((v) => Math.round(v * 10) / 10),
    aimPoint: hit.point.map((v) => Math.round(v * 10) / 10),
    aimKind: hit.kind,
    los: s.city.collision.hasLineOfSight(s.player.x, s.player.z, g.c.x, g.c.z),
  };
});
console.log('aim diag:', JSON.stringify(aim, null, 1));
await page.waitForTimeout(1000);
await page.mouse.click(640, 360);
await page.waitForTimeout(1200);
const hp = await page.evaluate(() => window.__selara.combatAI.members[0]?.health);
console.log('gang hp after click:', hp);

// --- M3 kedai reach.
const m3 = await page.evaluate(() => {
  const s = window.__selara;
  s.missions.startMission(2);
  const [gx, gz] = s.missions.sidewalkSpot('kedai');
  const l = s.city.landmark('kedai');
  s.player.x = gx; s.player.z = gz;
  s.player.syncChar();
  return {
    kedai: [l.x, l.z, l.w, l.d],
    sidewalk: [Math.round(gx * 10) / 10, Math.round(gz * 10) / 10],
    near: s.missions.nearLandmark('kedai', 12),
  };
});
console.log('m3 before wait:', JSON.stringify(m3));
await page.waitForTimeout(3000);
const m3b = await page.evaluate(() => {
  const s = window.__selara;
  return {
    player: [Math.round(s.player.x), Math.round(s.player.z)],
    stage: s.missions.stage,
    mission: s.missions.mission?.id,
    near: s.missions.nearLandmark('kedai', 12),
    gang: s.missions.gang.length,
  };
});
console.log('m3 after wait:', JSON.stringify(m3b));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
