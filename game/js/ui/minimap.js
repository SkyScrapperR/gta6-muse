// Minimap: a circular, rotating map rendered from a pre-rendered city
// image (drawn once at boot). North is the player's heading, so the map
// turns with Kai. The same city image feeds the full-screen big map.
import { HALF, GRID, streetCoord } from '../world/roads.js';

const MAP_SIZE = 1024;
const WORLD_EXTENT = 560; // world units from the centre to the map edge
const SCALE = MAP_SIZE / (WORLD_EXTENT * 2);

const DISTRICT_FILL = {
  downtown: '#5a5f6e',
  kemuning: '#7a6a55',
  bukit: '#5d7050',
  docks: '#4d4a55',
  beach: '#b8a86e',
  park: '#3f6b3a',
};

function worldToMap(x, z) {
  return [(x + WORLD_EXTENT) * SCALE, (z + WORLD_EXTENT) * SCALE];
}

export class CityMap {
  constructor(city) {
    this.city = city;
    this.canvas = document.createElement('canvas');
    this.canvas.width = MAP_SIZE;
    this.canvas.height = MAP_SIZE;
    this.render();
  }

  render() {
    const ctx = this.canvas.getContext('2d');
    // Sea.
    ctx.fillStyle = '#16324a';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Island slab.
    const [ix0, iz0] = worldToMap(-HALF - 6, -HALF - 6);
    const [ix1, iz1] = worldToMap(HALF + 6, HALF + 6);
    ctx.fillStyle = '#2c2f36';
    ctx.fillRect(ix0, iz0, ix1 - ix0, iz1 - iz0);
    // City blocks, coloured by district.
    for (const b of this.city.blocks) {
      const [x0, z0] = worldToMap(b.cx - 45, b.cz - 45);
      const [x1, z1] = worldToMap(b.cx + 45, b.cz + 45);
      ctx.fillStyle = DISTRICT_FILL[b.district] ?? '#333';
      ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
    }
    // Roads.
    ctx.strokeStyle = '#17181c';
    ctx.lineWidth = 14 * SCALE;
    for (let i = 0; i <= GRID; i++) {
      const s = streetCoord(i);
      const [x] = worldToMap(s, 0);
      const [, z] = worldToMap(0, s);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(MAP_SIZE, z); ctx.stroke();
    }
    // Centre lines.
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    for (let i = 0; i <= GRID; i++) {
      const s = streetCoord(i);
      const [x] = worldToMap(s, 0);
      const [, z] = worldToMap(0, s);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(MAP_SIZE, z); ctx.stroke();
    }
    ctx.setLineDash([]);
    // East pier.
    const [px0, pz0] = worldToMap(520, 288);
    const [px1, pz1] = worldToMap(610, 312);
    ctx.fillStyle = '#6b5a44';
    ctx.fillRect(px0, pz0, px1 - px0, pz1 - pz0);
    // Landmarks.
    for (const lm of Object.values(this.city.landmarks)) {
      const [x, z] = worldToMap(lm.x, lm.z);
      ctx.fillStyle = '#e8b64c';
      ctx.beginPath(); ctx.arc(x, z, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Ferry pier.
    const pier = this.city.ferryPier;
    const [fx, fz] = worldToMap(pier.x, pier.z);
    ctx.fillStyle = '#7fd4ff';
    ctx.beginPath(); ctx.arc(fx, fz, 6, 0, Math.PI * 2); ctx.fill();
  }
}

export class Minimap {
  constructor(cityMap, player) {
    this.map = cityMap;
    this.player = player;
    this.radius = 92;
    this.zoom = 2.6; // how much of the city fills the circle
    this.waypoint = null; // {x, z} or null
    this.route = null; // [[x, z], ...] GPS polyline or null
    this.markers = []; // {x, z, color, label}
    this.searchCenter = null; // [x, z] wanted search area
  }

  // Convert a world point to minimap canvas coordinates (before rotation).
  toLocal(x, z, cx, cy) {
    const [mx, mz] = worldToMap(x, z);
    const [px, pz] = worldToMap(this.player.x, this.player.z);
    return [
      cx + (mx - px) * this.zoom,
      cy + (mz - pz) * this.zoom,
    ];
  }

  draw(ctx, cx, cy) {
    const r = this.radius;
    const p = this.player;
    ctx.save();
    // Circular clip.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // Rotate so the player's heading points up.
    ctx.translate(cx, cy);
    ctx.rotate(-p.heading);
    ctx.translate(-cx, -cy);
    // Draw the city image, scaled around the player.
    const [px, pz] = worldToMap(p.x, p.z);
    const size = MAP_SIZE * this.zoom;
    ctx.drawImage(this.map.canvas, cx - px * this.zoom, cy - pz * this.zoom, size, size);
    // GPS route.
    if (this.route && this.route.length > 1) {
      ctx.strokeStyle = '#4dd0ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < this.route.length; i++) {
        const [lx, ly] = this.toLocal(this.route[i][0], this.route[i][1], cx, cy);
        if (i === 0) ctx.moveTo(lx, ly);
        else ctx.lineTo(lx, ly);
      }
      ctx.stroke();
    }
    // Wanted search area.
    if (this.searchCenter) {
      const [lx, ly] = this.toLocal(this.searchCenter[0], this.searchCenter[1], cx, cy);
      ctx.strokeStyle = 'rgba(255,60,60,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(lx, ly, 40, 0, Math.PI * 2); ctx.stroke();
    }
    // Waypoint.
    if (this.waypoint) {
      const [lx, ly] = this.toLocal(this.waypoint.x, this.waypoint.z, cx, cy);
      ctx.fillStyle = '#ffcf3f';
      ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
    }
    // Mission markers.
    for (const m of this.markers) {
      const [lx, ly] = this.toLocal(m.x, m.z, cx, cy);
      ctx.fillStyle = m.color ?? '#ff5a5a';
      ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
    // Ring, player arrow and health/armor arcs (drawn unrotated).
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // Health arc (outer) and armor arc (inner), around the ring.
    this.arc(ctx, cx, cy, r + 6, p.health / 100, '#37d67a');
    this.arc(ctx, cx, cy, r + 11, p.armor / 100, '#4aa8ff');
    // Player arrow, pointing up.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx - 6, cy + 7);
    ctx.lineTo(cx + 6, cy + 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
  }

  arc(ctx, cx, cy, radius, frac, color) {
    if (frac <= 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }
}
