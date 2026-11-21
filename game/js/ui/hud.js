// HUD: everything drawn on the 2D overlay canvas — clock, money, wanted
// stars, weapon and ammo, crosshair with bloom, objective line, damage
// flash, banners, and the minimap. Menus are DOM (menus.js), not canvas.
import { WEAPONS } from '../combat/weapons.js';

export class HUD {
  constructor(canvas, player, police, minimap, notifications) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.player = player;
    this.police = police;
    this.minimap = minimap;
    this.notifications = notifications;
    this.hour = 17.6;
    this.objective = '';
    this.objectiveSub = '';
    this.progress = null; // {frac, label} for timed objectives
    this.banner = null; // {text, sub, until}
    this.lastDamageAt = -99;
    this.lastDamageHp = 100;
    this.time = 0;
  }

  setBanner(text, sub, seconds = 3) {
    this.banner = { text, sub, until: this.time + seconds };
  }

  formatClock(hour) {
    const h = Math.floor(hour) % 24;
    const m = Math.floor((hour % 1) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  draw(dt) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const p = this.player;
    this.time += dt;
    ctx.clearRect(0, 0, W, H);

    // Damage flash: a red vignette that fades after taking a hit.
    if (p.health < this.lastDamageHp) this.lastDamageAt = this.time;
    this.lastDamageHp = p.health;
    const sinceHit = this.time - this.lastDamageAt;
    if (sinceHit < 0.6) {
      const a = (1 - sinceHit / 0.6) * 0.35;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,0,0,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // Low health: a slow pulse.
    if (p.health > 0 && p.health <= 25) {
      const a = 0.12 + Math.sin(this.time * 4) * 0.08;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,0,0,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Top-left: clock and district.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(this.formatClock(this.hour), 16, 30);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(this.district ?? '', 16, 52);
    // FPS counter, toggled with F3 (prompt section 2).
    if (this.showFps) {
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(`FPS ${this.fps ?? 0} · ${this.quality ?? ''}`, 16, 74);
    }

    // Top-right: money and wanted stars.
    ctx.textAlign = 'right';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#5dff8f';
    ctx.fillText('$' + Math.floor(p.money).toLocaleString('en-US'), W - 16, 30);
    const wanted = this.police.wanted;
    const flash = wanted > 0 && Math.floor(this.time * 2.5) % 2 === 0;
    ctx.font = 'bold 22px sans-serif';
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < wanted ? '★' : '☆';
    ctx.fillStyle = flash ? '#ff4040' : '#ffd23f';
    ctx.fillText(stars, W - 16, 58);

    // Objective, top centre.
    if (this.objective) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(this.objective, W / 2, 30);
      if (this.objectiveSub) {
        ctx.font = '14px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(this.objectiveSub, W / 2, 52);
      }
    }

    // Progress bar (timed objectives, e.g. Dex in the bank).
    if (this.progress) {
      const bw = 260, bh = 10;
      const bx = W / 2 - bw / 2, by = 62;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#4dd0ff';
      ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, this.progress.frac)), bh);
      if (this.progress.label) {
        ctx.textAlign = 'center';
        ctx.font = '13px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(this.progress.label, W / 2, by + 28);
      }
    }

    // Notifications, below the objective.
    const notes = this.notifications.visible();
    ctx.textAlign = 'center';
    notes.forEach((n, i) => {
      const y = 84 + i * 26;
      ctx.font = '15px sans-serif';
      const colors = { info: '#dfe8ff', mission: '#ffd23f', success: '#5dff8f', warning: '#ff7a5c' };
      ctx.fillStyle = colors[n.kind] ?? '#fff';
      ctx.fillText(n.text, W / 2, y);
    });

    // Crosshair: centre dot, gap grows with bloom. Only when a gun is out,
    // and never during a cutscene.
    if (p.weapon !== 'fists' && !p.inCar && !p.dead && !this.inCutscene) {
      const cx = W / 2, cy = H / 2;
      const gap = 6 + p.bloom * 14 + (p.aiming ? -2 : 4);
      const len = 8;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
      ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
      ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
      ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }

    // Bottom-right: minimap with health/armor arcs.
    this.minimap.draw(ctx, W - 116, H - 116);

    // Bottom-left: weapon and ammo.
    ctx.textAlign = 'left';
    const w = WEAPONS[p.weapon];
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    let ammoText = w.name;
    if (p.weapon !== 'fists') {
      ammoText += `  ${p.mag[p.weapon]} / ${p.ammo[p.weapon] ?? 0}`;
      if (p.reloadT > 0) ammoText += '  — reloading…';
    }
    ctx.fillText(ammoText, 16, H - 44);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const hpText = `HP ${Math.ceil(p.health)}${p.armor > 0 ? `  •  Armor ${Math.ceil(p.armor)}` : ''}`;
    ctx.fillText(hpText, 16, H - 20);

    // Speed, bottom centre when driving.
    if (p.inCar) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(`${Math.round(Math.abs(p.inCar.speed) * 3.6)} km/h`, W / 2, H - 24);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(p.inCar.name, W / 2, H - 48);
    }

    // Centre banner (FLATLINED / CUFFED / mission title cards).
    if (this.banner && this.time < this.banner.until) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 12;
      ctx.fillText(this.banner.text, W / 2, H / 2 - 10);
      if (this.banner.sub) {
        ctx.font = '18px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(this.banner.sub, W / 2, H / 2 + 22);
      }
      ctx.shadowBlur = 0;
    }
  }
}
