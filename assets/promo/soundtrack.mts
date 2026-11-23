#!/usr/bin/env node
// soundtrack.mts — 合成休止符宣传片的配乐与界面音效，输出 48 kHz 立体声 16-bit WAV。
//
// 用法: node soundtrack.mts <promo.html> <out.wav>
//
// 所有时间点读自 promo.html 里的 <script id="timeline">，与画面共用一份 cue sheet；
// 改动画时间后重新运行即可保持同步。合成过程不依赖外部素材，同一输入输出按字节一致。
//
// 风格：古典室内乐。钢琴（加性合成，带弦的非谐性与击弦噪声）唱旋律、左手 Alberti 低音，
// 弦乐组（失谐锯齿波、延迟颤音）铺和声，拨弦（Karplus–Strong）走低音线。
// Andante，96 BPM 4/4，一小节 2.5 s，F 大调。时间为成片绝对时间：
//   0.0–2.5    标志：钢琴琶音升起，弦乐轻铺
//   2.5–9.1    动机：钢琴独奏，I–vi–IV–ii–V
//   9.1–9.9    倒带：刚才奏过的音乐被倒着快放回去，音高随带速升降
//   10.0–12.5  按住 ⌘：弦乐进入，停在属七和弦的延长记号上
//   12.5       第一次保存：延长音被干净地切断，休止一拍（caesura），随后回到主和弦
//   19.375     第二次保存：同样的延长、切断与休止
//   20.0–27.5  全奏：拨弦、钢琴、弦乐，终止式走向片尾
//   27.5       F 大调主和弦落在片尾休止符落墨的同一刻，名字出现时钢琴在高音区轻拨一串琶音
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
  mod2: CueRange;
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

// Three buses: `keys` (piano) and `main` (strings) are the music and pass through the caesura gate;
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

/**
 * Piano note. Partials follow stiff-string inharmonicity f_k = k·f·√(1 + B·k²); each decays in two stages
 * (prompt sound, then aftersound), higher partials faster. The lowest partials use two slightly detuned strings,
 * a short filtered noise burst stands in for the hammer, and the damper closes `dur` seconds after the attack.
 * Oscillators rotate a phasor instead of calling sin per sample.
 */
function pianoNote(m: number, dur: number, vel: number) {
  const f = mtof(m), B = 0.00032;
  const tau1 = clamp(3.2 * Math.sqrt(262 / f), 0.7, 6);
  const damp = 0.09;
  const len = Math.min(dur, tau1 * 4) + damp * 6;
  const parts: { cr: number; ci: number; re: number; im: number; amp: number; tau: number }[] = [];
  for (let k = 1; k <= 14; k++) {
    const fk = k * f * Math.sqrt(1 + B * k * k);
    if (fk > 9000) break;
    const amp = k ** -1.25 * Math.exp(-(k - 1) * (0.55 - 0.35 * vel));
    const tau = tau1 / (1 + 0.32 * (k - 1) ** 1.25);
    for (const cents of k <= 3 ? [-0.9, 0.9] : [0]) {
      const w = (TAU * fk * 2 ** (cents / 1200)) / SR, ph = rand() * TAU;
      parts.push({ cr: Math.cos(w), ci: Math.sin(w), re: Math.cos(ph), im: Math.sin(ph), amp: k <= 3 ? amp / 2 : amp, tau });
    }
  }
  const hammer = biquad('lp', 1200 + 3000 * vel, 0.8);
  const tone = biquad('lp', 2200 + 5200 * vel, 0.6);
  return render(len, (tt) => {
    let x = 0;
    for (const p of parts) {
      const re = p.re * p.cr - p.im * p.ci;
      p.im = p.re * p.ci + p.im * p.cr;
      p.re = re;
      x += p.im * p.amp * (0.6 * Math.exp(-tt / (0.22 * p.tau)) + 0.4 * Math.exp(-tt / p.tau));
    }
    if (tt < 0.03) x += run(hammer, noise()) * 0.25 * vel * Math.exp(-tt / 0.006);
    const attack = 1 - Math.exp(-tt / 0.0015);
    const release = tt > dur ? Math.exp(-(tt - dur) / damp) : 1;
    return run(tone, x) * attack * release * vel;
  });
}

/** Piano voice on the keys bus, panned by register like a grand seen from the audience. */
function piano(m: number, t0: number, dur: number, vel: number) {
  place(pianoNote(m, dur, vel), t0, { gain: 0.16, pan: clamp((m - 62) / 36, -0.6, 0.6), verb: 0.32, keys: true });
}

