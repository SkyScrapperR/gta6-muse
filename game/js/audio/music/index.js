// MusicSystem: the facade main.js talks to. It owns the fx chain, the
// synth, the sequencer, the radio and the score, and decides what plays:
// the title theme on the title screen and on foot, the radio in a car
// (muffled for 3 s after stepping out, then off), the chase track at
// 3+ stars, Lin's theme in cutscenes, and stingers on mission events.
//
// The system is created lazily (ensure()) because the AudioContext can
// only start after a user gesture — the first click/keypress.
import { MusicFx } from './fx.js';
import { Synth } from './synth.js';
import { Sequencer } from './sequencer.js';
import { Radio } from './radio.js';
import { Score } from './score.js';
import { TITLE_THEME } from './songs/title.js';

export class MusicSystem {
  constructor(sfx) {
    this.sfx = sfx;
    this.ctx = null;
    this.fx = null;
    this.synth = null;
    this.seq = null;
    this.radio = null;
    this.score = null;
    this.mode = 'off'; // off | title | explore
    this.inCar = false;
    this.onRadioChange = null;
    this._radioStopT = 0; // seconds of muffled radio left after exiting
  }

  ensure() {
    if (this.ctx) return;
    this.sfx.ensure();
    if (!this.sfx.ctx) return;
    this.ctx = this.sfx.ctx;
    this.fx = new MusicFx(this.ctx, this.sfx.musicGain);
    this.synth = new Synth(this.ctx, this.fx.input, this.sfx.noiseBuf);
    this.synth.setSends(this.fx.delay, this.fx.reverb);
    this.seq = new Sequencer(this.ctx, this.synth, this.fx);
    this.radio = new Radio(this);
    this.score = new Score(this);
    this.radio.on = false;
  }

  playSong(song, { bus = 'direct', onEnd = null, loop = true } = {}) {
    if (!this.ctx) return;
    this.synth.out = bus === 'radio' ? this.fx.radioInput : this.fx.input;
    this.fx.setTempo(song.bpm);
    this.seq.play(song, { loop, onEnd });
  }

  stopSong() {
    this.seq?.stop();
  }

  playTitle() {
    this.ensure();
    if (!this.ctx) return;
    this.playSong(TITLE_THEME, { loop: true });
    this.mode = 'title';
  }

  // Back to whatever was playing before a chase/cutscene: the radio if
  // Kai is in a car, the title theme otherwise.
  toExplore() {
    if (!this.ctx) return;
    if (this.inCar && this.radio.on) {
      this.radio.playCurrent();
    } else if (this.inCar) {
      this.radio.start();
    } else {
      this.playSong(TITLE_THEME, { loop: true });
    }
    this.mode = 'explore';
  }

  // R switches the radio station while driving — but never while the
  // chase or a cutscene owns the music bus.
  nextStation() {
    if (!this.ctx || !this.radio.on) return;
    if (this.score.mode !== 'explore') return;
    this.radio.nextStation();
  }

  setInCar(inCar) {
    this.inCar = inCar;
    if (!this.ctx) return;
    if (inCar) {
      this.radio.setInCar(true);
      this._radioStopT = 0;
      if (this.score.mode === 'explore' && !this.radio.on) {
        this.radio.start();
      }
    } else {
      this.radio.setInCar(false);
      // The radio keeps playing muffled for 3 s after stepping out,
      // then fades back to the theme.
      if (this.radio.on) this._radioStopT = 3;
    }
  }

  update(dt, state) {
    if (!this.ctx) return;
    if (this._radioStopT > 0) {
      this._radioStopT -= dt;
      if (this._radioStopT <= 0) {
        this.radio.stop();
        this.toExplore();
      }
    }
    this.score.update(state);
  }

  stinger(kind) {
    this.score?.stinger(kind);
  }
}
