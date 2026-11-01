import { Music } from './music.js';

/**
 * All game audio, made live with the Web Audio API (no sound files).
 *
 *   audio.play('harpoon')          a sound effect (see SOUNDS below)
 *   audio.setMusic('shallows')     crossfade to a depth's music ('menu', a theme id, or null)
 *   audio.setDuck(true)            muffle the music (pause, level-up screens)
 *   audio.setIntensity('boss')     extra tension in the music while a final boss is up
 *
 * Browsers only allow sound after the player clicks or presses a key, so the audio
 * starts on the first input. Until then every call is silently ignored.
 *
 * Busy moments can ask for the same sound dozens of times a tick (a pulse hitting 30
 * fish), so each sound has a `gap`: it won't restart sooner than that, and there's a
 * cap on how many voices play at once.
 */

const SETTINGS_KEY = 'fathom:audio';
const MAX_VOICES = 32;
const LEVELS = { master: 0.9, sfx: 0.85, music: 0.4 };

export class Audio {
  constructor() {
    this.ctx = null;
    this.settings = loadSettings();
    this.lastPlayed = new Map();
    this.voices = 0;
    this.musicTheme = 'menu';
    this.ducked = false;
    this.intensity = 'calm';
    this.pearlStep = 0;
    this.lastPearl = -1;

    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // Go quiet while the tab is hidden (the game pauses too).
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      const change = document.hidden ? this.ctx.suspend() : this.ctx.resume();
      change?.catch(() => {}); // e.g. the context was closed; nothing to do
    });
  }

  /** Create the audio graph on the first click or key press. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    this.ctx = ctx;

    // master → gentle limiter → speakers
    this.master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    this.master.connect(limiter).connect(ctx.destination);

    // sound effects, with their own reverb ("underwater" space)
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.sfxReverb = ctx.createConvolver();
    this.sfxReverb.buffer = makeImpulse(ctx, 2.2, 3);
    this.sfxReverb.connect(this.sfxBus);

    // music → duck filter → music volume → master
    this.musicIn = ctx.createGain();
    this.duckFilter = ctx.createBiquadFilter();
    this.duckFilter.type = 'lowpass';
    this.duckFilter.frequency.value = 20000;
    this.duckGain = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.musicIn.connect(this.duckFilter).connect(this.duckGain).connect(this.musicBus).connect(this.master);
    this.musicReverb = ctx.createConvolver();
    this.musicReverb.buffer = makeImpulse(ctx, 4.5, 2.2);
    this.musicReverb.connect(this.musicIn);

    this.noiseBuffer = makeNoise(ctx, 2, 'white');
    this.brownBuffer = makeNoise(ctx, 4, 'brown');

    this.applySettings();
    this.music = new Music(this);
    this.music.play(this.musicTheme);
    this.music.setIntensity(this.intensity);
    this.setDuck(this.ducked);
  }

  get ready() {
    return Boolean(this.ctx) && this.ctx.state !== 'closed';
  }

  // ------------------------------------------------------------ settings

  applySettings() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : LEVELS.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx ? LEVELS.sfx : 0, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music ? LEVELS.music : 0, t, 0.3);
  }

  setSetting(key, value) {
    this.settings[key] = value;
    saveSettings(this.settings);
    this.applySettings();
  }

  toggleMute() {
    this.setSetting('muted', !this.settings.muted);
    return this.settings.muted;
  }

  // ------------------------------------------------------------ music

  setMusic(theme) {
    this.musicTheme = theme;
    this.music?.play(theme);
  }

  /** Muffle the music (true) or bring it back (false). */
  setDuck(on) {
    this.ducked = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duckFilter.frequency.setTargetAtTime(on ? 650 : 20000, t, on ? 0.08 : 0.25);
    this.duckGain.gain.setTargetAtTime(on ? 0.6 : 1, t, 0.15);
  }

  setIntensity(level) {
    this.intensity = level;
    this.music?.setIntensity(level);
  }

  // ------------------------------------------------------------ effects

  /** Play sound effect `name` (see SOUNDS). `opts` depend on the sound. */
  play(name, opts = {}) {
    if (!this.ready || this.settings.muted || !this.settings.sfx) return;
    const sound = SOUNDS[name];
    if (!sound) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < (sound.gap ?? 0.03)) return;
    if (this.voices >= MAX_VOICES && !sound.important) return;
    this.lastPlayed.set(name, now);
    sound.play(this, now + 0.005, opts);
  }

  /** One oscillator note with an envelope. Times in seconds, `at` is absolute. */
  tone({ at, type = 'sine', freq, to = null, dur, attack = 0.005, gain = 0.2, filter = null, q = 0.8, verb = 0, out = null }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + dur);
    const env = ctx.createGain();
    envelope(env.gain, at, attack, dur, gain);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      f.Q.value = q;
      node.connect(f);
      node = f;
    }
    node.connect(env);
    this.route(env, out ?? this.sfxBus, verb);
    this.start(osc, at, dur);
    return osc;
  }

  /** A burst of filtered noise (whooshes, splashes, impacts). */
  noise({ at, dur, type = 'bandpass', freq = 1000, to = null, q = 1, gain = 0.2, attack = 0.003, verb = 0, brown = false, out = null }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brownBuffer : this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    f.Q.value = q;
    const env = ctx.createGain();
    envelope(env.gain, at, attack, dur, gain);
    src.connect(f).connect(env);
    this.route(env, out ?? this.sfxBus, verb);
    this.start(src, at, dur, Math.random() * 1.5);
    return src;
  }

  route(node, out, verb) {
    node.connect(out);
    if (verb > 0) {
      const send = this.ctx.createGain();
      send.gain.value = verb;
      node.connect(send).connect(out === this.sfxBus ? this.sfxReverb : this.musicReverb);
    }
  }

  start(src, at, dur, offset = 0) {
    this.voices++;
    src.onended = () => {
      this.voices--;
      src.disconnect();
    };
    src.start(at, offset);
    src.stop(at + dur + 0.05);
  }
}