/** Pizzicato: Karplus–Strong string with a lowpassed pluck and a small body resonance. */
function pizz(m: number, t0: number, vel: number, { t60 = 0.9, gain = 0.3, pan = -0.25 } = {}) {
  const f = mtof(m), period = Math.max(2, Math.round(SR / f - 0.5));
  const line = new Float32Array(period);
  const pluck = biquad('lp', 500 + 2200 * vel, 0.7);
  for (let i = 0; i < period; i++) line[i] = run(pluck, noise());
  const rho = 10 ** (-3 / (t60 * f));
  const body = biquad('bp', 260, 1.2);
  let i = 0, prev = 0;
  const buf = render(t60 + 0.1, (tt) => {
    const y = line[i];
    line[i] = rho * 0.5 * (y + prev);
    prev = y;
    if (++i >= period) i = 0;
    return (y + 0.6 * run(body, y)) * vel * (1 - Math.exp(-tt / 0.001));
  });
  place(buf, t0, { gain, pan, verb: 0.3 });
}

/**
 * Bowed string section: per note three detuned band-limited saws with a delayed vibrato, two lowpass stages,
 * a slow bow attack and release. `swell` shapes the dynamics over the note (0–1 → gain multiplier).
 */
function strings(notes: number[], t0: number, t1: number, { gain = 0.05, attack = 0.35, release = 0.35, cutoff = 1900, swell = (_p: number) => 1, pan = 0.2 } = {}) {
  const hold = t1 - t0;
  notes.forEach((m, n) => {
    const f = mtof(m);
    const voices = [-7, 0, 7].map((cents) => ({ f: f * 2 ** (cents / 1200), p: rand(), vib: 5.1 + rand() * 0.8, vph: rand() * TAU }));
    const lp1 = biquad('lp', cutoff * (m < 48 ? 0.55 : 1), 0.7), lp2 = biquad('lp', cutoff * 1.6, 0.6);
    const buf = render(hold + release * 4, (tt) => {
      let x = 0;
      const depth = 0.0022 * clamp((tt - 0.25) / 0.4, 0, 1);
      for (const v of voices) {
        const fv = v.f * (1 + depth * Math.sin(TAU * v.vib * tt + v.vph)), dt = fv / SR;
        x += 2 * v.p - 1 - polyBlep(v.p, dt);
        v.p += dt;
        if (v.p >= 1) v.p -= 1;
      }
      const rise = Math.sin((Math.PI / 2) * Math.min(1, tt / attack)) ** 2;
      const fall = tt > hold ? Math.exp(-(tt - hold) / release) : 1;
      return run(lp2, run(lp1, x / 3)) * rise * fall * swell(clamp(tt / hold, 0, 1));
    });
    place(buf, t0, { gain, pan: pan * (n % 2 ? 1 : -1) * (m < 48 ? 0.3 : 1), verb: 0.45 });
  });
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

// Pitches as MIDI numbers (F3 = 53, C4 = 60, F4 = 65, C5 = 72). Durations in beats.
const pn = (m: number | number[], bar: number, beat: number, beats: number, vel = 0.55) =>
  [m].flat().forEach((x) => piano(x, at(bar, beat), beats * BEAT, vel));
/** Left-hand Alberti figure in eighths: low, high, middle, high, from `beat` for `beats` beats. */
const alberti = ([lo, mid, hi]: number[], bar: number, beat: number, beats: number, vel = 0.32) => {
  for (let k = 0; k < beats * 2; k++) piano([lo, hi, mid, hi][k % 4], at(bar, beat + k / 2), BEAT * 0.9, vel * (k % 2 ? 0.8 : 1));
};
/** Notes that must stop exactly at a caesura; the gate removes whatever tail is left. */
const until = (t: number, bar: number, beat: number) => (t - at(bar, beat)) / BEAT;

const F = [53, 57, 60], Dm = [50, 53, 57], Bb = [46, 50, 53], Gm = [43, 46, 50], C7 = [48, 52, 58], FC = [48, 53, 57];
const CUT1 = C.save1, CUT2 = C.save2;
const bar1 = Math.round(CUT1 / BAR);                // the bar the first caesura opens
const bar2 = Math.round((CUT2 + BEAT) / BAR);       // the bar that follows the second caesura

// Logo: an arpeggio rises with the ink, the strings breathe under it.
[53, 57, 60, 65, 69, 72].forEach((m, k) => piano(m, C.logo[0] + 0.05 + k * 0.1, 2.3 - k * 0.1, 0.42 + k * 0.04));
strings([53, 60, 65], C.logo[0], C.logo[3], { gain: 0.03, attack: 0.9, release: 0.6 });

// Motivation: solo piano, I – vi IV – ii V.
pn(69, 1, 0, 1); pn(72, 1, 1, 1); pn(77, 1, 2, 2, 0.6);
alberti(F, 1, 0, 4);
pn(74, 2, 0, 1); pn(72, 2, 1, 1); pn(70, 2, 2, 1); pn(69, 2, 3, 1);
alberti(Dm, 2, 0, 2); alberti(Bb, 2, 2, 2);
pn(70, 3, 0, 1); pn(69, 3, 1, 1); pn(67, 3, 2, 2);
alberti(Gm, 3, 0, 2); alberti(C7, 3, 2, 2);

// The shortcut: strings enter; the phrase rises to C7 and holds it under a fermata until the click.
const fermata1 = at(bar1 - 1, 2);
pn(74, bar1 - 1, 0, 1); pn(72, bar1 - 1, 1, 1);
alberti(Bb, bar1 - 1, 0, 2);
pn([76, 70], bar1 - 1, 2, until(CUT1, bar1 - 1, 2), 0.5);
pn([48, 55, 58], bar1 - 1, 2, until(CUT1, bar1 - 1, 2), 0.36);
strings([46, 62, 65], at(bar1 - 1, 0), fermata1, { gain: 0.035, attack: 0.5, release: 0.25 });
strings([48, 64, 67, 70], fermata1, CUT1, { gain: 0.04, attack: 0.3, release: 0.012, swell: (p) => 0.6 + 0.5 * p });

// Caesura. The next phrase starts on beat two with the tonic: the note has landed.
pizz(41, at(bar1, 1), 0.8); pizz(48, at(bar1, 2), 0.6); pizz(45, at(bar1, 3), 0.6);
pn(77, bar1, 1, 1, 0.6); pn(76, bar1, 2, 0.5); pn(74, bar1, 2.5, 0.5); pn(72, bar1, 3, 1);
alberti(F, bar1, 1, 3);
strings([57, 60, 65], at(bar1, 1), at(bar1 + 1, 0), { gain: 0.025, attack: 0.5 });
pizz(46, at(bar1 + 1, 0), 0.7); pizz(53, at(bar1 + 1, 1), 0.5); pizz(48, at(bar1 + 1, 2), 0.7); pizz(55, at(bar1 + 1, 3), 0.5);
pn(70, bar1 + 1, 0, 1); pn(74, bar1 + 1, 1, 1); pn(72, bar1 + 1, 2, 2);
alberti(Bb, bar1 + 1, 0, 2); alberti([48, 52, 55], bar1 + 1, 2, 2);
strings([58, 62, 65], at(bar1 + 1, 0), at(bar1 + 1, 2), { gain: 0.028 });
strings([55, 60, 64], at(bar1 + 1, 2), at(bar1 + 2, 0), { gain: 0.028 });

// Appending: vi, then C7 again under a fermata until ⌘ Enter.
const b7 = bar2 - 1, fermata2 = at(b7, 2);
pizz(50, at(b7, 0), 0.7); pizz(45, at(b7, 1), 0.5); pizz(48, fermata2, 0.7);
pn(69, b7, 0, 1); pn(74, b7, 1, 1);
alberti(Dm, b7, 0, 2);
pn([76, 70], b7, 2, until(CUT2, b7, 2), 0.52);
pn([48, 55, 58], b7, 2, until(CUT2, b7, 2), 0.36);
strings([57, 62, 65], at(b7, 0), fermata2, { gain: 0.03, release: 0.25 });
strings([48, 64, 67, 70], fermata2, CUT2, { gain: 0.042, attack: 0.25, release: 0.012, swell: (p) => 0.6 + 0.5 * p });

// Caesura, then the full ensemble on the downbeat: I – IV ii – cadential 6/4 V7 – I.
pizz(41, at(bar2, 0), 0.85); pizz(48, at(bar2, 2), 0.6);
pn(77, bar2, 0, 2, 0.62); pn(72, bar2, 2, 1); pn(69, bar2, 3, 1);
alberti(F, bar2, 0, 4, 0.34);
strings([41], at(bar2, 0), at(bar2 + 1, 0), { gain: 0.05, cutoff: 1200 });
strings([60, 65, 69], at(bar2, 0), at(bar2 + 1, 0), { gain: 0.032 });

pizz(46, at(bar2 + 1, 0), 0.7); pizz(53, at(bar2 + 1, 1), 0.5); pizz(43, at(bar2 + 1, 2), 0.7); pizz(50, at(bar2 + 1, 3), 0.5);
pn(70, bar2 + 1, 0, 0.5); pn(74, bar2 + 1, 0.5, 0.5); pn(77, bar2 + 1, 1, 1, 0.6); pn(74, bar2 + 1, 2, 1); pn(70, bar2 + 1, 3, 1);
alberti(Bb, bar2 + 1, 0, 2); alberti(Gm, bar2 + 1, 2, 2);
strings([46], at(bar2 + 1, 0), at(bar2 + 2, 0), { gain: 0.05, cutoff: 1200 });
strings([58, 62, 65], at(bar2 + 1, 0), at(bar2 + 1, 2), { gain: 0.032 });
strings([58, 62, 67], at(bar2 + 1, 2), at(bar2 + 2, 0), { gain: 0.032 });

const END_BAR = Math.round(C.end / BAR);
const b10 = END_BAR - 1;
pizz(48, at(b10, 0), 0.8); pizz(48, at(b10, 2), 0.8);
pn(72, b10, 0, 1); pn(77, b10, 1, 1, 0.6); pn(76, b10, 2, 1);
[67, 70, 72, 76].forEach((m, k) => pn(m, b10, 3 + k / 4, 0.25, 0.48 + k * 0.04));
alberti(FC, b10, 0, 2); alberti(C7, b10, 2, 2);
strings([36], at(b10, 0), C.end, { gain: 0.055, cutoff: 1100 });
strings([57, 60, 65], at(b10, 0), at(b10, 2), { gain: 0.034 });
strings([55, 64, 70], at(b10, 2), C.end, { gain: 0.036, swell: (p) => 0.7 + 0.5 * p });

// Final tonic with the end card's ink; a high arpeggio as the name settles.
pn([41, 53, 60, 65, 69, 72, 77], END_BAR, 0, 5, 0.7);
pizz(29, C.end, 0.9, { t60: 1.6 });
strings([41, 53, 57, 60, 65, 69], C.end, T.duration - 1.8, { gain: 0.034, attack: 0.25, release: 0.9 });
[77, 81, 84, 89].forEach((m, k) => piano(m, C.end + 0.8 + k * 0.13, 2.4, 0.3 + k * 0.03));

// ------------------------------------------------------------------ tape rewind

/**
 * Replace the music under the rewind with the music of the sent branch, played backwards and fast,
 * so the score retraces the picture. Tape speed eases in and out, so the pitch rises and falls with it.
 * Content above 3 kHz is filtered out first; the fastest passage runs at about seven times speed.
 */
function rewindMusic([d0, d1]: CueRange, s0: number, s1: number, silentUntil: number) {
  const len = Math.round((d1 - d0) * SR), j0 = Math.round(d0 * SR), stop = Math.round(silentUntil * SR);
  for (const ch of [...bus.main, ...bus.keys, ...bus.mainSend, ...bus.keysSend]) {
    const lp1 = biquad('lp', 3000, 0.7), lp2 = biquad('lp', 3000, 0.7);
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
      ch[j0 + j] = x * Math.min(1, j / fadeIn, (len - j) / fadeOut);
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
for (const [t0, t1] of [...C.mod, C.mod2]) {                                                          // 按下 / 松开 ⌘
  key(t0, 0.11);
  thump(t0 + 0.02, 320, 190, 0.03, 0.06, 0.25);                                                       // 休止符出现
  key(t1, 0.055);
}
click(C.save1, 0.24, 0.1);                                                                            // 点休止符
key(C.save2, 0.13);                                                                                   // ⌘ Enter
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

function freeverb(inL: Float32Array, inR: Float32Array, { room = 0.86, damp = 0.32 } = {}) {
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
  const hp = biquad('hp', 30);
  return bus.main[c].map((x, n) => run(hp, (x + bus.keys[c][n]) * gate[n] + bus.sfx[c][n] + wet[c][n] * 1.3));
});

// Level: RMS to TARGET_RMS dBFS, soft knee above 0.7, peak at -1 dBFS; short fade at both ends.
const TARGET_RMS = -19;
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
