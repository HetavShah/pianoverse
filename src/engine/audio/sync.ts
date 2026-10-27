// Automatic alignment of notes to a video: the attacks heard in the video's audio are matched against the
// note onsets, and the time shift with the best agreement wins. Pure TypeScript; runs in the app and in Node.
import type { RawNote } from '../project';
import { fftOf, pow2 } from './fft';

export const RATE = 100; // analysis frames per second (10 ms)

/**
 * Onset strength at 100 frames per second: log-spectral flux of the mono audio (half-wave rectified,
 * 40 Hz – 6 kHz), with the slowly varying part removed so loud passages don't dominate.
 */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const hop = sampleRate / RATE;
  const N = pow2(Math.round(sampleRate * 0.046)); // ~46 ms window
  const frames = Math.floor(samples.length / hop);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const k0 = Math.max(1, Math.floor((40 * N) / sampleRate)), k1 = Math.min(N / 2 - 1, Math.ceil((6000 * N) / sampleRate));
  const prev = new Float64Array(k1 + 1);
  const flux = new Float32Array(frames);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    const c = Math.round(f * hop);
    for (let i = 0; i < N; i++) {
      // window centred a quarter-window early, so an attack peaks on the frame where it happens
      const idx = c - (3 * N) / 4 + i;
      re[i] = idx >= 0 && idx < samples.length ? samples[idx] * win[i] : 0;
      im[i] = 0;
    }
    fftOf(N).forward(re, im);
    let s = 0;
    for (let k = k0; k <= k1; k++) {
      const m = Math.log1p(1000 * Math.hypot(re[k], im[k]));
      const d = m - prev[k];
      if (d > 0 && f > 0) s += d;
      prev[k] = m;
    }
    flux[f] = s;
  }
  // remove a 1-second running mean, keep the positive part
  const out = new Float32Array(frames);
  const R = RATE / 2;
  let acc = 0;
  for (let i = 0; i < Math.min(frames, R); i++) acc += flux[i];
  for (let f = 0; f < frames; f++) {
    const add = f + R, drop = f - R - 1;
    if (add < frames) acc += flux[add];
    if (drop >= 0) acc -= flux[drop];
    const n = Math.min(frames - 1, f + R) - Math.max(0, f - R) + 1;
    out[f] = Math.max(0, flux[f] - acc / n);
  }
  return out;
}

/** Note onsets as a signal at 100 frames per second (chord notes add up, softened over ±20 ms). */
export function onsetTrain(notes: RawNote[], frames: number, shift = 0): Float32Array {
  const out = new Float32Array(frames);
  for (const n of notes) {
    const x = (n.s + shift) * RATE;
    const i0 = Math.floor(x);
    for (let k = -2; k <= 3; k++) {
      const i = i0 + k;
      if (i < 0 || i >= frames) continue;
      out[i] += (0.5 + n.v) * Math.exp(-(((i - x) / 1.2) ** 2));
    }
  }
  return out;
}

export interface SyncResult {
  /** video time = note time + offset (seconds) */
  offset: number;
  /** 0..1: how clearly the best shift beats the alternatives */
  confidence: number;
  /** correlation curve around the best shift, for display (-1 s .. +1 s) */
  near: Float32Array;
  /** peak height in standard deviations of the other shifts, and the runner-up's */
  z?: number;
  zSecond?: number;
}

/**
 * Find the shift that best lines the notes up with the audio's attacks.
 * Each candidate shift is scored by the cosine similarity of the overlapping parts (so shifts that leave
 * most notes hanging off the end of the video gain nothing), and only shifts that overlap at least
 * 60 % of the shorter of the two are considered. maxShift limits the search (seconds) around 0.
 */
