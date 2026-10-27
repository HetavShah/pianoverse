// The Transkun model: two ONNX networks run with ONNX Runtime (on the GPU when there is one) and the front end's
// constants (analysis windows and mel filters). 51 MB, so it is downloaded once and kept for the session.
export const TK_RATE = 44100;
/** hop between frames, window length and spectrum bins */
export const HOP = 1024, W = 4096, NB = W / 2 + 1;
/** mel bands, and the six differently windowed spectra per frame */
export const NMEL = 229, NWIN = 6;
/** seconds per window, and between windows (they overlap by half) */
export const SEG = 16, STEP = 8;
/** what each output row is: sustain, soft pedal, then the 88 keys */
export const PITCHES = [-64, -67, ...Array.from({ length: 88 }, (_, i) => 21 + i)];
export const NSYM = PITCHES.length;
/** width of the per-frame context the second network reads */
export const D = 256;

type Ort = typeof import('onnxruntime-web/webgpu');
type Session = import('onnxruntime-web').InferenceSession;

export interface TranskunModel {
  ort: Ort;
  /** audio features -> interval scores S [keys, T, T] and context [keys, T, D] */
  net: Session;
  /** a note's context -> its velocity and fine timing */
  attr: Session;
  /** the six analysis windows, W samples each */
  wins: Float32Array;
  /** mel filters, each kept as its non-zero span */
  mel: { lo: Int32Array; hi: Int32Array; w: Float32Array[] };
}

let loading: Promise<TranskunModel> | null = null;

/**
 * The model, loaded on first use and shared after that (a lazy singleton: loading it twice would download and
 * compile 51 MB again). A failed load is forgotten so the next call tries again.
 */
export function transkunModel(base: string, onProgress: (pct: number) => void): Promise<TranskunModel> {
  loading ??= load(base, onProgress).catch((e) => { loading = null; throw e; });
  return loading;
}

async function load(base: string, onProgress: (pct: number) => void): Promise<TranskunModel> {
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
  let net: Session;
  // automated tests run without a real GPU: software WebGPU is far slower than the CPU there
  const gpu = !(globalThis as { __pvCpuModel?: boolean }).__pvCpuModel;
  try { net = await ort.InferenceSession.create(netBytes, opts(gpu)); }
  catch { net = await ort.InferenceSession.create(netBytes, opts(false)); } // no usable GPU: slower, same notes
  const attr = await ort.InferenceSession.create(attrBytes, opts(false));
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
