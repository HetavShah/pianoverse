// The video's soundtrack: decoded once per video, mono at 22.05 kHz, plus its onset envelope.
import { mixDown } from '../engine/sync';
import { DETECT_RATE } from '../engine/detectConfig';

export interface VideoAudio { mono: Float32Array; rate: number; envelope: Float32Array; duration: number }

const cache = new Map<string, Promise<VideoAudio>>();

export function loadAudio(url: string): Promise<VideoAudio> {
  let p = cache.get(url);
  if (!p) {
    p = decode(url);
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

async function decode(url: string): Promise<VideoAudio> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read the video file (${res.status})`);
  const bytes = await res.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, DETECT_RATE);
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(bytes);
  } catch {
    throw new Error("This video's sound couldn't be read. Does it have an audio track?");
  }
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const mono = mixDown(chans);
  const envelope = await new Promise<Float32Array>((resolve, reject) => {
    const w = new Worker(new URL('../engine/audioWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev) => { resolve(ev.data.envelope); w.terminate(); };
    w.onerror = (e) => { reject(new Error(e.message)); w.terminate(); };
    w.postMessage({ samples: mono, rate: DETECT_RATE });
  });
  return { mono, rate: DETECT_RATE, envelope, duration: buf.duration };
}
