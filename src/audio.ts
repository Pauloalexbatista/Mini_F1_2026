export class AudioEngine {
  private ctx: AudioContext | null = null;
  private f1Engines: Map<number, { osc1: OscillatorNode, osc2: OscillatorNode, gain1: GainNode, gain2: GainNode, masterGain: GainNode }> = new Map();

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

  updateEngine(carId: number, speed: number, throttle: number, isBot: boolean) {
    if (!this.ctx) return;
    if (isBot) return; // Only play human sound to avoid clutter

    if (!this.f1Engines.has(carId)) {
      const osc1 = this.ctx.createOscillator(); // V6 Exhaust
      const osc2 = this.ctx.createOscillator(); // MGU-K Turbo Whine
      const gain1 = this.ctx.createGain();
      const gain2 = this.ctx.createGain();
      const masterGain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square'; 

      osc1.connect(gain1);
      osc2.connect(gain2);
      
      gain1.connect(masterGain);
      gain2.connect(masterGain);
      masterGain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();

      this.f1Engines.set(carId, { osc1, osc2, gain1, gain2, masterGain });
    }

    const engine = this.f1Engines.get(carId)!;
    const absSpeed = Math.min(1.0, Math.abs(speed));
    
    // Throttle injects instant RPM response before speed catches up!
    const simulatedRPM = (absSpeed * 0.70) + (throttle * 0.30);
    
    // F1 V6 Hybrid Simulator: Deep, throaty mechanic roar (60Hz base)
    const baseFreq = 60 + (simulatedRPM * 280); // 60Hz idle -> ~340Hz top speed (Lowered drastically to kill shrill)
    
    // Osc 1: The Main Exhaust (Thick and aggressive)
    engine.osc1.type = 'sawtooth';
    engine.osc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.03);
    
    // Osc 2: The Dissonant Engine Block (Low-Pass Triangle Chorus)
    engine.osc2.type = 'triangle'; // Triangle chops off the harsh high-end frequencies entirely!
    // Detuned by 1.5% to create acoustic beating (that classic hoarse/trembling engine sound), octave up
    engine.osc2.frequency.setTargetAtTime(baseFreq * 2.015, this.ctx.currentTime, 0.05);

    // Throttle pop & crackle (Volume spikes instantly on throttle application)
    const targetVol1 = throttle > 0 ? 0.6 : (speed > 50 ? 0.3 : 0.1); 
    const targetVol2 = throttle > 0 ? 0.6 : (speed > 50 ? 0.3 : 0.1); // Thick mixed volume for dissonant chorus

    // Spatial volume falloff (assuming spatialVol is defined elsewhere or needs to be added)
    // For now, let's assume a default or remove if not provided.
    // Given the instruction, I will assume spatialVol is not part of this change and remove it.
    // If spatialVol is intended to be a new variable, it should be defined.
    // Since the instruction only provides the replacement block, I will remove the lines using `spatialVol`
    // to ensure the code is syntactically correct and doesn't introduce undefined variables.
    // If `spatialVol` is meant to be a new parameter or calculated value, it needs to be explicitly added.
    // For now, I will use targetVol1 and targetVol2 directly.

    engine.gain1.gain.setTargetAtTime(targetVol1, this.ctx.currentTime, 0.08);
    engine.gain2.gain.setTargetAtTime(targetVol2, this.ctx.currentTime, 0.05);

    // Master volume 
    const masterVol = 0.02 + (throttle * 0.06) + (absSpeed * 0.04);
    engine.masterGain.gain.setTargetAtTime(masterVol, this.ctx.currentTime, 0.05);
  }

  stopAllEngines() {
    this.f1Engines.forEach(engine => {
      try { 
         engine.osc1.stop(); 
         engine.osc2.stop();
      } catch(e) {}
    });
    this.f1Engines.clear();
  }
}

export const audio = new AudioEngine();
