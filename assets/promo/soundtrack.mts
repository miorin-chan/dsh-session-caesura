#!/usr/bin/env node
// soundtrack.mts — 合成休止符宣传片的配乐与界面音效，输出 48 kHz 立体声 16-bit WAV。
//
// 用法: node soundtrack.mts <promo.html> <out.wav>
//
// 所有时间点读自 promo.html 里的 <script id="timeline">，与画面共用一份 cue sheet；
// 改动画时间后重新运行即可保持同步。合成过程不依赖外部素材，同一输入输出按字节一致。
//
// 风格：小型管弦乐。弦乐五部（失谐的限带锯齿波合奏，各自带延迟颤音）、圆号、单簧管、长笛、
// 竖琴与低音拨弦（Karplus–Strong）、定音鼓（非谐模态加毡槌声）。所有声部都经过低通，音区压在 F5 以下，
// 再配一个偏暗的大厅混响，让整体温暖、不刺耳。Andante，96 BPM 4/4，一小节 2.5 s，F 大调。时间为成片绝对时间：
//   0.0–2.5    标志：竖琴琶音随落墨升起，低音弦乐与远处的圆号托底
//   2.5–9.1    动机：单簧管独唱，竖琴分解和弦，弦乐轻铺，I–vi–IV–ii–V
//   9.1–9.9    倒带：刚才奏过的音乐被倒着快放回去，音高随带速升降
//   10.0–12.5  按住 ⌘：弦乐接过旋律，全团停在属七和弦的延长记号上，定音鼓滚奏渐强
//   12.5       第一次保存：全团戛然而止，休止一拍（caesura），长笛在结语落定时接上主和弦
//   19.375     按 Enter 追加：同样的延长、滚奏、切断与休止
//   20.0–27.5  全奏：定音鼓与竖琴刮奏开场，经终止四六和弦与属七和弦走向片尾
//   27.5       F 大调主和弦落在片尾休止符落墨的同一刻，名字出现时竖琴回应开头的琶音
// 休止的用法与乐谱上的 caesura（//）一致：音乐在延长音上悬住，切断后的寂静里只剩厅堂余响，再起下一句。

import { readFileSync, writeFileSync } from 'node:fs';

const [page, outPath] = process.argv.slice(2);
if (!page || !outPath) {
  console.error('usage: node soundtrack.mts <promo.html> <out.wav>');
  process.exit(64);
}
const block = readFileSync(page, 'utf8').match(/<script id="timeline" type="application\/json">([\s\S]*?)<\/script>/);
if (!block) {
  console.error(`soundtrack: no <script id="timeline"> block in ${page}`);
  process.exit(1);
}
type CueRange = [number, number];
interface CueSheet {
  duration: number;
  bpm: number;
  end: number;
  logo: [number, number, number, number];
  winIn: CueRange;
  winOut: CueRange;
  r1Actions: CueRange;
  noteKeys: number[];
  enter: number;
  sent: CueRange;
  r2Think: CueRange;
  r2Done: number;
  r2Actions: CueRange;
  rewind: CueRange;
  rewindFrom: number;
  rewindTo: number;
  mod: CueRange[];
  save1: number;
  fly1: CueRange;
  note1: CueRange;
  store: CueRange;
  appendKeys: number[];
  save2: number;
  fly2: CueRange;
  append: number;
  copy: number;
  rewindNote: number;
  flyBack: CueRange;
  fill: number;
}

const C = JSON.parse(block[1]) as CueSheet;
const T = { duration: C.duration };

const SR = 48000;
const N = Math.round(T.duration * SR);
const BEAT = 60 / C.bpm;
const BAR = 4 * BEAT;
/** Time of `beat` (quarter notes, fractional allowed) in `bar`; bar 0 starts with the film. */
const at = (bar: number, beat: number) => bar * BAR + beat * BEAT;

// ------------------------------------------------------------------ primitives

// Three buses: `keys` (woodwind solos) and `main` (the rest of the orchestra) are the music and pass through the caesura gate;
// `sfx` carries the interface sounds and does not. All feed the reverb send.
const stereo = () => [new Float32Array(N), new Float32Array(N)];
const bus = {
  main: stereo(), keys: stereo(), sfx: stereo(),
  mainSend: stereo(), keysSend: stereo(), sfxSend: stereo(),
};
/** Where `place` mixes non-keys sounds; switched to 'sfx' before the interface section. */
let layer: 'main' | 'sfx' = 'main';

let seed = 0x2f6b1d3c;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
const noise = () => rand() * 2 - 1;
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const TAU = 2 * Math.PI;

function render(seconds: number, fn: (seconds: number, frame: number) => number) {
  const buf = new Float32Array(Math.max(1, Math.round(seconds * SR)));
  for (let i = 0; i < buf.length; i++) buf[i] = fn(i / SR, i);
  return buf;
}

/** Mix a mono buffer in at `t0` with equal-power pan and an optional reverb send. */
function place(buf: Float32Array, t0: number, { gain = 1, pan = 0, verb = 0, keys = false } = {}) {
  const [dry, send] = keys ? [bus.keys, bus.keysSend] : layer === 'sfx' ? [bus.sfx, bus.sfxSend] : [bus.main, bus.mainSend];
  const i0 = Math.round(t0 * SR);
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * gain, gr = Math.sin(a) * gain;
  for (let i = 0; i < buf.length; i++) {
    const j = i0 + i;
    if (j < 0) continue;
    if (j >= N) break;
    const s = buf[i];
    dry[0][j] += s * gl;
    dry[1][j] += s * gr;
    if (verb) {
      send[0][j] += s * gl * verb;
      send[1][j] += s * gr * verb;
    }
  }
}

