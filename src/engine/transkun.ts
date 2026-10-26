// Piano note finder: Transkun 2.0 (Yujia Yan & Zhiyao Duan, "Scoring intervals using non-hierarchical transformer
// for automatic piano transcription", ISMIR 2024; MIT licence), run with ONNX Runtime on the GPU.
// The network gives, for every key, a score for each possible note (start frame, end frame); a short dynamic program
// picks the best set of notes; a small head reads each note's loudness and fine timing. Audio is handled in 16 s
// windows, 8 s apart, stitched exactly as the original does. Step for step the same as the reference implementation.
import type { RawNote } from './project';
import { velocityToLoudness } from './notes';

export const TK_RATE = 44100;
const HOP = 1024, W = 4096, NB = W / 2 + 1, NMEL = 229, NWIN = 6, SEG = 16, STEP = 8;
const PITCHES = [-64, -67, ...Array.from({ length: 88 }, (_, i) => 21 + i)]; // sustain, soft pedal, then the keys
const NSYM = PITCHES.length, D = 256;

type Ort = typeof import('onnxruntime-web/webgpu');
interface Model { ort: Ort; net: import('onnxruntime-web').InferenceSession; attr: import('onnxruntime-web').InferenceSession; wins: Float32Array; mel: { lo: Int32Array; hi: Int32Array; w: Float32Array[] } }
let loading: Promise<Model> | null = null;

async function load(base: string, onProgress: (pct: number) => void): Promise<Model> {
  const ort = await import('onnxruntime-web/webgpu');
  ort.env.wasm.numThreads = 1;
  const get = async (name: string, from: number, to: number) => {
    const r = await fetch(base + name);
    if (!r.ok || !r.body) throw new Error(`Could not load the piano model (${name}).`);
    const total = Number(r.headers.get('content-length')) || 0;
    const reader = r.body.getReader();
    const parts: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); got += value.length;
      if (total) onProgress(from + ((to - from) * got) / total);
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  const front = new Float32Array((await get('front.bin', 0, 2)).buffer);
  const netBytes = await get('net.onnx', 2, 14);
  const attrBytes = await get('attr.onnx', 14, 15);
  const opts = (gpu: boolean) => ({ executionProviders: gpu ? ['webgpu', 'wasm'] : ['wasm'], graphOptimizationLevel: 'all' as const });
  let net: Model['net'], attr: Model['attr'];
  // automated tests run without a real GPU: software WebGPU is far slower than the CPU there
  const gpu = !(globalThis as { __pvCpuModel?: boolean }).__pvCpuModel;
  try { net = await ort.InferenceSession.create(netBytes, opts(gpu)); }
  catch { net = await ort.InferenceSession.create(netBytes, opts(false)); } // no usable GPU: slower, same notes
  attr = await ort.InferenceSession.create(attrBytes, opts(false));
  // the mel filters are mostly zeros: keep each band's non-zero span
  const wins = front.subarray(0, NWIN * W);
  const M = front.subarray(NWIN * W);
  const lo = new Int32Array(NMEL), hi = new Int32Array(NMEL), w: Float32Array[] = [];
  for (let m = 0; m < NMEL; m++) {
    let a = -1, b = -1;
    for (let f = 0; f < NB; f++) if (M[f * NMEL + m] !== 0) { if (a < 0) a = f; b = f; }
    if (a < 0) { a = 0; b = -1; }
    lo[m] = a; hi[m] = b;
    const ws = new Float32Array(Math.max(0, b - a + 1));
    for (let f = a; f <= b; f++) ws[f - a] = M[f * NMEL + m];
    w.push(ws);
  }
  return { ort, net, attr, wins, mel: { lo, hi, w } };
}

