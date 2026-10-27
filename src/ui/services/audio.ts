// The video's soundtrack: decoded once per video, mono at 22.05 kHz, plus its onset envelope (for syncing) and a
// waveform overview (for drawing). A note finder that listens at another rate gets its own copy (loadMonoAudio).
import { mixDown } from '../../engine/audio/sync';
import { integratedLoudness } from '../../engine/audio/loudness';
import { EXPORT_RATE } from '../../engine/audio/mixdown';

/** the rate the soundtrack is analysed at */
const ANALYSIS_RATE = 22050;

/** peaks: min/max pairs at PEAK_RATE bins per second, for drawing the waveform */
export interface VideoAudio { mono: Float32Array; rate: number; envelope: Float32Array; peaks: Float32Array; duration: number }
export const PEAK_RATE = 200;

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

const monoCache = new Map<string, Promise<Float32Array>>();
/** the soundtrack, mono, at another rate (a note finder's) */
export function loadMonoAudio(url: string, rate: number): Promise<Float32Array> {
  const key = `${rate}|${url}`;
  let p = monoCache.get(key);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not read the video file (${res.status})`);
      const ctx = new OfflineAudioContext(1, 1, rate);
      let buf: AudioBuffer;
      try { buf = await ctx.decodeAudioData(await res.arrayBuffer()); } catch { throw new Error("This video's sound couldn't be read. Does it have an audio track?"); }
      const chans: Float32Array[] = [];
      for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
      return mixDown(chans);
    })();
    monoCache.set(key, p);
    p.catch(() => monoCache.delete(key));
  }
  return p;
}

async function decode(url: string): Promise<VideoAudio> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read the video file (${res.status})`);
  const bytes = await res.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, ANALYSIS_RATE);
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(bytes);
  } catch {
    throw new Error("This video's sound couldn't be read. Does it have an audio track?");
  }
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const mono = mixDown(chans);
  const { envelope, peaks } = await new Promise<{ envelope: Float32Array; peaks: Float32Array }>((resolve, reject) => {
    const w = new Worker(new URL('../../engine/audio/audioWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev) => { resolve(ev.data); w.terminate(); };
    w.onerror = (e) => { reject(new Error(e.message)); w.terminate(); };
    w.postMessage({ samples: mono, rate: ANALYSIS_RATE });
  });
  return { mono, rate: ANALYSIS_RATE, envelope, peaks, duration: buf.duration };
}

// ---------- the full-quality soundtrack, for the Sound settings and the export ----------

let soundtrack: { url: string; buf: Promise<AudioBuffer> } | null = null;
/** the soundtrack in stereo at the export's rate (only the latest video's is kept: it is large) */
export function loadSoundtrack(url: string): Promise<AudioBuffer> {
  if (soundtrack?.url === url) return soundtrack.buf;
  const buf = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not read the video file (${res.status})`);
    try { return await new OfflineAudioContext(2, 1, EXPORT_RATE).decodeAudioData(await res.arrayBuffer()); } catch { throw new Error("This video's sound couldn't be read. Does it have an audio track?"); }
  })();
  soundtrack = { url, buf };
  buf.catch(() => { if (soundtrack?.buf === buf) soundtrack = null; });
  return buf;
}

const loudness = new Map<string, Promise<number>>();
/** how loud the soundtrack is between span[0] and span[1] seconds (LUFS) */
export function measureLoudness(url: string, span: [number, number]): Promise<number> {
  const key = `${span[0].toFixed(2)}|${span[1].toFixed(2)}|${url}`;
  let p = loudness.get(key);
  if (!p) {
    p = loadSoundtrack(url).then((b) => integratedLoudness(Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)), b.sampleRate, span[0], span[1]));
    loudness.set(key, p);
    p.catch(() => loudness.delete(key));
  }
  return p;
}