/** RBJ biquad; `tune` keeps state so filters can sweep. */
type FilterType = 'lp' | 'hp' | 'bp';
interface Filter {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function biquad(type: FilterType, f: number, q = Math.SQRT1_2) {
  const fl: Filter = { x1: 0, x2: 0, y1: 0, y2: 0, b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 };
  tune(fl, type, f, q);
  return fl;
}
function tune(fl: Filter, type: FilterType, f: number, q: number) {
  const w = (TAU * clamp(f, 10, SR * 0.45)) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), a0 = 1 + al;
  let b0, b1, b2;
  if (type === 'lp') [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
  else if (type === 'hp') [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  else [b0, b1, b2] = [al, 0, -al];
  Object.assign(fl, { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 });
}
function run(fl: Filter, x: number) {
  const y = fl.b0 * x + fl.b1 * fl.x1 + fl.b2 * fl.x2 - fl.a1 * fl.y1 - fl.a2 * fl.y2;
  fl.x2 = fl.x1; fl.x1 = x; fl.y2 = fl.y1; fl.y1 = y;
  return y;
}

function polyBlep(p: number, dt: number) {
  if (p < dt) { p /= dt; return p + p - p * p - 1; }
  if (p > 1 - dt) { p = (p - 1) / dt; return p * p + p + p + 1; }
  return 0;
}

// ------------------------------------------------------------------ instruments

// Every voice is band-limited and lowpassed, and the register stays at or below F5 except for the final harp
// arpeggio, so the orchestra sounds warm rather than bright.

type SectionName = 'vln1' | 'vln2' | 'vla' | 'vc' | 'cb';
/** Seating left to right: violins I and II, violas, cellos, basses behind the cellos. */
const SECTIONS: Record<SectionName, { cutoff: number; gain: number; pan: number; voices: number }> = {
  vln1: { cutoff: 3200, gain: 0.05, pan: -0.45, voices: 6 },
  vln2: { cutoff: 2800, gain: 0.042, pan: -0.2, voices: 6 },
  vla: { cutoff: 2200, gain: 0.045, pan: 0.15, voices: 5 },
  vc: { cutoff: 1500, gain: 0.055, pan: 0.38, voices: 5 },
  cb: { cutoff: 800, gain: 0.07, pan: 0.25, voices: 4 },
};
interface Shape { dyn?: (p: number) => number; attack?: number; release?: number; gain?: number }

/**
 * Bowed section: each note is an ensemble of band-limited saws spread over ±12 cents, each player with its own
 * vibrato that settles in after the attack. Two lowpass stages open with the dynamic, a soft body resonance
 * near 450 Hz adds wood.
 */
function bowed(name: SectionName, notes: number[], t0: number, t1: number, { dyn = () => 1, attack = 0.3, release = 0.35, gain = 1 }: Shape = {}) {
  const S = SECTIONS[name], hold = Math.max(0.05, t1 - t0);
  for (const m of notes) {
    const f = mtof(m);
    const players = Array.from({ length: S.voices }, (_, k) => ({
      f: f * 2 ** (((k / (S.voices - 1) - 0.5) * 24 + (rand() - 0.5) * 4) / 1200),
      p: rand(), vib: 4.7 + rand() * 1.1, vph: rand() * TAU, depth: 0.0022 + rand() * 0.001,
    }));
    const lp1 = biquad('lp', S.cutoff, 0.6), lp2 = biquad('lp', S.cutoff * 1.3, 0.55), body = biquad('bp', 450, 0.8);
    const buf = render(hold + release * 5, (tt, i) => {
      const d = dyn(clamp(tt / hold, 0, 1));
      if (i % 64 === 0) tune(lp1, 'lp', S.cutoff * (0.6 + 0.4 * d), 0.6);
      const vibOn = clamp((tt - 0.2) / 0.5, 0, 1);
      let x = 0;
      for (const v of players) {
        const fv = v.f * (1 + v.depth * vibOn * Math.sin(TAU * v.vib * tt + v.vph)), dt = fv / SR;
        x += 2 * v.p - 1 - polyBlep(v.p, dt);
        v.p += dt;
        if (v.p >= 1) v.p -= 1;
      }
      const y = run(lp2, run(lp1, x / players.length));
      const rise = Math.sin((Math.PI / 2) * Math.min(1, tt / attack)) ** 2;
      const fall = tt > hold ? Math.exp(-(tt - hold) / release) : 1;
      return (y + 0.4 * run(body, y)) * rise * fall * d;
    });
    place(buf, t0, { gain: S.gain * gain, pan: S.pan, verb: 0.5 });
  }
}

/** French horns: two players a few cents apart, a dark lowpass that opens as they play louder. */
function horn(notes: number[], t0: number, t1: number, { dyn = () => 1, attack = 0.14, release = 0.3, gain = 1 }: Shape = {}) {
  const hold = Math.max(0.05, t1 - t0);
  notes.forEach((m, n) => {
    const f = mtof(m);
    const players = [-4, 4].map((c) => ({ f: f * 2 ** (c / 1200), p: rand() }));
    const lp1 = biquad('lp', 600, 0.8), lp2 = biquad('lp', 2400, 0.6);
    const buf = render(hold + release * 5, (tt, i) => {
      const d = dyn(clamp(tt / hold, 0, 1));
      if (i % 64 === 0) tune(lp1, 'lp', 320 + 1100 * d, 0.8);
      let x = 0;
      for (const v of players) {
        const dt = v.f / SR;
        x += 2 * v.p - 1 - polyBlep(v.p, dt);
        v.p += dt;
        if (v.p >= 1) v.p -= 1;
      }
      const rise = 1 - Math.exp(-tt / (attack / 3));
      const fall = tt > hold ? Math.exp(-(tt - hold) / release) : 1;
      return run(lp2, run(lp1, x / 2)) * rise * fall * d;
    });
    place(buf, t0, { gain: 0.07 * gain, pan: 0.5 - n * 0.06, verb: 0.65 });
  });
}

/** Clarinet: a band-limited square (odd harmonics), softly filtered, with a light late vibrato. */
function clarinet(m: number, t0: number, dur: number, vel = 0.7) {
  const f = mtof(m), lp1 = biquad('lp', 1300 + 700 * vel, 0.7), lp2 = biquad('lp', 3000, 0.6);
  let p = 0;
  const buf = render(dur + 0.6, (tt) => {
    const fv = f * (1 + 0.0012 * clamp((tt - 0.3) / 0.4, 0, 1) * Math.sin(TAU * 5.2 * tt)), dt = fv / SR;
    const q = (p + 0.5) % 1;
    const x = (2 * p - 1 - polyBlep(p, dt)) - (2 * q - 1 - polyBlep(q, dt));
    p += dt;
    if (p >= 1) p -= 1;
    const env = (1 - Math.exp(-tt / 0.02)) * (tt > dur ? Math.exp(-(tt - dur) / 0.1) : 1);
    return run(lp2, run(lp1, x * 0.5)) * env * vel;
  });
  place(buf, t0, { gain: 0.09, pan: -0.05, verb: 0.45, keys: true });
}

/** Flute: a nearly pure tone with a little breath and a gentle vibrato. */
function flute(m: number, t0: number, dur: number, vel = 0.7) {
  const f = mtof(m), breath = biquad('bp', f * 2, 3);
  let ph = 0;
  const buf = render(dur + 0.6, (tt) => {
    ph += (TAU * f * (1 + 0.003 * clamp((tt - 0.25) / 0.4, 0, 1) * Math.sin(TAU * 5 * tt))) / SR;
    const x = Math.sin(ph) + 0.16 * Math.sin(2 * ph) + 0.05 * Math.sin(3 * ph) + 0.05 * run(breath, noise());
    const env = (1 - Math.exp(-tt / 0.03)) * (tt > dur ? Math.exp(-(tt - dur) / 0.12) : 1);
    return x * env * vel;
  });
  place(buf, t0, { gain: 0.06, pan: -0.15, verb: 0.5, keys: true });
}

/** Plucked string (harp or double-bass pizzicato): Karplus–Strong with a soft pluck and a body resonance. */
function pluck(m: number, t0: number, vel: number, { t60 = 2.2, bright = 900, body = 380, gain = 0.2, pan = -0.4 } = {}) {
  const f = mtof(m), period = Math.max(2, Math.round(SR / f - 0.5));
  const line = new Float32Array(period);
  const shape = biquad('lp', bright * (0.6 + 0.8 * vel), 0.7);
  for (let i = 0; i < period; i++) line[i] = run(shape, noise());
  const rho = 10 ** (-3 / (t60 * f)), bp = biquad('bp', body, 1.1), lp = biquad('lp', 3500, 0.6);
  let i = 0, prev = 0;
  const buf = render(t60 + 0.1, (tt) => {
    const y = line[i];
    line[i] = rho * 0.5 * (y + prev);
    prev = y;
    if (++i >= period) i = 0;
    return run(lp, y + 0.5 * run(bp, y)) * vel * (1 - Math.exp(-tt / 0.002));
  });
  place(buf, t0, { gain, pan, verb: 0.45 });
}
const harp = (m: number, t0: number, vel = 0.6) => pluck(m, t0, vel);
const bassPizz = (m: number, t0: number, vel = 0.7) => pluck(m, t0, vel, { t60: 0.9, bright: 500, body: 160, gain: 0.32, pan: 0.25 });

/** Timpani stroke: the drum's inharmonic modes, a slight pitch settle, and a felt mallet thud. */
function timp(m: number, t0: number, vel: number, gain = 0.2) {
  const f = mtof(m);
  const modes = [[1, 1, 1.6], [1.504, 0.45, 0.9], [1.742, 0.25, 0.7], [2.0, 0.2, 0.5], [2.245, 0.12, 0.4]];
  const phases = modes.map(() => 0);
  const thud = biquad('lp', 380, 0.7);
  const buf = render(2.2, (tt) => {
    const glide = 1 + 0.012 * Math.exp(-tt / 0.05);
    let x = 0;
    modes.forEach(([r, a, d], k) => {
      phases[k] += (TAU * f * r * glide) / SR;
      x += Math.sin(phases[k]) * a * Math.exp(-tt / d);
    });
    if (tt < 0.05) x += run(thud, noise()) * 1.2 * Math.exp(-tt / 0.008);
    return x * vel * (1 - Math.exp(-tt / 0.001));
  });
  place(buf, t0, { gain, pan: 0.1, verb: 0.5 });
}
/** Timpani roll: alternating strokes about 15 per second, the dynamic following `dyn` over the roll. */
function roll(m: number, t0: number, t1: number, dyn: (p: number) => number) {
  for (let t = t0; t < t1; t += (1 / 15) * (0.9 + 0.2 * rand())) timp(m, t, 0.32 * dyn((t - t0) / (t1 - t0)), 0.16);
}

interface NoiseHitOptions {
  len: number;
  decay: number;
  type: FilterType;
  f: number;
  q?: number;
  gain: number;
  pan?: number;
  verb?: number;
}

function noiseHit(t0: number, { len, decay, type, f, q = Math.SQRT1_2, gain, pan = 0, verb = 0 }: NoiseHitOptions) {
  const fl = biquad(type, f, q);
  const buf = render(len, (tt) => run(fl, noise()) * (1 - Math.exp(-tt / 0.0005)) * Math.exp(-tt / decay));
  place(buf, t0, { gain, pan, verb });
}

/** Short low sine thump; the "body" under taps and clicks. */
function thump(t0: number, f0: number, f1: number, decay: number, gain: number, pan = 0) {
  let ph = 0;
  const buf = render(decay * 6, (tt) => {
    ph += (TAU * (f1 + (f0 - f1) * Math.exp(-tt / 0.02))) / SR;
    return Math.sin(ph) * Math.exp(-tt / decay) * (1 - Math.exp(-tt / 0.001));
  });
  place(buf, t0, { gain, pan });
}

/** Band-passed noise whose centre glides f0 → f1 (whoosh / swell). */
function sweep(t0: number, t1: number, f0: number, f1: number, { gain = 0.07, q = 1.3, pan = 0, verb = 0.3, shape = (p: number) => Math.sin(Math.PI * p) ** 1.5 } = {}) {
  const len = t1 - t0, fl = biquad('bp', f0, q);
  const buf = render(len, (tt, i) => {
    const p = tt / len;
    if (i % 16 === 0) tune(fl, 'bp', f0 * (f1 / f0) ** p, q);
    return run(fl, noise()) * shape(p);
  });
  place(buf, t0, { gain, pan, verb });
}

/** Soft fingertip tap: a short noise tick over a low thump; no pitch you could hum. */
function tap(t0: number, gain: number, { f = 2400, pan = 0 } = {}) {
  noiseHit(t0, { len: 0.03, decay: 0.005, type: 'bp', f, q: 1.0, gain, pan });
  thump(t0, 170, 120, 0.012, gain * 0.8, pan);
}

/** Mouse click. */
function click(t0: number, gain = 0.28, pan = 0) {
  noiseHit(t0, { len: 0.02, decay: 0.0022, type: 'hp', f: 3000, gain, pan });
  thump(t0, 210, 160, 0.01, gain * 0.7, pan);
}

/** Keyboard key, slightly varied per stroke. */
function key(t0: number, gain: number) {
  const pan = (rand() - 0.5) * 0.3;
  noiseHit(t0, { len: 0.04, decay: 0.004, type: 'bp', f: 3000 + rand() * 700, q: 1.2, gain, pan });
  thump(t0, 160, 130, 0.008, gain * 0.5, pan);
}

// ------------------------------------------------------------------ score

// Pitches as MIDI numbers (F3 = 53, C4 = 60, F4 = 65, C5 = 72). Beats are quarter notes.
const T0 = (bar: number, beat: number) => at(bar, beat);
const D = (beats: number) => beats * BEAT;
/** Harp broken chord in eighths, rising through `notes` and falling back, from `beat` for `beats` beats. */
const harpArp = (notes: number[], bar: number, beat: number, beats: number, vel = 0.5) => {
  const cycle = [...notes, ...notes.slice(1, -1).reverse()];
  for (let k = 0; k < beats * 2; k++) harp(cycle[k % cycle.length], T0(bar, beat + k / 2), vel * (k % 2 ? 0.8 : 1));
};
const ramp = (a: number, b: number) => (p: number) => a + (b - a) * p;
const hairpin = (lo: number, hi: number) => (p: number) => lo + (hi - lo) * Math.sin(Math.PI * p);

const CUT1 = C.save1, CUT2 = C.save2;
const bar1 = Math.round(CUT1 / BAR);                // the bar the first caesura opens
const bar2 = Math.round((CUT2 + BEAT) / BAR);       // the bar that follows the second caesura
const b7 = bar2 - 1;
const END_BAR = Math.round(C.end / BAR);
const b10 = END_BAR - 1;

// Logo: a harp arpeggio rises with the ink over low strings and a distant horn.
[53, 57, 60, 65, 69, 72].forEach((m, k) => harp(m, C.logo[0] + 0.05 + k * 0.11, 0.5 + k * 0.04));
bowed('cb', [29], C.logo[0], C.logo[3], { attack: 0.9, release: 0.6, dyn: () => 0.6 });
bowed('vc', [41, 48], C.logo[0], C.logo[3], { attack: 0.9, release: 0.6, dyn: () => 0.6 });
bowed('vla', [53, 57], C.logo[0] + 0.2, C.logo[3], { attack: 0.9, release: 0.6, dyn: () => 0.55 });
horn([53, 60], C.logo[0] + 0.4, C.logo[3], { attack: 0.6, release: 0.6, dyn: hairpin(0.25, 0.5) });

// Motivation: a clarinet sings over harp and quiet strings. I – vi IV – ii V.
clarinet(69, T0(1, 0), D(1)); clarinet(72, T0(1, 1), D(1)); clarinet(77, T0(1, 2), D(2), 0.75);
harpArp([41, 48, 53, 57, 60], 1, 0, 4);
bowed('vc', [41], T0(1, 0), T0(2, 0), { dyn: () => 0.35, attack: 0.5 });
bowed('vla', [57, 60], T0(1, 0), T0(2, 0), { dyn: () => 0.3, attack: 0.5 });
clarinet(74, T0(2, 0), D(1)); clarinet(72, T0(2, 1), D(1)); clarinet(70, T0(2, 2), D(1)); clarinet(69, T0(2, 3), D(1));
harpArp([38, 45, 50, 53, 57], 2, 0, 2); harpArp([34, 41, 46, 50, 53], 2, 2, 2);
bowed('vc', [38], T0(2, 0), T0(2, 2), { dyn: () => 0.35 }); bowed('vc', [34], T0(2, 2), T0(3, 0), { dyn: () => 0.35 });
bowed('vla', [57, 62], T0(2, 0), T0(2, 2), { dyn: () => 0.3 }); bowed('vla', [58, 62], T0(2, 2), T0(3, 0), { dyn: () => 0.3 });
clarinet(70, T0(3, 0), D(1)); clarinet(69, T0(3, 1), D(1)); clarinet(67, T0(3, 2), D(2));
harpArp([43, 50, 55, 58, 62], 3, 0, 2); harpArp([36, 43, 48, 52, 58], 3, 2, 2);
bowed('vc', [43], T0(3, 0), T0(3, 2), { dyn: () => 0.35 }); bowed('vc', [36], T0(3, 2), T0(4, 0), { dyn: () => 0.35 });

/** The whole orchestra holds C7 under a fermata, swelling with a timpani roll, and stops dead at `cut`. */
function fermata(from: number, cut: number, lo: number) {
  const swell = ramp(lo, 1);
  const s = { dyn: swell, attack: 0.25, release: 0.012 };
  bowed('vln1', [76], from, cut, s);
  bowed('vln2', [70], from, cut, s);
  bowed('vla', [64, 67], from, cut, s);
  bowed('vc', [48], from, cut, s);
  bowed('cb', [36], from, cut, s);
  horn([64, 67], from, cut, { dyn: ramp(lo * 0.8, 0.95), release: 0.012 });
  roll(48, from, cut, ramp(0.15, 1));
}

// The shortcut: the strings take over the tune and rise to the dominant, held until the click.
bowed('vln1', [74], T0(bar1 - 1, 0), T0(bar1 - 1, 1), { dyn: () => 0.6, attack: 0.15 });
bowed('vln1', [72], T0(bar1 - 1, 1), T0(bar1 - 1, 2), { dyn: () => 0.6, attack: 0.1 });
bowed('vln2', [62], T0(bar1 - 1, 0), T0(bar1 - 1, 2), { dyn: () => 0.5 });
bowed('vla', [58], T0(bar1 - 1, 0), T0(bar1 - 1, 2), { dyn: () => 0.5 });
bowed('vc', [46], T0(bar1 - 1, 0), T0(bar1 - 1, 2), { dyn: () => 0.5 });
bowed('cb', [34], T0(bar1 - 1, 0), T0(bar1 - 1, 2), { dyn: () => 0.5 });
harpArp([46, 53, 58, 62, 65], bar1 - 1, 0, 2);
fermata(T0(bar1 - 1, 2), CUT1, 0.55);

// Caesura. The flute picks up on beat two, as the note lands: I, then IV V.
flute(77, T0(bar1, 1), D(1)); flute(76, T0(bar1, 2), D(0.5)); flute(74, T0(bar1, 2.5), D(0.5)); flute(72, T0(bar1, 3), D(1));
harpArp([41, 48, 53, 57, 60], bar1, 1, 3);
bassPizz(41, T0(bar1, 1)); bassPizz(48, T0(bar1, 2), 0.55); bassPizz(45, T0(bar1, 3), 0.55);
bowed('vla', [57, 60], T0(bar1, 1), T0(bar1 + 1, 0), { dyn: () => 0.35, attack: 0.5 });
flute(70, T0(bar1 + 1, 0), D(1)); flute(74, T0(bar1 + 1, 1), D(1)); flute(72, T0(bar1 + 1, 2), D(2));
harpArp([34, 41, 46, 50, 53], bar1 + 1, 0, 2); harpArp([36, 43, 48, 52, 55], bar1 + 1, 2, 2);
bassPizz(46, T0(bar1 + 1, 0)); bassPizz(53, T0(bar1 + 1, 1), 0.5); bassPizz(48, T0(bar1 + 1, 2)); bassPizz(55, T0(bar1 + 1, 3), 0.5);
bowed('vla', [58, 62], T0(bar1 + 1, 0), T0(bar1 + 1, 2), { dyn: () => 0.35 });
bowed('vla', [55, 60], T0(bar1 + 1, 2), T0(bar1 + 2, 0), { dyn: () => 0.35 });

// Appending: vi with clarinet and flute in thirds, then the dominant fermata again until Enter.
flute(69, T0(b7, 0), D(1)); flute(74, T0(b7, 1), D(1));
clarinet(65, T0(b7, 0), D(1), 0.6); clarinet(69, T0(b7, 1), D(1), 0.6);
harpArp([38, 45, 50, 53, 57], b7, 0, 2);
bassPizz(50, T0(b7, 0)); bassPizz(45, T0(b7, 1), 0.5);
bowed('vla', [57, 62], T0(b7, 0), T0(b7, 2), { dyn: () => 0.4 });
flute(76, T0(b7, 2), CUT2 - T0(b7, 2) - 0.03);
fermata(T0(b7, 2), CUT2, 0.5);

// Tutti on the downbeat after the second caesura: I – IV ii – cadential 6/4 V7 – I.
timp(41, T0(bar2, 0), 0.9);
[53, 55, 57, 58, 60, 62, 64, 65, 67, 69, 70, 72, 74, 76, 77].forEach((m, k) => harp(m, T0(bar2, 0) + k * 0.035, 0.35 + k * 0.015));
bowed('vln1', [77], T0(bar2, 0), T0(bar2, 2), { dyn: () => 0.85, attack: 0.12 });
bowed('vln1', [72], T0(bar2, 2), T0(bar2, 3), { dyn: () => 0.8, attack: 0.08 });
bowed('vln1', [69], T0(bar2, 3), T0(bar2 + 1, 0), { dyn: () => 0.8, attack: 0.08 });
flute(77, T0(bar2, 0), D(2), 0.6); flute(72, T0(bar2, 2), D(1), 0.55); flute(69, T0(bar2, 3), D(1), 0.55);
bowed('vln2', [69, 72], T0(bar2, 0), T0(bar2 + 1, 0), { dyn: () => 0.7 });
bowed('vla', [60, 65], T0(bar2, 0), T0(bar2 + 1, 0), { dyn: () => 0.7 });
bowed('vc', [41], T0(bar2, 0), T0(bar2 + 1, 0), { dyn: () => 0.8 });
bowed('cb', [29], T0(bar2, 0), T0(bar2 + 1, 0), { dyn: () => 0.8 });
horn([65, 69], T0(bar2, 0), T0(bar2 + 1, 0), { dyn: hairpin(0.55, 0.75) });

const b9 = bar2 + 1;
bowed('vln1', [70], T0(b9, 0), T0(b9, 0.5), { dyn: () => 0.75, attack: 0.06 });
bowed('vln1', [74], T0(b9, 0.5), T0(b9, 1), { dyn: () => 0.75, attack: 0.06 });
bowed('vln1', [77], T0(b9, 1), T0(b9, 2), { dyn: () => 0.85, attack: 0.08 });
bowed('vln1', [74], T0(b9, 2), T0(b9, 3), { dyn: () => 0.8, attack: 0.08 });
bowed('vln1', [70], T0(b9, 3), T0(b9 + 1, 0), { dyn: () => 0.8, attack: 0.08 });
bowed('vln2', [65], T0(b9, 0), T0(b9, 2), { dyn: () => 0.65 }); bowed('vln2', [67], T0(b9, 2), T0(b9 + 1, 0), { dyn: () => 0.65 });
bowed('vla', [58, 62], T0(b9, 0), T0(b9 + 1, 0), { dyn: () => 0.65 });
bowed('vc', [46], T0(b9, 0), T0(b9, 2), { dyn: () => 0.75 }); bowed('vc', [43], T0(b9, 2), T0(b9 + 1, 0), { dyn: () => 0.75 });
bowed('cb', [34], T0(b9, 0), T0(b9, 2), { dyn: () => 0.75 }); bowed('cb', [31], T0(b9, 2), T0(b9 + 1, 0), { dyn: () => 0.75 });
horn([62, 65], T0(b9, 0), T0(b9, 2), { dyn: () => 0.6 }); horn([62, 67], T0(b9, 2), T0(b9 + 1, 0), { dyn: () => 0.6 });
harpArp([34, 41, 46, 50, 53], b9, 0, 2, 0.45); harpArp([31, 38, 43, 46, 50], b9, 2, 2, 0.45);

bowed('vln1', [72], T0(b10, 0), T0(b10, 1), { dyn: () => 0.8, attack: 0.08 });
bowed('vln1', [77], T0(b10, 1), T0(b10, 2), { dyn: () => 0.9, attack: 0.08 });
bowed('vln1', [76], T0(b10, 2), T0(b10, 3), { dyn: () => 0.9, attack: 0.08 });
[67, 70, 72, 76].forEach((m, k) => bowed('vln1', [m], T0(b10, 3 + k / 4), T0(b10, 3 + (k + 1) / 4), { dyn: () => 0.8 + 0.05 * k, attack: 0.03, release: 0.08 }));
bowed('vln2', [69], T0(b10, 0), T0(b10, 2), { dyn: () => 0.7 }); bowed('vln2', [70], T0(b10, 2), C.end, { dyn: ramp(0.7, 0.95) });
bowed('vla', [60, 65], T0(b10, 0), T0(b10, 2), { dyn: () => 0.7 }); bowed('vla', [64, 67], T0(b10, 2), C.end, { dyn: ramp(0.7, 0.95) });
bowed('vc', [48], T0(b10, 0), C.end, { dyn: ramp(0.7, 1) });
bowed('cb', [36], T0(b10, 0), C.end, { dyn: ramp(0.7, 1) });
horn([65, 69], T0(b10, 0), T0(b10, 2), { dyn: () => 0.65 }); horn([64, 70], T0(b10, 2), C.end, { dyn: ramp(0.65, 0.95) });
roll(48, T0(b10, 2), C.end - 0.02, ramp(0.2, 1));

// Final tonic with the end card's ink; the harp answers the logo as the name settles.
const tail = T.duration - 1.6;
const fade = (p: number) => 0.8 - 0.4 * p;
timp(41, C.end, 0.8);
roll(41, C.end + 0.08, C.end + 1.1, ramp(0.6, 0.1));
bowed('vln1', [77], C.end, tail, { dyn: fade, attack: 0.1, release: 1.2 });
bowed('vln2', [69, 72], C.end, tail, { dyn: fade, attack: 0.1, release: 1.2 });
bowed('vla', [60, 65], C.end, tail, { dyn: fade, attack: 0.1, release: 1.2 });
bowed('vc', [41, 48], C.end, tail, { dyn: fade, attack: 0.1, release: 1.2 });
bowed('cb', [29], C.end, tail, { dyn: fade, attack: 0.1, release: 1.2 });
horn([53, 57, 60, 65], C.end, tail - 0.4, { dyn: (p) => 0.9 - 0.5 * p, release: 1.0 });
[65, 69, 72, 77, 81].forEach((m, k) => harp(m, C.end + 0.8 + k * 0.13, 0.45 - k * 0.03));

// ------------------------------------------------------------------ tape rewind

/**
 * Replace the music under the rewind with the music of the sent branch, played backwards and fast,
 * so the score retraces the picture. Tape speed eases in and out, so the pitch rises and falls with it.
 * Content above 2.5 kHz is filtered out first and the result is lowpassed again, so the fast passage stays soft.
 */
function rewindMusic([d0, d1]: CueRange, s0: number, s1: number, silentUntil: number) {
  const len = Math.round((d1 - d0) * SR), j0 = Math.round(d0 * SR), stop = Math.round(silentUntil * SR);
  for (const ch of [...bus.main, ...bus.keys, ...bus.mainSend, ...bus.keysSend]) {
    const lp1 = biquad('lp', 2500, 0.7), lp2 = biquad('lp', 2500, 0.7), post = biquad('lp', 3500, 0.7);
    const src = ch.slice(Math.round(s0 * SR), Math.round(s1 * SR)).map((x) => run(lp2, run(lp1, x)));
    const fadeIn = 0.03 * SR, fadeOut = 0.08 * SR, cut = 0.02 * SR;
    for (let j = j0 - cut; j < stop; j++) {
      if (j < j0) ch[j] *= (j0 - j) / cut;
      else ch[j] = 0;
    }
    for (let j = 0; j < len; j++) {
      const u = 0.5 - 0.5 * Math.cos((Math.PI * j) / len);
      const pos = (1 - u) * (src.length - 1), i = Math.floor(pos), fr = pos - i;
      const x = src[i] * (1 - fr) + (src[Math.min(i + 1, src.length - 1)] ?? 0) * fr;
      ch[j0 + j] = run(post, x) * Math.min(1, j / fadeIn, (len - j) / fadeOut);
    }
  }
}
rewindMusic(C.rewind, C.rewindTo, C.rewindFrom, at(Math.ceil(C.rewind[1] / BAR), 0));

// ------------------------------------------------------------------ interface sounds (no pitched tones)

layer = 'sfx';

/** Tape hiss under the rewind: band-passed noise falling in pitch with a fast flutter that slows down. */
function rewindFx(t0: number, t1: number, gain = 0.035) {
  const len = t1 - t0, fl = biquad('bp', 2800, 2.2);
  let ph = 0;
  const buf = render(len, (tt, i) => {
    const p = tt / len;
    if (i % 16 === 0) tune(fl, 'bp', 2800 * (500 / 2800) ** p, 2.2);
    ph += (TAU * (26 - 14 * p)) / SR;
    return run(fl, noise()) * (0.55 + 0.45 * Math.sin(ph)) * Math.sin(Math.PI * p) ** 0.7;
  });
  place(buf, t0, { gain, verb: 0.2 });
}

sweep(C.winIn[0], C.winIn[1] + 0.1, 700, 2600, { gain: 0.035, q: 1.0 });                             // 窗口出现
tap(C.r1Actions[0], 0.03, { f: 2000, pan: -0.25 });                                                  // 操作行
[...C.noteKeys, ...C.appendKeys].forEach((t) => key(t, 0.09 * (0.8 + 0.4 * rand())));              // 打字
key(C.enter, 0.13);                                                                                   // Enter：发出去
sweep(C.sent[0], C.sent[0] + 0.38, 700, 3800, { gain: 0.05, q: 1.2, pan: 0.2, shape: (p) => Math.sin(Math.PI * p) });
tap(C.r2Think[0], 0.03, { f: 1800, pan: -0.3 });                                                     // 思考中
tap(C.r2Done, 0.035, { f: 2400, pan: -0.3 });                                                        // 已完成
tap(C.r2Actions[0], 0.03, { f: 2000, pan: -0.25 });
rewindFx(C.rewind[0] - 0.05, C.rewind[1] + 0.05);                                                    // 倒回
for (const [t0, t1] of C.mod) {                                                          // 按下 / 松开 ⌘
  key(t0, 0.11);
  thump(t0 + 0.02, 320, 190, 0.03, 0.06, 0.25);                                                       // 休止符出现
  key(t1, 0.055);
}
click(C.save1, 0.24, 0.1);                                                                            // 点休止符
key(C.save2, 0.13);                                                                                   // Enter 追加
for (const [fly, land] of [[C.fly1, C.note1[0] + 0.2], [C.fly2, C.append]] as const) {
  sweep(fly[0], fly[1], 900, 3200, { gain: 0.045, q: 1.1, pan: 0.15 });                              // 草稿飞向结语
  thump(land, 220, 120, 0.05, 0.11);                                                                  // 落入结语
  noiseHit(land, { len: 0.03, decay: 0.006, type: 'bp', f: 1200, q: 1, gain: 0.045 });
}
tap(C.store[0], 0.04, { f: 2800, pan: -0.2 });                                                       // 标注
click(C.copy, 0.2, 0.15);                                                                             // 复制
tap(C.copy + 0.06, 0.04, { f: 2600, pan: 0.15 });                                                    // ✓
click(C.rewindNote, 0.22, 0.15);                                                                      // 回退
sweep(C.flyBack[0], C.flyBack[1], 3200, 900, { gain: 0.05, q: 1.1, pan: -0.15 });                    // 结语飞回输入框
thump(C.fill, 220, 120, 0.05, 0.11);
noiseHit(C.fill, { len: 0.03, decay: 0.006, type: 'bp', f: 1200, q: 1, gain: 0.045 });
sweep(C.winOut[0], C.winOut[1], 2600, 700, { gain: 0.03, q: 1.0 });                                   // 窗口退场

// ------------------------------------------------------------------ master

function freeverb(inL: Float32Array, inR: Float32Array, { room = 0.9, damp = 0.45 } = {}) {
  const k = SR / 44100;
  const line = (d: number) => ({ buf: new Float32Array(Math.round(d * k)), i: 0, store: 0 });
  const chan = (spread: number) => ({
    combs: [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => line(d + spread)),
    aps: [556, 441, 341, 225].map((d) => line(d + spread)),
  });
  const chans = [chan(0), chan(23)];
  const out = [new Float32Array(N), new Float32Array(N)];
  for (let n = 0; n < N; n++) {
    const x = (inL[n] + inR[n]) * 0.015;
    for (let c = 0; c < 2; c++) {
      let y = 0;
      for (const cb of chans[c].combs) {
        const o = cb.buf[cb.i];
        cb.store = o * (1 - damp) + cb.store * damp;
        cb.buf[cb.i] = x + cb.store * room;
        if (++cb.i >= cb.buf.length) cb.i = 0;
        y += o;
      }
      for (const ap of chans[c].aps) {
        const b = ap.buf[ap.i];
        ap.buf[ap.i] = y + b * 0.5;
        if (++ap.i >= ap.buf.length) ap.i = 0;
        y = b - y;
      }
      out[c][n] = y;
    }
  }
  return out;
}

// The caesura gate: after each fermata the music is cut cleanly for one beat. The gate sits before the reverb,
// so the hall's tail of the held chord keeps ringing through the silence.
const gate = new Float32Array(N).fill(1);
for (const t of [CUT1, CUT2]) {
  const a = Math.round(t * SR), b = Math.round((t + BEAT) * SR), ramp = Math.round(0.012 * SR);
  for (let n = a - ramp; n < Math.min(N, b + ramp); n++) {
    const g = n < a ? (a - n) / ramp : n < b ? 0 : (n - b) / ramp;
    gate[n] = Math.min(gate[n], g);
  }
}
const sendOf = (c: number) => bus.mainSend[c].map((x, n) => (x + bus.keysSend[c][n]) * gate[n] + bus.sfxSend[c][n]);
const wet = freeverb(sendOf(0), sendOf(1));
const mix = [0, 1].map((c) => {
  // A gentle lowpass on the master keeps the top end soft.
  const hp = biquad('hp', 30), lp = biquad('lp', 8000, 0.6);
  return bus.main[c].map((x, n) => run(lp, run(hp, (x + bus.keys[c][n]) * gate[n] + bus.sfx[c][n] + wet[c][n] * 1.4)));
});

// Level: RMS to TARGET_RMS dBFS, soft knee above 0.7, peak at -1 dBFS; short fade at both ends.
const TARGET_RMS = -20;
let sum = 0;
for (let n = 0; n < N; n++) sum += (mix[0][n] ** 2 + mix[1][n] ** 2) / 2;
const scale = 10 ** (TARGET_RMS / 20) / Math.sqrt(sum / N);
const knee = (x: number) => {
  const a = Math.abs(x);
  return a < 0.7 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
};
let peak = 0;
for (const ch of mix) for (let n = 0; n < N; n++) {
  const fade = Math.min(1, n / (0.01 * SR), (N - n) / (0.4 * SR));
  ch[n] = knee(ch[n] * scale) * fade;
  peak = Math.max(peak, Math.abs(ch[n]));
}
const ceiling = 10 ** (-1 / 20);
if (peak > ceiling) for (const ch of mix) for (let n = 0; n < N; n++) ch[n] *= ceiling / peak;

const wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + N * 4, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  wav.writeInt16LE(Math.round(clamp(mix[0][n], -1, 1) * 32767), 44 + n * 4);
  wav.writeInt16LE(Math.round(clamp(mix[1][n], -1, 1) * 32767), 46 + n * 4);
}
writeFileSync(outPath, wav);
console.error(`soundtrack: ${T.duration}s, peak ${(20 * Math.log10(Math.min(peak, ceiling))).toFixed(1)} dBFS → ${outPath}`);
