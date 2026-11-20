// Diagnostic: project the Merpati to screen space with the real matrices.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 8097;
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
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const s = window.__selara;
    const cam = s.player.cameraForRender();
    // Rebuild view-proj here (same math as the renderer).
    const lookAt = (eye, target) => {
      const z = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]];
      const zl = Math.hypot(...z); z[0] /= zl; z[1] /= zl; z[2] /= zl;
      const x = [0 * z[2] - 1 * z[1], 1 * z[0] - 0 * z[2], 0 * z[1] - 0 * z[0]];
      const xl = Math.hypot(...x) || 1; x[0] /= xl; x[1] /= xl; x[2] /= xl;
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return { x, y, z };
    };
    const basis = lookAt(cam.pos, cam.target);
    const project = (p) => {
      const dx = p[0] - cam.pos[0], dy = p[1] - cam.pos[1], dz = p[2] - cam.pos[2];
      const vx = dx * basis.x[0] + dy * basis.x[1] + dz * basis.x[2];
      const vy = dx * basis.y[0] + dy * basis.y[1] + dz * basis.y[2];
      const vz = dx * basis.z[0] + dy * basis.z[1] + dz * basis.z[2];
      const f = 1 / Math.tan(cam.fov / 2);
      const aspect = 1280 / 720;
      const ndcX = (vx * f) / (aspect * -vz);
      const ndcY = (vy * f) / -vz;
      return { sx: (ndcX * 0.5 + 0.5) * 1280, sy: (1 - (ndcY * 0.5 + 0.5)) * 720, behind: vz > 0, dist: -vz };
    };
    const merpati = s.vehicles.vehicles[0];
    return {
      camPos: cam.pos.map((v) => +v.toFixed(1)),
      camTarget: cam.target.map((v) => +v.toFixed(1)),
      fov: +(cam.fov * 180 / Math.PI).toFixed(1),
      merpati: [merpati.x, merpati.z],
      merpatiScreen: project([merpati.x, 1, merpati.z]),
      kaiScreen: project([s.player.x, 1, s.player.z]),
      counts: { veh: s.vehicles.vehicles.length },
    };
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  if (browser) await browser.close();
  server.kill();
}
