// SFX: every sound is synthesized with Web Audio — no audio files.
// Gunshots, reloads, punches, explosions, pickup chimes, UI clicks, the
// mission sting, the car horn, crashes, footsteps, a two-tone police
// siren and an engine whose pitch follows the car's speed. Positional
// sounds use PannerNodes; the listener follows the camera.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.noiseBuf = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenPan = null;
    this.sirenLfo = null;
    this.volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
    this.lastStepAt = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volumes.master;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.volumes.sfx;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.volumes.music;
    this.musicGain.connect(this.master);
    // White noise, shared by every noise-based sound.
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setVolume(kind, v) {
    this.volumes[kind] = v;
    if (!this.ctx) return;
    if (kind === 'master') this.master.gain.value = v;
    if (kind === 'sfx') this.sfxGain.gain.value = v;
    if (kind === 'music') this.musicGain.gain.value = v;
  }

  // A short oscillator blip with an exponential decay.
  blip(freq, dur, type = 'sine', gain = 0.2, slideTo = null, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Filtered noise burst.
  noise(dur, filterFreq, gain = 0.3, type = 'lowpass', when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // Positional wrapper: a blip that comes from a world position.
  blipAt(x, y, z, freq, dur, type = 'sine', gain = 0.2, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const pan = this.ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = 8;
    pan.maxDistance = 120;
    pan.positionX.value = x;
    pan.positionY.value = y;
    pan.positionZ.value = z;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(pan);
    pan.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot() {
    this.noise(0.12, 1800, 0.5, 'bandpass');
    this.blip(160, 0.1, 'square', 0.25, 60);
  }

  reload() {
    this.noise(0.05, 3000, 0.15, 'highpass');
    this.noise(0.05, 3000, 0.15, 'highpass', 0.18);
  }

  punch() {
    this.noise(0.09, 500, 0.4, 'lowpass');
  }

  explosion() {
    this.noise(1.1, 300, 0.7, 'lowpass');
    this.blip(90, 0.8, 'sine', 0.5, 30);
  }

  pickup() {
    this.blip(880, 0.09, 'sine', 0.18);
    this.blip(1318, 0.14, 'sine', 0.18, null, 0.08);
  }

  click() {
    this.blip(1200, 0.04, 'sine', 0.12);
  }

  sting() {
    // Mission sting: a short three-note brass-ish figure.
    this.blip(220, 0.35, 'sawtooth', 0.12);
    this.blip(277, 0.35, 'sawtooth', 0.12, null, 0.12);
    this.blip(330, 0.5, 'sawtooth', 0.14, null, 0.24);
  }

  horn() {
    this.blip(370, 0.4, 'sawtooth', 0.12);
    this.blip(466, 0.4, 'sawtooth', 0.1);
  }

  crash() {
    this.noise(0.3, 400, 0.5, 'lowpass');
    this.blip(70, 0.25, 'sine', 0.4, 40);
  }

  footstep() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStepAt < 0.28) return;
    this.lastStepAt = now;
    this.noise(0.06, 300, 0.1, 'lowpass');
  }

  // --- Loops: engine and siren. ---
  engineStart() {
    if (!this.ctx || this.engineOsc) return;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 55;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    o.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    o.start();
    this.engineOsc = o;
    this.engineFilter = f;
    this.engineGain = g;
  }

  engineSet(speed, throttle) {
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    const rpm = 50 + Math.abs(speed) * 5 + throttle * 25;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + Math.abs(speed) * 30, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.05 + Math.min(Math.abs(speed) / 44, 1) * 0.06, t, 0.1);
  }

  engineStop() {
    if (!this.engineOsc) return;
    const o = this.engineOsc;
    const g = this.engineGain;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => { try { o.stop(); } catch { /* already stopped */ } }, 300);
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
  }

  sirenStart() {
    if (!this.ctx || this.sirenOsc) return;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 800;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.7;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 150;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    const pan = this.ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = 10;
    pan.maxDistance = 200;
    o.connect(g);
    g.connect(pan);
    pan.connect(this.sfxGain);
    o.start();
    lfo.start();
    this.sirenOsc = o;
    this.sirenLfo = lfo;
    this.sirenGain = g;
    this.sirenPan = pan;
  }

  sirenSet(x, y, z, volume) {
    if (!this.sirenOsc) return;
    this.sirenPan.positionX.value = x;
    this.sirenPan.positionY.value = y;
    this.sirenPan.positionZ.value = z;
    this.sirenGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.2);
  }

  sirenStop() {
    if (!this.sirenOsc) return;
    const o = this.sirenOsc, l = this.sirenLfo;
    this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    setTimeout(() => {
      try { o.stop(); l.stop(); } catch { /* already stopped */ }
    }, 300);
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenGain = null;
    this.sirenPan = null;
  }

  // Listener follows the camera; loops follow the world.
  update(camera, player, copCars) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const [ex, ey, ez] = camera.pos;
    const dx = camera.target[0] - ex;
    const dy = camera.target[1] - ey;
    const dz = camera.target[2] - ez;
    const len = Math.hypot(dx, dy, dz) || 1;
    if (l.positionX) {
      l.positionX.value = ex;
      l.positionY.value = ey;
      l.positionZ.value = ez;
      l.forwardX.value = dx / len;
      l.forwardY.value = dy / len;
      l.forwardZ.value = dz / len;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
    // Engine loop.
    if (player.inCar) {
      this.engineStart();
      this.engineSet(player.inCar.speed, 0.5);
    } else {
      this.engineStop();
    }
    // Siren: nearest cop car, if any.
    let nearest = null;
    let nearestD = 1e9;
    for (const c of copCars) {
      const d = Math.hypot(c.v.x - player.x, c.v.z - player.z);
      if (d < nearestD) { nearestD = d; nearest = c.v; }
    }
    if (nearest && nearestD < 120) {
      this.sirenStart();
      this.sirenSet(nearest.x, 1, nearest.z, Math.max(0, 0.16 * (1 - nearestD / 120)));
    } else {
      this.sirenStop();
    }
    // Footsteps while Kai walks or runs.
    if (!player.inCar && !player.dead && player.speed > 2.5) this.footstep();
  }
}
