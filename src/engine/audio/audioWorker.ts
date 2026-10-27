// Web Worker: analysis of the video's audio off the main thread — the onset envelope (for syncing) and
// a min/max waveform overview (for drawing).
import { onsetEnvelope } from './sync';

export const PEAK_RATE = 200; // waveform bins per second

self.onmessage = (ev: MessageEvent<{ samples: Float32Array; rate: number }>) => {
  const { samples, rate } = ev.data;
  const env = onsetEnvelope(samples, rate);
  const per = rate / PEAK_RATE;
  const n = Math.floor(samples.length / per);
  const peaks = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = 0;
    const a = Math.floor(i * per), b = Math.floor((i + 1) * per);
    for (let k = a; k < b; k++) { const v = samples[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
    peaks[i * 2] = lo; peaks[i * 2 + 1] = hi;
  }
  (self as unknown as Worker).postMessage({ envelope: env, peaks }, [env.buffer, peaks.buffer]);
};
