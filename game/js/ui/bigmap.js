// Big map: press M to open the whole city, click anywhere to set a
// waypoint. A 3D light beam marks the waypoint in the world so Kai can
// find it without looking at the map.
import { box, emptyGeometry } from '../engine/mesh.js';
import { mat4TRS } from '../core/math.js';

const WORLD_EXTENT = 560;

export class BigMap {
  constructor(renderer, cityMap, player, minimap) {
    this.renderer = renderer;
    this.map = cityMap;
    this.player = player;
    this.minimap = minimap;
    this.open = false;
    // A tall emissive beam, one instance, hidden until a waypoint is set.
    const geo = emptyGeometry();
    box(geo, 0, 0, 0, 1.2, 120, 1.2, [0.3, 0.8, 1], [0.3, 0.8, 1]);
    this.beamBatch = renderer.createBatch('beam', geo, 1);
    this.beamMatrices = new Float32Array(16);
    this.beamColors = new Float32Array([1, 1, 1, 0.55]);
    this.waypoint = null;
  }

  setWaypoint(x, z) {
    this.waypoint = { x, z };
    this.minimap.waypoint = this.waypoint;
    this.minimap.setRouteTo(x, z);
    const m = mat4TRS(x, 60, z, 0, 0, 0, 1, 1, 1);
    this.beamMatrices.set(m);
  }

  clearWaypoint() {
    this.waypoint = null;
    this.minimap.waypoint = null;
    this.minimap.clearRoute();
  }

  // Draw the full map over the 2D canvas. Returns true when open.
  draw(ctx, W, H) {
    if (!this.open) return false;
    ctx.fillStyle = 'rgba(8,10,16,0.88)';
    ctx.fillRect(0, 0, W, H);
    const size = Math.min(W, H) - 80;
    const x0 = (W - size) / 2;
    const y0 = (H - size) / 2;
    ctx.drawImage(this.map.canvas, x0, y0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, size, size);
    // Landmark labels, skipping any that would overlap an earlier label.
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd23f';
    const drawnLabels = [];
    for (const lm of Object.values(this.map.city.landmarks)) {
      const mx = x0 + ((lm.x + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * size;
      const my = y0 + ((lm.z + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * size;
      const label = lm.name ?? lm.id;
      const w = ctx.measureText(label).width;
      const rect = { x: mx + 10, y: my - 9, w: w + 4, h: 16 };
      const overlaps = drawnLabels.some((r) => rect.x < r.x + r.w && rect.x + rect.w > r.x && rect.y < r.y + r.h && rect.y + rect.h > r.y);
      if (overlaps) continue;
      drawnLabels.push(rect);
      ctx.fillText(label, mx + 10, my + 4);
    }
    // Player arrow.
    const px = x0 + ((this.player.x + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * size;
    const py = y0 + ((this.player.z + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * size;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.player.heading);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(-7, 8); ctx.lineTo(7, 8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // Waypoint marker.
    if (this.waypoint) {
      const wx = x0 + ((this.waypoint.x + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * size;
      const wy = y0 + ((this.waypoint.z + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * size;
      ctx.fillStyle = '#ffcf3f';
      ctx.beginPath(); ctx.arc(wx, wy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('SELARA BAY — click to set a waypoint, M or Esc to close', W / 2, y0 - 16);
    return true;
  }

  // Convert a click on the HUD canvas to world coordinates, or null when
  // the click missed the map.
  clickToWorld(cx, cy, W, H) {
    const size = Math.min(W, H) - 80;
    const x0 = (W - size) / 2;
    const y0 = (H - size) / 2;
    if (cx < x0 || cx > x0 + size || cy < y0 || cy > y0 + size) return null;
    const x = ((cx - x0) / size) * (WORLD_EXTENT * 2) - WORLD_EXTENT;
    const z = ((cy - y0) / size) * (WORLD_EXTENT * 2) - WORLD_EXTENT;
    return { x, z };
  }

  drawBeam() {
    if (!this.waypoint) return;
    this.renderer.setInstances('beam', this.beamMatrices, this.beamColors, 1);
    this.renderer.drawBatch('beam');
  }
}
