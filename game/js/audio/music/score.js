// Score: the adaptive layer. Cutscenes duck the music and play Lin's
// theme; a 3+ star wanted level switches to the chase track (the radio
// is silenced while it runs); when the heat dies down the music returns
// to whatever was playing before — the radio if Kai is in a car, the
// title theme otherwise.
//
// Stingers are one-shot phrases over the music: mission passed/failed,
// FLATLINED, CUFFED. They are short sequences scheduled on the synth
// directly, ducking the bus for their duration.
import { PURSUIT } from './songs/pursuit.js';
import { LIN_THEME } from './songs/lin-theme.js';

const STINGERS = {
  passed: { notes: [69, 72, 76, 79], inst: 'lead', step: 0.12 },
  failed: { notes: [65, 62, 60, 57], inst: 'lead', step: 0.16 },
  flatlined: { notes: [57, 55, 53, 50], inst: 'lead', step: 0.22 },
  cuffed: { notes: [62, 58, 55, 62], inst: 'lead', step: 0.16 },
};

export class Score {
  constructor(music) {
    this.music = music;
    this.mode = 'explore'; // explore | chase | cutscene
  }

  update({ wanted, inCutscene }) {
    if (inCutscene) {
      if (this.mode !== 'cutscene') {
        this.mode = 'cutscene';
        this.music.playSong(LIN_THEME, { loop: true });
      }
      return;
    }
    if (wanted >= 3) {
      if (this.mode !== 'chase') {
        this.mode = 'chase';
        this.music.playSong(PURSUIT, { loop: true });
      }
      return;
    }
    if (this.mode !== 'explore') {
      this.mode = 'explore';
      this.music.toExplore();
    }
  }

  stinger(kind) {
    const def = STINGERS[kind];
    if (!def || !this.music.ctx) return;
    const { ctx, synth, fx } = this.music;
    const t0 = ctx.currentTime + 0.05;
    synth.out = fx.input; // stingers always play on the direct bus
    fx.setDuck(0.3);
    def.notes.forEach((midi, i) => {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const t = t0 + i * def.step;
      synth[def.inst](t, f, def.step * 1.8, 0.8);
    });
    setTimeout(() => fx.setDuck(1), def.notes.length * def.step * 1000 + 400);
  }
}