// ---------- FFT (radix 2, two real frames at once) ----------
const LOG = Math.log2(W);
const rev = new Uint32Array(W);
for (let i = 0; i < W; i++) { let r = 0; for (let b = 0; b < LOG; b++) r |= ((i >> b) & 1) << (LOG - 1 - b); rev[i] = r; }
const cosT = new Float64Array(W / 2), sinT = new Float64Array(W / 2);
for (let i = 0; i < W / 2; i++) { cosT[i] = Math.cos((2 * Math.PI * i) / W); sinT[i] = -Math.sin((2 * Math.PI * i) / W); }
function fft(re: Float64Array, im: Float64Array) {
  for (let i = 0; i < W; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= W; size <<= 1) {
    const half = size >> 1, step = W / size;
    for (let s = 0; s < W; s += size) {
      for (let k = 0; k < half; k++) {
        const c = cosT[k * step], n = sinT[k * step];
        const a = s + k, b = a + half;
        const tr = re[b] * c - im[b] * n, ti = re[b] * n + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

/** frames of the (padded) segment, centred like the original: [T, 4096] */
function makeFrames(x: Float32Array): { data: Float32Array; T: number } {
  const T = Math.ceil(x.length / HOP) + 1;
  const data = new Float32Array(T * W);
  for (let k = 0; k < T; k++) {
    const o = k * HOP - W / 2;
    for (let i = 0; i < W; i++) { const s = o + i; data[k * W + i] = s >= 0 && s < x.length ? x[s] : 0; }
  }
  return { data, T };
}

/** log-mel features of six differently windowed spectra per frame: [1, T, 229, 6] */
function features(m: Model, fr: { data: Float32Array; T: number }): Float32Array {
  const { data, T } = fr;
  const n = data.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += data[i];
  mean /= n;
  let v = 0;
  for (let i = 0; i < n; i++) { const d = data[i] - mean; v += d * d; }
  const std = Math.sqrt(v / (n - 1)) + 1e-8;
  const out = new Float32Array(T * NMEL * NWIN);
  const re = new Float64Array(W), im = new Float64Array(W);
  const P = new Float64Array(NB * 2);
  const k0 = 1 / Math.sqrt(W);
  const eps = 1e-5, le = Math.log(eps);
  const jobs: [number, number][] = [];
  for (let t = 0; t < T; t++) for (let w = 0; w < NWIN; w++) jobs.push([t, w]);
  for (let j = 0; j < jobs.length; j += 2) {
    const [t1, w1] = jobs[j], second = jobs[j + 1];
    const win1 = m.wins.subarray(w1 * W, w1 * W + W);
    const win2 = second ? m.wins.subarray(second[1] * W, second[1] * W + W) : null;
    for (let i = 0; i < W; i++) {
      re[i] = ((data[t1 * W + i] - mean) / std) * win1[i];
      im[i] = second ? ((data[second[0] * W + i] - mean) / std) * win2![i] : 0;
    }
    fft(re, im);
    // split the two real spectra: X1 = (Z[k] + conj Z[N-k]) / 2, X2 = (Z[k] - conj Z[N-k]) / 2i
    for (let k = 0; k < NB; k++) {
      const nk = (W - k) % W;
      const ar = re[k], ai = im[k], br = re[nk], bi = -im[nk];
      const x1r = (ar + br) / 2, x1i = (ai + bi) / 2;
      const x2r = (ai - bi) / 2, x2i = -(ar - br) / 2;
      P[k] = (x1r * x1r + x1i * x1i) * k0 * k0;
      P[NB + k] = (x2r * x2r + x2i * x2i) * k0 * k0;
    }
    for (let q = 0; q < (second ? 2 : 1); q++) {
      const [t, w] = q === 0 ? jobs[j] : second!;
      for (let mm = 0; mm < NMEL; mm++) {
        const a = m.mel.lo[mm], ws = m.mel.w[mm];
        let s = 0;
        for (let f = 0; f < ws.length; f++) s += P[q * NB + a + f] * ws[f];
        out[(t * NMEL + mm) * NWIN + w] = (Math.log(s + eps) - le) / -le;
      }
    }
  }
  return out;
}

/** best set of notes for one key: S is [T(end) x T(begin)]; returns [begin, end] frame pairs in order */
function viterbiBackward(S: Float32Array, off: number, T: number, start: number): [number, number][] {
  const q = new Float64Array(T);
  const ptr = new Int32Array(T);
  const d = (i: number) => S[off + i * T + i];
  q[T - 1] = d(T - 1) > 0 ? d(T - 1) : 0;
  for (let pos = T - 2; pos >= 0; pos--) {
    let best = q[pos + 1], sel = -1; // skipping wins ties, like the original
    for (let e = pos + 1; e < T; e++) {
      const c = q[e] + S[off + e * T + pos];
      if (c > best) { best = c; sel = e - pos - 1; }
    }
    ptr[pos] = sel;
    const dd = d(pos);
    q[pos] = best + (dd > 0 ? dd : 0);
  }
  const out: [number, number][] = [];
  let j = start;
  while (j < T - 1) {
    if (d(j) > 0) out.push([j, j]);
    const sel = ptr[j];
    if (sel < 0) j += 1;
    else { const i = sel + j + 1; out.push([j, i]); j = i; }
  }
  if (d(T - 1) > 0) out.push([T - 1, T - 1]);
  return out;
}

/** the mean of a continuous Bernoulli with this logit (as torch computes it) */
function cbMean(logit: number) {
  const p = 1 / (1 + Math.exp(-logit));
  if (p < 0.499 || p > 0.501) return p / (2 * p - 1) + 1 / (Math.log1p(-p) - Math.log(p));
  const x = p - 0.5;
  return 0.5 + (1 / 3 + (16 / 45) * x * x) * x;
}

interface Ev { start: number; end: number; pitch: number; vel: number; on: boolean; off: boolean }

async function segment(m: Model, x: Float32Array, startPos: number[], lastFrameIdx: number): Promise<{ ev: Ev[]; lastP: number[] }> {
  const fr = makeFrames(x);
  const T = fr.T;
  const feat = new m.ort.Tensor('float32', features(m, fr), [1, T, NMEL, NWIN]);
  const res = await m.net.run({ feat });
  const S = res.S.data as Float32Array, ctx = res.ctx.data as Float32Array;
  feat.dispose?.();
  const paths: [number, number][][] = [];
  for (let k = 0; k < NSYM; k++) paths.push(viterbiBackward(S, k * T * T, T, startPos[k]));
  res.S.dispose?.();
  const n = paths.reduce((a, p) => a + p.length, 0);
  const lastP = new Array(NSYM).fill(0);
  if (!n) { res.ctx.dispose?.(); return { ev: [], lastP }; }
  const X = new Float32Array(n * 3 * D);
  let r = 0;
  for (let k = 0; k < NSYM; k++) for (const [a, b] of paths[k]) {
    const ca = (k * T + a) * D, cb = (k * T + b) * D, o = r * 3 * D;
    for (let i = 0; i < D; i++) { const u = ctx[ca + i], v = ctx[cb + i]; X[o + i] = u; X[o + D + i] = v; X[o + 2 * D + i] = u * v; }
    r++;
  }
  res.ctx.dispose?.();
  const at = await m.attr.run({ x: new m.ort.Tensor('float32', X, [n, 3 * D]) });
  const vel = at.vel.data as Float32Array, of = at.of.data as Float32Array;
  const fd = HOP / TK_RATE;
  const ev: Ev[] = [];
  let c = 0;
  for (let k = 0; k < NSYM; k++) {
    let lastEnd = 0, cur = 0;
    for (const [a, b] of paths[k]) {
      let vi = 0;
      for (let i = 1; i < 128; i++) if (vel[c * 128 + i] > vel[c * 128 + vi]) vi = i;
      const o0 = Math.min(0.5, Math.max(-0.5, (cbMean(of[c * 4]) - 0.5) / 0.99));
      const o1 = Math.min(0.5, Math.max(-0.5, (cbMean(of[c * 4 + 1]) - 0.5) / 0.99));
      const on = a > 0 || of[c * 4 + 2] > 0, off = b < lastFrameIdx || of[c * 4 + 3] > 0;
      let s = (a + o0) * fd, e = (b + o1) * fd;
      s = Math.max(s, lastEnd); e = Math.max(e, s + 1e-8); lastEnd = e;
      ev.push({ start: s, end: e, pitch: PITCHES[k], vel: vi, on, off });
      if (off) cur = b;
      c++;
    }
    lastP[k] = cur;
  }
  ev.sort((p, q2) => p.start - q2.start || p.end - q2.end || p.pitch - q2.pitch);
  return { ev, lastP };
}

/**
 * Find the notes in a mono recording at TK_RATE. Returns piano notes (with the sustain pedal folded into each
 * note's held end, like a MIDI file); onProgress gets 0..100.
 */
export async function transcribePiano(audio: Float32Array, onProgress: (pct: number) => void, base = 'models/transkun/'): Promise<RawNote[]> {
  loading ??= load(base, onProgress).catch((e) => { loading = null; throw e; });
  const m = await loading;
  onProgress(15);
  const padT = SEG - STEP;
  const pad = Math.ceil(padT * TK_RATE);
  const x = new Float32Array(audio.length + 2 * pad);
  x.set(audio, pad);
  let startPos = new Array(NSYM).fill(Math.floor((padT * TK_RATE) / HOP));
  const step = Math.ceil((STEP * TK_RATE) / HOP) * HOP, seg = Math.ceil(SEG * TK_RATE);
  const byType = new Map<number, Ev[]>();
  for (let i = 0; i < x.length; i += step) {
    const j = Math.min(i + seg, x.length);
    const t0 = i / TK_RATE - padT;
    const sl = new Float32Array(seg);
    sl.set(x.subarray(i, j));
    const { ev, lastP } = await segment(m, sl, startPos, Math.round(seg / HOP));
    startPos = lastP.map((k) => Math.max(k - Math.trunc(step / HOP), 0));
    for (const e of ev) { e.start = Math.max(e.start + t0, 0); e.end = Math.max(e.end + t0, e.start); }
    for (const e of ev) {
      let L = byType.get(e.pitch);
      if (!L) byType.set(e.pitch, (L = []));
      if (L.length && e.start < L[L.length - 1].end) {
        if (e.on) L[L.length - 1] = e;
        else { const l = L[L.length - 1]; l.off = e.off; l.end = Math.max(e.end, l.end); }
        continue;
      }
      if (e.on) L.push(e);
    }
    onProgress(15 + (85 * Math.min(x.length, i + step)) / x.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  for (const L of byType.values()) if (L.length) L[L.length - 1].off = true;
  const all = [...byType.values()].flat().filter((e) => e.off);
  all.sort((p, q) => p.start - q.start || p.end - q.end || p.pitch - q.pitch);
  const last = new Map<number, Ev>();
  for (const e of all) { const l = last.get(e.pitch); if (l && l.end > e.start) l.end = e.start; last.set(e.pitch, e); }
  const events = all.filter((e) => e.start < e.end);
  // the sustain pedal: a note released while the pedal is down rings until the pedal comes up
  const pedal = events.filter((e) => e.pitch === -64).map((e) => [e.start, e.end] as [number, number]);
  const notes = events.filter((e) => e.pitch > 0).map((e) => {
    const pd = pedal.find(([a, b]) => e.end >= a && e.end < b);
    return { s: e.start, e: e.end, p: e.pitch, v: velocityToLoudness(e.vel), h: pd ? pd[1] : e.end };
  });
  // a re-struck key cuts the pedal ring of the previous note
  const lastBy = new Map<number, RawNote>();
  for (const n of notes) { const l = lastBy.get(n.p); if (l && (l.h ?? l.e) > n.s) l.h = Math.max(l.e, n.s); lastBy.set(n.p, n); }
  return notes;
}
