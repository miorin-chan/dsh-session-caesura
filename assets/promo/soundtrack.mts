#!/usr/bin/env node
// soundtrack.mts — 合成休止符宣传片的配乐与界面音效，输出 48 kHz 立体声 16-bit WAV。
//
// 用法: node soundtrack.mts <promo.html> <out.wav>
//
// 所有时间点读自 promo.html 里的 <script id="timeline">，与画面共用一份 cue sheet；
// 改动画时间后重新运行即可保持同步。合成过程不依赖外部素材，同一输入输出按字节一致。
//
// 风格：氛围电子乐。只用合成器本来的音色，不模仿原声乐器：温暖的模拟风格铺底、模态合成的马林巴式拨奏、
// 柔和的 FM 颤音琴、正弦低音和一套轻电子鼓，拨奏与颤音琴送进附点八分的乒乓回声。
// 96 BPM 4/4，一小节 2.5 s，F 大调，Fmaj9–Dm9/Bbmaj9–Gm9/C11。时间为成片绝对时间：
//   0.0–2.5    标志：铺底吸气般升起，颤音琴琶音随落墨上行
//   2.5–9.1    动机：铺底、轻声的拨奏型、正弦低音，随后加入沙锤
//   9.1–9.9    倒带：刚才奏过的音乐被倒着快放回去，音高随带速升降
//   10.0–12.5  按住 ⌘：build，十六分拨奏渐强，铺底滤波打开，riser 推向点击
//   12.5       第一次保存：一切切断，空一拍（caesura），drop 在第二拍随结语落定，进入半速律动
//   19.375     按 Enter 追加：鼓组退场，短 build 被 Enter 切断，空一拍
//   20.0–27.5  完整 drop：四拍底鼓、拍手、颤音琴旋律；最后两拍鼓组退场，riser 推向片尾
//   27.5       F 大调和弦落在片尾休止符落墨的同一刻，名字出现时颤音琴轻声回应
// 休止的用法取自电子乐 drop 前的 break：张力推到最高时切断，留一拍空白，回声与混响的尾巴在空白里飘着，再落下。

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

