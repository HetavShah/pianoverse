// Web Worker: runs the keyboard tracker off the main thread.
import { KeyboardTracker, toGray } from './tracker';
import type { Quad } from './geometry';

export type WorkerIn =
  | { kind: 'init'; w: number; h: number; rgba: ArrayBuffer; scale: number; corners: Quad; whiteKeys: number }
  | { kind: 'frame'; t: number; w: number; h: number; rgba: ArrayBuffer };

export type WorkerOut =
  | { kind: 'ready'; features: number }
  | { kind: 'result'; t: number; corners: Quad | null; inliers: number; tracked: number; method: string }
  | { kind: 'error'; message: string };

let tracker: KeyboardTracker | null = null;

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  const post = (o: WorkerOut) => (self as unknown as Worker).postMessage(o);
  try {
    if (m.kind === 'init') {
      const ref = toGray(new Uint8ClampedArray(m.rgba), m.w, m.h);
      tracker = new KeyboardTracker({ ref, scale: m.scale, corners: m.corners, whiteKeys: m.whiteKeys });
      post({ kind: 'ready', features: tracker.featureCount });
    } else if (m.kind === 'frame') {
      if (!tracker) throw new Error('tracker not initialised');
      const r = tracker.step(toGray(new Uint8ClampedArray(m.rgba), m.w, m.h));
      post({ kind: 'result', t: m.t, corners: r.corners, inliers: r.inliers, tracked: r.tracked, method: r.method });
    }
  } catch (e) {
    post({ kind: 'error', message: String((e as Error)?.message ?? e) });
  }
};