export function findOffset(envelope: Float32Array, notes: RawNote[], maxShift?: number): SyncResult {
  if (!notes.length || !envelope.length) return { offset: 0, confidence: 0, near: new Float32Array(0) };
  const first = notes[0].s, last = notes[notes.length - 1].s;
  const span = Math.ceil((last - first) * RATE) + 10;
  const lead = 0.05; // the train starts 50 ms before the first onset
  // compress loud attacks so a few big chords don't decide everything
  const A = Float64Array.from(envelope, (v) => Math.sqrt(v));
  const B = Float64Array.from(onsetTrain(notes, span, -first + lead));
  const nA = A.length, nB = B.length;
  const n = pow2(nA + nB);
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(A); br.set(B);
  const F = fftOf(n);
  F.forward(ar, ai); F.forward(br, bi);
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] + ai[i] * bi[i];
    const im = ai[i] * br[i] - ar[i] * bi[i];
    ar[i] = r; ai[i] = im;
  }
  F.inverse(ar, ai);
  // prefix sums of squares for the energy inside each overlap
  const cA = new Float64Array(nA + 1), cB = new Float64Array(nB + 1);
  for (let i = 0; i < nA; i++) cA[i + 1] = cA[i] + A[i] * A[i];
  for (let i = 0; i < nB; i++) cB[i + 1] = cB[i] + B[i] * B[i];
  const minOverlap = Math.floor(0.6 * Math.min(nA, nB));
  // lag l: train frame i sits on audio frame i + l
  const score = (l: number) => {
    const a0 = Math.max(0, l), a1 = Math.min(nA, l + nB);
    if (a1 - a0 < minOverlap) return NaN;
    const b0 = a0 - l, b1 = a1 - l;
    const eA = cA[a1] - cA[a0], eB = cB[b1] - cB[b0];
    if (eA <= 0 || eB <= 0) return 0;
    return ar[((l % n) + n) % n] / Math.sqrt(eA * eB);
  };
  let lo = -nB + minOverlap, hi = nA - minOverlap;
  if (maxShift !== undefined) {
    lo = Math.max(lo, Math.floor((first - lead - maxShift) * RATE));
    hi = Math.min(hi, Math.ceil((first - lead + maxShift) * RATE));
  }
  let best = lo, bv = -Infinity;
  for (let l = lo; l <= hi; l++) { const v = score(l); if (v > bv) { bv = v; best = l; } }
  if (!isFinite(bv)) return { offset: 0, confidence: 0, near: new Float32Array(0) };
  // confidence: how far the best shift stands out from the others (z-score) and from the runner-up
  let sum = 0, sum2 = 0, cnt = 0, second = -Infinity;
  for (let l = lo; l <= hi; l++) {
    if (Math.abs(l - best) <= 15) continue;
    const v = score(l);
    if (!isFinite(v)) continue;
    sum += v; sum2 += v * v; cnt++;
    if (v > second) second = v;
  }
  const mean = sum / Math.max(1, cnt), sd = Math.sqrt(Math.max(1e-12, sum2 / Math.max(1, cnt) - mean * mean));
  const z = (bv - mean) / sd, zSecond = (second - mean) / sd;
  // sub-frame refinement (parabola through the peak)
  const y0 = score(best - 1), y1 = bv, y2 = score(best + 1);
  const den = y0 - 2 * y1 + y2;
  const frac = isFinite(den) && den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0;
  const onsetAt = (best + frac) / RATE + lead;
  const near = new Float32Array(201);
  for (let k = -100; k <= 100; k++) { const v = score(best + k); near[k + 100] = isFinite(v) ? v / bv : 0; }
  // calibrated on the sample: true matches reach z 6.9 (15 s clip) .. 11 (60 s) with a 1.9+ lead over the
  // runner-up; unrelated notes stay below z 6 with a lead under 1.3
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const confidence = clamp01((z - 5) / 2.5) * clamp01((z - zSecond - 0.8) / 1.2);
  return { offset: onsetAt - first, confidence, near, z, zSecond };
}

/** Mono audio at a fixed rate from an audio buffer's channels. */
export function mixDown(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i] / channels.length;
  return out;
}
