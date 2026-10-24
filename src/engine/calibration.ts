// Calibration data: keyboard size presets, raw tracking -> per-frame homographies, manual fixes.
import { cornersOf, planeToImage, Pt, Quad } from './geometry';
import type { ProjectFile } from './project';

export interface KeyboardPreset { keys: number; lowestNote: number; label: string }

export const PRESETS: KeyboardPreset[] = [
  { keys: 25, lowestNote: 48, label: '25 keys (C3–C5)' },
  { keys: 37, lowestNote: 48, label: '37 keys (C3–C6)' },
  { keys: 49, lowestNote: 36, label: '49 keys (C2–C6)' },
  { keys: 61, lowestNote: 36, label: '61 keys (C2–C7)' },
  { keys: 76, lowestNote: 28, label: '76 keys (E1–G7)' },
  { keys: 88, lowestNote: 21, label: '88 keys (A0–C8)' },
];

const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = (p: number) => BLACK.has(((p % 12) + 12) % 12);

export function whiteKeyCount(lowest: number, keys: number): number {
  let n = 0;
  for (let p = lowest; p < lowest + keys; p++) if (!isBlack(p)) n++;
  return n;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (p: number) => `${NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;

export interface Fix { t: number; corners: Quad } // t: seconds into the video

export interface Calibration {
  /** time (seconds) of the frame the corners were marked on */
  refTime: number;
  /** corners marked on the reference frame (video pixels): back-left, back-right, front-right, front-left */
  corners: Quad;
  cameraMoves: boolean;
  /** the user has placed the corners (not just the starting box) */
  cornersSet?: boolean;
  /** raw tracked corners per frame (8 numbers) before smoothing and fixes; null entries = lost */
  raw?: (number[] | null)[];
  /** tracking confidence per frame, 0..1 */
  quality?: number[];
  fixes: Fix[];
}

export type CalibratedProject = ProjectFile & { calibration?: Calibration };

/** frames per second from presented-frame timestamps */
export function estimateFps(times: number[]): number {
  const d: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const x = times[i] - times[i - 1];
    if (x > 0.004) d.push(x);
  }
  if (!d.length) return 30;
  d.sort((a, b) => a - b);
  const step = d[Math.floor(d.length * 0.1)];
  const raw = 1 / step;
  const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 120];
  let best = raw;
  for (const c of common) if (Math.abs(c - raw) / c < 0.04 && Math.abs(c - raw) < Math.abs(best - raw) + 1e-9) best = c;
  return best === raw ? Math.round(raw) : best;
}

const flat = (q: Quad) => [q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]];
const unflat = (a: number[]): Quad => [[a[0], a[1]], [a[2], a[3]], [a[4], a[5]], [a[6], a[7]]];

/**
 * Resample timestamped tracking results onto the video's frame grid.
 * Lost frames and frames that were never presented are filled by linear interpolation.
 */
export function resampleTracking(samples: { t: number; corners: Quad | null; quality: number }[], fps: number, frames: number) {
  const good = samples.filter((s) => s.corners).sort((a, b) => a.t - b.t);
  const raw: (number[] | null)[] = [];
  const quality: number[] = [];
  if (!good.length) return { raw: new Array(frames).fill(null), quality: new Array(frames).fill(0) };
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  let j = 0, q = 0;
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    while (j < good.length - 1 && good[j + 1].t <= t) j++;
    const a = good[j], b = good[Math.min(good.length - 1, j + 1)];
    let v: number[];
    if (t <= good[0].t) v = flat(good[0].corners!);
    else if (t >= good[good.length - 1].t) v = flat(good[good.length - 1].corners!);
    else {
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
      const fa = flat(a.corners!), fb = flat(b.corners!);
      v = fa.map((x, i) => x + (fb[i] - x) * k);
    }
    raw.push(v);
    while (q < sorted.length - 1 && Math.abs(sorted[q + 1].t - t) <= Math.abs(sorted[q].t - t)) q++;
    quality.push(sorted.length ? (sorted[q].corners ? sorted[q].quality : 0) : 0);
  }
  return { raw, quality };
}

/** Median of 5 then Gaussian smoothing per coordinate: removes single-frame jumps and fine jitter. */
export function smooth(raw: number[][], sigma = 0.9): number[][] {
  const n = raw.length;
  if (n < 3) return raw.map((r) => [...r]);
  const med = raw.map((_, f) => {
    const out: number[] = [];
    for (let c = 0; c < 8; c++) {
      const w: number[] = [];
      for (let k = -2; k <= 2; k++) w.push(raw[Math.min(n - 1, Math.max(0, f + k))][c]);
      w.sort((a, b) => a - b);
      out.push(w[2]);
    }
    return out;
  });
  const rad = Math.ceil(sigma * 3);
  const ker: number[] = [];
  for (let k = -rad; k <= rad; k++) ker.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  return med.map((_, f) => {
    const out = new Array(8).fill(0);
    let ws = 0;
    for (let k = -rad; k <= rad; k++) {
      const g = ker[k + rad];
      const r = med[Math.min(n - 1, Math.max(0, f + k))];
      for (let c = 0; c < 8; c++) out[c] += r[c] * g;
      ws += g;
    }
    return out.map((v) => v / ws);
  });
}

/** Corner offsets from manual fixes, interpolated between fixed frames (the reference frame counts as fixed at zero). */
export function applyFixes(base: number[][], fixes: Fix[], refFrame: number, fps: number): number[][] {
  if (!fixes.length) return base;
  const clampF = (f: number) => Math.min(base.length - 1, Math.max(0, f));
  const keys = new Map<number, number[]>();
  keys.set(clampF(refFrame), new Array(8).fill(0));
  for (const fx of fixes) {
    const f = clampF(Math.round(fx.t * fps));
    const b = base[f];
    keys.set(f, flat(fx.corners).map((v, i) => v - b[i]));
  }
  const ks = [...keys.keys()].sort((a, b) => a - b);
  return base.map((row, f) => {
    let off: number[];
    if (f <= ks[0]) off = keys.get(ks[0])!;
    else if (f >= ks[ks.length - 1]) off = keys.get(ks[ks.length - 1])!;
    else {
      let i = 0;
      while (ks[i + 1] < f) i++;
      const a = ks[i], b = ks[i + 1], k = (f - a) / (b - a);
      const oa = keys.get(a)!, ob = keys.get(b)!;
      off = oa.map((v, c) => v + (ob[c] - v) * k);
    }
    return row.map((v, c) => v + off[c]);
  });
}

/** Final corners per frame (video pixels) for a calibration. */
export function finalCorners(cal: Calibration, fps: number): Quad[] {
  const refFrame = Math.round(cal.refTime * fps);
  if (!cal.cameraMoves || !cal.raw || !cal.raw.length) return [cal.corners];
  const filled = cal.raw.map((r) => r ?? null);
  // carry neighbours into any remaining gaps
  let last: number[] | null = filled.find((r) => r) ?? flat(cal.corners);
  const dense = filled.map((r) => (r ? (last = r) : last!));
  return applyFixes(smooth(dense), cal.fixes, refFrame, fps).map(unflat);
}

/** Write a calibration into the project: keyboard size, saber line, per-frame homographies. */
export function applyCalibration(
  proj: CalibratedProject,
  cal: Calibration,
  kb: { keys: number; lowestNote: number; edge: { a: number; b: number } },
): CalibratedProject {
  const whiteKeys = whiteKeyCount(kb.lowestNote, kb.keys);
  const corners = finalCorners(cal, proj.video.fps);
  const frames = corners.map((q) => {
    const H = planeToImage(q, whiteKeys);
    return H ? H.slice(0, 8).map((v) => Math.round(v * 1e6) / 1e6) : [1, 0, 0, 0, 1, 0, 0, 0];
  });
  return {
    ...proj,
    keyboard: { keys: kb.keys, lowestNote: kb.lowestNote, whiteKeys, edge: kb.edge },
    tracking: { space: 'video-pixels', frames },
    calibration: cal,
  };
}

/** Corners for a frame as currently tracked + fixed, for display while editing. */
export function cornersAt(proj: CalibratedProject, frame: number): Quad | null {
  const f = proj.tracking?.frames;
  if (!f?.length) return null;
  const h = f[Math.min(f.length - 1, Math.max(0, frame))];
  return cornersOf([...h, 1], proj.keyboard.whiteKeys);
}

/** A sweep across every key, used to check alignment before real notes exist. */
export function testNotes(lowest: number, keys: number, duration: number) {
  const out: { s: number; e: number; p: number; v: number }[] = [];
  let t = 0.6, i = 0;
  const seq: number[] = [];
  for (let k = 0; k < keys; k++) seq.push(lowest + k);
  for (let k = keys - 2; k > 0; k--) seq.push(lowest + k);
  while (t < duration - 0.3) {
    const p = seq[i % seq.length];
    out.push({ s: t, e: t + 0.22, p, v: 0.45 + 0.15 * Math.sin(i * 0.7) });
    t += 0.14; i++;
  }
  return out;
}

export type { Pt, Quad };
