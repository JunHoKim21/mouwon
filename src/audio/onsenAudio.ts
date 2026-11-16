import {
  FootstepSurface,
  SpatialNatureMix,
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

function normalizeBufferRms(
  data: Float32Array,
  targetRms: number,
  activeLength: number,
  fadeTailSamples = 0,
): void {
  const n = Math.max(1, Math.min(data.length, activeLength));
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    sumSq += data[i] * data[i];
  }
  const rms = Math.sqrt(sumSq / n);
  const scale = targetRms / Math.max(rms, 1e-4);
  const ceiling = 0.94;
  for (let i = 0; i < data.length; i++) {
    const tailFade =
      fadeTailSamples > 0 && i >= data.length - fadeTailSamples
        ? (data.length - i) / fadeTailSamples
        : 1;
    data[i] = ceiling * Math.tanh((data[i] * scale) / ceiling) * tailFade;
  }
}

function createSnowCrunchBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 0.19;
  const length = Math.max(1024, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  // Soft wintry snow press ("사각- 뽀득") without harsh gravel crackle
  let grainEnv = 0.65;
  let grainCooldown = 0;
  let bodyLp = 0;
  let shearLp = 0;
  let smoothLp = 0;
  let dcPrevIn = 0;
  let dcPrevOut = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const normT = t / duration;

    const attack = Math.min(1, t / 0.025);
    const weightPeak = Math.exp(-Math.pow((normT - 0.36) / 0.25, 2));
    const settlePeak = 0.32 * Math.exp(-Math.pow((normT - 0.7) / 0.15, 2));
    const macroEnv = attack * (0.24 * Math.exp(-t * 15) + weightPeak + settlePeak);

    grainCooldown--;
    if (grainCooldown <= 0) {
      grainEnv = 0.58 + Math.random() * 0.42;
      grainCooldown = Math.floor(sampleRate * (0.002 + Math.random() * 0.0045));
    } else {
      grainEnv = 0.52 + (grainEnv - 0.52) * 0.96;
    }

    const rawWhite = Math.random() * 2 - 1;
    // Two-stage soft smoothing keeps crystal texture velvety instead of gritty sandpaper
    shearLp = shearLp * 0.72 + rawWhite * 0.28;
    smoothLp = smoothLp * 0.45 + shearLp * 0.55;
    const crunch = smoothLp * grainEnv * macroEnv;

    // Soft powdery snow cushion under paw
    bodyLp = bodyLp * 0.94 + rawWhite * 0.06;
    const padEnv = attack * Math.exp(-t * 20);
    const pad = bodyLp * 1.15 * padEnv;

    const combined = crunch + pad;
    const hp = 0.985 * (dcPrevOut + combined - dcPrevIn);
    dcPrevIn = combined;
    dcPrevOut = hp;
    data[i] = hp;
  }

  normalizeBufferRms(
    data,
    0.13,
    Math.floor(sampleRate * 0.14),
    Math.floor(sampleRate * 0.03),
  );
  return buffer;
}

function createWaterWadeBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 0.38;
  const length = Math.max(1024, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  // Fine trailing water droplet scatter ("차라락") after each splash stride (pure noise bursts)
  const splashFlicks: Array<{ start: number; dur: number; amp: number }> = [];
  for (let i = 0; i < 22; i++) {
    splashFlicks.push({
      start: 0.035 + Math.random() * 0.28,
      dur: 0.0016 + Math.random() * 0.0028,
      amp: 0.35 + Math.random() * 0.55,
    });
  }

  let warmMidLp = 0;
  let warmHpIn = 0;
  let warmHpOut = 0;
  let sprayLp = 0;
  let sprayHpIn = 0;
  let sprayHpOut = 0;
  let flutterTarget = 0.85;
  let flutter = 0.85;
  let flutterTick = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;

    // Clean "촤~아~" splash envelope: quick swell (22ms) -> sustained airy fan -> soft tail
    const attack = Math.min(1, t / 0.022);
    const tail = Math.exp(-Math.max(0, t - 0.028) * 10.2);
    const secondaryWash = 0.24 * Math.exp(-Math.pow((t - 0.115) / 0.048, 2));
    const splashEnv = attack * (tail + secondaryWash);

    // Gentle liquid droplet modulation (breaks flat hiss into sparkling splash without low thumps)
    flutterTick--;
    if (flutterTick <= 0) {
      flutterTarget = 0.65 + Math.random() * 0.35;
      flutterTick = Math.floor(sampleRate * (0.004 + Math.random() * 0.007));
    }
    flutter += (flutterTarget - flutter) * 0.06;

    const w1 = Math.random() * 2 - 1;
    const w2 = Math.random() * 2 - 1;

    // 1. Warm mid water-splash core (~380-1400Hz, zero sub-300Hz "투퉁" thud)
    warmMidLp = warmMidLp * 0.8 + w1 * 0.2;
    const warmMid = 0.94 * (warmHpOut + warmMidLp - warmHpIn);
    warmHpIn = warmMidLp;
    warmHpOut = warmMid;

    // 2. Soft "촤~" water-parting fan (~800-2400Hz, rolled off smoothly so it's never sharp)
    sprayLp = sprayLp * 0.68 + w2 * 0.32;
    const sprayBand = 0.88 * (sprayHpOut + sprayLp - sprayHpIn);
    sprayHpIn = sprayLp;
    sprayHpOut = sprayBand;

    // 3. Gentle surface spray droplets
    let flickEnv = 0;
    for (const f of splashFlicks) {
      const dt = t - f.start;
      if (dt >= 0 && dt < f.dur) {
        flickEnv += f.amp * (1 - dt / f.dur);
      }
    }

    data[i] =
      (warmMid * 0.85 + sprayBand * 0.58 * flutter) * splashEnv +
      sprayBand * 0.14 * flickEnv;
  }

  normalizeBufferRms(
    data,
    0.14,
    Math.floor(sampleRate * 0.22),
    Math.floor(sampleRate * 0.055),
  );
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
  private windSpatialGain: GainNode | null = null;
  private waterSpatialGain: GainNode | null = null;
  private cedarSpatialGain: GainNode | null = null;
  private bambooSpatialGain: GainNode | null = null;
  private waterwheelSpatialGain: GainNode | null = null;
  private purrBus: GainNode | null = null;
  private purrSpatialGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;

  private pinkNoiseShort: AudioBuffer | null = null;
  private snowCrunchBuffers: AudioBuffer[] = [];
  private waterWadeBuffers: AudioBuffer[] = [];
  private settings: AudioMixerSettings = { ...DEFAULT_MIXER_SETTINGS };
  private isIndoor = false;
  private initialized = false;
  private disposed = false;
  private suspendedByVisibility = false;
  private visibilityListenerAttached = false;

  private readonly handleVisibilityChange = (): void => {
    if (this.disposed || !this.ctx || typeof document === 'undefined') return;
    if (document.hidden) {
      if (this.ctx.state === 'running') {
        this.suspendedByVisibility = true;
        void this.ctx.suspend().catch(() => {});
      }
      return;
    }

    if (
      !this.settings.muted &&
      (this.suspendedByVisibility || this.isContextResumable(this.ctx))
    ) {
      this.suspendedByVisibility = false;
      void this.ctx.resume().catch(() => {});
    }
  };

  private isContextResumable(ctx: AudioContext): boolean {
    const state = ctx.state as string;
    return state === 'suspended' || state === 'interrupted';
  }

  private ensureVisibilityListener(): void {
    if (this.visibilityListenerAttached || typeof document === 'undefined') {
      return;
    }
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.visibilityListenerAttached = true;
  }

  private indoorMultiplier(): number {
    return this.isIndoor ? 0.32 : 1.0;
  }

  public unlock(): void {
    if (this.disposed) return;
    this.ensureVisibilityListener();
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
    if (this.isContextResumable(this.ctx)) {
      this.suspendedByVisibility = false;
      void this.ctx.resume().catch(() => {});
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
    this.snowCrunchBuffers = [
      createSnowCrunchBuffer(ctx),
      createSnowCrunchBuffer(ctx),
      createSnowCrunchBuffer(ctx),
      createSnowCrunchBuffer(ctx),
    ];
    this.waterWadeBuffers = [
      createWaterWadeBuffer(ctx),
      createWaterWadeBuffer(ctx),
      createWaterWadeBuffer(ctx),
      createWaterWadeBuffer(ctx),
    ];

    this.createWinterWind(ctx, ambientBus);
    this.createCedarFoliage(ctx, ambientBus);
    this.createBambooRustle(ctx, ambientBus);
    this.createWaterwheelSound(ctx, ambientBus);
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
    lpf1.frequency.value = 580;
    lpf1.Q.value = 0.55;

    const lpf2 = ctx.createBiquadFilter();
    lpf2.type = 'lowpass';
    lpf2.frequency.value = 520;
    lpf2.Q.value = 0.6;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.115;

    const windSpatialGain = ctx.createGain();
    windSpatialGain.gain.value = 1.0;
    this.windSpatialGain = windSpatialGain;

    // Primary slow breathing swell
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.048;

    const lfoGainDepth = ctx.createGain();
    lfoGainDepth.gain.value = 0.036;
    lfo.connect(lfoGainDepth);
    lfoGainDepth.connect(windGain.gain);

    const lfoFreqDepth = ctx.createGain();
    lfoFreqDepth.gain.value = 165;
    lfo.connect(lfoFreqDepth);
    lfoFreqDepth.connect(lpf2.frequency);

    // Secondary gentle valley gust
    const gustLfo = ctx.createOscillator();
    gustLfo.type = 'sine';
    gustLfo.frequency.value = 0.11;

    const gustGainDepth = ctx.createGain();
    gustGainDepth.gain.value = 0.018;
    gustLfo.connect(gustGainDepth);
    gustGainDepth.connect(windGain.gain);

    src.connect(hpf);
    hpf.connect(lpf1);
    lpf1.connect(lpf2);
    lpf2.connect(windGain);
    windGain.connect(windSpatialGain);
    windSpatialGain.connect(destination);

    src.start();
    lfo.start();
    gustLfo.start();
  }

  /**
   * Warm mid-band pine needle wind near cedar forest trees (700-1500Hz).
   */
  private createCedarFoliage(ctx: AudioContext, destination: AudioNode): void {
    const buf = createPinkNoiseBuffer(ctx, 7.2, 4096);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1050;
    bp.Q.value = 1.05;

    const spatialGain = ctx.createGain();
    spatialGain.gain.value = 0;
    this.cedarSpatialGain = spatialGain;

    const busScale = ctx.createGain();
    busScale.gain.value = 0.21;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.17;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 240;
    lfo.connect(lfoDepth);
    lfoDepth.connect(bp.frequency);

    const ampLfo = ctx.createOscillator();
    ampLfo.type = 'sine';
    ampLfo.frequency.value = 0.12;
    const ampDepth = ctx.createGain();
    ampDepth.gain.value = 0.065;
    ampLfo.connect(ampDepth);
    ampDepth.connect(busScale.gain);

    src.connect(bp);
    bp.connect(busScale);
    busScale.connect(spatialGain);
    spatialGain.connect(destination);

    src.start();
    lfo.start();
    ampLfo.start();
  }

  /**
   * Light crispy bamboo leaf rustle in the southwestern bamboo grove (2000-4000Hz + 1000Hz cane shimmer).
   */
  private createBambooRustle(ctx: AudioContext, destination: AudioNode): void {
    const buf = createPinkNoiseBuffer(ctx, 6.4, 4096);
    const spatialGain = ctx.createGain();
    spatialGain.gain.value = 0;
    this.bambooSpatialGain = spatialGain;
    spatialGain.connect(destination);

    // Layer 1: Distinct crisp bamboo leaf rustle (2000-4000Hz)
    const leafSrc = ctx.createBufferSource();
    leafSrc.buffer = buf;
    leafSrc.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2750;
    bp.Q.value = 1.2;

    const busScale = ctx.createGain();
    busScale.gain.value = 0.28;

    const swayLfo = ctx.createOscillator();
    swayLfo.type = 'sine';
    swayLfo.frequency.value = 0.26;
    const swayDepth = ctx.createGain();
    swayDepth.gain.value = 0.095;
    swayLfo.connect(swayDepth);
    swayDepth.connect(busScale.gain);

    const toneLfo = ctx.createOscillator();
    toneLfo.type = 'sine';
    toneLfo.frequency.value = 0.34;
    const toneDepth = ctx.createGain();
    toneDepth.gain.value = 540;
    toneLfo.connect(toneDepth);
    toneDepth.connect(bp.frequency);

    leafSrc.connect(bp);
    bp.connect(busScale);
    busScale.connect(spatialGain);

    // Layer 2: Soft hollow cane breeze undertone (~1050Hz)
    const caneSrc = ctx.createBufferSource();
    caneSrc.buffer = buf;
    caneSrc.loop = true;
    const caneBp = ctx.createBiquadFilter();
    caneBp.type = 'bandpass';
    caneBp.frequency.value = 1050;
    caneBp.Q.value = 1.15;
    const caneGain = ctx.createGain();
    caneGain.gain.value = 0.12;
    caneSrc.connect(caneBp);
    caneBp.connect(caneGain);
    caneGain.connect(spatialGain);

    leafSrc.start();
    caneSrc.start(0, 1.9);
    swayLfo.start();
    toneLfo.start();
  }

  /**
   * Warm, soothing 2-tier hot-spring waterfall sound (polyrhythmic cascade bands
   * rolled off smoothly at 1950Hz with slow organic flow breathing).
   */
  private createWaterwheelSound(ctx: AudioContext, destination: AudioNode): void {
    const buf = createPinkNoiseBuffer(ctx, 6.2, 2048);
    const spatialGain = ctx.createGain();
    spatialGain.gain.value = 0;
    this.waterwheelSpatialGain = spatialGain;

    // Gentle lowpass keeps the waterfall warm and soothing without sharp high hiss
    const warmthLpf = ctx.createBiquadFilter();
    warmthLpf.type = 'lowpass';
    warmthLpf.frequency.value = 1950;
    warmthLpf.Q.value = 0.55;
    warmthLpf.connect(spatialGain);
    spatialGain.connect(destination);

    const bands: Array<{ freq: number; q: number; rate: number; gain: number; offset: number }> = [
      { freq: 310, q: 0.65, rate: 0.82, gain: 1.25, offset: 0 },
      { freq: 740, q: 0.6, rate: 1.09, gain: 0.85, offset: 1.7 },
      { freq: 1380, q: 0.7, rate: 1.38, gain: 0.34, offset: 3.4 },
    ];

    const flowLfo = ctx.createOscillator();
    flowLfo.type = 'sine';
    flowLfo.frequency.value = 0.14;

    for (const band of bands) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = band.rate;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = band.freq;
      bp.Q.value = band.q;

      const g = ctx.createGain();
      g.gain.value = band.gain;

      const freqDepth = ctx.createGain();
      freqDepth.gain.value = band.freq * 0.08;
      flowLfo.connect(freqDepth);
      freqDepth.connect(bp.frequency);

      src.connect(bp);
      bp.connect(g);
      g.connect(warmthLpf);
      src.start(0, band.offset);
    }

    flowLfo.start();
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

  public updateSpatialVolumes(
    waterGain: number,
    purrProximity: number,
    natureMix?: SpatialNatureMix,
  ): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.waterSpatialGain?.gain.setTargetAtTime(waterGain, now, 0.12);
    this.purrSpatialGain?.gain.setTargetAtTime(0.05 + purrProximity * 0.55, now, 0.18);
    if (natureMix) {
      this.cedarSpatialGain?.gain.setTargetAtTime(natureMix.cedarGain, now, 0.2);
      this.bambooSpatialGain?.gain.setTargetAtTime(natureMix.bambooGain, now, 0.2);
      this.waterwheelSpatialGain?.gain.setTargetAtTime(natureMix.waterwheelGain, now, 0.16);
      // Duck base open-field wind near bamboo grove, waterwheel, or cedar forest so local sounds shine
      const windDuck = Math.max(
        0.34,
        1 -
          natureMix.bambooGain * 0.62 -
          natureMix.waterwheelGain * 0.54 -
          natureMix.cedarGain * 0.34,
      );
      this.windSpatialGain?.gain.setTargetAtTime(windDuck, now, 0.22);
    }
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

    if (surface === 'snow' && this.snowCrunchBuffers.length > 0) {
      // Soft velvety winter snow press ("사각- 뽀득") matched to stone footstep loudness
      const buf =
        this.snowCrunchBuffers[Math.floor(Math.random() * this.snowCrunchBuffers.length)];
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.92 + Math.random() * 0.16;

      const warmthLpf = ctx.createBiquadFilter();
      warmthLpf.type = 'lowpass';
      warmthLpf.frequency.value = 2650 + Math.random() * 450;
      warmthLpf.Q.value = 0.65;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16 + Math.random() * 0.03, now);

      src.connect(warmthLpf);
      warmthLpf.connect(g);
      g.connect(this.sfxBus);
      src.start(now);
      src.stop(now + 0.22);
    } else if (surface === 'wood') {
      // Hollow cedar/hinoki board tap + subtle wood grain knock
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(188 + Math.random() * 28, now);
      osc.frequency.exponentialRampToValueAtTime(92, now + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.14, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.068);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.start(now);
      osc.stop(now + 0.072);

      const body = ctx.createOscillator();
      body.type = 'triangle';
      body.frequency.setValueAtTime(390 + Math.random() * 50, now);
      body.frequency.exponentialRampToValueAtTime(210, now + 0.032);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, now);
      bg.gain.linearRampToValueAtTime(0.055, now + 0.003);
      bg.gain.exponentialRampToValueAtTime(0.001, now + 0.038);
      body.connect(bg);
      bg.connect(this.sfxBus);
      body.start(now);
      body.stop(now + 0.042);
    } else if (surface === 'stone') {
      // Crisp mineral tap + fine grit scatter on stone flagstone / stepping stones
      const tap = ctx.createOscillator();
      tap.type = 'triangle';
      tap.frequency.setValueAtTime(620 + Math.random() * 140, now);
      tap.frequency.exponentialRampToValueAtTime(260, now + 0.038);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.0001, now);
      tg.gain.linearRampToValueAtTime(0.11, now + 0.003);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      tap.connect(tg);
      tg.connect(this.sfxBus);
      tap.start(now);
      tap.stop(now + 0.05);

      if (this.pinkNoiseShort) {
        const grit = ctx.createBufferSource();
        grit.buffer = this.pinkNoiseShort;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2500 + Math.random() * 500;
        bp.Q.value = 2.0;
        const gg = ctx.createGain();
        gg.gain.setValueAtTime(0.0001, now);
        gg.gain.linearRampToValueAtTime(0.06, now + 0.004);
        gg.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
        grit.connect(bp);
        bp.connect(gg);
        gg.connect(this.sfxBus);
        grit.start(now, Math.random() * 0.5);
        grit.stop(now + 0.048);
      }
    } else if (surface === 'water' && this.waterWadeBuffers.length > 0) {
      // Soft rounded water-parting splash ("촤~ 촤~") without sharp high hiss or low thuds
      const buf =
        this.waterWadeBuffers[Math.floor(Math.random() * this.waterWadeBuffers.length)];
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.92 + Math.random() * 0.14;

      const waterHpf = ctx.createBiquadFilter();
      waterHpf.type = 'highpass';
      waterHpf.frequency.value = 340;

      const waterLpf = ctx.createBiquadFilter();
      waterLpf.type = 'lowpass';
      waterLpf.frequency.value = 2150 + Math.random() * 400;
      waterLpf.Q.value = 0.5;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.15 + Math.random() * 0.025, now);

      src.connect(waterHpf);
      waterHpf.connect(waterLpf);
      waterLpf.connect(g);
      g.connect(this.sfxBus);
      src.start(now);
      src.stop(now + 0.42);
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

  public playGroomSound(): void {
    this.unlock();
    if (!this.ctx || !this.sfxBus || this.settings.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Two gentle paw-brushing swishes (filtered soft noise)
    [0.08, 0.72].forEach((offset) => {
      if (!this.pinkNoiseShort) return;
      const t = now + offset;
      const src = ctx.createBufferSource();
      src.buffer = this.pinkNoiseShort;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1450, t);
      bp.frequency.exponentialRampToValueAtTime(920, t + 0.24);
      bp.Q.value = 1.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.085, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxBus!);
      src.start(t);
      src.stop(t + 0.31);
    });

    // Warm soft purr hum underneath grooming
    const hum = ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.setValueAtTime(148, now + 0.12);
    hum.frequency.exponentialRampToValueAtTime(176, now + 0.55);
    const humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0.0001, now + 0.12);
    humGain.gain.linearRampToValueAtTime(0.045, now + 0.25);
    humGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    hum.connect(humGain);
    humGain.connect(this.sfxBus);
    hum.start(now + 0.12);
    hum.stop(now + 0.98);
  }

  public dispose(): void {
    this.disposed = true;
    this.suspendedByVisibility = false;
    if (this.visibilityListenerAttached && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListenerAttached = false;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
