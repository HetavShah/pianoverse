// The beat of a performance, from its notes alone.
// Played without a click, so the tempo drifts: a beat tracker that follows it (dynamic programming over onset
// strength, after Ellis 2007) rather than a fixed grid. Bars are groups of beats starting on the strongest one.
import type { RawNote } from './project';

export interface BeatGrid { beats: number[]; bars: number[]; bpm: number }

const RATE = 100; // onset-strength samples per second

export function estimateBeats(notes: RawNote[], duration: number): BeatGrid {
  const n = Math.max(1, Math.ceil(duration * RATE) + 1);
  if (notes.length < 8) return evenGrid(duration, 100);
  // onset strength: louder and lower notes count more (the bass marks the beat)
  const o = new Float32Array(n);
  for (const nt of notes) {
    const i = Math.round(nt.s * RATE);
    if (i < 0 || i >= n) continue;
    o[i] += (0.4 + nt.v) * (1 + Math.max(0, 60 - nt.p) / 30);
  }
  const s = smooth(o, 2);
  // tempo: autocorrelation over 60..180 BPM, with a gentle preference for about 100 BPM
  let best = 0, bestLag = 60;
  for (let lag = Math.round(RATE * 60 / 180); lag <= Math.round(RATE * 60 / 60); lag++) {
    let acc = 0;
    for (let i = lag; i < n; i++) acc += s[i] * s[i - lag];
    const bpm = 60 * RATE / lag;
    const w = Math.exp(-0.5 * (Math.log2(bpm / 100) / 0.9) ** 2);
    if (acc * w > best) { best = acc * w; bestLag = lag; }
  }
  const P = bestLag;
  // beat tracking: best chain of beats near period P that lands on strong onsets
  const score = new Float32Array(n), prev = new Int32Array(n).fill(-1);
  const alpha = 400;
  for (let i = 0; i < n; i++) {
    let m = 0, arg = -1;
    for (let j = i - 2 * P; j <= i - Math.round(P / 2); j++) {
      if (j < 0) continue;
      const v = score[j] - alpha * Math.log((i - j) / P) ** 2 / P;
      if (arg < 0 || v > m) { m = v; arg = j; }
    }
    score[i] = s[i] + Math.max(0, m);
    prev[i] = m > 0 ? arg : -1;
  }
  // end on the best beat in the last period, then walk back
  let end = n - 1;
  for (let i = Math.max(0, n - P); i < n; i++) if (score[i] > score[end]) end = i;
  const idx: number[] = [];
  for (let i = end; i >= 0; i = prev[i]) idx.push(i);
  idx.reverse();
  // extend evenly before the first and after the last tracked beat
  const beats = idx.map((i) => i / RATE);
  if (beats.length < 2) return evenGrid(duration, 60 * RATE / P);
  const T = P / RATE;
  while (beats[0] - T > -1e-6) beats.unshift(beats[0] - T);
  while (beats[beats.length - 1] + T < duration) beats.push(beats[beats.length - 1] + T);
  // bars of 4 (or 3), starting on the strongest beat of the group
  const strength = beats.map((b) => peakNear(s, Math.round(b * RATE), 4));
  let bestMeter = 4, bestPhase = 0, bestContrast = -Infinity;
  for (const meter of [4, 3]) {
    for (let ph = 0; ph < meter; ph++) {
      let on = 0, off = 0, cOn = 0, cOff = 0;
      strength.forEach((v, k) => { if ((k - ph) % meter === 0) { on += v; cOn++; } else { off += v; cOff++; } });
      const contrast = on / Math.max(1, cOn) - off / Math.max(1, cOff) - (meter === 3 ? 0.08 : 0); // 4/4 unless 3/4 is clear
      if (contrast > bestContrast) { bestContrast = contrast; bestMeter = meter; bestPhase = ph; }
    }
  }
  const bars = beats.filter((_, k) => k >= bestPhase && (k - bestPhase) % bestMeter === 0);
  return { beats: beats.filter((b) => b >= -1e-6 && b <= duration), bars: bars.filter((b) => b >= -1e-6 && b <= duration), bpm: Math.round(600 / T) / 10 };
}

/** the beat nearest to t (for snapping joins) */
export function nearestBeat(grid: BeatGrid, t: number): number {
  let best = t, d = Infinity;
  for (const b of grid.beats) { const e = Math.abs(b - t); if (e < d) { d = e; best = b; } }
  return best;
}

function evenGrid(duration: number, bpm: number): BeatGrid {
  const T = 60 / bpm, beats: number[] = [];
  for (let t = 0; t <= duration; t += T) beats.push(t);
  return { beats, bars: beats.filter((_, i) => i % 4 === 0), bpm };
}

function smooth(x: Float32Array, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 3), k: number[] = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-0.5 * (i / sigma) ** 2));
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let a = 0;
    for (let j = -r; j <= r; j++) { const q = i + j; if (q >= 0 && q < x.length) a += x[q] * k[j + r]; }
    out[i] = a;
  }
  return out;
}

function peakNear(x: Float32Array, i: number, r: number) {
  let m = 0;
  for (let j = Math.max(0, i - r); j <= Math.min(x.length - 1, i + r); j++) m = Math.max(m, x[j]);
  return m;
}
