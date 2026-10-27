// The video's sound, read once per video and shared:
//   loadSoundtrack  stereo at 48 kHz: the Sound settings, the swell, the loudness, the export
//   loadAudio       mono at 22.05 kHz with its onset envelope (for syncing) and a waveform overview (for drawing)
//   loadMonoAudio   mono at another rate (a note finder's)
// The last two are made from the first, so the file is read and decoded once.
//
// Reading it: in the desktop app FFmpeg pulls out just the sound as a WAV (a few MB, cached by the app), when FFmpeg
// is there; otherwise the whole video file is read (a phone video can be hundreds of MB). Only one video is read at
// a time: opening another project drops the read of the one before, so two large videos are never in memory together.
import { mixDown } from '../../engine/audio/sync';
import { integratedLoudness } from '../../engine/audio/loudness';
import { EXPORT_RATE } from '../../engine/audio/mixdown';
import { analyse } from '../../engine/audio/waveform';
import { inTauri } from './media';

/** the rate the soundtrack is analysed at */
const ANALYSIS_RATE = 22050;

/** peaks: min/max pairs at PEAK_RATE bins per second, for drawing the waveform */
export interface VideoAudio { mono: Float32Array; rate: number; envelope: Float32Array; peaks: Float32Array; duration: number }
export const PEAK_RATE = 200;

const NO_AUDIO = "This video's sound couldn't be read. Does it have an audio track?";

// the files behind video URLs (desktop app), so FFmpeg can read the sound from the file itself
const paths = new Map<string, string>();
/** tell the sound reader which file a video URL is (desktop app) */
export function registerVideoPath(url: string, path: string | undefined) { if (url && path) paths.set(url, path); }

async function readBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const path = paths.get(url);
  if (path && inTauri()) {
    try {
      const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
      const wav = await invoke<string>('extract_audio', { path });
      const res = await fetch(convertFileSrc(wav), { signal });
      if (res.ok) return await res.arrayBuffer();
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      // without FFmpeg (or if it fails) the video file itself is read below
    }
  }
  let res: Response;
  try { res = await fetch(url, { signal }); } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new Error(`Couldn't open the video file to read its sound (${(e as Error).message}).`);
  }
  if (!res.ok) throw new Error(`Could not read the video file (${res.status})`);
  return res.arrayBuffer();
}

// ---------- the soundtrack: one at a time ----------

let soundtrack: { url: string; buf: Promise<AudioBuffer>; abort: AbortController } | null = null;
/** the soundtrack in stereo at the export's rate (only the open video's is kept: it is large) */
export function loadSoundtrack(url: string): Promise<AudioBuffer> {
  if (soundtrack?.url === url) return soundtrack.buf;
  soundtrack?.abort.abort();
  const abort = new AbortController();
  const buf = (async () => {
    const bytes = await readBytes(url, abort.signal);
    try { return await new OfflineAudioContext(2, 1, EXPORT_RATE).decodeAudioData(bytes); } catch { throw new Error(NO_AUDIO); }
  })();
  soundtrack = { url, buf, abort };
  buf.catch(() => { if (soundtrack?.buf === buf) soundtrack = null; });
  return buf;
}

/** the soundtrack as mono at `rate` (resampled from the stereo one) */
async function monoAt(buf: AudioBuffer, rate: number): Promise<Float32Array> {
  if (buf.sampleRate === rate) return mixDown(Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)));
  const ctx = new OfflineAudioContext(buf.numberOfChannels, Math.max(1, Math.ceil(buf.duration * rate)), rate);
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.connect(ctx.destination);
  node.start(0);
  const out = await ctx.startRendering();
  return mixDown(Array.from({ length: out.numberOfChannels }, (_, c) => out.getChannelData(c)));
}

// ---------- made from it ----------

// small, so kept for the videos opened in this session
const cache = new Map<string, Promise<VideoAudio>>();
const monoCache = new Map<string, Promise<Float32Array>>();
const keepFor = <T>(map: Map<string, Promise<T>>, key: string, make: () => Promise<T>) => {
  let p = map.get(key);
  if (!p) {
    p = make();
    map.set(key, p);
    p.catch(() => map.delete(key));
  }
  return p;
};

/** forget what was made for a video still being read (it took too long): the next call starts again */
export function forgetAudio(url: string) {
  cache.delete(url);
  if (soundtrack?.url === url) { soundtrack.abort.abort(); soundtrack = null; }
}

export function loadAudio(url: string): Promise<VideoAudio> {
  return keepFor(cache, url, async () => {
    const buf = await loadSoundtrack(url);
    const mono = await monoAt(buf, ANALYSIS_RATE);
    // in a worker; if it fails or doesn't answer within 20 s, here instead
    const { envelope, peaks } = await new Promise<{ envelope: Float32Array; peaks: Float32Array }>((resolve) => {
      let done = false;
      const here = () => { if (!done) { done = true; resolve(analyse(mono, ANALYSIS_RATE)); } };
      try {
        const w = new Worker(new URL('../../engine/audio/audioWorker.ts', import.meta.url), { type: 'module' });
        const t = setTimeout(() => { w.terminate(); here(); }, 20_000);
        w.onmessage = (ev) => { clearTimeout(t); w.terminate(); if (!done) { done = true; resolve(ev.data); } };
        w.onerror = () => { clearTimeout(t); w.terminate(); here(); };
        w.postMessage({ samples: mono.slice(), rate: ANALYSIS_RATE });
      } catch { here(); }
    });
    return { mono, rate: ANALYSIS_RATE, envelope, peaks, duration: buf.duration };
  });
}

/** the soundtrack, mono, at another rate (a note finder's) */
export function loadMonoAudio(url: string, rate: number): Promise<Float32Array> {
  return keepFor(monoCache, `${rate}|${url}`, async () => monoAt(await loadSoundtrack(url), rate));
}

const loudness = new Map<string, Promise<number>>();
/** how loud the soundtrack is between span[0] and span[1] seconds (LUFS) */
export function measureLoudness(url: string, span: [number, number]): Promise<number> {
  return keepFor(loudness, `${span[0].toFixed(2)}|${span[1].toFixed(2)}|${url}`,
    () => loadSoundtrack(url).then((b) => integratedLoudness(Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)), b.sampleRate, span[0], span[1])));
}
