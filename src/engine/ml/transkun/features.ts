// Transkun's front end, as the original computes it: the audio cut into overlapping frames, each frame seen through
// six windows, and each windowed spectrum reduced to 229 log-mel bands. Two real frames share one complex FFT.
import { fftOf } from '../../audio/fft';
import { HOP, NB, NMEL, NWIN, TranskunModel, W } from './model';

export interface Frames { data: Float32Array; T: number }

/** frames of the (padded) segment, centred like the original: [T, 4096] */
export function makeFrames(x: Float32Array): Frames {
  const T = Math.ceil(x.length / HOP) + 1;
  const data = new Float32Array(T * W);
  for (let k = 0; k < T; k++) {
    const o = k * HOP - W / 2;
    for (let i = 0; i < W; i++) { const s = o + i; data[k * W + i] = s >= 0 && s < x.length ? x[s] : 0; }
  }
  return { data, T };
}

/** log-mel features of six differently windowed spectra per frame: [1, T, 229, 6] */
export function features(m: TranskunModel, fr: Frames): Float32Array {
  const { data, T } = fr;
  const n = data.length;
  // the segment is normalised to zero mean and unit spread first
  let mean = 0;
  for (let i = 0; i < n; i++) mean += data[i];
  mean /= n;
  let v = 0;
  for (let i = 0; i < n; i++) { const d = data[i] - mean; v += d * d; }
  const std = Math.sqrt(v / (n - 1)) + 1e-8;
  const out = new Float32Array(T * NMEL * NWIN);
  const fft = fftOf(W);
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
    fft.forward(re, im);
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
