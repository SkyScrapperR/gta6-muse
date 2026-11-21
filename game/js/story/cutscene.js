// Cutscenes: letterbox bars, subtitles, portrait cards and cinematic
// cameras. A cutscene is a list of dialogue lines; each line picks a
// camera shot (two-shot, close-up, wide) framed on the two characters
// the mission provides. Click or any key advances the line.
import { SPEAKERS } from './dialogue.js';

const LINE_TIME = 3.2;

export class CutscenePlayer {
  constructor(collision = null) {
    this.collision = collision; // for line-of-sight camera placement
    this.lines = [];
    this.cast = {}; // {a, b} characters in the world
    this.index = 0;
    this.lineT = 0;
    this.playing = false;
    this.onDone = null;
    this.camera = null;
  }

  play(lines, cast, onDone) {
    this.lines = lines;
    this.cast = cast;
    this.index = 0;
    this.lineT = 0;
    this.playing = true;
    this.onDone = onDone;
    // Face the cast toward each other: a close-up only works when the
    // speaker's face is toward the listener (and the camera beside them).
    if (cast.a && cast.b) {
      cast.a.heading = Math.atan2(cast.b.x - cast.a.x, cast.b.z - cast.a.z);
      cast.b.heading = Math.atan2(cast.a.x - cast.b.x, cast.a.z - cast.b.z);
    }
    this.updateCamera();
  }

  stop() {
    this.playing = false;
    this.lines = [];
    // The cast stops talking the moment the scene ends.
    if (this.cast.a) this.cast.a.pose = 'idle';
    if (this.cast.b) this.cast.b.pose = 'idle';
    if (this.onDone) {
      const cb = this.onDone;
      this.onDone = null;
      cb();
    }
  }

  advance() {
    this.index++;
    this.lineT = 0;
    if (this.index >= this.lines.length) this.stop();
    else this.updateCamera();
  }

  update(dt, input) {
    if (!this.playing) return;
    this.lineT += dt;
    if (input.pressedLeft() || input.pressed('Space') || input.pressed('Enter')) {
      this.advance();
      return;
    }
    if (this.lineT >= LINE_TIME) this.advance();
  }

  currentLine() {
    return this.lines[this.index] ?? null;
  }

  // The character speaking the current line (null for narration).
  get speaker() {
    const line = this.currentLine();
    if (!line || !this.cast.a) return null;
    if (line.s === 'kai') return this.cast.a;
    if (line.s === 'narrator') return this.cast.a;
    return this.cast.b ?? this.cast.a;
  }

  // Camera for the current line, framed on the cast.
  updateCamera() {
    const line = this.currentLine();
    const a = this.cast.a;
    const b = this.cast.b;
    if (!line || !a) {
      this.camera = null;
      return;
    }
    const sp = SPEAKERS[line.s] ?? SPEAKERS.narrator;
    const subject = line.s === 'kai' ? a : (b ?? a);
    const other = subject === a ? b : a;
    const shot = !other || line.s === 'narrator' ? 'wide' : (line.s === 'kai' ? 'close-a' : 'close-b');
    // Talk pose (Tier 2): the speaker gestures, the listener stands
    // still. The narrator line leaves both idle.
    const talking = line.s === 'kai' ? a : line.s === 'narrator' ? null : b;
    if (a) a.pose = talking === a ? 'talk' : 'idle';
    if (b) b.pose = talking === b ? 'talk' : 'idle';
    let pos, altPos, target, fov;
    // Narrator lines frame Kai alone, wherever he is; the two-shot is for
    // dialogue between two characters standing together.
    if (shot === 'wide' && other && line.s !== 'narrator') {
      const mx = (subject.x + other.x) / 2, mz = (subject.z + other.z) / 2;
      const dx = other.x - subject.x, dz = other.z - subject.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len, pz = dx / len;
      target = [mx, 1.4, mz];
      pos = [mx + px * 7, 3.2, mz + pz * 7];
      altPos = [mx - px * 7, 3.2, mz - pz * 7];
      fov = 55;
    } else if (shot === 'close-a' || shot === 'close-b') {
      // Side close-up: the camera sits to the side of the speaker, a touch
      // in front, so the face is in 3/4 profile and the background is the
      // street and sky, never a building wall. The listener stands beside.
      const c = subject;
      const o = other ?? { x: c.x + 2, z: c.z };
      const dx = o.x - c.x, dz = o.z - c.z;
      const len = Math.hypot(dx, dz) || 1;
      const fx = dx / len, fz = dz / len;
      const px = -fz, pz = fx;
      target = [c.x, 1.45, c.z];
      pos = [c.x + px * 3.5 + fx * 0.5, 1.7, c.z + pz * 3.5 + fz * 0.5];
      altPos = [c.x - px * 3.5 + fx * 0.5, 1.7, c.z - pz * 3.5 + fz * 0.5];
      // Rule of thirds (Tier 2): shift the aim point sideways so the
      // speaker's face sits on a third-line instead of dead centre.
      // Kai and the other speaker take opposite thirds across the cut.
      const fwdx = target[0] - pos[0], fwdz = target[2] - pos[2];
      const fl = Math.hypot(fwdx, fwdz) || 1;
      const rx = -fwdz / fl, rz = fwdx / fl;
      const third = shot === 'close-a' ? 0.7 : -0.7;
      target = [target[0] + rx * third, target[1], target[2] + rz * third];
      fov = 50;
    } else {
      // Wide on a single character (narrator): low and close, the
      // character framed against the world behind them — from the west,
      // so the sunrise/sunset sky is behind them.
      target = [a.x, 1.5, a.z];
      pos = [a.x - 5, 2.6, a.z + 3];
      altPos = [a.x + 5, 2.6, a.z - 3];
      fov = 60;
    }
    const placed = this.placeCamera(pos, altPos, target);
    this.camera = {
      pos: placed, target,
      fov: (fov * Math.PI) / 180, near: 0.3, far: 3000,
    };
    void sp;
  }

