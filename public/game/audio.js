// Tiny WebAudio sound kit: engine, sirens, crashes, stings. No files needed.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.7; this.master.connect(c.destination);
    // engine
    this.eng = c.createOscillator(); this.eng.type = "sawtooth"; this.eng.frequency.value = 45;
    this.eng2 = c.createOscillator(); this.eng2.type = "square"; this.eng2.frequency.value = 22.5;
    this.engF = c.createBiquadFilter(); this.engF.type = "lowpass"; this.engF.frequency.value = 380;
    this.engG = c.createGain(); this.engG.gain.value = 0;
    this.eng.connect(this.engF); this.eng2.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master);
    this.eng.start(); this.eng2.start();
    // siren
    this.sir = c.createOscillator(); this.sir.type = "triangle"; this.sir.frequency.value = 700;
    this.sirG = c.createGain(); this.sirG.gain.value = 0;
    this.sir.connect(this.sirG); this.sirG.connect(this.master); this.sir.start();
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05); }
  update(speed, copDist, running, t) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.eng.frequency.setTargetAtTime(42 + speed * 15, now, 0.05);
    this.eng2.frequency.setTargetAtTime(21 + speed * 7.5, now, 0.05);
    this.engG.gain.setTargetAtTime(running ? 0.09 + speed * 0.012 : 0, now, 0.1);
    const near = running && copDist < 900 ? Math.max(0, 1 - copDist / 900) : 0;
    this.sirG.gain.setTargetAtTime(near * 0.06, now, 0.1);
    this.sir.frequency.setTargetAtTime(Math.floor(t / 27) % 2 ? 960 : 720, now, 0.04);
  }
  noise(vol = 0.5, freq = 900) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
  }
  tone(freq, dur, type = "square", vol = 0.12, when = 0, slide = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  crash(p) { this.noise(Math.min(0.9, 0.2 + p * 0.08), 700 + p * 120); }
  spike() { this.noise(0.5, 3000); this.tone(180, 0.3, "sawtooth", 0.08, 0, 0.4); }
  failed() {
    this.noise(0.9, 220);
    this.tone(110, 1.8, "sawtooth", 0.18, 0.05, 0.5);
    this.tone(82, 2.2, "triangle", 0.22, 0.35, 0.7);
    this.tone(55, 2.6, "sine", 0.35, 0.35);
  }
  cleared() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, "square", 0.08, i * 0.09)); }
  passed() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, "square", 0.08, i * 0.11)); this.tone(131, 1.4, "sawtooth", 0.1, 0.1); }
  click() { this.tone(880, 0.05, "square", 0.05); }
}
