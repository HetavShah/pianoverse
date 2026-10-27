// The analysis the Audio step draws and syncs with: the onset envelope (engine/audio/sync.ts) and a min/max
// waveform overview. Run in a worker (audioWorker.ts), or right here if the worker can't be used.
import { onsetEnvelope } from './sync';

export const PEAK_RATE = 200; // waveform bins per second

export function analyse(samples: Float32Array, rate: number): { envelope: Float32Array; peaks: Float32Array } {
  const envelope = onsetEnvelope(samples, rate);
  const per = rate / PEAK_RATE;
  const n = Math.floor(samples.length / per);
  const peaks = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = 0;
    const a = Math.floor(i * per), b = Math.floor((i + 1) * per);
    for (let k = a; k < b; k++) { const v = samples[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
    peaks[i * 2] = lo; peaks[i * 2 + 1] = hi;
  }
  return { envelope, peaks };
}