  // Pick a camera spot with a clear line of sight to the target: try the
  // preferred spot, then the mirrored one, then pull in toward the target
  // until the view clears (never inside a building).
  placeCamera(pos, altPos, target) {
    const clear = (p) => !this.collision
      || this.collision.hasLineOfSight(p[0], p[2], target[0], target[2]);
    if (clear(pos)) return pos;
    if (altPos && clear(altPos)) return altPos;
    const dx = pos[0] - target[0], dz = pos[2] - target[2];
    const dist = Math.hypot(dx, dz) || 1;
    for (let d = dist - 1; d >= 2.5; d -= 1) {
      const p = [target[0] + (dx / dist) * d, pos[1], target[2] + (dz / dist) * d];
      if (clear(p)) return p;
    }
    return [target[0] + (dx / dist) * 2.5, pos[1], target[2] + (dz / dist) * 2.5];
  }

  // Draw letterbox, subtitle and portrait card on the 2D canvas.
  draw(ctx, W, H) {
    if (!this.playing) return;
    const barH = Math.round(H * 0.11);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, barH);
    ctx.fillRect(0, H - barH, W, barH);
    const line = this.currentLine();
    if (!line) return;
    const sp = SPEAKERS[line.s] ?? SPEAKERS.narrator;
    // Portrait card, bottom-left for Kai, bottom-right for anyone else.
    // The narrator has no face to show.
    const showPortrait = line.s !== 'narrator';
    const left = line.s === 'kai';
    const cw = 150, ch = 170;
    const cx = left ? 28 : W - cw - 28;
    const cy = H - barH - ch - 16;
    if (showPortrait) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cx, cy, cw, ch, 10);
    ctx.clip();
    const g = ctx.createLinearGradient(cx, cy, cx, cy + ch);
    g.addColorStop(0, sp.jacket);
    g.addColorStop(1, '#14161f');
    ctx.fillStyle = g;
    ctx.fillRect(cx, cy, cw, ch);
    // Head.
    ctx.fillStyle = sp.skin;
    ctx.beginPath(); ctx.arc(cx + cw / 2, cy + 68, 34, 0, Math.PI * 2); ctx.fill();
    // Hair.
    ctx.fillStyle = sp.hair;
    if (sp.hairStyle === 'bun') {
      ctx.beginPath(); ctx.arc(cx + cw / 2, cy + 40, 26, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + cw / 2, cy + 22, 12, 0, Math.PI * 2); ctx.fill();
    } else if (sp.hairStyle === 'curly') {
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.arc(cx + cw / 2 + i * 13, cy + 42 - Math.abs(i) * 4, 11, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.beginPath(); ctx.arc(cx + cw / 2, cy + 42, 26, Math.PI, 0); ctx.fill();
    }
    // Eyes.
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx + cw / 2 - 12, cy + 66, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + cw / 2 + 12, cy + 66, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 10); ctx.stroke();
    // Name.
    ctx.textAlign = left ? 'left' : 'right';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(sp.name, left ? cx : cx + cw, cy + ch + 4);
    }
    // Subtitle, centred above the bottom bar.
    ctx.textAlign = 'center';
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;
    const words = line.t.split(' ');
    const lines = [''];
    for (const word of words) {
      if ((lines[lines.length - 1] + ' ' + word).trim().length > 64) lines.push(word);
      else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + word).trim();
    }
    lines.forEach((l, i) => {
      ctx.fillText(l, W / 2, H - barH + 34 + i * 26);
    });
    ctx.shadowBlur = 0;
  }
}
