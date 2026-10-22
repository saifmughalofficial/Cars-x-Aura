// All audio is synthesised live with the Web Audio API: per-class engine sound driven by RPM and
// throttle, turbo whistle, tyre squeal, wind, ambience, impacts, UI / race cues and a procedural
// synthwave soundtrack. No recordings are used. The context starts on the first user gesture
// (browser autoplay rules) and everything respects the volume settings.

const PROFILES = {
  v8: { base: 26, top: 225, sub: 0.65, harm: 0.28, ratio: 1.5, cut: [280, 3000], drive: 3.2, lope: 0.3, turbo: 0.15 },
  v6tt: { base: 34, top: 255, sub: 0.45, harm: 0.32, ratio: 2, cut: [380, 3400], drive: 2.6, lope: 0.1, turbo: 0.7 },
  i6: { base: 38, top: 300, sub: 0.38, harm: 0.36, ratio: 2, cut: [420, 4200], drive: 2.1, lope: 0.04, turbo: 0.4 },
  i4: { base: 44, top: 330, sub: 0.26, harm: 0.42, ratio: 2, cut: [480, 3800], drive: 1.7, lope: 0.02, turbo: 0 },
  i4t: { base: 44, top: 340, sub: 0.3, harm: 0.42, ratio: 2, cut: [480, 4200], drive: 1.9, lope: 0.03, turbo: 0.55 },
  diesel: { base: 22, top: 125, sub: 0.75, harm: 0.22, ratio: 2, cut: [220, 1500], drive: 3.8, lope: 0.18, turbo: 0.5, clatter: 0.3 },
  flat6: { base: 40, top: 360, sub: 0.32, harm: 0.52, ratio: 1.5, cut: [600, 5200], drive: 2.3, lope: 0.06, turbo: 0 },
  hyper: { base: 52, top: 430, sub: 0.28, harm: 0.58, ratio: 2, cut: [700, 6400], drive: 2, lope: 0, turbo: 0.25, whine: 0.25 },
};

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.muted = false;
    this.engineOn = false;
    this.musicMode = null;
    this.prevThrottle = 0;
  }

  /** Must be called from a user gesture (click / key / touch). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    // iOS / Safari: play a silent buffer to fully unlock
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.engineBus = this._bus();
    this.sfxBus = this._bus();
    this.musicBus = this._bus();
    this.ambBus = this._bus();
    this.noise = this._noiseBuffer();
    this.applyVolumes();
    this._buildLoops();
    if (this.pendingAmb) this.setAmbience(this.pendingAmb);
    if (this.pendingMusic) this.music(this.pendingMusic);
    if (this.engineOn) this.engineActive(true);
  }

  _bus() {
    const g = this.ctx.createGain();
    g.connect(this.master);
    return g;
  }

  _noiseBuffer() {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noiseSource() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : s.masterVolume, t, 0.05);
    this.engineBus.gain.setTargetAtTime(s.engineVolume, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.ambBus.gain.setTargetAtTime(s.sfxVolume * 0.8, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.musicVolume * 0.55, t, 0.1);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyVolumes();
    return this.muted;
  }

  // ───────────────────────── continuous loops ─────────────────────────
  _buildLoops() {
    const c = this.ctx;
    // engine
    const e = (this.eng = {});
    e.out = c.createGain();
    e.out.gain.value = 0;
    e.out.connect(this.engineBus);
    e.filter = c.createBiquadFilter();
    e.filter.type = 'lowpass';
    e.filter.Q.value = 1.6;
    e.shaper = c.createWaveShaper();
    e.am = c.createGain();
    e.filter.connect(e.am).connect(e.out);
    e.shaper.connect(e.filter);
    e.mix = c.createGain();
    e.mix.gain.value = 0.35;
    e.mix.connect(e.shaper);
    e.o1 = c.createOscillator();
    e.o1.type = 'sawtooth';
    e.o2 = c.createOscillator();
    e.o2.type = 'square';
    e.o3 = c.createOscillator();
    e.o3.type = 'sawtooth';
    e.g1 = c.createGain();
    e.g2 = c.createGain();
    e.g3 = c.createGain();
    e.o1.connect(e.g1).connect(e.mix);
    e.o2.connect(e.g2).connect(e.mix);
    e.o3.connect(e.g3).connect(e.mix);
    // lope / firing irregularity
    e.lfo = c.createOscillator();
    e.lfo.type = 'sine';
    e.lfoDepth = c.createGain();
    e.lfo.connect(e.lfoDepth).connect(e.am.gain);
    // intake noise
    e.nz = this._noiseSource();
    e.nzF = c.createBiquadFilter();
    e.nzF.type = 'bandpass';
    e.nzF.Q.value = 0.8;
    e.nzG = c.createGain();
    e.nzG.gain.value = 0;
    e.nz.connect(e.nzF).connect(e.nzG).connect(e.out);
    // turbo whistle
    e.tb = c.createOscillator();
    e.tb.type = 'sine';
    e.tbG = c.createGain();
    e.tbG.gain.value = 0;
    e.tb.connect(e.tbG).connect(this.engineBus);
    for (const o of [e.o1, e.o2, e.o3, e.lfo, e.nz, e.tb]) o.start();

    // tyres
    this.tyre = { src: this._noiseSource(), f: c.createBiquadFilter(), g: c.createGain() };
    this.tyre.f.type = 'bandpass';
    this.tyre.f.frequency.value = 1500;
    this.tyre.f.Q.value = 5;
    this.tyre.g.gain.value = 0;
    this.tyre.src.connect(this.tyre.f).connect(this.tyre.g).connect(this.sfxBus);
    this.tyre.src.start();
    // wind
    this.wind = { src: this._noiseSource(), f: c.createBiquadFilter(), g: c.createGain() };
    this.wind.f.type = 'lowpass';
    this.wind.g.gain.value = 0;
    this.wind.src.connect(this.wind.f).connect(this.wind.g).connect(this.sfxBus);
    this.wind.src.start();
    // ambience
    this.amb = { src: this._noiseSource(), f: c.createBiquadFilter(), g: c.createGain() };
    this.amb.g.gain.value = 0;
    this.amb.src.connect(this.amb.f).connect(this.amb.g).connect(this.ambBus);
    this.amb.src.start();
    this.setEngine(this.pendingEngine || 'i6');
  }

  setEngine(type) {
    this.pendingEngine = type;
    if (!this.ctx || !this.eng) return;
    const p = (this.profile = PROFILES[type] || PROFILES.i6);
    const e = this.eng;
    e.g1.gain.value = 0.55;
    e.g2.gain.value = p.sub;
    e.g3.gain.value = p.harm;
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * p.drive) / Math.tanh(p.drive);
    }
    e.shaper.curve = curve;
    e.lfoDepth.gain.value = p.lope * 0.5;
  }

  setAmbience(kind) {
    if (!this.ctx) {
      this.pendingAmb = kind;
      return;
    }
    const a = this.amb, t = this.ctx.currentTime;
    const cfg = {
      highway: ['lowpass', 260, 0.7, 0.05],
      desert: ['bandpass', 520, 0.6, 0.06],
      city: ['lowpass', 160, 0.9, 0.06],
      menu: ['lowpass', 120, 0.7, 0.0],
    }[kind] || ['lowpass', 200, 0.7, 0];
    a.f.type = cfg[0];
    a.f.frequency.setTargetAtTime(cfg[1], t, 0.2);
    a.f.Q.value = cfg[2];
    a.g.gain.setTargetAtTime(cfg[3], t, 0.5);
  }

  engineActive(on) {
    this.engineOn = on;
    if (!this.ctx || !this.eng) return;
    const t = this.ctx.currentTime;
    if (!on) {
      this.eng.out.gain.setTargetAtTime(0, t, 0.08);
      this.eng.tbG.gain.setTargetAtTime(0, t, 0.08);
      this.tyre.g.gain.setTargetAtTime(0, t, 0.08);
      this.wind.g.gain.setTargetAtTime(0, t, 0.08);
    }
  }

  /** Per-frame drive state of the player car. */
  updateDrive(s) {
    if (!this.ctx || !this.eng || !this.engineOn) return;
    const c = this.ctx, t = c.currentTime, p = this.profile, e = this.eng;
    const r = Math.max(0, Math.min(1.05, s.rpmFrac));
    const f = p.base + (p.top - p.base) * r;
    e.o1.frequency.setTargetAtTime(f, t, 0.02);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.02);
    e.o3.frequency.setTargetAtTime(f * p.ratio, t, 0.02);
    e.lfo.frequency.setTargetAtTime(Math.max(4, f * 0.25), t, 0.03);
    const thr = s.throttle;
    const cut = p.cut[0] + (p.cut[1] - p.cut[0]) * (0.35 * r + 0.65 * r * (0.35 + 0.65 * thr));
    e.filter.frequency.setTargetAtTime(cut, t, 0.03);
    e.am.gain.setTargetAtTime(1 - p.lope * 0.4, t, 0.05);
    const vol = (0.16 + 0.24 * thr + 0.12 * r) * (s.airborne ? 0.85 : 1);
    e.out.gain.setTargetAtTime(vol, t, 0.04);
    e.nzF.frequency.setTargetAtTime(600 + r * 2600, t, 0.05);
    e.nzG.gain.setTargetAtTime((p.clatter || 0.06) * (0.3 + thr) * 0.6, t, 0.05);
    // turbo spool + blow-off
    if (p.turbo) {
      e.tb.frequency.setTargetAtTime(1600 + 3600 * r, t, 0.08);
      e.tbG.gain.setTargetAtTime(p.turbo * 0.022 * thr * r * r, t, 0.12);
      if (this.prevThrottle > 0.6 && thr < 0.2 && r > 0.45) this._blowOff(p.turbo);
    }
    if (this.prevThrottle > 0.6 && thr < 0.1 && r > 0.6 && Math.random() < 0.5) this._crackle();
    this.prevThrottle = thr;
    // tyres + wind
    const slip = s.slip;
    this.tyre.g.gain.setTargetAtTime(slip > 0.25 ? Math.min(0.32, (slip - 0.2) * 0.42) : 0, t, 0.05);
    this.tyre.f.frequency.setTargetAtTime(1200 + slip * 600 + Math.random() * 150, t, 0.05);
    const sp = Math.min(1.3, s.speed / 75);
    this.wind.f.frequency.setTargetAtTime(300 + sp * 900, t, 0.1);
    this.wind.g.gain.setTargetAtTime(sp * sp * 0.22 + (s.nitro ? 0.08 : 0), t, 0.1);
  }

  // ───────────────────────── one-shots ─────────────────────────
  _env(node, peak, attack, decay, when = 0) {
    const t = this.ctx.currentTime + when;
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return t + attack + decay;
  }

  _tone(freq, type, peak, attack, decay, when = 0, bus = this.sfxBus, slideTo = null) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    const t0 = c.currentTime + when;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + attack + decay);
    o.connect(g).connect(bus);
    const end = this._env(g, peak, attack, decay, when);
    o.start(t0);
    o.stop(end + 0.05);
  }

  _noiseHit(peak, attack, decay, type, freq, q = 1, when = 0, bus = this.sfxBus, sweepTo = null) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const t0 = c.currentTime + when;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + attack + decay);
    const g = c.createGain();
    s.connect(f).connect(g).connect(bus);
    const end = this._env(g, peak, attack, decay, when);
    s.start(t0, Math.random());
    s.stop(end + 0.05);
  }

  _blowOff(k) {
    this._noiseHit(0.08 * k, 0.005, 0.28, 'bandpass', 2400, 2, 0, this.engineBus, 900);
  }

  _crackle() {
    for (let i = 0; i < 3; i++) this._noiseHit(0.12, 0.002, 0.05, 'lowpass', 1800, 1, 0.04 + Math.random() * 0.25, this.engineBus);
  }

  impact(strength) {
    if (!this.ctx) return;
    const k = Math.min(1, strength / 18);
    this._noiseHit(0.25 + 0.5 * k, 0.003, 0.18 + 0.3 * k, 'lowpass', 900 + 1500 * k, 0.7);
    this._tone(70, 'sine', 0.4 * k + 0.1, 0.005, 0.25, 0, this.sfxBus, 40);
    if (k > 0.3) this._noiseHit(0.12 * k, 0.002, 0.35, 'highpass', 3500, 0.7);
  }

  scrape(strength) {
    if (!this.ctx) return;
    this._noiseHit(Math.min(0.2, strength * 0.02), 0.01, 0.15, 'bandpass', 2600, 3);
  }

  land(strength) {
    if (!this.ctx) return;
    const k = Math.min(1, strength / 10);
    this._tone(55, 'sine', 0.5 * k, 0.005, 0.3, 0, this.sfxBus, 35);
    this._noiseHit(0.2 * k, 0.003, 0.2, 'lowpass', 500, 0.7);
  }

  nitro() {
    if (!this.ctx) return;
    this._noiseHit(0.22, 0.02, 0.6, 'bandpass', 300, 1.2, 0, this.sfxBus, 3200);
  }

  countdown(n) {
    if (!this.ctx) return;
    if (n > 0) this._tone(660, 'square', 0.12, 0.005, 0.22);
    else {
      this._tone(1320, 'square', 0.14, 0.005, 0.55);
      this._tone(990, 'sine', 0.12, 0.005, 0.6);
    }
  }

  checkpoint() {
    if (!this.ctx) return;
    this._tone(880, 'triangle', 0.14, 0.005, 0.18);
    this._tone(1320, 'triangle', 0.14, 0.005, 0.25, 0.09);
  }

  lap() {
    if (!this.ctx) return;
    [660, 880, 1320].forEach((f, i) => this._tone(f, 'triangle', 0.14, 0.005, 0.25, i * 0.09));
  }

  finish(win) {
    if (!this.ctx) return;
    const notes = win ? [523, 659, 784, 1047] : [440, 523, 659];
    notes.forEach((f, i) => this._tone(f, 'sawtooth', 0.08, 0.01, 0.6, i * 0.12, this.sfxBus));
    notes.forEach((f, i) => this._tone(f / 2, 'triangle', 0.1, 0.01, 0.8, i * 0.12));
  }

  click() {
    if (!this.ctx) return;
    this._tone(1800, 'triangle', 0.05, 0.002, 0.05);
  }

  drift(points) {
    if (!this.ctx) return;
    this._tone(1046, 'triangle', 0.08, 0.004, 0.15);
    this._tone(1568, 'triangle', 0.08, 0.004, 0.2, 0.06);
  }

  // ───────────────────────── procedural music ─────────────────────────
  music(mode) {
    this.pendingMusic = mode;
    if (!this.ctx) return;
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    if (this._seq) clearInterval(this._seq);
    this._seq = null;
    if (!mode) return;
    const bpm = mode === 'race' ? 118 : 96;
    const step = 60 / bpm / 4; // 16th notes
    // Am - F - C - G (A minor)
    const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    let i = 0;
    let next = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.ctx) return;
      while (next < this.ctx.currentTime + 0.15) {
        const bar = Math.floor(i / 16) % 4, s = i % 16;
        const chord = prog[bar];
        const when = next - this.ctx.currentTime;
        // bass: driving eighths
        if (s % 2 === 0) this._tone(NOTE(chord[0] - 24), 'sawtooth', mode === 'race' ? 0.09 : 0.06, 0.005, step * 1.6, when, this.musicBus);
        // arp
        if (mode === 'race' || s % 2 === 0) {
          const n = chord[(s >> (mode === 'race' ? 0 : 1)) % 3] + (s % 8 >= 4 ? 12 : 0);
          this._tone(NOTE(n), 'square', 0.025, 0.004, step * 0.9, when, this.musicBus);
        }
        // pad at bar start
        if (s === 0) for (const n of chord) this._tone(NOTE(n), 'triangle', 0.035, 0.3, step * 15, when, this.musicBus);
        if (mode === 'race') {
          if (s % 4 === 0) this._tone(110, 'sine', 0.3, 0.003, 0.18, when, this.musicBus, 45); // kick
          if (s % 4 === 2) this._noiseHit(0.05, 0.002, 0.05, 'highpass', 7000, 0.7, when, this.musicBus); // hat
          if (s === 4 || s === 12) this._noiseHit(0.12, 0.002, 0.16, 'bandpass', 1800, 0.8, when, this.musicBus); // snare
        }
        next += step;
        i++;
      }
    };
    this._seq = setInterval(tick, 40);
    tick();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
}