// Three buses: `keys` (pad, bass, mallets; ducked under the kick) and `main` (drums, risers) are the music and pass through the caesura gate;
// `sfx` carries the interface sounds and does not. All feed the reverb send.
const stereo = () => [new Float32Array(N), new Float32Array(N)];
const bus = {
  main: stereo(), keys: stereo(), sfx: stereo(),
  mainSend: stereo(), keysSend: stereo(), sfxSend: stereo(),
  /** Ping-pong echo send for the mallets and vibraphone. */
  echoSend: stereo(),
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
function place(buf: Float32Array, t0: number, { gain = 1, pan = 0, verb = 0, echo = 0, keys = false } = {}) {
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
    if (echo) {
      bus.echoSend[0][j] += s * gl * echo;
      bus.echoSend[1][j] += s * gr * echo;
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

// Every voice here is native to a synthesizer, so nothing has to pass for an acoustic instrument:
// a warm analog-style pad, a marimba-like mallet from modal synthesis, a soft FM vibraphone, a sine sub bass,
// and a gentle electronic kit. Mallets and the vibraphone feed a ping-pong echo.

/**
 * Pad: per side two detuned band-limited saws over a quiet sine an octave down, through a resonant lowpass whose
 * cutoff follows `open(p)` across the note. The left and right sides use different detunes for width.
 */
function pad(notes: number[], t0: number, t1: number, { gain = 1, attack = 1.0, release = 0.9, open = (_p: number) => 1000 } = {}) {
  const hold = Math.max(0.05, t1 - t0);
  for (const m of notes) {
    const f = mtof(m);
    for (const [side, cents] of [[-1, [-9, 5]], [1, [-5, 9]]] as const) {
      const saws = cents.map((c) => ({ f: f * 2 ** (c / 1200), p: rand() }));
      let sub = rand() * TAU;
      const lp = biquad('lp', 1000, 0.9), lp2 = biquad('lp', 7000, 0.6);
      const buf = render(hold + release * 5, (tt, i) => {
        if (i % 64 === 0) tune(lp, 'lp', 1.3 * open(clamp(tt / hold, 0, 1)), 0.9);
        let x = 0;
        for (const s of saws) {
          const dt = s.f / SR;
          x += 2 * s.p - 1 - polyBlep(s.p, dt);
          s.p += dt;
          if (s.p >= 1) s.p -= 1;
        }
        sub += (TAU * f * 0.5) / SR;
        const rise = Math.sin((Math.PI / 2) * Math.min(1, tt / attack)) ** 2;
        const fall = tt > hold ? Math.exp(-(tt - hold) / release) : 1;
        return (run(lp2, run(lp, x / 2)) + 0.1 * Math.sin(sub)) * rise * fall;
      });
      place(buf, t0, { gain: 0.036 * gain, pan: 0.75 * side, verb: 0.45, keys: true });
    }
  }
}

/** Marimba-like mallet: three inharmonic modes (1, 3.93, 9.2) with fast upper decays and a soft felt click. */
function mallet(m: number, t0: number, vel = 0.5, { echo = 0.3, pan = 0 } = {}) {
  const f = mtof(m), decay = clamp(1.1 * Math.sqrt(220 / f), 0.35, 1.6);
  const modes = [[1, 1, decay], [3.93, 0.3, decay * 0.18], [9.2, 0.06, decay * 0.06]].filter(([r]) => f * r < 9000);
  const ph = modes.map(() => rand() * TAU), click = biquad('lp', 4000, 0.7);
  const buf = render(decay * 5, (tt) => {
    let x = 0;
    modes.forEach(([r, a, d], k) => {
      ph[k] += (TAU * f * r) / SR;
      x += Math.sin(ph[k]) * a * Math.exp(-tt / d);
    });
    if (tt < 0.01) x += run(click, noise()) * 0.3 * Math.exp(-tt / 0.002);
    return x * vel * (1 - Math.exp(-tt / 0.0012));
  });
  place(buf, t0, { gain: 0.16, pan, verb: 0.35, echo, keys: true });
}

/** Soft FM vibraphone: carrier and modulator at 1:2 with a low, fast-decaying index, so it rings without clang. */
function vibe(m: number, t0: number, vel = 0.5, { dur = 2.4, echo = 0.35, pan = 0.1 } = {}) {
  const f = mtof(m), lp = biquad('lp', 4500, 0.6);
  let pc = 0, pm = 0;
  const buf = render(dur, (tt) => {
    pm += (TAU * f * 2) / SR;
    pc += (TAU * f) / SR;
    const idx = 1.5 * Math.exp(-tt / 0.15);
    const trem = 1 + 0.12 * Math.sin(TAU * 4.5 * tt);
    return run(lp, Math.sin(pc + idx * Math.sin(pm))) * Math.exp(-tt / (dur * 0.35)) * trem * vel * (1 - Math.exp(-tt / 0.002));
  });
  place(buf, t0, { gain: 0.14, pan, verb: 0.45, echo, keys: true });
}

/** Sine sub bass with a touch of second harmonic so small speakers can follow it. */
function bass(m: number, t0: number, dur: number, vel = 0.7) {
  const f = mtof(m), lp = biquad('lp', 400, 0.7);
  let ph = 0;
  const buf = render(dur + 0.2, (tt) => {
    ph += (TAU * f) / SR;
    const env = Math.min(1, tt / 0.02) * (tt > dur ? Math.exp(-(tt - dur) / 0.05) : 1);
    return run(lp, Math.sin(ph) + 0.18 * Math.sin(2 * ph)) * env * vel;
  });
  place(buf, t0, { gain: 0.11, keys: true });
}

const KICKS: number[] = [];
/** Soft kick: a sine dropping from 110 to 46 Hz with a short felt click; registered for the sidechain duck. */
function kick(t0: number, vel = 0.8) {
  KICKS.push(t0);
  let ph = 0;
  const lp = biquad('lp', 1500, 0.7);
  const buf = render(0.5, (tt) => {
    ph += (TAU * (46 + 64 * Math.exp(-tt / 0.035))) / SR;
    return run(lp, Math.sin(ph) * Math.exp(-tt / 0.26) + (tt < 0.004 ? noise() * 0.15 : 0)) * vel * (1 - Math.exp(-tt / 0.0015));
  });
  place(buf, t0, { gain: 0.24 });
}

/** Soft clap: three quick filtered bursts and a short tail, mostly heard through the reverb. */
function clap(t0: number, vel = 0.6) {
  [0, 0.011, 0.022].forEach((d, k) => noiseHit(t0 + d, { len: 0.05, decay: 0.008, type: 'bp', f: 1300, q: 1.1, gain: 0.1 * vel * (k === 2 ? 1.3 : 1), verb: 0.5 }));
  noiseHit(t0 + 0.022, { len: 0.25, decay: 0.06, type: 'bp', f: 1100, q: 0.9, gain: 0.05 * vel, verb: 0.6 });
}

/** Shaker / hat: highpassed noise below 10 kHz; `open` lengthens it into an open hat. */
function shaker(t0: number, vel = 0.5, open = false) {
  const hp = biquad('hp', 5000, 0.7), lp = biquad('lp', 9500, 0.7), decay = open ? 0.09 : 0.02;
  const buf = render(decay * 5, (tt) => run(lp, run(hp, noise())) * Math.exp(-tt / decay) * (1 - Math.exp(-tt / 0.002)));
  place(buf, t0, { gain: (open ? 0.22 : 0.32) * vel, pan: open ? -0.2 : 0.3, verb: 0.15 });
}

/** Low impact for the drops: a long sine boom. */
function boom(t0: number, gain = 0.3) {
  let ph = 0;
  const buf = render(1.6, (tt) => {
    ph += (TAU * (38 + 30 * Math.exp(-tt / 0.08))) / SR;
    return Math.sin(ph) * Math.exp(-tt / 0.55) * (1 - Math.exp(-tt / 0.002));
  });
  place(buf, t0, { gain, verb: 0.2 });
}

/**
 * Riser for the builds: band-passed noise sweeping upward and a sine climbing an octave, both swelling
 * until `t1`, where the caesura cuts them off.
 */
function riser(t0: number, t1: number, m: number, gain = 1) {
  const len = t1 - t0, fl = biquad('bp', 300, 1.4), f = mtof(m);
  let ph = 0;
  const buf = render(len, (tt, i) => {
    const p = tt / len;
    if (i % 16 === 0) tune(fl, 'bp', 300 * (3200 / 300) ** p, 1.4);
    ph += (TAU * f * 2 ** p) / SR;
    return (run(fl, noise()) * 1.4 + 0.25 * Math.sin(ph)) * p ** 1.6;
  });
  place(buf, t0, { gain: 0.06 * gain, verb: 0.35 });
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

// Chords: pad voicing and bass root. Major-ninth and suspended colours keep the harmony soft.
const CH = {
  F: { pad: [53, 57, 60, 64], top: [65, 69, 72, 76], root: 41 },   // Fmaj9 (F A C E, G on top in the arps)
  Dm: { pad: [53, 57, 60, 64], top: [62, 65, 69, 72], root: 38 },  // Dm9
  Bb: { pad: [53, 57, 60, 62], top: [62, 65, 69, 72], root: 34 },  // Bbmaj9
  Gm: { pad: [53, 57, 58, 62], top: [62, 65, 67, 70], root: 43 },  // Gm9
  C: { pad: [53, 55, 58, 62], top: [60, 65, 67, 70], root: 36 },   // C11
};
type Chord = (typeof CH)[keyof typeof CH];
const ARP = [0, 2, 1, 3, 2, 1, 3, 0];
/** Mallet arpeggio over a chord's top voicing; `step` is the note length in beats. */
function arp(c: Chord, bar: number, beat: number, beats: number, { step = 0.5, vel = (_p: number) => 0.45, echo = 0.3 } = {}) {
  const n = Math.round(beats / step);
  for (let k = 0; k < n; k++) mallet(c.top[ARP[k % ARP.length]], T0(bar, beat + k * step), vel(k / n) * (k % 2 ? 0.8 : 1), { echo, pan: k % 2 ? 0.25 : -0.25 });
}
/** Half-time groove: kick on 1 and the and of 3, clap on 3, offbeat hats. */
function grooveA(bar: number, from = 0, to = 4) {
  for (const b of [0, 2.5]) if (b >= from && b < to) kick(T0(bar, b), 0.7);
  if (2 >= from && 2 < to) clap(T0(bar, 2), 0.5);
  for (let b = 0.5; b < 4; b += 1) if (b >= from && b < to) shaker(T0(bar, b), 0.6);
}
/** Full groove: soft four-on-the-floor kick, claps on 2 and 4, offbeat hats and a sixteenth shaker. */
function grooveB(bar: number, to = 4) {
  for (let b = 0; b < to; b++) kick(T0(bar, b), 0.8);
  for (const b of [1, 3]) if (b < to) clap(T0(bar, b), 0.6);
  for (let b = 0; b < to; b += 0.25) shaker(T0(bar, b), b % 1 === 0.5 ? 0.7 : 0.3, b % 1 === 0.5);
}
const ramp = (a: number, b: number) => (p: number) => a + (b - a) * p;

const CUT1 = C.save1, CUT2 = C.save2;
const bar1 = Math.round(CUT1 / BAR);                // the bar the first caesura opens
const bar2 = Math.round((CUT2 + BEAT) / BAR);       // the bar that follows the second caesura
const b7 = bar2 - 1;
const END_BAR = Math.round(C.end / BAR);
const b10 = END_BAR - 1;

// Logo: the pad breathes in and a vibraphone arpeggio rises with the ink.
pad(CH.F.pad, C.logo[0] - 0.1, C.logo[3] + 0.3, { attack: 1.0, release: 0.9, open: () => 1300 });
[65, 69, 72, 76].forEach((m, k) => vibe(m, C.logo[0] + 0.05 + k * 0.22, 0.42 + k * 0.03));

// Motivation: pad, a quiet mallet pattern, sub bass, then a shaker. I – vi IV – ii V.
pad(CH.F.pad, T0(1, 0), T0(2, 0), { attack: 0.6, open: () => 1600 });
arp(CH.F, 1, 0, 4, { vel: () => 0.38 });
bass(CH.F.root, T0(1, 0), D(3.8), 0.5);
pad(CH.Dm.pad, T0(2, 0), T0(2, 2), { attack: 0.4, open: () => 1700 }); pad(CH.Bb.pad, T0(2, 2), T0(3, 0), { attack: 0.4, open: () => 1700 });
arp(CH.Dm, 2, 0, 2, { vel: () => 0.42 }); arp(CH.Bb, 2, 2, 2, { vel: () => 0.42 });
bass(CH.Dm.root, T0(2, 0), D(1.9), 0.55); bass(CH.Bb.root, T0(2, 2), D(1.9), 0.55);
for (let b = 0.5; b < 8; b += 1) shaker(T0(2, b), 0.45);
pad(CH.Gm.pad, T0(3, 0), T0(3, 2), { attack: 0.4, open: () => 1700 }); pad(CH.C.pad, T0(3, 2), T0(4, 0), { attack: 0.4, open: () => 1700 });
arp(CH.Gm, 3, 0, 2, { vel: () => 0.42 }); arp(CH.C, 3, 2, 2, { vel: () => 0.42 });
bass(CH.Gm.root, T0(3, 0), D(1.9), 0.55); bass(CH.C.root, T0(3, 2), D(1.9), 0.55);

// The shortcut: a build. Sixteenth mallets swell, the pad filter opens, a riser climbs into the click.
const build1 = T0(bar1 - 1, 0);
pad(CH.Bb.pad, build1, T0(bar1 - 1, 2), { attack: 0.3, open: ramp(1500, 2200) });
pad(CH.C.pad, T0(bar1 - 1, 2), CUT1, { attack: 0.2, release: 0.01, open: ramp(2200, 3600) });
arp(CH.Bb, bar1 - 1, 0, 2, { step: 0.25, vel: ramp(0.32, 0.48) });
arp(CH.C, bar1 - 1, 2, 2, { step: 0.25, vel: ramp(0.48, 0.62) });
bass(CH.Bb.root, build1, D(1.95), 0.6); bass(CH.C.root, T0(bar1 - 1, 2), CUT1 - T0(bar1 - 1, 2) - 0.01, 0.65);
for (let b = 0; b < 4; b += 0.25) shaker(T0(bar1 - 1, b), 0.25 + 0.5 * (b / 4));
kick(T0(bar1 - 1, 2), 0.55); kick(T0(bar1 - 1, 3), 0.6);
riser(build1, CUT1, 48);

// Caesura. The drop lands on beat two, together with the note: impact, then a half-time groove.
const drop1 = T0(bar1, 1);
boom(drop1, 0.16); kick(drop1, 0.9);
pad(CH.F.pad, drop1, T0(bar1 + 1, 0), { attack: 0.12, open: () => 2300 });
arp(CH.F, bar1, 1, 3, { vel: () => 0.5 });
bass(CH.F.root, drop1, D(1.4), 0.75); bass(CH.F.root, T0(bar1, 2.5), D(1.4), 0.7);
grooveA(bar1, 1.5);
pad(CH.Dm.pad, T0(bar1 + 1, 0), T0(bar1 + 1, 2), { attack: 0.2, open: () => 2300 });
pad(CH.Bb.pad, T0(bar1 + 1, 2), T0(bar1 + 2, 0), { attack: 0.2, open: () => 2300 });
arp(CH.Dm, bar1 + 1, 0, 2, { vel: () => 0.5 }); arp(CH.Bb, bar1 + 1, 2, 2, { vel: () => 0.5 });
bass(CH.Dm.root, T0(bar1 + 1, 0), D(1.4), 0.75); bass(CH.Dm.root, T0(bar1 + 1, 1.5), D(0.45), 0.6);
bass(CH.Bb.root, T0(bar1 + 1, 2), D(1.4), 0.75); bass(CH.Bb.root, T0(bar1 + 1, 3.5), D(0.45), 0.6);
grooveA(bar1 + 1);

// Appending: Gm9 with the groove, then the drums fall away into a short build that Enter cuts off.
pad(CH.Gm.pad, T0(b7, 0), T0(b7, 2), { attack: 0.2, open: () => 2300 });
pad(CH.C.pad, T0(b7, 2), CUT2, { attack: 0.15, release: 0.01, open: ramp(2200, 3600) });
arp(CH.Gm, b7, 0, 2, { vel: () => 0.5 });
arp(CH.C, b7, 2, (CUT2 - T0(b7, 2)) / BEAT, { step: 0.25, vel: ramp(0.5, 0.62) });
bass(CH.Gm.root, T0(b7, 0), D(1.9), 0.75); bass(CH.C.root, T0(b7, 2), CUT2 - T0(b7, 2) - 0.01, 0.7);
grooveA(b7, 0, 2);
for (let b = 2; b < 3; b += 0.125) shaker(T0(b7, b), 0.3 + 0.5 * (b - 2));
riser(T0(b7, 1.5), CUT2, 48, 0.9);

// Caesura, then the full drop on the downbeat: I – vi IV – ii V, with a vibraphone hook.
const drop2 = T0(bar2, 0);
boom(drop2, 0.19);
const full = [[CH.F, CH.F], [CH.Dm, CH.Bb], [CH.Gm, CH.C]] as const;
full.forEach(([a, b], k) => {
  const bar = bar2 + k;
  pad(a.pad, T0(bar, 0), T0(bar, 2), { attack: 0.08, open: () => 2700 });
  pad(b.pad, T0(bar, 2), T0(bar + 1, 0), { attack: 0.08, open: () => 2700 });
  arp(a, bar, 0, 2, { step: 0.25, vel: () => 0.42, echo: 0.25 }); arp(b, bar, 2, 2, { step: 0.25, vel: () => 0.42, echo: 0.25 });
  for (const [c, beat] of [[a, 0], [b, 2]] as const) {
    bass(c.root, T0(bar, beat), D(0.9), 0.8); bass(c.root, T0(bar, beat + 1), D(0.4), 0.65); bass(c.root + 12, T0(bar, beat + 1.5), D(0.4), 0.5);
  }
  grooveB(bar, bar === b10 ? 2 : 4);
});
const HOOK: [number, number, number, number][] = [
  [bar2, 0, 72, 0.55], [bar2, 1.5, 69, 0.45], [bar2, 2, 67, 0.45], [bar2, 3, 69, 0.45],
  [bar2 + 1, 0, 70, 0.5], [bar2 + 1, 1, 69, 0.45], [bar2 + 1, 2, 65, 0.5],
  [b10, 0, 67, 0.5], [b10, 1, 70, 0.45], [b10, 2, 72, 0.5],
];
for (const [bar, beat, m, vel] of HOOK) vibe(m, T0(bar, beat), vel, { dur: 1.8 });
riser(T0(b10, 2), C.end, 48, 0.7);

// The end card: the riser gives way to one chord with the ink, and the vibraphone answers as the name settles.
boom(C.end, 0.13);
pad(CH.F.pad, C.end, T.duration - 1.8, { attack: 0.3, release: 1.4, open: ramp(2200, 1100) });
bass(CH.F.root, C.end, 2.4, 0.6);
[53, 57, 60, 65, 69].forEach((m, k) => mallet(m, C.end + k * 0.09, 0.5 - k * 0.04, { echo: 0.35 }));
[69, 72, 76].forEach((m, k) => vibe(m, C.end + 0.8 + k * 0.16, 0.38 - k * 0.04, { dur: 3 }));

// ------------------------------------------------------------------ tape rewind

/**
 * Replace the music under the rewind with the music of the sent branch, played backwards and fast,
 * so the score retraces the picture. Tape speed eases in and out, so the pitch rises and falls with it.
 * Content above 2.5 kHz is filtered out first and the result is lowpassed again, so the fast passage stays soft.
 */
function rewindMusic([d0, d1]: CueRange, s0: number, s1: number, silentUntil: number) {
  const len = Math.round((d1 - d0) * SR), j0 = Math.round(d0 * SR), stop = Math.round(silentUntil * SR);
  for (const ch of [...bus.main, ...bus.keys, ...bus.mainSend, ...bus.keysSend, ...bus.echoSend]) {
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

function freeverb(inL: Float32Array, inR: Float32Array, { room = 0.88, damp = 0.4 } = {}) {
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

/** Ping-pong echo at a dotted eighth; each repeat crosses sides and loses some top end. */
function pingPong(inL: Float32Array, inR: Float32Array, { time = 0.75 * BEAT, fb = 0.38 } = {}) {
  const d = Math.round(time * SR), bl = new Float32Array(d), br = new Float32Array(d);
  const lpL = biquad('lp', 2600, 0.7), lpR = biquad('lp', 2600, 0.7);
  const out = [new Float32Array(N), new Float32Array(N)];
  let i = 0;
  for (let n = 0; n < N; n++) {
    const yl = bl[i], yr = br[i];
    bl[i] = run(lpL, (inL[n] + inR[n]) * 0.5 + fb * yr);
    br[i] = run(lpR, fb * yl);
    if (++i >= d) i = 0;
    out[0][n] = yl;
    out[1][n] = yr;
  }
  return out;
}

// The caesura gate: at each save the music is cut cleanly for one beat. The gate sits before the reverb and echo,
// so their tails keep drifting through the silence, as in a break before a drop.
const gate = new Float32Array(N).fill(1);
for (const t of [CUT1, CUT2]) {
  const a = Math.round(t * SR), b = Math.round((t + BEAT) * SR), ramp = Math.round(0.008 * SR);
  for (let n = a - ramp; n < Math.min(N, b + ramp); n++) {
    const g = n < a ? (a - n) / ramp : n < b ? 0 : (n - b) / ramp;
    gate[n] = Math.min(gate[n], g);
  }
}
// Pad, bass and mallets duck under each kick (fast dip, 160 ms recovery) so the groove breathes.
const duck = new Float32Array(N).fill(1);
for (const tk of KICKS) {
  const i0 = Math.round(tk * SR);
  for (let i = i0; i < Math.min(N, i0 + SR); i++) duck[i] = Math.min(duck[i], 1 - 0.35 * Math.exp(-(i - i0) / (0.16 * SR)));
}
const echoed = pingPong(bus.echoSend[0].map((x, n) => x * gate[n]), bus.echoSend[1].map((x, n) => x * gate[n]));
const sendOf = (c: number) => bus.mainSend[c].map((x, n) => (x + bus.keysSend[c][n] * duck[n]) * gate[n] + bus.sfxSend[c][n] + echoed[c][n] * 0.3);
const wet = freeverb(sendOf(0), sendOf(1));
const mix = [0, 1].map((c) => {
  const hp = biquad('hp', 30), lp = biquad('lp', 12000, 0.6);
  return bus.main[c].map((x, n) => run(lp, run(hp, (x + bus.keys[c][n] * duck[n]) * gate[n] + bus.sfx[c][n] + wet[c][n] * 1.2 + echoed[c][n] * 0.7)));
});

// Level: RMS to TARGET_RMS dBFS, soft knee above 0.7, peak at -1 dBFS; short fade at both ends.
const TARGET_RMS = -18;
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
