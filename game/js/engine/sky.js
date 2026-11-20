// Time-of-day palette: one function turns a game hour (0..24) into every
// lighting value the renderer needs — sun direction and colour, hemisphere
// ambient, sky gradient, fog, and how night the scene is. The day is a loop
// of keyframes; between them everything lerps, so dawn and dusk sweep
// smoothly instead of snapping.
//
// The sun rises around 06:00 in the east and sets around 18:00 in the west.
// At night the "sun" becomes the moon: low, cool and dim, so streetlights,
// windows and neon carry the scene.

import { clamp, lerp } from '../core/math.js';

function mix3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// hour, sunDir, sunColor, hemiSky, hemiGround, zenith, horizon, sunTint,
// fogColor, fogDensity, night
const KEYS = [
  { h: 0.0, sun: [0.25, 0.55, -0.45], sunC: [0.10, 0.12, 0.20], hs: [0.030, 0.040, 0.070], hg: [0.015, 0.015, 0.025], zen: [0.008, 0.012, 0.035], hor: [0.030, 0.040, 0.085], tint: [0.10, 0.12, 0.22], fog: [0.020, 0.028, 0.060], fogD: 0.00045, night: 1.0 },
  { h: 5.0, sun: [0.55, 0.10, -0.30], sunC: [0.35, 0.22, 0.18], hs: [0.100, 0.080, 0.120], hg: [0.050, 0.045, 0.060], zen: [0.100, 0.110, 0.210], hor: [0.420, 0.250, 0.220], tint: [0.90, 0.45, 0.25], fog: [0.150, 0.120, 0.160], fogD: 0.00055, night: 0.75 },
  { h: 6.5, sun: [0.85, 0.25, -0.20], sunC: [0.95, 0.62, 0.38], hs: [0.220, 0.200, 0.260], hg: [0.110, 0.100, 0.120], zen: [0.260, 0.340, 0.520], hor: [0.950, 0.620, 0.420], tint: [1.00, 0.62, 0.30], fog: [0.380, 0.330, 0.360], fogD: 0.00060, night: 0.25 },
  { h: 9.0, sun: [0.75, 0.80, 0.10], sunC: [1.00, 0.95, 0.85], hs: [0.420, 0.500, 0.620], hg: [0.210, 0.200, 0.180], zen: [0.250, 0.480, 0.800], hor: [0.650, 0.780, 0.900], tint: [1.00, 0.95, 0.80], fog: [0.580, 0.680, 0.800], fogD: 0.00055, night: 0.0 },
  { h: 12.0, sun: [0.15, 1.00, 0.25], sunC: [1.05, 1.00, 0.90], hs: [0.450, 0.540, 0.660], hg: [0.230, 0.215, 0.190], zen: [0.200, 0.450, 0.830], hor: [0.620, 0.770, 0.920], tint: [1.00, 0.97, 0.85], fog: [0.600, 0.700, 0.820], fogD: 0.00050, night: 0.0 },
  { h: 16.0, sun: [-0.55, 0.55, 0.45], sunC: [1.00, 0.85, 0.60], hs: [0.400, 0.450, 0.580], hg: [0.220, 0.200, 0.180], zen: [0.280, 0.450, 0.750], hor: [0.750, 0.660, 0.600], tint: [1.00, 0.80, 0.50], fog: [0.600, 0.620, 0.680], fogD: 0.00055, night: 0.0 },
  { h: 17.5, sun: [-0.90, 0.22, 0.30], sunC: [1.00, 0.55, 0.28], hs: [0.300, 0.260, 0.360], hg: [0.170, 0.140, 0.150], zen: [0.260, 0.220, 0.480], hor: [0.980, 0.520, 0.300], tint: [1.00, 0.55, 0.25], fog: [0.480, 0.380, 0.380], fogD: 0.00060, night: 0.15 },
  { h: 18.75, sun: [-0.85, 0.05, 0.10], sunC: [0.55, 0.28, 0.35], hs: [0.150, 0.130, 0.240], hg: [0.080, 0.070, 0.100], zen: [0.100, 0.080, 0.280], hor: [0.550, 0.250, 0.380], tint: [0.90, 0.40, 0.45], fog: [0.250, 0.180, 0.280], fogD: 0.00060, night: 0.55 },
  { h: 20.0, sun: [-0.45, 0.45, -0.55], sunC: [0.14, 0.16, 0.26], hs: [0.050, 0.060, 0.110], hg: [0.025, 0.025, 0.040], zen: [0.015, 0.020, 0.060], hor: [0.060, 0.070, 0.140], tint: [0.15, 0.18, 0.30], fog: [0.040, 0.050, 0.100], fogD: 0.00050, night: 0.95 },
  { h: 22.0, sun: [0.25, 0.55, -0.45], sunC: [0.10, 0.12, 0.20], hs: [0.030, 0.040, 0.070], hg: [0.015, 0.015, 0.025], zen: [0.008, 0.012, 0.035], hor: [0.030, 0.040, 0.085], tint: [0.10, 0.12, 0.22], fog: [0.020, 0.028, 0.060], fogD: 0.00045, night: 1.0 },
  { h: 24.0, sun: [0.25, 0.55, -0.45], sunC: [0.10, 0.12, 0.20], hs: [0.030, 0.040, 0.070], hg: [0.015, 0.015, 0.025], zen: [0.008, 0.012, 0.035], hor: [0.030, 0.040, 0.085], tint: [0.10, 0.12, 0.22], fog: [0.020, 0.028, 0.060], fogD: 0.00045, night: 1.0 },
];

export function skyPalette(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = clamp((h - a.h) / (b.h - a.h), 0, 1);
  const s = t * t * (3 - 2 * t); // smooth the blend
  const len = Math.hypot(...a.sun) || 1;
  const sunDir = mix3(a.sun, b.sun, s).map((v) => v / (Math.hypot(...mix3(a.sun, b.sun, s)) || 1));
  return {
    sunDir,
    sunColor: mix3(a.sunC, b.sunC, s),
    hemiSky: mix3(a.hs, b.hs, s),
    hemiGround: mix3(a.hg, b.hg, s),
    zenith: mix3(a.zen, b.zen, s),
    horizon: mix3(a.hor, b.hor, s),
    sunTint: mix3(a.tint, b.tint, s),
    fogColor: mix3(a.fog, b.fog, s),
    fogDensity: lerp(a.fogD, b.fogD, s),
    night: lerp(a.night, b.night, s),
  };
}

// Human-readable name of the time of day, for the HUD clock.
export function daypartName(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 4.5) return 'Night';
  if (h < 6.5) return 'Dawn';
  if (h < 11) return 'Morning';
  if (h < 15) return 'Midday';
  if (h < 17.5) return 'Afternoon';
  if (h < 19) return 'Golden hour';
  if (h < 20.5) return 'Dusk';
  return 'Night';
}