// ---------------------------------------------------------------- helpers

/** Attack to `peak`, then an exponential fade to silence by `at + dur`. */
function envelope(param, at, attack, dur, peak) {
  param.setValueAtTime(0.0001, at);
  param.linearRampToValueAtTime(peak, at + Math.min(attack, dur * 0.9));
  param.exponentialRampToValueAtTime(0.0001, at + dur);
}

function makeNoise(ctx, seconds, kind) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

/** A soft, dark reverb tail: decaying noise, duller toward the end (sound in water). */
function makeImpulse(ctx, seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const k = 0.15 + 0.8 * t; // more smoothing (duller) as it fades
      smooth += (Math.random() * 2 - 1 - smooth) * (1 - k);
      data[i] = smooth * Math.pow(1 - t, decay);
    }
  }
  return buffer;
}

const vary = (x, amount = 0.06) => x * (1 + (Math.random() * 2 - 1) * amount);
const semis = (base, n) => base * Math.pow(2, n / 12);
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

function loadSettings() {
  const defaults = { muted: false, music: true, sfx: true };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode): settings just won't persist
  }
}

// ---------------------------------------------------------------- the sounds

/**
 * Sound recipes. Each: { gap, important?, play(audio, at, opts) }.
 * `gap` = shortest time between two plays of the same sound; `important` sounds
 * still play when the voice cap is reached.
 */
