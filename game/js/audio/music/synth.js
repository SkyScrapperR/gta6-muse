// Synth: every instrument is raw Web Audio — no audio files, no samples.
// Subtractive bass/lead, FM electric piano and bells, Karplus-Strong
// plucked strings, supersaw pads, and a drum kit from noise + sine.
//
// All instruments take an absolute AudioContext time `t` (the sequencer
// schedules ahead), so the music stays in time even when the frame rate
// does not.
export class Synth {
  constructor(ctx, out, noiseBuf) {
    this.ctx = ctx;
    this.out = out; // bus: fx.input (direct) or fx.radioInput (radio)
    this.noiseBuf = noiseBuf;
    this.delaySend = null;
    this.reverbSend = null;
  }

  setSends(delay, reverb) {
    this.delaySend = delay;
    this.reverbSend = reverb;
  }

  // Route a node to the dry bus plus the two sends (space).
  _route(node, sendAmount = 0) {
    node.connect(this.out);
    if (sendAmount > 0 && this.delaySend && this.reverbSend) {
      const d = this.ctx.createGain();
      d.gain.value = sendAmount;
      node.connect(d);
      d.connect(this.delaySend);
      const r = this.ctx.createGain();
      r.gain.value = sendAmount;
      node.connect(r);
      r.connect(this.reverbSend);
    }
  }

  _noiseSrc(t) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start(t);
    return src;
  }

  kick(t, vel = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
  }

  snare(t, vel = 1) {
    const ctx = this.ctx;
    const src = this._noiseSrc(t);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.stop(t + 0.2);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 190;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.25 * vel, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og);
    og.connect(this.out);
    o.start(t);
    o.stop(t + 0.12);
  }

  hat(t, vel = 1, open = false) {
    const ctx = this.ctx;
    const src = this._noiseSrc(t);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 8000;
    const g = ctx.createGain();
    const dur = open ? 0.28 : 0.05;
    g.gain.setValueAtTime(0.22 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.stop(t + dur + 0.02);
  }

  clap(t, vel = 1) {
    const ctx = this.ctx;
    const src = this._noiseSrc(t);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1200;
    f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.stop(t + 0.17);
  }

  bass(t, freq, dur, vel = 0.9) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = freq;
    o2.detune.value = 8;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(300, t + dur);
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.01);
    g.gain.setValueAtTime(0.5 * vel, t + Math.max(0.01, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
    o2.start(t);
    o2.stop(t + dur + 0.02);
  }

  // Karplus-Strong plucked string: a noise burst into a feedback delay
  // tuned to the note, damped by a lowpass in the loop.
  pluck(t, freq, dur, vel = 0.7) {
    const ctx = this.ctx;
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 1 / freq;
    const fb = ctx.createGain();
    fb.gain.setValueAtTime(0.96, t);
    fb.gain.setTargetAtTime(0, t + dur * 0.7, 0.05);
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3500;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.5 * vel, t);
    out.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const exc = this._noiseSrc(t);
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(1, t);
    eg.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    exc.connect(eg);
    eg.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    delay.connect(out);
    this._route(out, 0.2);
    exc.stop(t + 0.05);
  }

  // FM electric piano: a sine carrier with a 2x modulator whose index
  // decays, giving the bell-like attack and mellow body.
  epiano(t, freq, dur, vel = 0.6) {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * 2.01;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(freq * 1.8, t);
    mg.gain.exponentialRampToValueAtTime(freq * 0.2, t + dur);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4 * vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    car.connect(g);
    this._route(g, 0.25);
    car.start(t);
    car.stop(t + dur + 0.02);
    mod.start(t);
    mod.stop(t + dur + 0.02);
  }

  // Supersaw pad: two detuned saws through a lowpass, slow attack.
  pad(t, freq, dur, vel = 0.4) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.3);
    g.gain.setValueAtTime(0.22 * vel, t + Math.max(0.3, dur - 0.4));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    f.connect(g);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
    this._route(g, 0.3);
  }

  // Square lead through a filter that closes over the note.
  lead(t, freq, dur, vel = 0.5) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(500, t + dur);
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f);
    f.connect(g);
    this._route(g, 0.3);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // FM bell: a bright inharmonic attack that rings down (gamelan-ish).
  bell(t, freq, dur, vel = 0.6) {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * 3.01;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(freq * 2.4, t);
    mg.gain.exponentialRampToValueAtTime(1, t + dur);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    car.connect(g);
    this._route(g, 0.35);
    car.start(t);
    car.stop(t + dur + 0.02);
    mod.start(t);
    mod.stop(t + dur + 0.02);
  }

  // Gong: inharmonic partials with a long slow decay.
  gong(t, freq, dur, vel = 0.7) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4 * vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    for (const [ratio, amp] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
    this._route(g, 0.4);
  }
}
