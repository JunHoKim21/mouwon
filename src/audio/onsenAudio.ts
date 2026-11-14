import {
  FootstepSurface,
  PENTATONIC_BAMBOO_NOTES,
  YARN_MAX_COUNT,
} from '../world/ritualMath';

export interface AudioMixerSettings {
  ambient: number; // 0..1
  purr: number; // 0..1
  sfx: number; // 0..1
  muted: boolean;
}

export const DEFAULT_MIXER_SETTINGS: AudioMixerSettings = {
  ambient: 0.45,
  purr: 0.4,
  sfx: 0.5,
  muted: false,
};

function createPinkNoiseBuffer(
  ctx: AudioContext,
  durationSeconds: number,
  crossfadeSamples = 2048,
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1024, Math.floor(sampleRate * durationSeconds));
  const fadeLen = Math.min(
    Math.max(crossfadeSamples, Math.floor(sampleRate * 0.55)),
    Math.floor(length / 3),
  );
  const totalSamples = length + fadeLen;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  const tailOverlap = new Float32Array(fadeLen);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  const nextPinkSample = (): number => {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
    b6 = white * 0.115926;
    return pink;
  };

  // Warm up IIR filter state so the beginning has no DC/transient step
  for (let i = 0; i < 1024; i++) {
    nextPinkSample();
  }

  for (let i = 0; i < totalSamples; i++) {
    const sample = nextPinkSample();
    if (i < length) {
      data[i] = sample;
    } else {
      tailOverlap[i - length] = sample;
    }
  }

  // Equal-power overlap crossfade from extra tail into buffer head for seamless looping
  for (let i = 0; i < fadeLen; i++) {
    const angle = (i / fadeLen) * (Math.PI * 0.5);
    data[i] = data[i] * Math.sin(angle) + tailOverlap[i] * Math.cos(angle);
  }

  return buffer;
}

function makeReverbImpulse(ctx: AudioContext, duration = 1.7): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = ctx.createBuffer(2, length, rate);
  const preDelaySamples = Math.floor(rate * 0.028);

  for (let ch = 0; ch < 2; ch++) {
    const channelData = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      if (i < preDelaySamples) {
        channelData[i] = 0;
      } else {
        const t = (i - preDelaySamples) / rate;
        const decay = Math.exp(-t * 5.7);
        channelData[i] = (Math.random() * 2 - 1) * decay * 0.5;
      }
    }
  }
  return impulse;
}