const SOUNDS = {
  // ---- weapons
  harpoon: {
    gap: 0.06,
    play(a, at) {
      a.noise({ at, dur: 0.2, freq: 2400, to: 500, q: 1.2, gain: 0.26 }); // whoosh
      a.tone({ at, type: 'triangle', freq: vary(260), to: 120, dur: 0.14, gain: 0.16 }); // line twang
      a.tone({ at, freq: 75, to: 48, dur: 0.1, gain: 0.16 }); // gun thump
    },
  },
  darts: {
    gap: 0.05,
    play(a, at) {
      a.noise({ at, dur: 0.07, type: 'highpass', freq: 2600, gain: 0.13 });
      a.tone({ at, freq: vary(1700), to: 1000, dur: 0.06, gain: 0.05 });
    },
  },
  droneLaunch: {
    gap: 0.1,
    play(a, at) {
      a.tone({ at, type: 'square', freq: 150, to: 60, dur: 0.12, gain: 0.07, filter: 700 }); // pneumatic thunk
      a.noise({ at, dur: 0.16, type: 'lowpass', freq: 900, to: 300, gain: 0.22 });
      a.tone({ at: at + 0.06, freq: vary(600), to: 1300, dur: 0.14, gain: 0.045 }); // pod flies off
    },
  },
  droneDeploy: {
    gap: 0.05,
    play(a, at) {
      a.tone({ at, freq: 900, dur: 0.06, gain: 0.045, verb: 0.2 });
      a.tone({ at: at + 0.06, freq: 1350, dur: 0.09, gain: 0.04, verb: 0.2 });
    },
  },
  droneShot: {
    gap: 0.035,
    play(a, at) {
      // a short laser zap
      a.tone({ at, type: 'sawtooth', freq: vary(2600, 0.1), to: 700, dur: 0.06, gain: 0.025, filter: 4000 });
      a.tone({ at, freq: vary(1300, 0.1), to: 500, dur: 0.05, gain: 0.02 });
    },
  },
  sonar: {
    gap: 0.15,
    play(a, at, { big = false } = {}) {
      const f = big ? 880 : vary(1180, 0.015);
      a.tone({ at, freq: f, to: f * 0.95, dur: big ? 0.9 : 0.5, gain: big ? 0.16 : 0.09, verb: 0.55 });
      a.tone({ at, freq: f * 2, dur: 0.18, gain: 0.015 });
    },
  },
  starfish: {
    gap: 0.07,
    play(a, at) {
      a.noise({ at, dur: 0.06, type: 'highpass', freq: 4500, to: 7000, gain: 0.1 }); // slice
      a.tone({ at, type: 'triangle', freq: vary(2800, 0.08), to: 2400, dur: 0.07, gain: 0.035 });
    },
  },
  zap: {
    gap: 0.06,
    play(a, at, { big = false } = {}) {
      // an electric crackle with a buzzing body
      a.noise({ at, dur: 0.12, freq: vary(3600, 0.15), q: 0.9, gain: big ? 0.38 : 0.28 });
      a.tone({ at, type: 'sawtooth', freq: vary(110, 0.1), dur: 0.13, gain: big ? 0.15 : 0.11, filter: 2600 });
      a.tone({ at, type: 'square', freq: vary(1900, 0.12), to: 600, dur: 0.08, gain: 0.05, filter: 5000 });
      a.noise({ at: at + 0.04, dur: 0.05, type: 'highpass', freq: 5000, gain: 0.12 });
    },
  },
  squirt: {
    gap: 0.12,
    play(a, at) {
      // a thick, wet whoosh of ink
      a.noise({ at, dur: 0.28, type: 'lowpass', freq: 900, to: 180, gain: 0.24, brown: true });
      a.tone({ at, freq: vary(150), to: 70, dur: 0.16, gain: 0.1 });
      a.noise({ at, dur: 0.1, freq: 1400, to: 500, q: 2, gain: 0.05 });
    },
  },
  thrust: {
    gap: 0.05,
    play(a, at) {
      // a quick swish through the water and a dull metal ring
      a.noise({ at, dur: 0.1, freq: vary(1900, 0.1), to: 700, q: 1.4, gain: 0.3 });
      a.tone({ at: at + 0.02, type: 'triangle', freq: vary(520, 0.05), to: 470, dur: 0.12, gain: 0.08 });
    },
  },
  bubbleShot: {
    gap: 0.08,
    play(a, at) {
      // a round "bloop"
      a.tone({ at, freq: vary(200, 0.08), to: 480, dur: 0.14, gain: 0.18 });
      a.noise({ at, dur: 0.06, type: 'lowpass', freq: 800, gain: 0.05 });
    },
  },
  bubbleTrap: {
    gap: 0.06,
    play(a, at) {
      // a soft gloop as the bubble closes around something
      a.tone({ at, freq: vary(320, 0.1), to: 180, dur: 0.12, gain: 0.07, verb: 0.2 });
    },
  },
  bubblePop: {
    gap: 0.04,
    play(a, at) {
      a.tone({ at, freq: vary(700, 0.15), to: 1600, dur: 0.05, gain: 0.11 });
      a.noise({ at, dur: 0.035, type: 'highpass', freq: 3000, gain: 0.07 });
    },
  },
  lureCast: {
    gap: 0.15,
    play(a, at) {
      // a line whipping out, then a faint glassy shimmer as the lure lights up
      a.noise({ at, dur: 0.12, type: 'highpass', freq: 2500, to: 5000, gain: 0.05 });
      a.tone({ at: at + 0.25, freq: 880, to: 1320, dur: 0.25, gain: 0.045, verb: 0.45 });
      a.tone({ at: at + 0.3, freq: 1760, dur: 0.35, gain: 0.02, verb: 0.55 });
    },
  },
  chomp: {
    gap: 0.1,
    important: true,
    play(a, at) {
      // huge jaws slamming shut: a crunch on a deep thud
      a.tone({ at, type: 'square', freq: 95, to: 45, dur: 0.15, gain: 0.12, filter: 700 });
      a.noise({ at, dur: 0.18, type: 'lowpass', freq: 1500, to: 280, gain: 0.3 });
      a.tone({ at, freq: 62, to: 38, dur: 0.24, gain: 0.25 });
      a.noise({ at: at + 0.02, dur: 0.05, type: 'highpass', freq: 3500, gain: 0.08 });
    },
  },
  snap: {
    gap: 0.1,
    important: true,
    play(a, at, { big = false } = {}) {
      // the claw: one sharp, deafening crack
      a.noise({ at, dur: 0.035, type: 'highpass', freq: 1800, gain: big ? 0.42 : 0.34 });
      a.tone({ at, freq: 2600, to: 280, dur: 0.035, gain: 0.09 });
      a.noise({ at, dur: 0.12, freq: 900, q: 1.2, gain: 0.12, verb: 0.3 });
    },
  },
  snapBurst: {
    gap: 0.06,
    play(a, at, { small = false } = {}) {
      // the bubble collapsing: a pop on a low boom
      const g = small ? 0.5 : 1;
      a.tone({ at, freq: vary(170, 0.08), to: 50, dur: 0.26, gain: 0.22 * g });
      a.noise({ at, dur: 0.3, type: 'lowpass', freq: 1500, to: 200, gain: 0.24 * g, verb: 0.25 });
      a.tone({ at, freq: vary(900, 0.1), to: 1800, dur: 0.04, gain: 0.06 * g });
    },
  },
  sting: {
    gap: 0.07,
    play(a, at) {
      // a tiny electric prickle
      a.tone({ at, type: 'triangle', freq: vary(3200, 0.12), to: 2100, dur: 0.035, gain: 0.035 });
      a.noise({ at, dur: 0.025, type: 'highpass', freq: 6000, gain: 0.045 });
    },
  },
  eyeLock: {
    gap: 0.4,
    play(a, at, { big = false } = {}) {
      // an uneasy, beating chord as the eye fixes on something
      a.tone({ at, freq: 220, dur: 0.7, attack: 0.08, gain: big ? 0.08 : 0.055, verb: 0.6 });
      a.tone({ at, freq: 233, dur: 0.7, attack: 0.08, gain: big ? 0.07 : 0.045, verb: 0.6 });
      a.tone({ at, type: 'triangle', freq: 110, to: 92, dur: 0.6, attack: 0.05, gain: 0.05 });
    },
  },
  eyeBurn: {
    gap: 0.35,
    play(a, at, { heat = 0 } = {}) {
      // a sizzle that climbs and thickens as the gaze heats up
      a.noise({ at, dur: 0.32, freq: 1800 + heat * 3200, q: 2.2, gain: 0.025 + heat * 0.05 });
      a.tone({ at, type: 'sawtooth', freq: 80 + heat * 120, dur: 0.3, gain: 0.015 + heat * 0.025, filter: 900 });
    },
  },
  song: {
    gap: 1,
    play(a, at) {
      // a squeezebox flourish: a quick reedy arpeggio as Jory starts a new song
      const notes = [0, 4, 7, 12];
      notes.forEach((n, i) => {
        const f = semis(220, n);
        a.tone({ at: at + i * 0.07, type: 'square', freq: f, dur: 0.22, attack: 0.02, gain: 0.035, filter: 1400, verb: 0.3 });
        a.tone({ at: at + i * 0.07, type: 'sawtooth', freq: f * 1.005, dur: 0.22, attack: 0.02, gain: 0.02, filter: 1200 });
      });
    },
  },
  coralBreak: {
    gap: 0.08,
    important: true,
    play(a, at) {
      // a coral plate cracking off: a brittle crunch and a hollow knock
      a.noise({ at, dur: 0.09, type: 'highpass', freq: 2200, gain: 0.2 });
      a.noise({ at: at + 0.02, dur: 0.12, freq: 900, q: 2, gain: 0.12 });
      a.tone({ at, freq: vary(320), to: 180, dur: 0.1, gain: 0.1 });
    },
  },
  overcharge: {
    gap: 0.2,
    important: true,
    play(a, at) {
      a.noise({ at, dur: 0.25, freq: 400, to: 3200, q: 3, gain: 0.18 });
      a.tone({ at, type: 'sawtooth', freq: 90, to: 45, dur: 0.3, gain: 0.1, filter: 1200 });
      a.tone({ at, type: 'square', freq: 1500, to: 3000, dur: 0.12, gain: 0.035, filter: 5000 });
    },
  },

  // ---- enemies
  hit: {
    gap: 0.03,
    play(a, at, { size = 12 } = {}) {
      const f = vary(Math.min(320, Math.max(80, 2800 / size)), 0.1);
      a.tone({ at, freq: f, to: f * 0.5, dur: 0.08, gain: 0.17 }); // body thud, lower for bigger fish
      a.noise({ at, dur: 0.05, type: 'lowpass', freq: 1600, gain: 0.13 }); // splash of the impact
    },
  },
  bigHit: {
    gap: 0.08,
    play(a, at) {
      a.tone({ at, freq: vary(90), to: 55, dur: 0.14, gain: 0.24 });
      a.noise({ at, dur: 0.09, type: 'lowpass', freq: 800, gain: 0.16 });
    },
  },
  kill: {
    gap: 0.035,
    play(a, at) {
      const f = vary(300, 0.15);
      a.tone({ at, freq: f, to: f * 2.4, dur: 0.09, gain: 0.11 }); // a bubble popping
    },
  },
  bigKill: {
    gap: 0.3,
    important: true,
    play(a, at) {
      a.tone({ at, freq: 80, to: 30, dur: 1.0, gain: 0.45 });
      a.noise({ at, dur: 0.9, type: 'lowpass', freq: 600, to: 120, gain: 0.4, verb: 0.3 });
      for (let i = 0; i < 7; i++) {
        const f = 300 + Math.random() * 600;
        a.tone({ at: at + 0.1 + i * 0.07 + Math.random() * 0.05, freq: f, to: f * 2, dur: 0.06, gain: 0.04, verb: 0.4 });
      }
    },
  },
  enemyShot: {
    gap: 0.06,
    play(a, at) {
      a.noise({ at, dur: 0.08, freq: 1000, q: 2, gain: 0.05 });
      a.tone({ at, freq: 500, to: 300, dur: 0.06, gain: 0.025 });
    },
  },
  slam: {
    gap: 0.1,
    important: true,
    play(a, at) {
      a.tone({ at, freq: 70, to: 35, dur: 0.4, gain: 0.28 });
      a.noise({ at, dur: 0.3, type: 'lowpass', freq: 500, to: 150, gain: 0.24, verb: 0.2 });
    },
  },
  eliteArrive: {
    gap: 1,
    important: true,
    play(a, at) {
      horn(a, at, 73.4, 1.8, 0.11);
    },
  },
  bossArrive: {
    gap: 1,
    important: true,
    play(a, at) {
      horn(a, at, 55, 3, 0.14);
      horn(a, at + 1.1, 41.2, 2.6, 0.1);
    },
  },
  warning: {
    gap: 1,
    important: true,
    play(a, at) {
      a.noise({ at, dur: 1.1, freq: 200, to: 650, q: 2, gain: 0.08, attack: 0.45, verb: 0.3 });
      a.tone({ at, freq: 110, to: 104, dur: 1.1, gain: 0.07, attack: 0.45 });
    },
  },

  // ---- the diver
  hurt: {
    gap: 0.12,
    important: true,
    play(a, at) {
      a.tone({ at, type: 'sawtooth', freq: 170, to: 70, dur: 0.22, gain: 0.16, filter: 700 });
      a.noise({ at, dur: 0.16, type: 'lowpass', freq: 600, gain: 0.2 });
    },
  },
  death: {
    gap: 1,
    important: true,
    play(a, at) {
      [0, -3, -7, -12].forEach((n, i) => {
        a.tone({ at: at + i * 0.28, type: 'sawtooth', freq: semis(220, n), dur: 0.7, gain: 0.07, filter: 600, attack: 0.03, verb: 0.4 });
      });
      a.noise({ at, dur: 1.6, type: 'lowpass', freq: 500, to: 80, gain: 0.25, attack: 0.05 });
    },
  },

  // ---- pickups and progress
  pearl: {
    gap: 0.03,
    play(a, at) {
      // Pearls collected in quick succession climb a scale.
      a.pearlStep = at - a.lastPearl < 0.5 ? Math.min(PENTATONIC.length - 1, a.pearlStep + 1) : 0;
      a.lastPearl = at;
      const f = semis(880, PENTATONIC[a.pearlStep]);
      a.tone({ at, type: 'triangle', freq: f, dur: 0.09, gain: 0.04 });
      a.tone({ at, freq: f * 2, dur: 0.05, gain: 0.012 });
    },
  },
  heal: {
    gap: 0.1,
    play(a, at) {
      a.tone({ at, freq: 523, dur: 0.25, gain: 0.09, verb: 0.3 });
      a.tone({ at: at + 0.08, freq: 784, dur: 0.3, gain: 0.09, verb: 0.3 });
    },
  },
  magnet: {
    gap: 0.2,
    play(a, at) {
      a.tone({ at, freq: 300, to: 1400, dur: 0.45, gain: 0.09, verb: 0.3 });
      a.noise({ at, dur: 0.4, freq: 800, to: 4000, q: 1.5, gain: 0.04 });
    },
  },
  chest: {
    gap: 0.2,
    important: true,
    play(a, at, { trinket = false } = {}) {
      const notes = trinket ? [0, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
      notes.forEach((n, i) => {
        a.tone({ at: at + i * 0.07, type: 'triangle', freq: semis(523, n), dur: 0.45, gain: 0.08, verb: 0.4 });
      });
      if (trinket) shimmer(a, at + 0.3);
    },
  },
  levelUp: {
    gap: 0.2,
    important: true,
    play(a, at) {
      [0, 4, 7, 11, 14].forEach((n, i) => bell(a, at + i * 0.06, semis(440, n), 0.07));
    },
  },
  talent: {
    gap: 0.2,
    important: true,
    play(a, at) {
      [0, 7, 12, 16, 19].forEach((n, i) => bell(a, at + i * 0.09, semis(220, n), 0.08));
      a.tone({ at, freq: 110, dur: 1.6, gain: 0.09, attack: 0.3, verb: 0.5 });
    },
  },
  trinket: {
    gap: 0.2,
    important: true,
    play(a, at) {
      shimmer(a, at);
      bell(a, at + 0.1, 1046, 0.06);
    },
  },
  select: {
    gap: 0.05,
    important: true,
    play(a, at) {
      a.tone({ at, type: 'triangle', freq: 660, dur: 0.06, gain: 0.08 });
      a.tone({ at: at + 0.04, freq: 990, dur: 0.09, gain: 0.05 });
    },
  },
  heartbeat: {
    gap: 1,
    important: true,
    play(a, at) {
      // Matches the two dark pulses drawn by drawHeartbeat (at 0.15 s and 0.6 s).
      for (const [t, k] of [[0.15, 1], [0.6, 0.8]]) {
        a.tone({ at: at + t, freq: 62, to: 38, dur: 0.3, gain: 0.5 * k });
        a.tone({ at: at + t, freq: 130, to: 80, dur: 0.1, gain: 0.14 * k });
      }
    },
  },

  // ---- old-god teases
  omen: {
    gap: 2,
    important: true,
    play(a, at, { close = false } = {}) {
      // a whale-like moan from far below
      const base = close ? 70 : 92;
      const dur = close ? 4.6 : 3.6;
      const g = close ? 0.3 : 0.18;
      const osc = a.tone({ at, freq: base, to: base * 0.66, dur, gain: g, attack: 1.1, verb: 0.8 });
      const lfo = a.ctx.createOscillator();
      const depth = a.ctx.createGain();
      lfo.frequency.value = 4.5;
      depth.gain.value = base * 0.02;
      lfo.connect(depth).connect(osc.frequency);
      a.start(lfo, at, dur);
      a.tone({ at: at + 0.2, freq: base * 1.5, to: base, dur: dur * 0.85, gain: g * 0.3, attack: 1, verb: 0.8 });
      if (close) a.noise({ at, dur: dur, type: 'lowpass', freq: 160, gain: 0.25, attack: 1.2, brown: true });
    },
  },
};

/** A low brass-like horn: two detuned saws through a filter that opens and closes. */
function horn(a, at, freq, dur, gain) {
  const ctx = a.ctx;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 2;
  f.frequency.setValueAtTime(220, at);
  f.frequency.linearRampToValueAtTime(1000, at + dur * 0.4);
  f.frequency.linearRampToValueAtTime(220, at + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(gain, at + dur * 0.25);
  env.gain.setValueAtTime(gain, at + dur * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  for (const detune of [-7, 7]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(f);
    a.start(osc, at, dur);
  }
  f.connect(env);
  a.route(env, a.sfxBus, 0.45);
  a.tone({ at, freq: freq / 2, dur, gain: gain * 1.4, attack: dur * 0.25 });
}

/** A struck bell: a pure tone plus a quieter inharmonic overtone, long decay. */
function bell(a, at, freq, gain) {
  a.tone({ at, freq, dur: 1.1, gain, verb: 0.5 });
  a.tone({ at, freq: freq * 2.76, dur: 0.5, gain: gain * 0.25, verb: 0.5 });
}

/** Glittering high notes (trinkets). */
function shimmer(a, at) {
  [1568, 2093, 2637, 3136, 2349].forEach((f, i) => {
    a.tone({ at: at + i * 0.045 + Math.random() * 0.02, freq: f, dur: 0.5, gain: 0.025, verb: 0.7 });
  });
}
