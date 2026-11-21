// Music mix chain: input bus -> compressor -> the sfx music gain.
// Sends: a tempo-synced dotted-eighth delay and a generated-impulse
// convolver reverb. The radio bus passes through a lowpass so it can go
// muffled (car-radio EQ) when Kai steps out of the car.
export class MusicFx {
  constructor(ctx, musicGain) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.input.gain.value = 1;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;
    this.input.connect(this.comp);
    this.comp.connect(musicGain);
    // Tempo-synced delay (dotted eighth).
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.375;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    this.delay.connect(fb);
    fb.connect(this.delay);
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    this.delay.connect(wet);
    wet.connect(this.comp);
    // Generated-impulse reverb (1.8 s, decaying noise).
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.8, 2.5);
    const rw = ctx.createGain();
    rw.gain.value = 0.35;
    this.reverb.connect(rw);
    rw.connect(this.comp);
    // Radio bus: lowpass for the muffled on-foot sound + its own gain.
    this.radioInput = ctx.createGain();
    this.radioFilter = ctx.createBiquadFilter();
    this.radioFilter.type = 'lowpass';
    this.radioFilter.frequency.value = 18000;
    this.radioGain = ctx.createGain();
    this.radioGain.gain.value = 1;
    this.radioInput.connect(this.radioFilter);
    this.radioFilter.connect(this.radioGain);
    this.radioGain.connect(this.input);
  }

  _impulse(dur, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  setTempo(bpm) {
    this.delay.delayTime.setTargetAtTime((60 / bpm) * 0.75, this.ctx.currentTime, 0.05);
  }

  // Car-radio EQ: muffled (700 Hz, quiet) on foot, full in the car.
  setRadioMuffled(muffled) {
    const t = this.ctx.currentTime;
    this.radioFilter.frequency.setTargetAtTime(muffled ? 700 : 18000, t, 0.3);
    this.radioGain.gain.setTargetAtTime(muffled ? 0.35 : 1, t, 0.3);
  }

  // Duck the whole music bus (cutscenes, stingers).
  setDuck(v) {
    this.input.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }
}
