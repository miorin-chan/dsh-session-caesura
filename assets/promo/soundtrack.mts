#!/usr/bin/env node
// soundtrack.mts — 合成休止符宣传片的配乐与界面音效，输出 48 kHz 立体声 16-bit WAV。
//
// 用法: node soundtrack.mts <promo.html> <out.wav>
//
// 所有时间点读自 promo.html 里的 <script id="timeline">，与画面共用一份 cue sheet；
// 改动画时间后重新运行即可保持同步。合成过程不依赖外部素材，同一输入输出按字节一致。
// 乐器与母带处理沿用 dsh-next-actions 宣传片的 soundtrack.mts。
//
// 风格：lo-fi。温暖的电钢琴和弦 + 摇摆鼓组 + 圆润低音；界面音效全部是无音高的轻敲、点击、按键和风声。
// 96 BPM，一小节 2.5 s，F 大调，Fmaj7–Am7–Dm9–Bbmaj7 四小节一循环。时间为成片绝对时间：
//   0.0–7.5    动机：铺底与电钢琴；倒回时音乐压低，带一段倒带声
//   7.5–10.0   按住 ⌘：踩镲 + 轻底鼓
//   10.0–20.0  保存与追加：完整鼓组与低音
//   20.0–25.0  复制、回退、发送：鼓组退场，Gm7 → C9sus4，反向和弦吸入
//   25.0       Fmaj9 落点 = 片尾休止符开始落墨，随后淡出
// 两次保存（save1、save2）都落在拍点上：音乐在那里休止一拍，只留下点击与界面音效。

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
const SIX = BEAT / 4;
const SWING = SIX * 0.18;
/** Bar 0 starts with the film. */
const at = (bar: number, sixteenth: number) => bar * BAR + sixteenth * SIX;

// ------------------------------------------------------------------ primitives

// Three buses: `keys` is ducked under the kick, `main` is not, and `sfx` carries the interface sounds.
// The music buses (`main`, `keys`) pass through the rest gate; `sfx` does not. All feed the reverb send.
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
 * Mellow electric-piano note: FM at ratio 1 with a low, fast-decaying index (warmth, no bell partials),
 * a little second harmonic, slow tremolo and a velocity-dependent low-pass.
 */
function epNote(m: number, dur: number, vel: number) {
  const f = mtof(m), lp = biquad('lp', 1100 + 900 * vel, 0.7), rel = 0.12;
  return render(dur + rel, (tt) => {
    const env = (1 - Math.exp(-tt / 0.005)) * Math.exp(-tt / 1.6) * (tt > dur ? Math.exp(-(tt - dur) / (rel / 4)) : 1);
    const idx = (0.3 + 0.5 * vel) * Math.exp(-tt / 0.25);
    const x = Math.sin(TAU * f * tt + idx * Math.sin(TAU * f * tt)) + 0.12 * Math.sin(2 * TAU * f * tt) * Math.exp(-tt / 0.3);
    return run(lp, x) * env * (1 + 0.12 * Math.sin(TAU * 4.8 * tt)) * vel;
  });
}

/** Strummed chord: notes 12 ms apart, spread across the stereo field. Returns the mono sum when `bounce`. */
function epChord(notes: number[], t0: number, dur: number, vel: number, { gain = 0.13, bounce = false } = {}) {
  const strum = 0.012;
  const sum = bounce ? new Float32Array(Math.round((dur + 0.15 + strum * notes.length) * SR)) : null;
  notes.forEach((m, k) => {
    const buf = epNote(m, dur - k * strum, vel * (k === 0 ? 1 : 0.85));
    if (sum) buf.forEach((s, i) => { sum[i + Math.round(k * strum * SR)] += s; });
    else place(buf, t0 + k * strum, { gain, pan: (k / (notes.length - 1) - 0.5) * 0.6, verb: 0.3, keys: true });
  });
  return sum;
}

/** Soft, dark detuned-saw pad under the keys. */
function pad(notes: number[], t0: number, t1: number, { attack = 0.4, release = 0.7, gain = 0.035 } = {}) {
  const hold = t1 - t0;
  notes.forEach((m, k) => {
    for (const cents of [-6, 6]) {
      const f = mtof(m) * 2 ** (cents / 1200), dt = f / SR, lp = biquad('lp', 750, 0.6);
      let p = rand();
      const buf = render(hold + release, (tt) => {
        const v = 2 * p - 1 - polyBlep(p, dt);
        p += dt;
        if (p >= 1) p -= 1;
        const rise = Math.sin((Math.PI / 2) * Math.min(1, tt / attack)) ** 2;
        const fall = tt > hold ? Math.exp(-(tt - hold) / (release / 4)) : 1;
        return run(lp, v) * rise * fall;
      });
      place(buf, t0, { gain, pan: Math.sign(cents) * (k % 2 ? 0.5 : 0.3), verb: 0.4, keys: true });
    }
  });
}

