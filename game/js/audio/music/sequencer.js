// Sequencer: a lookahead scheduler. A 25 ms timer looks 0.15 s ahead
// and fires every note whose time has come, so the music stays in time
// even when the frame rate does not.
//
// Song data format (see songs/):
//   { id, title, bpm, bars, swing?, tracks: [...] }
//   track: { inst, pattern }            — drums, one 16-char string per
//           bar ('x' hit, '.' rest, 'o' open hat, 'g' ghost) — a single
//           string repeats for every bar
//          { inst, notes }              — melodic, midi numbers or 0,
//           one 16-slot array per bar (a single array repeats)
//          { inst, chords, len? }       — one chord (midi array) per bar,
//           played on step 0 of each bar
//   inst: kick | snare | hat | clap | bass | pluck | epiano | pad |
//         lead | bell | gong
export class Sequencer {
  constructor(ctx, synth, fx) {
    this.ctx = ctx;
    this.synth = synth;
    this.fx = fx;
    this.song = null;
    this.bpm = 100;
    this.step = 0;
    this.nextTime = 0;
    this.playing = false;
    this.timer = null;
    this.loop = true;
    this.onEnd = null;
    this.muted = new Set(); // track instruments muted (chase layers)
  }

  play(song, { loop = true, onEnd = null } = {}) {
    this.stop();
    this.song = song;
    this.bpm = song.bpm;
    this.loop = loop;
    this.onEnd = onEnd;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.playing = true;
    this.timer = setInterval(() => this._tick(), 25);
  }

  stop() {
    this.playing = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setMuted(inst, muted) {
    if (muted) this.muted.add(inst);
    else this.muted.delete(inst);
  }

  _tick() {
    if (!this.playing || !this.song) return;
    const stepDur = 60 / this.bpm / 4;
    const swing = this.song.swing ?? 0;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const s16 = this.step % 16;
      // Swing: odd 16ths land late (lo-fi feel).
      const t = this.nextTime + (s16 % 2 === 1 ? swing * stepDur : 0);
      this._scheduleStep(this.step, t);
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= this.song.bars * 16) {
        if (this.loop) {
          this.step = 0;
        } else {
          this.stop();
          if (this.onEnd) this.onEnd();
          return;
        }
      }
    }
  }

  _scheduleStep(step, t) {
    const song = this.song;
    const bar = Math.floor(step / 16) % song.bars;
    const s16 = step % 16;
    const stepDur = 60 / this.bpm / 4;
    for (const tr of song.tracks) {
      if (this.muted.has(tr.inst)) continue;
      if (tr.pattern) {
        const pat = Array.isArray(tr.pattern) ? (tr.pattern[bar] ?? tr.pattern[0]) : tr.pattern;
        const ch = pat[s16];
        if (!ch || ch === '.') continue;
        this._drum(tr.inst, ch, t);
      } else if (tr.notes) {
        const barNotes = Array.isArray(tr.notes[0]) ? (tr.notes[bar] ?? tr.notes[0]) : tr.notes;
        const note = barNotes[s16];
        if (!note) continue;
        this._note(tr.inst, note, t, (tr.len ?? 2) * stepDur);
      } else if (tr.chords) {
        if (s16 === 0) {
          const chord = tr.chords[bar] ?? tr.chords[0];
          if (!chord) continue;
          const dur = 16 * stepDur;
          for (const midi of chord) this._note(tr.inst, midi, t, dur);
        }
      }
    }
  }

  _drum(inst, ch, t) {
    const v = ch === 'g' ? 0.4 : 1;
    if (inst === 'kick') this.synth.kick(t, v);
    else if (inst === 'snare') this.synth.snare(t, v);
    else if (inst === 'hat') this.synth.hat(t, v, ch === 'o');
    else if (inst === 'clap') this.synth.clap(t, v);
  }

  _note(inst, midi, t, dur) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    if (inst === 'bass') this.synth.bass(t, f, dur, 0.9);
    else if (inst === 'pluck') this.synth.pluck(t, f, dur, 0.7);
    else if (inst === 'epiano') this.synth.epiano(t, f, dur, 0.6);
    else if (inst === 'pad') this.synth.pad(t, f, dur, 0.4);
    else if (inst === 'lead') this.synth.lead(t, f, dur, 0.5);
    else if (inst === 'bell') this.synth.bell(t, f, dur, 0.6);
    else if (inst === 'gong') this.synth.gong(t, f, dur, 0.7);
  }
}
