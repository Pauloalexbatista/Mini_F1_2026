export class AudioEngine {
  private ctx: AudioContext | null = null;
  private f1Engines: Map<number, { 
    osc1: OscillatorNode, 
    osc2: OscillatorNode, 
    filter: BiquadFilterNode,
    gain1: GainNode, 
    gain2: GainNode, 
    masterGain: GainNode 
  }> = new Map();

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
    gain.gain.linearRampToValueAtTime(0.08, time + 0.05);
    gain.gain.setValueAtTime(0.08, time + duration - 0.05);
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
    
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  playDrift() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.2;
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
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(t);
  }

  playVictory() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Tema da Vitória
    const notes = [
      { f: 392.00, d: 0.15 },
      { f: 523.25, d: 0.15 },
      { f: 659.25, d: 0.3 },
      { f: 587.33, d: 0.6 },
      { f: 392.00, d: 0.15 },
      { f: 523.25, d: 0.15 },
      { f: 659.25, d: 0.3 },
      { f: 587.33, d: 0.6 },
      { f: 392.00, d: 0.15 },
      { f: 523.25, d: 0.15 },
      { f: 698.46, d: 0.3 },
      { f: 659.25, d: 0.3 },
      { f: 587.33, d: 0.15 },
      { f: 523.25, d: 0.8 },
    ];

    let currentTime = t;
    notes.forEach(note => {
      this.beep(note.f, currentTime, note.d);
      currentTime += note.d + 0.02;
    });
  }

  updateEngine(carId: number, speedKmh: number, throttle: number, isBot: boolean) {
    if (!this.ctx) return;
    if (isBot) return; // Apenas o carro do jogador

    if (!this.f1Engines.has(carId)) {
      const osc1 = this.ctx.createOscillator(); // Corpo V6
      const osc2 = this.ctx.createOscillator(); // Sub-harmónica suave
      const filter = this.ctx.createBiquadFilter(); // Filtro passa-baixo para cortar sons agudos estridentes
      const gain1 = this.ctx.createGain();
      const gain2 = this.ctx.createGain();
      const masterGain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'triangle';

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, this.ctx.currentTime);
      filter.Q.setValueAtTime(2.0, this.ctx.currentTime);

      osc1.connect(gain1);
      osc2.connect(gain2);

      gain1.connect(filter);
      gain2.connect(filter);
      filter.connect(masterGain);
      masterGain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();

      this.f1Engines.set(carId, { osc1, osc2, filter, gain1, gain2, masterGain });
    }

    const engine = this.f1Engines.get(carId)!;
    
    // Escala linear proporcional de 0 a 350 km/h:
    const safeKmh = Math.max(0, speedKmh);
    const speedRatio = Math.min(1.0, safeKmh / 350);

    // Se estiver praticamente parado e sem acelerar, som quase mudo
    if (safeKmh < 3 && throttle <= 0.05) {
      engine.masterGain.gain.setTargetAtTime(0.001, this.ctx.currentTime, 0.1);
      return;
    }

    // Frequência base: vai dos 45 Hz (parado) até 165 Hz (350 km/h)
    // O acelerador dá uma resposta imediata de 15% mas a velocidade real dita o tom principal
    const effectiveRatio = Math.min(1.0, (speedRatio * 0.85) + (throttle * 0.15));
    const baseFreq = 45 + (effectiveRatio * 120);

    engine.osc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.04);
    engine.osc2.frequency.setTargetAtTime(baseFreq * 0.5, this.ctx.currentTime, 0.04);

    // O filtro corta frequências agudas (máx ~650 Hz), mantendo um ronco grave e mecânico agradável
    const filterCutoff = 260 + (effectiveRatio * 380);
    engine.filter.frequency.setTargetAtTime(filterCutoff, this.ctx.currentTime, 0.05);

    // Volume master suave e constante (não irrita nem satura)
    const targetVol = 0.006 + (effectiveRatio * 0.016);
    engine.masterGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.06);
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
