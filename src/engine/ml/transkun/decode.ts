// From network outputs to notes, step for step as the reference implementation: for every key a short dynamic
// program picks the best set of non-overlapping (start, end) intervals from the interval scores, then the second
// network reads each picked note's velocity and fine timing.
import { D, HOP, NMEL, NSYM, NWIN, PITCHES, TK_RATE, TranskunModel } from './model';
import { features, makeFrames } from './features';

/** a note event within one window (seconds from the window start) */
export interface Ev { start: number; end: number; pitch: number; vel: number; on: boolean; off: boolean }

/** best set of notes for one key: S is [T(end) x T(begin)]; returns [begin, end] frame pairs in order */
export function viterbiBackward(S: Float32Array, off: number, T: number, start: number): [number, number][] {
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
export function cbMean(logit: number) {
  const p = 1 / (1 + Math.exp(-logit));
  if (p < 0.499 || p > 0.501) return p / (2 * p - 1) + 1 / (Math.log1p(-p) - Math.log(p));
  const x = p - 0.5;
  return 0.5 + (1 / 3 + (16 / 45) * x * x) * x;
}

/**
 * Transcribe one window of audio. startPos: for each key, the first frame a note may start on (notes carried over
 * from the previous window end before it). Returns the window's events and, per key, where its last finished note
 * ended (for the next window).
 */
export async function transcribeWindow(m: TranskunModel, x: Float32Array, startPos: number[], lastFrameIdx: number): Promise<{ ev: Ev[]; lastP: number[] }> {
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
  // each note's input to the second network: the context at its start and end frames, and their product
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
