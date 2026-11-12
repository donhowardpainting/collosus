// Fully synthesized sound: no audio assets. Engine drone, impacts, clanks, cannon, explosions, UI.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.last = {}; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // engine: detuned saws + sub through a low-pass, with a chugging tremolo
    this.eng = { gain: c.createGain(), filt: c.createBiquadFilter(), osc: [], lfo: c.createOscillator(), lfoGain: c.createGain() };
    const e = this.eng;
    e.gain.gain.value = 0; e.filt.type = 'lowpass'; e.filt.frequency.value = 200; e.filt.Q.value = 3;
    for (const [type, f] of [['sawtooth', 42], ['sawtooth', 42.7], ['square', 21]]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(e.filt); o.start(); e.osc.push({ o, f });
    }
    const trem = c.createGain(); trem.gain.value = 0.7;
    e.lfo.frequency.value = 7; e.lfoGain.gain.value = 0.3; e.lfo.connect(e.lfoGain); e.lfoGain.connect(trem.gain); e.lfo.start();
    e.filt.connect(trem); trem.connect(e.gain); e.gain.connect(this.master);
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7; }
  engine(on, throttle = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, e = this.eng;
    e.gain.gain.setTargetAtTime(on ? 0.1 + throttle * 0.12 : 0, t, 0.15);
    for (const { o, f } of e.osc) o.frequency.setTargetAtTime(f * (1 + throttle * 0.9), t, 0.25);
    e.filt.frequency.setTargetAtTime(180 + throttle * 520, t, 0.2);
    e.lfo.frequency.setTargetAtTime(6 + throttle * 9, t, 0.3);
  }
  _ok(name, gap) { const n = performance.now(); if (n - (this.last[name] || 0) < gap) return false; this.last[name] = n; return !!this.ctx; }
  _noise(dur, freq, q, vol, type = 'lowpass', sweep = 0) {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.playbackRate.value = 0.6 + Math.random() * 0.8;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  _tone(freq, dur, vol, type = 'sine', slide = 1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  thud(s = 0.5) { if (!this._ok('thud', 70)) return; this._tone(70 + Math.random() * 20, 0.28, Math.min(0.9, 0.25 + s * 0.5), 'sine', 0.45); this._noise(0.16, 500, 0.7, Math.min(0.5, 0.1 + s * 0.3)); }
  clank(s = 0.5) {
    if (!this._ok('clank', 60)) return;
    const f = 300 + Math.random() * 500;
    for (const [m, v] of [[1, 0.2], [2.76, 0.12], [5.4, 0.08], [8.9, 0.04]]) this._tone(f * m, 0.12 + Math.random() * 0.25, v * (0.4 + s), 'sine');
    this._noise(0.05, 3500, 1, 0.15 * s, 'bandpass');
  }
  crack() { if (!this._ok('crack', 50)) return; this._noise(0.22, 1400, 1.2, 0.5, 'bandpass', 0.3); this._tone(160, 0.1, 0.25, 'triangle', 0.5); }
  cannon() { if (!this._ok('cannon', 40)) return; this._tone(110, 0.45, 0.9, 'sine', 0.3); this._noise(0.4, 1800, 0.5, 0.7, 'lowpass', 0.15); }
  boom(s = 1) { if (!this._ok('boom', 60)) return; this._tone(60, 0.9, 0.95, 'sine', 0.35); this._noise(1.1, 900, 0.4, 0.8 * s, 'lowpass', 0.1); this._noise(0.25, 3000, 0.5, 0.3, 'highpass'); }
  snap() { if (!this._ok('snap', 80)) return; this._tone(900, 0.08, 0.3, 'square', 0.3); this.clank(0.9); }
  ui(hi = false) { if (!this._ok('ui', 25)) return; this._tone(hi ? 880 : 520, 0.06, 0.12, 'triangle'); }
  place() { if (!this._ok('place', 25)) return; this._tone(180, 0.09, 0.3, 'triangle', 0.6); this._noise(0.05, 2500, 1, 0.14, 'bandpass'); }
  remove() { if (!this._ok('rm', 25)) return; this._tone(240, 0.1, 0.2, 'sawtooth', 0.4); }
  deny() { if (!this._ok('deny', 80)) return; this._tone(140, 0.14, 0.22, 'square', 0.8); }
  activate() {
    if (!this.ctx) return;
    this._tone(40, 1.6, 0.5, 'sawtooth', 4); this._tone(60, 1.6, 0.3, 'square', 4.2);
    this._noise(1.2, 300, 1.5, 0.3, 'bandpass', 8);
    [0, 0.12, 0.24].forEach((d, i) => this._tone(220 * (i + 2), 0.15, 0.14, 'square', 1, 1.0 + d));
  }
  fanfare(win = true) {
    if (!this.ctx) return;
    const n = win ? [392, 494, 587, 784] : [330, 277, 220, 165];
    n.forEach((f, i) => { this._tone(f, 0.5, 0.2, 'sawtooth', 1, i * 0.14); this._tone(f / 2, 0.5, 0.2, 'square', 1, i * 0.14); });
  }
}
