// Web Worker: onset analysis of the video's audio, off the main thread.
import { onsetEnvelope } from './sync';

self.onmessage = (ev: MessageEvent<{ samples: Float32Array; rate: number }>) => {
  const env = onsetEnvelope(ev.data.samples, ev.data.rate);
  (self as unknown as Worker).postMessage({ envelope: env }, [env.buffer]);
};