export class OnsenAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private dryBus: GainNode | null = null;
  private reverbInput: GainNode | null = null;

  private ambientBus: GainNode | null = null;
  private waterSpatialGain: GainNode | null = null;
  private purrBus: GainNode | null = null;
  private purrSpatialGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;

  private pinkNoiseShort: AudioBuffer | null = null;
  private settings: AudioMixerSettings = { ...DEFAULT_MIXER_SETTINGS };
  private isIndoor = false;
  private initialized = false;
  private disposed = false;

  private indoorMultiplier(): number {
    return this.isIndoor ? 0.32 : 1.0;
  }

  public unlock(): void {
    if (this.disposed) return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx({ latencyHint: 'playback' });
      } catch {
        this.ctx = new AudioCtx();
      }
      this.setupGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private setupGraph(ctx: AudioContext): void {
    if (this.initialized) return;
    this.initialized = true;

    // Master Compressor (-14dB, knee 18dB, ratio 3.5:1) -> Master Gain
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.22;
    this.compressor = compressor;

    const masterGain = ctx.createGain();
    masterGain.gain.value = this.settings.muted ? 0 : 0.72;
    this.masterGain = masterGain;

    const dryBus = ctx.createGain();
    dryBus.gain.value = 1.0;
    this.dryBus = dryBus;

    // 1.7s Convolution Reverb
    const reverbInput = ctx.createGain();
    reverbInput.gain.value = 0.36;
    const convolver = ctx.createConvolver();
    convolver.buffer = makeReverbImpulse(ctx, 1.7);
    const reverbLpf = ctx.createBiquadFilter();
    reverbLpf.type = 'lowpass';
    reverbLpf.frequency.value = 4200;
    this.reverbInput = reverbInput;

    dryBus.connect(compressor);
    reverbInput.connect(convolver);
    convolver.connect(reverbLpf);
    reverbLpf.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Channel Buses
    const ambientBus = ctx.createGain();
    ambientBus.gain.value = this.settings.ambient * this.indoorMultiplier();
    ambientBus.connect(dryBus);
    ambientBus.connect(reverbInput);
    this.ambientBus = ambientBus;

    const purrBus = ctx.createGain();
    purrBus.gain.value = this.settings.purr;
    purrBus.connect(dryBus);
    this.purrBus = purrBus;

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = this.settings.sfx;
    sfxBus.connect(dryBus);
    sfxBus.connect(reverbInput);
    this.sfxBus = sfxBus;

    this.pinkNoiseShort = createPinkNoiseBuffer(ctx, 1.2, 512);

    this.createWinterWind(ctx, ambientBus);
    this.createOnsenWater(ctx, ambientBus);
    this.createPurrSound(ctx, purrBus);
  }

  private createWinterWind(ctx: AudioContext, destination: AudioNode): void {
    const windBuf = createPinkNoiseBuffer(ctx, 8.5, 4096);
    const src = ctx.createBufferSource();
    src.buffer = windBuf;
    src.loop = true;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 180;
    hpf.Q.value = 0.5;

    // Cascaded 24dB/oct lowpass removes harsh hiss/crackling from pink noise
    const lpf1 = ctx.createBiquadFilter();
    lpf1.type = 'lowpass';
    lpf1.frequency.value = 500;
    lpf1.Q.value = 0.55;

    const lpf2 = ctx.createBiquadFilter();
    lpf2.type = 'lowpass';
    lpf2.frequency.value = 460;
    lpf2.Q.value = 0.55;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.065;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.045;

    const lfoGainDepth = ctx.createGain();
    lfoGainDepth.gain.value = 0.025;
    lfo.connect(lfoGainDepth);
    lfoGainDepth.connect(windGain.gain);

    const lfoFreqDepth = ctx.createGain();
    lfoFreqDepth.gain.value = 120;
    lfo.connect(lfoFreqDepth);
    lfoFreqDepth.connect(lpf2.frequency);

    src.connect(hpf);
    hpf.connect(lpf1);
    lpf1.connect(lpf2);
    lpf2.connect(windGain);
    windGain.connect(destination);

    src.start();
    lfo.start();
  }

  /**
   * Procedural 5.4s pink noise polyrhythm across 3 frequency bands (380Hz, 980Hz, 1850Hz).
   */
  private createOnsenWater(ctx: AudioContext, destination: AudioNode): void {
    const waterBuffer = createPinkNoiseBuffer(ctx, 5.4, 2048);
    const spatialGain = ctx.createGain();
    spatialGain.gain.value = 0.14;
    spatialGain.connect(destination);
    this.waterSpatialGain = spatialGain;

    const bands = [
      { freq: 380, rate: 0.82, gain: 0.55, q: 1.1 },
      { freq: 980, rate: 1.18, gain: 0.32, q: 1.5 },
      { freq: 1850, rate: 1.55, gain: 0.09, q: 2.0 },
    ];

    for (const band of bands) {
      const src = ctx.createBufferSource();
      src.buffer = waterBuffer;
      src.loop = true;
      src.playbackRate.value = band.rate;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = band.freq;
      filter.Q.value = band.q;

      const g = ctx.createGain();
      g.gain.value = band.gain;

      src.connect(filter);
      filter.connect(g);
      g.connect(spatialGain);
      src.start(0, Math.random() * 2.0);
    }
  }

  /**
   * Procedural collective cat purr: 26.5Hz triangle + 53Hz sine + 180Hz bandpass pink noise,
   * modulated by a 0.26Hz breathing LFO (~3.85s cycle) through a 220Hz lowpass filter.
   */
  private createPurrSound(ctx: AudioContext, destination: AudioNode): void {
    const spatialGain = ctx.createGain();
    spatialGain.gain.value = 0.08;
    spatialGain.connect(destination);
    this.purrSpatialGain = spatialGain;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 220;
    lpf.Q.value = 0.8;

    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.52;

    // 0.26 Hz breathing LFO
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.26;
    const lfoAmp = ctx.createGain();
    lfoAmp.gain.value = 0.36;
    lfo.connect(lfoAmp);
    lfoAmp.connect(breathGain.gain);

    // 26.5 Hz triangle fundamental
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = 26.5;
    const osc1Gain = ctx.createGain();
    osc1Gain.gain.value = 0.42;
    osc1.connect(osc1Gain);
    osc1Gain.connect(breathGain);

    // 53.0 Hz sine harmonic
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 53.0;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.24;
    osc2.connect(osc2Gain);
    osc2Gain.connect(breathGain);

    // Pink noise through 180Hz bandpass
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = createPinkNoiseBuffer(ctx, 4.2, 1024);
    noiseSrc.loop = true;
    const noiseBp = ctx.createBiquadFilter();
    noiseBp.type = 'bandpass';
    noiseBp.frequency.value = 180;
    noiseBp.Q.value = 1.2;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.45;
    noiseSrc.connect(noiseBp);
    noiseBp.connect(noiseGain);
    noiseGain.connect(breathGain);

    breathGain.connect(lpf);
    lpf.connect(spatialGain);

    osc1.start();
    osc2.start();
    noiseSrc.start();
    lfo.start();
  }

  public updateSettings(next: AudioMixerSettings): void {
    this.settings = { ...next };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain?.gain.setTargetAtTime(next.muted ? 0 : 0.72, now, 0.04);
    this.ambientBus?.gain.setTargetAtTime(
      next.ambient * this.indoorMultiplier(),
      now,
      0.04,
    );
    this.purrBus?.gain.setTargetAtTime(next.purr, now, 0.04);
    this.sfxBus?.gain.setTargetAtTime(next.sfx, now, 0.04);
  }

  /**
   * Smoothly attenuates outdoor wind/ambientBus to 32% over ~0.9s (3 * tau, tau=0.3s)
   * when entering Myoyeongak tatami hall, and restores 100% upon stepping outside.
   */
  public setIndoorAttenuation(indoor: boolean): void {
    if (this.isIndoor === indoor) return;
    this.isIndoor = indoor;
    if (!this.ctx || !this.ambientBus) return;
    const now = this.ctx.currentTime;
    this.ambientBus.gain.setTargetAtTime(
      this.settings.ambient * this.indoorMultiplier(),
      now,
      0.3,
    );
  }

  public updateSpatialVolumes(waterGain: number, purrProximity: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.waterSpatialGain?.gain.setTargetAtTime(waterGain, now, 0.12);
    this.purrSpatialGain?.gain.setTargetAtTime(0.05 + purrProximity * 0.55, now, 0.18);
  }

  public playMeow(pitchMultiplier = 1.0): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const pitch = Math.max(0.5, Math.min(2.0, pitchMultiplier));

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(590 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(840 * pitch, now + 0.09);
    osc.frequency.exponentialRampToValueAtTime(510 * pitch, now + 0.31);

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(1150 * pitch, now);
    formant.frequency.exponentialRampToValueAtTime(1450 * pitch, now + 0.1);
    formant.Q.value = 2.2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.28, now + 0.035);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.33);

    osc.connect(formant);
    formant.connect(env);
    env.connect(this.sfxBus);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  public playBambooNote(noteIndex: number): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const note =
      PENTATONIC_BAMBOO_NOTES[
        ((noteIndex % PENTATONIC_BAMBOO_NOTES.length) + PENTATONIC_BAMBOO_NOTES.length) %
          PENTATONIC_BAMBOO_NOTES.length
      ];

    // Warm hollow bamboo resonance + subtle water-drop pitch bloom
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.freq * 0.985, now);
    osc.frequency.exponentialRampToValueAtTime(note.freq, now + 0.035);

    const harmonic = ctx.createOscillator();
    harmonic.type = 'triangle';
    harmonic.frequency.setValueAtTime(note.freq * 2.0, now);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.32, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    const harmEnv = ctx.createGain();
    harmEnv.gain.setValueAtTime(0.0001, now);
    harmEnv.gain.linearRampToValueAtTime(0.09, now + 0.008);
    harmEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(env);
    harmonic.connect(harmEnv);
    env.connect(this.sfxBus);
    harmEnv.connect(this.sfxBus);

    osc.start(now);
    harmonic.start(now);
    osc.stop(now + 0.88);
    harmonic.stop(now + 0.2);
  }

  public playShishiOdoshi(): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Crisp hollow bamboo "Ttak!" strike against stone
    const strikeTime = now + 0.18;
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(640, strikeTime);
    bodyOsc.frequency.exponentialRampToValueAtTime(340, strikeTime + 0.08);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 720;
    bp.Q.value = 3.6;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, strikeTime);
    env.gain.linearRampToValueAtTime(0.45, strikeTime + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, strikeTime + 0.24);

    bodyOsc.connect(bp);
    bp.connect(env);
    env.connect(this.sfxBus);
    bodyOsc.start(strikeTime);
    bodyOsc.stop(strikeTime + 0.26);

    // Water pour splash right before the strike
    if (this.pinkNoiseShort) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.pinkNoiseShort;
      const nFilter = ctx.createBiquadFilter();
      nFilter.type = 'bandpass';
      nFilter.frequency.value = 1250;
      nFilter.Q.value = 1.4;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.0001, now);
      nGain.gain.linearRampToValueAtTime(0.18, now + 0.06);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      noise.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(this.sfxBus);
      noise.start(now);
      noise.stop(now + 0.38);
    }
  }

  public playFootstep(surface: FootstepSurface): void {
    if (!this.ctx || !this.sfxBus || this.settings.muted || this.ctx.state !== 'running') {
      return;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (surface === 'snow' && this.pinkNoiseShort) {
      const src = ctx.createBufferSource();
      src.buffer = this.pinkNoiseShort;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2100 + Math.random() * 450;
      bp.Q.value = 1.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.11, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxBus);
      src.start(now, Math.random() * 0.4);
      src.stop(now + 0.085);
    } else if (surface === 'wood') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(175 + Math.random() * 25, now);
      osc.frequency.exponentialRampToValueAtTime(92, now + 0.055);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.13, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (surface === 'water' && this.pinkNoiseShort) {
      const src = ctx.createBufferSource();
      src.buffer = this.pinkNoiseShort;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100 + Math.random() * 350;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.14, now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxBus);
      src.start(now, Math.random() * 0.5);
      src.stop(now + 0.15);
    }
  }

  public playCameraShutter(): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Crisp mechanical shutter click + soft warm chime
    if (this.pinkNoiseShort) {
      const n = ctx.createBufferSource();
      n.buffer = this.pinkNoiseShort;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.28, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      n.connect(hp);
      hp.connect(g);
      g.connect(this.sfxBus);
      n.start(now);
      n.stop(now + 0.06);
    }

    const chime = ctx.createOscillator();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(1046.5, now + 0.04);
    const cGain = ctx.createGain();
    cGain.gain.setValueAtTime(0.0001, now + 0.04);
    cGain.gain.linearRampToValueAtTime(0.14, now + 0.055);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    chime.connect(cGain);
    cGain.connect(this.sfxBus);
    chime.start(now + 0.04);
    chime.stop(now + 0.38);
  }

  public playYarnTick(count: number): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const isComplete = count >= YARN_MAX_COUNT;
    const freq = isComplete
      ? 783.99
      : PENTATONIC_BAMBOO_NOTES[count % PENTATONIC_BAMBOO_NOTES.length].freq;

    const osc = ctx.createOscillator();
    osc.type = isComplete ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(isComplete ? 0.28 : 0.09, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, now + (isComplete ? 0.9 : 0.14));
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + (isComplete ? 0.95 : 0.16));
  }

  public playVendingDrop(): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Gentle mechanical chute thud + warm glass bottle clink + bright triad
    const chute = ctx.createOscillator();
    chute.type = 'triangle';
    chute.frequency.setValueAtTime(190, now);
    chute.frequency.exponentialRampToValueAtTime(95, now + 0.09);
    const chuteGain = ctx.createGain();
    chuteGain.gain.setValueAtTime(0.0001, now);
    chuteGain.gain.linearRampToValueAtTime(0.24, now + 0.01);
    chuteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    chute.connect(chuteGain);
    chuteGain.connect(this.sfxBus);
    chute.start(now);
    chute.stop(now + 0.16);

    const clinkNotes = [783.99, 1046.5, 1318.5];
    clinkNotes.forEach((freq, i) => {
      const t = now + 0.11 + i * 0.075;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  }

  public playGiftChime(): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Warm ascending rose-pink chime + soft affectionate chirp
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.065;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(t);
      osc.stop(t + 0.58);
    });

    // Happy soft cat reply meow slightly delayed
    const meowT = now + 0.22;
    const meow = ctx.createOscillator();
    meow.type = 'triangle';
    meow.frequency.setValueAtTime(680, meowT);
    meow.frequency.exponentialRampToValueAtTime(920, meowT + 0.08);
    meow.frequency.exponentialRampToValueAtTime(610, meowT + 0.24);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1350;
    bp.Q.value = 2.0;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(0.0001, meowT);
    mg.gain.linearRampToValueAtTime(0.18, meowT + 0.025);
    mg.gain.exponentialRampToValueAtTime(0.001, meowT + 0.26);
    meow.connect(bp);
    bp.connect(mg);
    mg.connect(this.sfxBus);
    meow.start(meowT);
    meow.stop(meowT + 0.28);
  }

  public playWoodPickup(): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Two crisp hollow wood knocks + soft cloth rustle
    [0, 0.09].forEach((offset, i) => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(i === 0 ? 290 : 340, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  public playFireStoke(): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Crackling hearth fire bursts + warm ember chord
    if (this.pinkNoiseShort) {
      for (let i = 0; i < 4; i++) {
        const t = now + i * 0.09;
        const src = ctx.createBufferSource();
        src.buffer = this.pinkNoiseShort;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1400 + i * 420;
        bp.Q.value = 2.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.sfxBus);
        src.start(t, Math.random() * 0.4);
        src.stop(t + 0.13);
      }
    }

    const chord = [440, 554.37, 659.25];
    chord.forEach((freq, i) => {
      const t = now + 0.08 + i * 0.06;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(t);
      osc.stop(t + 0.68);
    });
  }

  public playEggDipBubbles(): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Soft plunge splash
    if (this.pinkNoiseShort) {
      const splash = ctx.createBufferSource();
      splash.buffer = this.pinkNoiseShort;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 950;
      bp.Q.value = 1.1;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, now + 0.25);
      sg.gain.linearRampToValueAtTime(0.16, now + 0.34);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
      splash.connect(bp);
      bp.connect(sg);
      sg.connect(this.sfxBus);
      splash.start(now + 0.25);
      splash.stop(now + 0.72);
    }

    // 6 warm organic bubble pops while eggs steep in hot spring
    const offsets = [0.45, 0.72, 0.96, 1.25, 1.52, 1.82];
    offsets.forEach((off, idx) => {
      const t = now + off;
      const startF = 340 + (idx % 3) * 85;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startF, t);
      osc.frequency.exponentialRampToValueAtTime(startF * 1.95, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(t);
      osc.stop(t + 0.11);
    });
  }

  public playEggReadyChime(): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    [659.25, 880.0].forEach((freq, idx) => {
      const t = now + idx * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  public dispose(): void {
    this.disposed = true;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
