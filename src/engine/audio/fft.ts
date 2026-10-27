// Fast Fourier transform (radix 2, in place, on separate real and imaginary arrays). One instance per size holds
// its bit-reversal and twiddle tables; fftOf(n) hands out a shared instance (a flyweight: the tables for a size
// are made once and reused by every caller).

export class FFT {
  private rev: Uint32Array;
  private cos: Float64Array;
  private sin: Float64Array;

  constructor(readonly n: number) {
    const log = Math.log2(n);
    if (!Number.isInteger(log)) throw new Error(`FFT size must be a power of two (got ${n})`);
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < log; b++) r |= ((i >> b) & 1) << (log - 1 - b); this.rev[i] = r; }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos((2 * Math.PI * i) / n); this.sin[i] = -Math.sin((2 * Math.PI * i) / n); }
  }

  /** forward transform, in place */
  forward(re: Float64Array, im: Float64Array) {
    const n = this.n, rev = this.rev, cosT = this.cos, sinT = this.sin;
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let s = 0; s < n; s += size) {
        for (let k = 0; k < half; k++) {
          const c = cosT[k * step], w = sinT[k * step];
          const a = s + k, b = a + half;
          const tr = re[b] * c - im[b] * w, ti = re[b] * w + im[b] * c;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  /** inverse transform, in place (scaled by 1/n): the forward transform of the conjugate, conjugated */
  inverse(re: Float64Array, im: Float64Array) {
    const n = this.n;
    for (let i = 0; i < n; i++) im[i] = -im[i];
    this.forward(re, im);
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
  }
}

const shared = new Map<number, FFT>();
/** the FFT for size n (made once) */
export function fftOf(n: number): FFT {
  let f = shared.get(n);
  if (!f) { f = new FFT(n); shared.set(n, f); }
  return f;
}

/** the smallest power of two at least n */
export const pow2 = (n: number) => { let p = 1; while (p < n) p <<= 1; return p; };
