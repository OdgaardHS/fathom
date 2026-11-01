/**
 * Ambient music, generated live: no audio files and no fixed loop, so it never repeats
 * exactly. Each theme is a slow chord progression played by soft pads, a low drone, sparse
 * bell notes, and a constant filtered-noise "sea" underneath. Themes crossfade.
 *
 * A theme (MUSIC_THEMES):
 *   root       MIDI note the chords are built on (50 = D3)
 *   chords     each chord = semitones above `root`, lowest note first
 *   chordTime  seconds per chord (the pads overlap, so changes are soft)
 *   cutoff     brightness of the pads (low-pass filter, Hz)
 *   pad        pad volume
 *   bells      { scale, base (MIDI), every: [min, max] seconds, gain } sparse melody notes
 *   bass       low drone volume (0 = none)
 *   sea        noise bed volume
 *   whale      optional [min, max] seconds between distant whale-like moans
 *
 * Intensity 'boss' adds a slow heartbeat pulse and moves the chords along faster.
 */

const SHALLOWS_CHORDS = [
  [0, 7, 14, 16], // D add9
  [-3, 4, 9, 12], // B minor
  [-7, -3, 4, 9], // G maj7
  [-5, 2, 7, 11], // A
];

const OPEN_BLUE_CHORDS = [
  [0, 7, 12, 15], // A minor
  [-4, 3, 8, 12], // F
  [-7, 0, 5, 8], // D minor
  [-5, 2, 7, 10], // E minor
];

export const MUSIC_THEMES = {
  menu: {
    root: 50,
    chords: SHALLOWS_CHORDS,
    chordTime: 12,
    cutoff: 750,
    pad: 0.045,
    bells: { scale: [0, 2, 4, 7, 9], base: 74, every: [4, 9], gain: 0.022 },
    bass: 0,
    sea: 0.05,
  },
  shallows: {
    root: 50,
    chords: SHALLOWS_CHORDS,
    chordTime: 9,
    cutoff: 1500,
    pad: 0.05,
    bells: { scale: [0, 2, 4, 7, 9], base: 74, every: [1.6, 4.5], gain: 0.03 },
    bass: 0.05,
    sea: 0.035,
  },
  openblue: {
    root: 45,
    chords: OPEN_BLUE_CHORDS,
    chordTime: 12,
    cutoff: 850,
    pad: 0.055,
    bells: { scale: [0, 3, 5, 7, 10], base: 69, every: [3, 8], gain: 0.026 },
    bass: 0.06,
    sea: 0.05,
    whale: [16, 32],
  },
};

const LOOKAHEAD = 1.2; // seconds of music scheduled ahead of time
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (min, max) => min + Math.random() * (max - min);

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.current = null;
    this.intensity = 'calm';
    setInterval(() => this.update(), 200);
  }

  /** Crossfade to theme `name` (a key of MUSIC_THEMES), or fade out with null. */
  play(name) {
    const theme = MUSIC_THEMES[name] ? name : null;
    if ((this.current?.name ?? null) === theme) return;
    this.current?.fadeOut();
    this.current = theme ? new ThemePlayer(this.audio, theme, MUSIC_THEMES[theme]) : null;
  }

  setIntensity(level) {
    this.intensity = level;
  }

  update() {
    if (this.audio.ctx?.state !== 'running') return;
    this.current?.schedule(this.intensity);
  }
}

class ThemePlayer {
  constructor(audio, name, def) {
    this.audio = audio;
    this.ctx = audio.ctx;
    this.name = name;
    this.def = def;
    this.sources = new Set();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // theme output: fades in, feeds the music bus and the music reverb
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, now);
    this.out.gain.exponentialRampToValueAtTime(1, now + 3);
    this.out.connect(audio.musicIn);
    const send = ctx.createGain();
    send.gain.value = 0.7;
    this.out.connect(send).connect(audio.musicReverb);

    // pads go through a slowly breathing low-pass filter
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = def.cutoff;
    this.padFilter.Q.value = 0.6;
    this.padFilter.connect(this.out);
    this.lfo(this.padFilter.frequency, 0.045, def.cutoff * 0.35);

    // the sea: brown noise, low-passed, swelling slowly
    if (def.sea > 0) {
      const sea = ctx.createBufferSource();
      sea.buffer = audio.brownBuffer;
      sea.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 360;
      const g = ctx.createGain();
      g.gain.value = def.sea;
      sea.connect(f).connect(g).connect(this.out);
      this.lfo(f.frequency, 0.07, 160);
      this.lfo(g.gain, 0.03, def.sea * 0.5);
      this.run(sea, now);
    }

