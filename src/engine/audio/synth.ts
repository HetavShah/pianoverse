// Sounds made from scratch, so nothing has to be licensed or downloaded: the concert hall's and the ring-out's
// reverb (impulse responses: what a single click sounds like in the room), and the swell, made from the performance
// itself. Seeded noise: the same sample rate always gives exactly the same sound, in the preview and in the export.
import { mulberry32 } from '../random';

export type Stereo = [Float32Array, Float32Array];

/** a filter whose cutoff can move every sample (topology-preserving state variable filter: stable at any setting) */
class SweepFilter {
  private ic1 = 0;
  private ic2 = 0;
  constructor(private rate: number) {}
  /** one sample; returns [low-pass, band-pass] */
  step(x: number, hz: number, q: number): [number, number] {
    const g = Math.tan((Math.PI * Math.min(hz, this.rate * 0.45)) / this.rate), k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return [v2, v1];
  }
}

/**
 * A room's reverb: decaying noise, darker as it fades (air and walls swallow the highs first).
 * seconds: until it has died away by 60 dB. bright: the cutoff it starts with, Hz. bloom: how long it takes to build,
 * seconds (a slower build sounds like a larger room).
 */
export function impulse(rate: number, seconds: number, bright: number, seed: number, bloom = 0.004): Stereo {
  const n = Math.max(1, Math.ceil(rate * seconds));
  const pre = Math.round(rate * 0.012);
  const out: Stereo = [new Float32Array(n + pre), new Float32Array(n + pre)];
  for (let c = 0; c < 2; c++) {
    const rnd = mulberry32(seed + c * 7919);
    const lp = new SweepFilter(rate);
    const ch = out[c];
    for (let i = 0; i < n; i++) {
      const t = i / rate, u = i / n;
      const env = Math.exp((-6.91 * t) / seconds) * Math.min(1, t / bloom);
      const [low] = lp.step(rnd() * 2 - 1, bright * Math.pow(1800 / bright, u), 0.6);
      ch[pre + i] = low * env;
    }
  }
  return out;
}

/** the concert hall (Sound → Hall) */
export const hallImpulse = (rate: number) => impulse(rate, 2.6, 9000, 101);
/** the ring-out: a big, warm hall that rings for `seconds` */
export const ringImpulse = (rate: number, seconds: number) => impulse(rate, Math.max(0.5, seconds), 6500, 202, 0.04);

/**
 * The swell: the opening notes as an echo played backwards, rising out of silence into the first note. Made the
 * classic way: the first moments of the performance reversed, run through a hall whose reverb lasts `len` seconds,
 * reversed back. What comes before the start is the swell; it's in the key and on the notes of the piece because it
 * is made of them. Returns `len` seconds of stereo at `rate`, ending exactly where the video starts.
 */
export async function reverseSwell(src: AudioBuffer, at: number, len: number, rate: number): Promise<Stereo> {
  const W = 2.5;                                   // how much of the opening goes in
  const n = Math.round(W * rate), nLen = Math.max(1, Math.round(len * rate));
  const ctx = new OfflineAudioContext(2, n + nLen, rate);
  // the opening, reversed (resampled to `rate` by a first offline pass when the soundtrack is at another rate)
  const open = await sliceAt(src, at, W, rate);
  const rev = ctx.createBuffer(2, n, rate);
  for (let c = 0; c < 2; c++) {
    const from = open[Math.min(c, open.length - 1)], to = rev.getChannelData(c);
    for (let i = 0; i < n; i++) to[i] = from[n - 1 - i] ?? 0;
  }
  const node = ctx.createBufferSource();
  node.buffer = rev;
  const verb = ctx.createConvolver();
  const ir = impulse(rate, len, 6000, 404);
  const irBuf = ctx.createBuffer(2, ir[0].length, rate);
  irBuf.copyToChannel(ir[0], 0); irBuf.copyToChannel(ir[1], 1);
  verb.buffer = irBuf;
  node.connect(verb).connect(ctx.destination);
  node.start(0);
  const wet = await ctx.startRendering();
  // reversed back, each note's reverb now comes before the note. The render is n + nLen long; read backwards, its
  // first nLen samples are what comes before the start (the swell), the rest lines up with the opening itself
  const out: Stereo = [new Float32Array(nLen), new Float32Array(nLen)];
  for (let c = 0; c < 2; c++) {
    const w = wet.getChannelData(c);
    for (let i = 0; i < nLen; i++) out[c][i] = w[n + nLen - 1 - i];
  }
  // a soft beginning, the loudest moment just before the first note, and as loud as the opening itself
  let peak = 1e-9, ref = 1e-9;
  for (const ch of out) for (let i = 0; i < nLen; i++) { ch[i] *= Math.pow(i / nLen, 1.5); peak = Math.max(peak, Math.abs(ch[i])); }
  for (const ch of open) for (let i = 0; i < Math.min(ch.length, rate); i++) ref = Math.max(ref, Math.abs(ch[i]));
  const k = (0.8 * ref) / peak;
  for (const ch of out) for (let i = 0; i < nLen; i++) ch[i] *= k;
  return out;
}

/** `dur` seconds of the soundtrack from `at`, at `rate` */
async function sliceAt(src: AudioBuffer, at: number, dur: number, rate: number): Promise<Float32Array[]> {
  const n = Math.round(dur * rate);
  const ctx = new OfflineAudioContext(Math.min(2, src.numberOfChannels), n, rate);
  const node = ctx.createBufferSource();
  node.buffer = src;
  node.connect(ctx.destination);
  node.start(0, at, dur);
  const b = await ctx.startRendering();
  return Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
}
