// Runs keyboard tracking over a whole video: a hidden copy of the video plays while each presented
// frame is shrunk, read back and handed to the tracking worker. Playback pauses whenever the worker
// falls behind, so no frame is skipped because of slow tracking.
import type { Quad } from '../engine/geometry';
import type { WorkerIn, WorkerOut } from '../engine/trackWorker';

export interface TrackSample { t: number; corners: Quad | null; quality: number }

export interface TrackProgress { done: number; total: number; lost: number; features: number }

type RVFC = HTMLVideoElement & {
  requestVideoFrameCallback: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback: (id: number) => void;
};

export interface TrackJob { promise: Promise<{ samples: TrackSample[]; times: number[] }>; cancel: () => void }

const MAX_DIM = 960;

function onceEvent(el: HTMLElement, name: string, timeoutMs = 15000) {
  return new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`video did not fire ${name}`)), timeoutMs);
    el.addEventListener(name, () => { clearTimeout(t); res(); }, { once: true });
  });
}

export function startTracking(opts: {
  src: string;
  refTime: number;
  corners: Quad;
  whiteKeys: number;
  onProgress: (p: TrackProgress) => void;
}): TrackJob {
  let cancelled = false;
  const v = document.createElement('video') as RVFC;
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(v);
  const worker = new Worker(new URL('../engine/trackWorker.ts', import.meta.url), { type: 'module' });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    cancelled = true;
    worker.terminate();
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.remove();
  };

  let abort: (e: Error) => void = () => {};
  const aborted = new Promise<never>((_, rej) => { abort = rej; });
  const work = (async () => {
    v.src = opts.src;
    await onceEvent(v, 'loadeddata');
    const W = v.videoWidth, H = v.videoHeight;
    const scale = Math.min(1, MAX_DIM / Math.max(W, H));
    const tw = Math.round(W * scale), th = Math.round(H * scale);
    const canvas = document.createElement('canvas');
    canvas.width = tw; canvas.height = th;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const grab = () => {
      ctx.drawImage(v, 0, 0, tw, th);
      return ctx.getImageData(0, 0, tw, th).data.buffer as ArrayBuffer;
    };

    // reference frame
    v.currentTime = Math.max(0, opts.refTime);
    await onceEvent(v, 'seeked');
    await new Promise((r) => setTimeout(r, 60));
    const refBuf = grab();
    let features = 0;
    await new Promise<void>((res, rej) => {
      worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
        if (ev.data.kind === 'ready') { features = ev.data.features; res(); }
        else if (ev.data.kind === 'error') rej(new Error(ev.data.message));
      };
      const msg: WorkerIn = { kind: 'init', w: tw, h: th, rgba: refBuf, scale, corners: opts.corners, whiteKeys: opts.whiteKeys };
      worker.postMessage(msg, [refBuf]);
    });
    if (features < 12) throw new Error('Not enough detail on the keyboard to track. Check the corners, or choose "Camera stayed still".');
    if (cancelled) throw new Error('cancelled');

    // play from the start, tracking every presented frame
    const samples: TrackSample[] = [];
    const times: number[] = [];
    let pending = 0, held = false, ended = false, lost = 0;
    const duration = v.duration;
    v.currentTime = 0;
    await onceEvent(v, 'seeked');

    return await new Promise<{ samples: TrackSample[]; times: number[] }>((res, rej) => {
      const finishIfDone = () => { if (ended && pending === 0) res({ samples, times }); };
      worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
        const m = ev.data;
        if (m.kind === 'error') { rej(new Error(m.message)); return; }
        if (m.kind !== 'result') return;
        pending--;
        if (!m.corners) lost++;
        samples.push({ t: m.t, corners: m.corners, quality: m.tracked ? m.inliers / m.tracked : 0 });
        opts.onProgress({ done: m.t, total: duration, lost, features });
        if (held && pending <= 1 && !cancelled) { held = false; v.play().catch(rej); }
        finishIfDone();
      };
      let lastT = -1;
      const onFrame = (_now: number, meta: { mediaTime: number }) => {
        if (cancelled) return;
        const t = meta.mediaTime;
        if (t !== lastT) {
          lastT = t;
          times.push(t);
          const buf = grab();
          pending++;
          const msg: WorkerIn = { kind: 'frame', t, w: tw, h: th, rgba: buf };
          worker.postMessage(msg, [buf]);
          if (pending >= 3 && !v.paused) { held = true; v.pause(); }
        }
        if (!ended) v.requestVideoFrameCallback(onFrame);
      };
      v.requestVideoFrameCallback(onFrame);
      v.addEventListener('ended', () => { ended = true; finishIfDone(); }, { once: true });
      v.play().catch(rej);
    });
  })();
  const promise = Promise.race([work, aborted]).finally(cleanup);
  work.catch(() => {});

  return { promise, cancel: () => { abort(new Error('cancelled')); cleanup(); } };
}
