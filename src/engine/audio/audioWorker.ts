// Web Worker: the analysis of the video's audio (waveform.ts) off the main thread.
import { analyse } from './waveform';

self.onmessage = (ev: MessageEvent<{ samples: Float32Array; rate: number }>) => {
  const { envelope, peaks } = analyse(ev.data.samples, ev.data.rate);
  (self as unknown as Worker).postMessage({ envelope, peaks }, [envelope.buffer, peaks.buffer]);
};
