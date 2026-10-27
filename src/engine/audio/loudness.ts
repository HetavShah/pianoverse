// How loud a recording sounds, in LUFS (ITU-R BS.1770-4, the measure Instagram, TikTok, YouTube and Spotify use to
// even out what they play). The sound is weighted like the ear hears it (K-weighting: a lift above 1.5 kHz, a cut
// below 40 Hz), measured in overlapping 400 ms blocks, and silence and quiet passages are gated out.

/** a biquad filter, run over a whole channel */
function biquad(x: Float32Array, b: [number, number, number], a: [number, number, number]): Float32Array {
  const [b0, b1, b2] = b.map((v) => v / a[0]), a1 = a[1] / a[0], a2 = a[2] / a[0];
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** the K-weighting (the two filters of BS.1770, designed for any sample rate) */
function kWeight(x: Float32Array, rate: number): Float32Array {
  // high shelf: +4 dB above 1.5 kHz
  {
    const A = Math.pow(10, 4 / 40), w = (2 * Math.PI * 1500) / rate, al = Math.sin(w) / (2 / Math.SQRT2), c = Math.cos(w), r = 2 * Math.sqrt(A) * al;
    x = biquad(x,
      [A * ((A + 1) + (A - 1) * c + r), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - r)],
      [(A + 1) - (A - 1) * c + r, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - r]);
  }
  // high pass at 38 Hz
  {
    const w = (2 * Math.PI * 38) / rate, al = Math.sin(w) / (2 * 0.5), c = Math.cos(w);
    x = biquad(x, [(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al]);
  }
  return x;
}

/**
 * Integrated loudness in LUFS of the channels (left and right count equally), between `from` and `to` seconds.
 * −Infinity for silence.
 */
export function integratedLoudness(channels: Float32Array[], rate: number, from = 0, to = Infinity): number {
  const i0 = Math.max(0, Math.floor(from * rate));
  const i1 = Math.min(channels[0].length, Math.floor(Math.min(to, channels[0].length / rate) * rate));
  const block = Math.round(0.4 * rate), hop = Math.round(0.1 * rate);
  if (i1 - i0 < block) return -Infinity;
  const nb = Math.floor((i1 - i0 - block) / hop) + 1;
  // mean square per block, summed over the channels
  const z = new Float64Array(nb);
  for (const ch of channels) {
    const y = kWeight(ch.subarray(i0, i1), rate);
    // running sums of squares, so each block costs nothing
    const cum = new Float64Array(y.length + 1);
    for (let i = 0; i < y.length; i++) cum[i + 1] = cum[i] + y[i] * y[i];
    for (let j = 0; j < nb; j++) z[j] += (cum[j * hop + block] - cum[j * hop]) / block;
  }
  const lufs = (v: number) => -0.691 + 10 * Math.log10(v);
  const gated = (min: number) => {
    let s = 0, n = 0;
    for (let j = 0; j < nb; j++) if (z[j] > 0 && lufs(z[j]) > min) { s += z[j]; n++; }
    return n ? s / n : 0;
  };
  const abs = gated(-70);
  if (!abs) return -Infinity;
  const rel = gated(Math.max(-70, lufs(abs) - 10));
  return rel ? lufs(rel) : -Infinity;
}
