export class AudioEngine {
  private ctx: AudioContext | null = null;
  private engineOscillators: Map<number, OscillatorNode> = new Map();
  private engineGains: Map<number, GainNode> = new Map();

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playStartSequence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    
    // 3 beeps
    for (let i = 0; i < 3; i++) {
      this.beep(440, t + i, 0.2);
    }
    // High beep
    this.beep(880, t + 3, 0.5);
  }

  private beep(freq: number, time: number, duration: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.1, time + 0.05);
    gain.gain.setValueAtTime(0.1, time + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, time + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + duration);
  }

  playCrash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(10, t + 0.2);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  playDrift() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.2; // 0.2 seconds of noise
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(t);
  }

  playVictory() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Ayrton Senna Theme approximation (Tema da Vitória)
    const notes = [
      { f: 392.00, d: 0.15 }, // G4
      { f: 523.25, d: 0.15 }, // C5
      { f: 659.25, d: 0.3 },  // E5
      { f: 587.33, d: 0.6 },  // D5
      
      { f: 392.00, d: 0.15 }, // G4
      { f: 523.25, d: 0.15 }, // C5
      { f: 659.25, d: 0.3 },  // E5
      { f: 587.33, d: 0.6 },  // D5
      
      { f: 392.00, d: 0.15 }, // G4
      { f: 523.25, d: 0.15 }, // C5
      { f: 698.46, d: 0.3 },  // F5
      { f: 659.25, d: 0.3 },  // E5
      { f: 587.33, d: 0.15 }, // D5
      { f: 523.25, d: 0.8 },  // C5
    ];

    let currentTime = t;
    notes.forEach(note => {
      this.beep(note.f, currentTime, note.d);
      currentTime += note.d + 0.02;
    });
  }

  updateEngine(carId: number, speed: number, isBot: boolean) {
    if (!this.ctx) return;
    
    // Only play engine sound for human players to avoid noise clutter
    if (isBot) return;

    if (!this.engineOscillators.has(carId)) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      this.engineOscillators.set(carId, osc);
      this.engineGains.set(carId, gain);
    }

    const osc = this.engineOscillators.get(carId)!;
    const gain = this.engineGains.get(carId)!;

    const absSpeed = Math.abs(speed);
    // Base freq 50Hz, max freq 250Hz
    const freq = 50 + (absSpeed / 10) * 200;
    osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    
    // Volume based on speed
    const vol = 0.01 + (absSpeed / 10) * 0.04;
    gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
  }

  stopAllEngines() {
    this.engineOscillators.forEach(osc => {
      try { osc.stop(); } catch(e) {}
    });
    this.engineOscillators.clear();
    this.engineGains.clear();
  }
}

export const audio = new AudioEngine();