const KICKS: number[] = [];
function kick(t0: number, gain = 0.42) {
  KICKS.push(t0);
  let ph = 0;
  const lp = biquad('lp', 1800);
  const buf = render(0.45, (tt) => {
    ph += (TAU * (42 + 70 * Math.exp(-tt / 0.04))) / SR;
    return run(lp, Math.tanh(1.4 * Math.sin(ph) * Math.exp(-tt / 0.22) * (1 - Math.exp(-tt / 0.002))));
  });
  place(buf, t0, { gain });
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

/** Short low sine thump; the "body" under taps, clicks and the snare. */
function thump(t0: number, f0: number, f1: number, decay: number, gain: number, pan = 0) {
  let ph = 0;
  const buf = render(decay * 6, (tt) => {
    ph += (TAU * (f1 + (f0 - f1) * Math.exp(-tt / 0.02))) / SR;
    return Math.sin(ph) * Math.exp(-tt / decay) * (1 - Math.exp(-tt / 0.001));
  });
  place(buf, t0, { gain, pan });
}

const hat = (t0: number, gain: number) => noiseHit(t0, { len: 0.1, decay: 0.022, type: 'bp', f: 6500, q: 0.7, gain, pan: 0.2 });
function snare(t0: number, gain = 0.12) {
  noiseHit(t0, { len: 0.35, decay: 0.08, type: 'bp', f: 1600, q: 0.8, gain, pan: -0.08, verb: 0.25 });
  thump(t0, 230, 185, 0.04, gain * 0.7);
}

function bass(m: number, t0: number, dur: number, gain = 0.22, decay = 1.4) {
  const f = mtof(m), lp = biquad('lp', 700);
  const buf = render(dur + 0.15, (tt) => {
    const body = Math.exp(-Math.min(tt, dur) / decay) * (tt > dur ? Math.exp(-(tt - dur) / 0.03) : 1);
    const x = Math.sin(TAU * f * tt) + 0.25 * Math.sin(2 * TAU * f * tt);
    return run(lp, Math.tanh(1.4 * x) * Math.min(1, tt / 0.015) * body);
  });
  place(buf, t0, { gain });
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

function boom(t0: number, gain = 0.3) {
  thump(t0, 60, 38, 0.6, gain);
}

// ------------------------------------------------------------------ music

const FMAJ7 = [53, 57, 60, 64], AM7 = [55, 57, 60, 64], DM9 = [53, 57, 60, 64], BBMAJ7 = [53, 57, 58, 62];
const GM7 = [53, 55, 58, 62], C9SUS4 = [53, 55, 58, 62];
const LOOP = [FMAJ7, AM7, DM9, BBMAJ7];
const ROOTS = [41, 45, 38, 34];                     // F2 A2 D2 Bb1, under LOOP
const END_BAR = Math.round(C.end / BAR);            // the final chord lands on this bar
const BREAK_BAR = END_BAR - 2;                      // drums leave for the note actions
const HATS_BAR = Math.round(C.rewind[1] / BAR);     // hats and a light kick once the feature starts
const GROOVE = Math.round(C.save1 / BAR);           // full groove from the first save

const chordOf = (bar: number) => (bar < BREAK_BAR ? LOOP[bar % 4] : bar === BREAK_BAR ? GM7 : C9SUS4);

// Opening: the pad swells under a soft chord, the keys comp gently through the motivation.
pad(FMAJ7, 0, at(1, 0), { attack: 1.6, gain: 0.04 });
epChord(FMAJ7, 0.1, 2.3, 0.5);
for (let bar = 1; bar < END_BAR; bar++) {
  const notes = chordOf(bar);
  const hits = bar === END_BAR - 1 ? [[0, 1], [6, 0.55]] : [[0, 0.9], [6, 0.5], [10, 0.65]];
  hits.forEach(([step, vel], i) => {
    const next = i + 1 < hits.length ? hits[i + 1][0] : 16;
    epChord(notes, at(bar, step), (next - step) * SIX, vel * (bar < HATS_BAR ? 0.8 : 1));
  });
  pad(notes, at(bar, 0), at(bar + 1, 0));
}

// Reverse swell of the final chord, ending exactly on the hit.
const FINAL = [55, 57, 60, 64, 69];
const swell = epChord(FINAL, 0, 0.9, 0.8, { bounce: true })!.reverse();
const swellLen = swell.length / SR;
swell.forEach((s, i, a) => { a[i] = s * Math.min(1, i / (0.2 * SR)); });
place(swell, C.end - swellLen, { gain: 0.12, verb: 0.3, keys: true });

epChord(FINAL, C.end, 3.2, 0.9);
pad(FINAL, C.end, T.duration - 1.4, { attack: 0.05, release: 1.4, gain: 0.04 });

// Drums: hats and a light kick for the shortcut, the swung groove from the first save.
const swing = (step: number) => (step % 4 === 2 ? SWING : 0);
const hats = (bar: number, gain = 1, steps = [0, 2, 4, 6, 8, 10, 12, 14]) =>
  steps.forEach((step) => hat(at(bar, step) + swing(step), (step % 4 ? 0.035 : 0.02) * gain));
hats(1, 0.35, [0, 4, 8, 12]);
hats(2, 0.45, [0, 4, 8, 12]);
for (let bar = HATS_BAR; bar < GROOVE; bar++) {
  hats(bar, 0.8);
  kick(at(bar, 0), 0.3);
  kick(at(bar, 8), 0.26);
}
for (let bar = GROOVE; bar < BREAK_BAR; bar++) {
  for (const step of [0, 6, 10]) kick(at(bar, step));
  for (const step of [4, 12]) snare(at(bar, step));
  hats(bar);
}
snare(at(BREAK_BAR - 1, 14), 0.06);
snare(at(BREAK_BAR - 1, 15), 0.08);
hats(BREAK_BAR, 0.5, [0, 4, 8, 12]);
hats(BREAK_BAR + 1, 0.4, [0, 4, 8]);
sweep(at(END_BAR - 1, 8), C.end, 400, 2500, { gain: 0.035, q: 0.8, verb: 0.2, shape: (p) => p ** 2 });
kick(C.end, 0.48);
boom(C.end);

for (let bar = GROOVE; bar < BREAK_BAR; bar++) {
  const m = ROOTS[bar % 4];
  bass(m, at(bar, 0), 5 * SIX);
  bass(m, at(bar, 6), 3 * SIX);
  bass(m, at(bar, 10), 5 * SIX);
}
bass(43, at(BREAK_BAR, 0), 9 * SIX, 0.18);
bass(43, at(BREAK_BAR, 10), 5 * SIX, 0.16);
bass(36, at(END_BAR - 1, 0), C.end - at(END_BAR - 1, 0) - 0.01, 0.18);
bass(29, C.end, 2.4, 0.2, 1.2);

// ------------------------------------------------------------------ interface sounds (no pitched tones)

layer = 'sfx';

/** Tape rewind: band-passed noise falling in pitch with a fast flutter that slows down. */
function rewindFx(t0: number, t1: number, gain = 0.07) {
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

sweep(C.winIn[0], C.winIn[1] + 0.1, 700, 2600, { gain: 0.04, q: 1.0 });                              // 窗口出现
tap(C.r1Actions[0], 0.03, { f: 2000, pan: -0.25 });                                                  // 操作行
[...C.noteKeys, ...C.appendKeys].forEach((t) => key(t, 0.1 * (0.8 + 0.4 * rand())));               // 打字
key(C.enter, 0.14);                                                                                   // Enter：发出去
sweep(C.sent[0], C.sent[0] + 0.38, 700, 3800, { gain: 0.06, q: 1.2, pan: 0.2, shape: (p) => Math.sin(Math.PI * p) });
tap(C.r2Think[0], 0.03, { f: 1800, pan: -0.3 });                                                     // 思考中
sweep(C.r2Think[1], C.r2Done + 0.05, 1200, 4000, { gain: 0.018, q: 2 });
tap(C.r2Done, 0.035, { f: 2400, pan: -0.3 });                                                        // 已完成
tap(C.r2Actions[0], 0.03, { f: 2000, pan: -0.25 });
rewindFx(C.rewind[0] - 0.05, C.rewind[1] + 0.05);                                                    // 倒回
for (const [t0, t1] of [...C.mod, C.mod2]) {                                                          // 按下 / 松开 ⌘
  key(t0, 0.12);
  thump(t0 + 0.02, 320, 190, 0.03, 0.07, 0.25);                                                       // 休止符出现
  key(t1, 0.06);
}
click(C.save1, 0.26, 0.1);                                                                            // 点休止符
key(C.save2, 0.14);                                                                                   // ⌘ Enter
for (const [fly, land] of [[C.fly1, C.note1[0] + 0.2], [C.fly2, C.append]] as const) {
  sweep(fly[0], fly[1], 900, 3200, { gain: 0.05, q: 1.1, pan: 0.15 });                               // 草稿飞向结语
  thump(land, 220, 120, 0.05, 0.12);                                                                  // 落入结语
  noiseHit(land, { len: 0.03, decay: 0.006, type: 'bp', f: 1200, q: 1, gain: 0.05 });
}
tap(C.store[0], 0.04, { f: 2800, pan: -0.2 });                                                       // 标注
click(C.copy, 0.22, 0.15);                                                                            // 复制
tap(C.copy + 0.06, 0.04, { f: 2600, pan: 0.15 });                                                    // ✓
click(C.rewindNote, 0.24, 0.15);                                                                      // 回退
sweep(C.flyBack[0], C.flyBack[1], 3200, 900, { gain: 0.055, q: 1.1, pan: -0.15 });                   // 结语飞回输入框
thump(C.fill, 220, 120, 0.05, 0.12);
noiseHit(C.fill, { len: 0.03, decay: 0.006, type: 'bp', f: 1200, q: 1, gain: 0.05 });
sweep(C.winOut[0], C.winOut[1], 2600, 700, { gain: 0.035, q: 1.0 });                                  // 窗口退场

// ------------------------------------------------------------------ master

function freeverb(inL: Float32Array, inR: Float32Array, { room = 0.82, damp = 0.4 } = {}) {
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

// The rest gate: music stops for one beat at each save and sinks under the rewind; sfx pass untouched.
const gate = new Float32Array(N).fill(1);
const shapeGate = (t0: number, t1: number, depth: number, down: number, up: number) => {
  for (let n = Math.max(0, Math.round((t0 - down) * SR)); n < Math.min(N, Math.round((t1 + up) * SR)); n++) {
    const tt = n / SR;
    const fall = clamp((tt - (t0 - down)) / down, 0, 1), rise = clamp((t1 + up - tt) / up, 0, 1);
    const g = 1 - depth * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(fall, rise)));
    gate[n] = Math.min(gate[n], g);
  }
};
for (const t of [C.save1, C.save2]) shapeGate(t, t + BEAT - 0.012, 1, 0.012, 0.012);
shapeGate(C.rewind[0] + 0.1, C.rewind[1] - 0.2, 0.75, 0.25, 0.25);

// Keys duck under each kick (fast dip, 140 ms recovery) so the groove breathes.
const duck = new Float32Array(N).fill(1);
for (const tk of KICKS) {
  const i0 = Math.round(tk * SR);
  for (let i = i0; i < Math.min(N, i0 + SR); i++) duck[i] = Math.min(duck[i], 1 - 0.3 * Math.exp(-(i - i0) / (0.14 * SR)));
}
const sendOf = (c: number) => bus.mainSend[c].map((x, n) => (x + bus.keysSend[c][n] * duck[n]) * gate[n] + bus.sfxSend[c][n]);
const wet = freeverb(sendOf(0), sendOf(1));
const mix = [0, 1].map((c) => {
  const hp = biquad('hp', 28);
  return bus.main[c].map((x, n) => run(hp, (x + bus.keys[c][n] * duck[n]) * gate[n] + bus.sfx[c][n] + wet[c][n] * 1.1));
});

// Level: RMS to TARGET_RMS dBFS, soft knee above 0.7, peak at -1 dBFS; short fade at both ends.
const TARGET_RMS = -17.5;
let sum = 0;
for (let n = 0; n < N; n++) sum += (mix[0][n] ** 2 + mix[1][n] ** 2) / 2;
const scale = 10 ** (TARGET_RMS / 20) / Math.sqrt(sum / N);
const knee = (x: number) => {
  const a = Math.abs(x);
  return a < 0.7 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
};
let peak = 0;
for (const ch of mix) for (let n = 0; n < N; n++) {
  const fade = Math.min(1, n / (0.01 * SR), (N - n) / (0.25 * SR));
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