    this.chordIndex = 0;
    this.nextChord = now + 0.1;
    this.nextBell = now + rand(1.5, 3);
    this.nextWhale = def.whale ? now + rand(...def.whale) * 0.5 : Infinity;
    this.nextPulse = now;
  }

  /** Schedule whatever falls within the next LOOKAHEAD seconds. */
  schedule(intensity) {
    const def = this.def;
    const now = this.ctx.currentTime;
    const ahead = now + LOOKAHEAD;
    const boss = intensity === 'boss';
    while (this.nextChord < ahead) {
      const len = def.chordTime * (boss ? 0.7 : 1);
      this.playChord(this.nextChord, len);
      this.nextChord += len;
    }
    while (this.nextBell < ahead) {
      this.playBell(this.nextBell);
      this.nextBell += rand(...def.bells.every) * (boss ? 1.6 : 1);
    }
    while (this.nextWhale < ahead) {
      this.playWhale(this.nextWhale);
      this.nextWhale += rand(...def.whale);
    }
    if (boss) {
      while (this.nextPulse < ahead) {
        this.playPulse(this.nextPulse);
        this.nextPulse += 1.1;
      }
    } else {
      this.nextPulse = Math.max(this.nextPulse, now);
    }
  }

  playChord(at, len) {
    const def = this.def;
    const chord = def.chords[this.chordIndex++ % def.chords.length];
    const end = at + len * 1.5; // overlaps the next chord for a soft change
    const level = def.pad / Math.sqrt(chord.length);
    for (const n of chord) {
      const f = mtof(def.root + n);
      for (const [type, detune] of [['triangle', -7], ['sine', 7]]) {
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = f;
        osc.detune.value = detune;
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.0001, at);
        env.gain.linearRampToValueAtTime(level, at + len * 0.4);
        env.gain.setValueAtTime(level, at + len * 0.9);
        env.gain.linearRampToValueAtTime(0.0001, end);
        osc.connect(env).connect(this.padFilter);
        this.run(osc, at, end);
      }
    }
    if (def.bass > 0) {
      const osc = this.ctx.createOscillator();
      osc.frequency.value = mtof(def.root + chord[0] - 12);
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.linearRampToValueAtTime(def.bass, at + 2);
      env.gain.setValueAtTime(def.bass, at + len * 0.95);
      env.gain.linearRampToValueAtTime(0.0001, at + len * 1.3);
      osc.connect(env).connect(this.out);
      this.run(osc, at, at + len * 1.3);
    }
  }

  playBell(at) {
    const b = this.def.bells;
    const note = b.base + b.scale[Math.floor(Math.random() * b.scale.length)] + (Math.random() < 0.25 ? 12 : 0);
    const f = mtof(note);
    for (const [ratio, gain, decay] of [[1, b.gain, 3.2], [2.01, b.gain * 0.2, 1.2]]) {
      const osc = this.ctx.createOscillator();
      osc.frequency.value = f * ratio;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.linearRampToValueAtTime(gain, at + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      osc.connect(env).connect(this.out);
      this.run(osc, at, at + decay);
    }
  }

  /** A distant whale-like moan (The Open Blue). */
  playWhale(at) {
    const dur = rand(4, 6);
    const start = rand(120, 170);
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(start, at);
    osc.frequency.exponentialRampToValueAtTime(start * rand(0.55, 0.75), at + dur * 0.7);
    osc.frequency.exponentialRampToValueAtTime(start * rand(0.7, 0.9), at + dur);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5;
    const depth = this.ctx.createGain();
    depth.gain.value = start * 0.015;
    vib.connect(depth).connect(osc.frequency);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(0.035, at + dur * 0.35);
    env.gain.linearRampToValueAtTime(0.0001, at + dur);
    osc.connect(env).connect(this.out);
    this.run(osc, at, at + dur);
    this.run(vib, at, at + dur);
  }

  /** Boss fights: a slow double thump, like a heartbeat. */
  playPulse(at) {
    for (const [t, k] of [[0, 1], [0.28, 0.6]]) {
      const osc = this.ctx.createOscillator();
      osc.frequency.setValueAtTime(58, at + t);
      osc.frequency.exponentialRampToValueAtTime(40, at + t + 0.25);
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, at + t);
      env.gain.linearRampToValueAtTime(0.16 * k, at + t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, at + t + 0.3);
      osc.connect(env).connect(this.out);
      this.run(osc, at + t, at + t + 0.3);
    }
  }

  /** Slowly wobble an audio parameter around its value. */
  lfo(param, rate, amount) {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = rate * rand(0.8, 1.2);
    const depth = this.ctx.createGain();
    depth.gain.value = amount;
    osc.connect(depth).connect(param);
    this.run(osc, this.ctx.currentTime);
  }

  /** Start a source (and stop it at `stopAt`, if given); remember it so a fade-out can stop it. */
  run(src, at, stopAt = null) {
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      src.disconnect();
    };
    src.start(at);
    if (stopAt !== null) src.stop(stopAt + 0.05);
  }

  fadeOut() {
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), now);
    this.out.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
    this.schedule = () => {}; // nothing new
    setTimeout(() => {
      for (const src of this.sources) {
        try {
          src.stop();
        } catch {
          // already stopped
        }
      }
      this.out.disconnect();
    }, 3000);
  }
}
