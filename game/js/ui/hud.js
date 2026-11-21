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
    this.weather = 'clear'; // 'clear' | 'rain', from the RainSystem
    this.radioText = null; // current radio station + song, with expiry
    this.radioUntil = 0;
    this.hitMarkerT = -99; // last hit, for the crosshair X (Tier 3)
    this.shop = null; // SideContent shop, drawn when the game is in 'shop' state
    this.stats = null; // Stats object, set by main.js
    this.showStats = false; // Tab toggles the stats screen
    this.interactPrompt = ''; // 'press E' hint near tags/shops (Tier 3)
  }

  setBanner(text, sub, seconds = 3) {
    this.banner = { text, sub, until: this.time + seconds };
  }

  // Radio pop-up (Tier 2): station + song, bottom centre, fades after
  // a few seconds. Called by the music system on station/song change.
  showRadio(text, seconds = 4) {
    this.radioText = text;
    this.radioUntil = this.time + seconds;
  }

  // Hit marker (Tier 3): a white X over the crosshair for a blink.
  showHitMarker() {
    this.hitMarkerT = this.time;
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
    // The weather rides on the district line while it rains.
    ctx.fillText((this.district ?? '') + (this.weather === 'rain' ? ' — Rain' : ''), 16, 52);
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
      // Hit marker (Tier 3): a white X over the crosshair, fading fast.
      const sinceHit = this.time - this.hitMarkerT;
      if (sinceHit < 0.25) {
        const a = 1 - sinceHit / 0.25;
        const m = gap + 4;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - m - 5, cy - m - 5); ctx.lineTo(cx - m + 3, cy - m + 3);
        ctx.moveTo(cx + m - 3, cy - m - 5); ctx.lineTo(cx + m + 5, cy - m + 3);
        ctx.moveTo(cx - m - 5, cy + m + 5); ctx.lineTo(cx - m + 3, cy + m - 3);
        ctx.moveTo(cx + m - 3, cy + m + 5); ctx.lineTo(cx + m + 5, cy + m - 3);
        ctx.stroke();
      }
    }

    // Radio pop-up (Tier 2): station + song, bottom centre.
    if (this.radioText && this.time < this.radioUntil) {
      const a = Math.min(1, (this.radioUntil - this.time) / 0.5);
      ctx.textAlign = 'center';
      ctx.font = '15px sans-serif';
      const tw = ctx.measureText(this.radioText).width;
      ctx.fillStyle = `rgba(0,0,0,${0.55 * a})`;
      ctx.fillRect(W / 2 - tw / 2 - 14, H - 128, tw + 28, 28);
      ctx.fillStyle = `rgba(255,255,255,${0.95 * a})`;
      ctx.fillText(this.radioText, W / 2, H - 108);
    }

    // Interact prompt (Tier 3): 'press E' near a tag or a shop.
    if (this.interactPrompt) {
      ctx.textAlign = 'center';
      ctx.font = '15px sans-serif';
      const tw = ctx.measureText(this.interactPrompt).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(W / 2 - tw / 2 - 14, H - 96, tw + 28, 28);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(this.interactPrompt, W / 2, H - 76);
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

    // Shop panel (Tier 3) and stats screen (Tier 3) draw last, over
    // everything else — the game is frozen while the shop is open.
    if (this.shop) this.drawShop(ctx, W, H);
    if (this.showStats && this.stats) this.drawStats(ctx, W, H);
  }

  // Shop list: number keys buy, Esc closes. Disabled items show why.
  drawShop(ctx, W, H) {
    const shop = this.shop;
    const pw = 460, ph = 90 + shop.items.length * 30;
    const x0 = (W - pw) / 2, y0 = (H - ph) / 2;
    ctx.fillStyle = 'rgba(8,10,16,0.92)';
    ctx.fillRect(x0, y0, pw, ph);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, pw, ph);
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(shop.title, x0 + 20, y0 + 34);
    ctx.font = '15px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`Cash: $${Math.floor(this.player.money)}`, x0 + 20, y0 + 58);
    shop.items.forEach((it, i) => {
      const y = y0 + 88 + i * 30;
      const afford = this.player.money >= it.price;
      ctx.font = '16px sans-serif';
      ctx.fillStyle = it.disabled ? 'rgba(255,255,255,0.35)'
        : !afford ? 'rgba(255,122,92,0.9)' : 'rgba(255,255,255,0.95)';
      ctx.fillText(`${it.key}. ${it.label}${it.disabled ? ` — ${it.disabledReason}` : ''}`, x0 + 20, y);
      ctx.textAlign = 'right';
      ctx.fillText(`$${it.price}`, x0 + pw - 20, y);
      ctx.textAlign = 'left';
    });
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Press a number to buy — Esc to leave', x0 + 20, y0 + ph - 14);
  }

  // Stats screen (Tier 3): Tab toggles, the game keeps running behind it.
  drawStats(ctx, W, H) {
    const s = this.stats;
    const rows = [
      ['Money earned', `$${Math.floor(s.moneyEarned).toLocaleString('en-US')}`],
      ['Missions completed', `${s.missionsCompleted} / 6`],
      ['Kills', String(s.kills)],
      ['Accuracy', `${s.accuracy}% (${s.shotsHit}/${s.shotsFired} hits)`],
      ['Deaths', String(s.deaths)],
      ['Arrests', String(s.arrests)],
      ['Helicopters shot down', String(s.heliDowns)],
      ['Orchid tags', `${s.tagsFound} / 12`],
      ['Cars resprayed', String(s.carsResprayed)],
      ['Spent in shops', `$${Math.floor(s.shopSpent).toLocaleString('en-US')}`],
      ['Distance driven', `${(s.distanceDriven / 1000).toFixed(1)} km`],
      ['Time played', s.playTime],
    ];
    const pw = 480, ph = 70 + rows.length * 28;
    const x0 = (W - pw) / 2, y0 = (H - ph) / 2;
    ctx.fillStyle = 'rgba(8,10,16,0.92)';
    ctx.fillRect(x0, y0, pw, ph);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, pw, ph);
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('KAI SANTOSO — STATS', x0 + 20, y0 + 34);
    ctx.font = '16px sans-serif';
    rows.forEach(([label, value], i) => {
      const y = y0 + 64 + i * 28;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(label, x0 + 20, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(value, x0 + pw - 20, y);
      ctx.textAlign = 'left';
    });
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Tab to close', x0 + 20, y0 + ph - 14);
  }
}
