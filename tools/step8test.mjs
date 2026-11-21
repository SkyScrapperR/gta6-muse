// Step 8 UI check: title -> new game (HUD+minimap) -> big map + waypoint
// -> pause -> resume -> save at safehouse.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8088;
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
    return {
      gameState: s.game.state,
      titleVisible: !document.getElementById('title').classList.contains('hidden'),
      pauseVisible: !document.getElementById('pause').classList.contains('hidden'),
      mapOpen: s.bigMap.open,
      waypoint: s.bigMap.waypoint,
      hasSave: s.save.hasSave(),
      money: s.player.money,
      player: [Math.round(s.player.x), Math.round(s.player.z)],
      fps: s.fps,
    };
  });
  console.log('at title:', JSON.stringify(await state()));
  await page.screenshot({ path: '/tmp/ui-title.png' });
  // New Game.
  await page.click('#btn-new');
  await page.waitForTimeout(2500);
  console.log('after new game:', JSON.stringify(await state()));
  await page.screenshot({ path: '/tmp/ui-playing.png' });
  // Big map.
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(1500);
  console.log('map open:', JSON.stringify(await state()));
  await page.screenshot({ path: '/tmp/ui-bigmap.png' });
  // Click the centre of the map to set a waypoint.
  await page.mouse.click(640, 360);
  await page.waitForTimeout(1000);
  console.log('after map click:', JSON.stringify(await state()));
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(1000);
  console.log('map closed:', JSON.stringify(await state()));
  // Pause and resume.
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(1000);
  console.log('paused:', JSON.stringify(await state()));
  await page.click('#btn-resume');
  await page.waitForTimeout(1000);
  console.log('resumed:', JSON.stringify(await state()));
  // Walk to the safehouse and save with E.
  await page.evaluate(() => {
    const s = window.__selara;
    const sh = s.city.landmark('safehouse');
    s.player.x = sh.x; s.player.z = sh.z;
  });
  await page.waitForTimeout(1500);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1000);
  console.log('after save at safehouse:', JSON.stringify(await state()));
  console.log('errors:', errors.length ? errors : 'none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
