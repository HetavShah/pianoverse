// Export: render every frame with the same engine as the preview and hand the pixels to an encoder.
// In the desktop app the encoder is FFmpeg (NVENC / AMF / Quick Sync / x264, see src-tauri/src/export.rs).
import type { Renderer } from '../../engine/render';
import { loadTitleFonts, resolveTitles } from '../../engine/titles';
import type { CalibratedProject } from '../../engine/calibration';
import { aspectInfo, cameraAt, CameraFrame, followPath, FollowPath } from '../../engine/camera';
import { inTauri } from '../services/media';
import type { FrameSource } from '../../engine/render';
import { sourceRect, trimRange } from '../../engine/project';
import { ExportSettings, SIZES } from '../../engine/exportSettings';
import { resolveSound, soundActive, soundLead, soundTail } from '../../engine/audio/sound';
import { renderSound, sourceLoudness, wavBytes } from '../../engine/audio/mixdown';
import { pianoPartFor } from '../services/piano';
import { loadSoundtrack, measureLoudness } from '../services/audio';
export type { ExportSettings, SizeId } from '../../engine/exportSettings';
export { SIZES } from '../../engine/exportSettings';


// ---------- the camera (Camera step) ----------
export const cameraOn = (p: CalibratedProject) => !!p.cameraTrack?.on;
/** the sizes on offer: with the camera on, only those in the camera's frame shape */
export function sizesFor(p: CalibratedProject) {
  if (!cameraOn(p)) return SIZES.filter((z) => z.id !== 'k4l');
  const r = aspectInfo(p.cameraTrack!.aspect).ratio;
  return SIZES.filter((z) => Math.abs(z.w / z.h - r) < 0.01);
}
const paths = new WeakMap<object, { key: string; path: FollowPath }>();
/** where your hands are over time (worked out once per set of notes and calibration) */
export function cameraPath(p: CalibratedProject): FollowPath {
  const mv = p.cameraTrack?.auto.movement ?? 'normal';
  const key = `${mv}|${p.tracking.frames.length}|${p.keyboard.edge.a}|${p.keyboard.lowestNote}|${p.video.fps}`;
  const hit = paths.get(p.notes);
  if (hit && hit.key === key && (hit as unknown as { tr: unknown }).tr === p.tracking) return hit.path;
  const path = followPath(p, mv);
  paths.set(p.notes, Object.assign({ key, path }, { tr: p.tracking }));
  return path;
}
/** the camera at time t */
export function cameraFrameAt(p: CalibratedProject, t: number, duration: number): CameraFrame {
  return cameraAt(p, p.cameraTrack!, cameraPath(p), t, duration);
}


export interface Encoders {
  h264: string[]; hevc: string[]; prores: boolean;
  /** why each graphics-card encoder that failed its test did (FFmpeg's words) */
  failed?: Record<string, string>;
}

export interface SinkOpts {
  out: string; width: number; height: number; fps: number; outWidth: number; outHeight: number; fit: string;
  codec: string; encoder: string; quality: string; audio: string | null; audioCopy: boolean; start: number; duration: number;
}
export interface Sink {
  start(o: SinkOpts): Promise<void>;
  frame(rgba: Uint8Array): Promise<void>;
  finish(): Promise<string>;
  /** a line for the export's log (timings) */
  note?(line: string): Promise<void>;
  /** keepSound: the soundtrack stays for another try */
  cancel(keepSound?: boolean, reason?: string): Promise<void>;
  /** hand over the export's soundtrack (a WAV file); returns where the encoder can read it */
  audio?(wav: Uint8Array): Promise<string>;
}

/** FFmpeg in the desktop app */
export const tauriSink: Sink = {
  async start(opts) { const { invoke } = await import('@tauri-apps/api/core'); await invoke('export_start', { opts }); },
  async frame(rgba) { const { invoke } = await import('@tauri-apps/api/core'); await invoke('export_frame', rgba); },
  async finish() { const { invoke } = await import('@tauri-apps/api/core'); return invoke<string>('export_finish'); },
  async note(line) { const { invoke } = await import('@tauri-apps/api/core'); await invoke('export_note', { line }); },
  async cancel(keepSound = false, reason?: string) { const { invoke } = await import('@tauri-apps/api/core'); await invoke('export_cancel', { keepSound, reason: reason ?? null }); },
  async audio(wav) { const { invoke } = await import('@tauri-apps/api/core'); return invoke<string>('export_audio', wav); },
};

/** tests in a plain browser can provide their own encoder */
/** the latest export's log file (desktop app), for "Show log" */
export async function lastExportLog(): Promise<string | null> {
  if (!inTauri()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string | null>('export_last_log');
}

export const testSink = (): Sink | null => (window as unknown as { __pvExportSink?: Sink }).__pvExportSink ?? null;

// The encoder test runs once per run of the app, in the background a few seconds after it starts (warmEncoders);
// the Export screen shows the last result straight away (remembered from the last run) and the fresh one when ready.
const ENC_KEY = 'pv.encoders';
let tested: Promise<Encoders> | null = null;

export function detectEncoders(): Promise<Encoders> {
  if (!tested) {
    tested = (async () => {
      const forTests = (window as unknown as { __pvEncoders?: Encoders }).__pvEncoders;
      if (!inTauri() && !forTests) return { h264: ['libx264'], hevc: ['libx265'], prores: true, failed: {} };
      const e = forTests ?? await (await import('@tauri-apps/api/core')).invoke<Encoders>('export_encoders');
      // (an earlier version kept a list of encoders that once failed, and never offered them again: forgotten now,
      // the best encoder is tried every time and a failure only changes that one export)
      try { localStorage.removeItem('pv.badEncoders'); localStorage.setItem(ENC_KEY, JSON.stringify(e)); } catch { /* not kept */ }
      return { ...e, failed: e.failed ?? {} };
    })();
    tested.catch(() => { tested = null; });
  }
  return tested;
}

/** the last test's result, from the last run of the app (shown until this run's test is done) */
export function rememberedEncoders(): Encoders | null {
  try { const e = JSON.parse(localStorage.getItem(ENC_KEY) ?? 'null'); return e?.h264?.length ? e : null; } catch { return null; }
}

/** start the encoder test in the background, if FFmpeg is already there (it is never downloaded for this) */
export async function warmEncoders() {
  if (!inTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  if (await invoke<boolean>('converter_ready').catch(() => false)) detectEncoders().catch(() => {});
}

/** the encoder an export uses: the one picked, if this computer has it, otherwise the best one that works */
export function pickEncoder(e: Encoders, s: ExportSettings): string {
  const list = s.codec === 'hevc' ? e.hevc : e.h264;
  const fallback = s.codec === 'hevc' ? 'libx265' : 'libx264';
  return s.encoder && s.encoder !== 'auto' && list.includes(s.encoder) ? s.encoder : list[0] ?? fallback;
}

// ---- how long an export takes: learnt from this computer's exports ----
// seconds per frame per megapixel, for each encoder (drawing, reading back and encoding together), starting from
// rough figures for a laptop and then following what the last exports here took
const SPEED_KEY = 'pv.encoderSpeed';
// (a laptop with NVIDIA took 6 min 46 s for 1,811 frames of 1080x1920 with NVENC, 7-8 min with x264: drawing and
// reading back each frame costs as much as encoding it, so a graphics-card encoder saves less than it seems)
const SPEED_START = (enc: string) => (enc === 'libx265' ? 0.2 : enc === 'libx264' ? 0.12 : 0.105);
function speeds(): Record<string, number> { try { return JSON.parse(localStorage.getItem(SPEED_KEY) ?? '{}'); } catch { return {}; } }
/** how many seconds an export of `frames` frames of w x h will take with this encoder */
export function estimateSeconds(enc: string, frames: number, w: number, h: number, transparent = false): number {
  const mp = (w * h) / 1e6;
  return frames * mp * (speeds()[enc] ?? SPEED_START(enc)) * (transparent ? 2 : 1) + 2;
}
function learnSpeed(enc: string, frames: number, w: number, h: number, secs: number) {
  if (frames < 30 || secs <= 0) return;
  const v = secs / (frames * (w * h) / 1e6);
  const all = speeds();
  all[enc] = all[enc] ? all[enc] * 0.5 + v * 0.5 : v;
  try { localStorage.setItem(SPEED_KEY, JSON.stringify(all)); } catch { /* not kept */ }
}

/**
 * Why the graphics card that draws the preview isn't the one encoding, in plain words (null when it is, or no
 * reason is known). gpu: the drawing card's name ("nvidia", "NVIDIA GeForce RTX 3050 Laptop GPU", …).
 */
export function encoderNote(e: Encoders | null, gpu: string, codec: 'h264' | 'hevc'): string | null {
  if (!e?.failed) return null;
  const vendor = /nvidia/i.test(gpu) ? 'nvenc' : /amd|radeon/i.test(gpu) ? 'amf' : null;
  if (!vendor) return null;
  const name = `${codec}_${vendor}`;
  const why = e.failed[name];
  if (!why || (codec === 'hevc' ? e.hevc : e.h264)[0] === name) return null;
  const card = vendor === 'nvenc' ? 'NVIDIA NVENC' : 'AMD AMF';
  if (/driver does not support|minimum required|nvenc API version|driver version/i.test(why)) return `${card} can't be used: your graphics driver is too old for it. Updating the driver should make exports faster. (${why})`;
  if (/no capable devices|no nvenc capable|not supported|cannot load nvcuda|OpenEncodeSession.*failed/i.test(why)) return `${card} can't be used: this graphics card has no video encoder, or Windows isn't giving Pianoverse access to it. (${why})`;
  if (/invalid param|invalid argument/i.test(why)) return `${card} can't be used: the card turned down every setting Pianoverse tried, even the simplest. Updating the graphics driver may help. (${why})`;
  return `${card} can't be used. (${why})`;
}

const isHardware = (enc: string) => /_(nvenc|amf|qsv)$/.test(enc);

// The graphics card that encodes isn't always the one that draws (a laptop with Intel and NVIDIA), so the label names
// the encoder only.
export const encoderLabel = (enc: string) => {
  if (enc.endsWith('_nvenc')) return 'NVIDIA NVENC';
  if (enc.endsWith('_amf')) return 'AMD AMF';
  if (enc.endsWith('_qsv')) return 'Intel Quick Sync';
  if (enc === 'libx265') return 'x265 (processor)';
  return 'x264 (processor)';
};

/** output size for a choice (the video's own size for 'source') */
export function outSize(s: ExportSettings, p: CalibratedProject) {
  if (cameraOn(p)) {
    const list = sizesFor(p);
    const z = list.find((x) => x.id === s.size) ?? list[0];
    return { w: z.w, h: z.h };
  }
  if (s.size === 'source') { const R = sourceRect(p); const w = Math.round(R.w), h = Math.round(R.h); return { w: w - (w % 2), h: h - (h % 2) }; }
  const z = SIZES.find((x) => x.id === s.size)!;
  return { w: z.w, h: z.h };
}

/** render scale so the rendered frame covers (crop) or fits inside (fit) the output, without wasting pixels */
export function renderScale(s: ExportSettings, p: CalibratedProject) {
  const { w, h } = outSize(s, p);
  const R = sourceRect(p);
  const kx = w / R.w, ky = h / R.h;
  return s.fit === 'fit' ? Math.min(kx, ky) : Math.max(kx, ky);
}

export function estimate(s: ExportSettings, p: CalibratedProject, duration: number) {
  const { w, h } = outSize(s, p);
  const fps = s.fps || p.video.fps || 30;
  const frames = Math.max(1, Math.floor(duration * fps));
  // bits per pixel per frame for busy glittery footage at each quality
  const bpp = { high: 0.11, medium: 0.065, small: 0.035 }[s.quality] * (s.codec === 'hevc' ? 0.62 : 1);
  const mb = (w * h * fps * bpp * duration) / 8 / 1e6 + (duration * 256) / 8 / 1000;
  return { frames, fps, mb };
}

/** the video's current frame as a canvas (a canvas copies into the GPU reliably on every system) */
let frameCanvas: HTMLCanvasElement | null = null;
export function videoFrame(v: HTMLVideoElement): HTMLCanvasElement {
  const c = (frameCanvas ??= document.createElement('canvas'));
  if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight; }
  c.getContext('2d')!.drawImage(v, 0, 0);
  return c;
}

const seekTo = (v: HTMLVideoElement, t: number) => new Promise<void>((res) => {
  if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) { res(); return; }
  const done = () => { v.removeEventListener('seeked', done); res(); };
  v.addEventListener('seeked', done);
  v.currentTime = t;
  setTimeout(done, 4000);
});

/**
 * The video's frames read straight through by FFmpeg (desktop app; src-tauri/src/decode.rs), instead of jumping the
 * video player to every frame: frame(si) gives source frame si, frames being asked for in order.
 */
interface DecodedVideo { frame(si: number): Promise<HTMLCanvasElement>; close(): void }

async function openDecoded(p: CalibratedProject, v: HTMLVideoElement, first: number, srcFps: number): Promise<DecodedVideo | null> {
  const path = p.video.editPath ?? p.video.path;
  if (!inTauri() || !path || !v.videoWidth) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  const w = v.videoWidth, h = v.videoHeight;
  await invoke('decode_open', { path, start: first / srcFps, fps: srcFps, width: w, height: h });
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  let cur = first - 1, ended = false, latest: ArrayBuffer | null = null, drawn = -2;
  return {
    async frame(si) {
      while (cur < si && !ended) {
        try { latest = await invoke<ArrayBuffer>('decode_next'); cur++; } catch (e) {
          if (/^end/.test(String((e as Error)?.message ?? e)) && latest) { ended = true; break; }
          throw e;
        }
      }
      if (!latest) throw new Error('The video reader gave no frame');
      if (drawn !== cur) { g.putImageData(new ImageData(new Uint8ClampedArray(latest), w, h), 0, 0); drawn = cur; }
      return c;
    },
    close() { invoke('decode_close').catch(() => {}); },
  };
}

export interface ExportProgress {
  phase: 'sound' | 'video' | 'effects'; done: number; total: number; elapsed: number; eta: number; preview?: string;
  /** something that changed on the way (the encoder) */
  note?: string;
  /** what a frame has been waiting on for a few seconds (shown so a slow step is never a silent freeze) */
  waiting?: string;
}

/** a step of a frame that takes too long fails with a message instead of waiting for ever */
const within = <T,>(p: Promise<T>, secs: number, what: string): Promise<T> => Promise.race([
  p,
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} didn't answer for ${secs} seconds, so the export stopped. Keep Pianoverse open and try again; if it happens again, restart the app.`)), secs * 1000)),
]);

/** render and encode; resolves with the saved file's path */
export async function runExport(args: {
  renderer: Renderer; video: HTMLVideoElement; project: CalibratedProject; duration: number;
  settings: ExportSettings; encoders: Encoders; sink: Sink;
  onProgress: (p: ExportProgress) => void; cancelled: () => boolean;
  /** export only this part (seconds) */
  range?: [number, number] | null;
}): Promise<string[]> {
  const { renderer: r, video: v, project: p, settings: s, sink } = args;
  const { w: outW, h: outH } = outSize(s, p);
  // only the part kept on the Video step (trim), and of that the selection if one is asked for
  const [t0, t1] = trimRange(p, args.duration);
  const from = Math.max(t0, args.range ? args.range[0] : t0);
  const to = Math.max(from + 1 / 30, Math.min(t1, args.range ? args.range[1] : t1));
  // the sound: the video's own audio as it is, or (with Sound settings) rendered with them. A swell comes before the
  // video (the picture holds its first frame, fading in) and a ring-out after it (it holds the last, fading out)
  const sound = resolveSound(p.sound);
  const shaped = soundActive(sound);
  const tail = soundTail(sound), lead = soundLead(sound);
  const { frames, fps } = estimate(s, p, lead + to - from + tail);
  const srcFps = p.video.fps || 30;
  const oldScale = r.scaleFactor;
  const oldOutput = r.output;
  const cam = cameraOn(p);
  const wasPaused = v.paused;
  v.pause();
  const saved: string[] = [];
  const passes: ('video' | 'effects')[] = s.transparent ? ['video', 'effects'] : ['video'];
  // the opening title and end card belong to what is exported (a section gets its own); the end card covers the ring-out
  r.cardSpan = [from - lead, to + tail];
  await loadTitleFonts();
  try {
    let audio: string | null = p.video.path ?? null;
    if (shaped) {
      if (!sink.audio) throw new Error('This exporter can\'t take a changed soundtrack.');
      args.onProgress({ phase: 'sound', done: 0, total: 1, elapsed: 0, eta: 0 });
      const url = v.currentSrc || v.src;
      const piano = await pianoPartFor(p.notes, sound);
      const src = sound.source === 'piano' ? null : await loadSoundtrack(url);
      const lufs = !sound.even ? null : piano ? await sourceLoudness(src, sound, piano, [t0, t1]) : await measureLoudness(url, [t0, t1]);
      audio = await sink.audio(wavBytes(await renderSound(src, sound, [from, to], lufs, piano)));
      if (args.cancelled()) throw new Error('cancelled');
    }
    const titles = resolveTitles(p.titles);
    const fadeTail = tail > 0 && !titles.outro.on, fadeLead = lead > 0 && !titles.intro.on;
    for (const phase of passes) {
      // with the camera the frame is drawn at the output size, through the camera's window
      if (cam) { r.setOutput([outW, outH]); r.setScale(1); } else r.setScale(renderScale(s, p));
      r.alphaOut = phase === 'effects';
      await r.texturesReady?.();
      const { width, height } = r.size;
      const out = phase === 'effects' ? s.out.replace(/\.[a-z0-9]+$/i, '') + ' (effects).mov' : s.out;
      let enc = phase === 'effects' ? 'prores_ks' : pickEncoder(args.encoders, s);
      let note: string | undefined;
      // a graphics-card encoder that gets stuck or stops: the pass starts again on the processor
      for (;;) {
      try {
      // starting the encoder has a limit too, and says so while it takes a moment
      const starting = setTimeout(() => args.onProgress({ phase, done: 0, total: frames, elapsed: 0, eta: 0, note, waiting: 'the encoder to start' }), 3000);
      try {
        await within(sink.start({
          out, width, height, fps, outWidth: outW, outHeight: outH, fit: s.fit,
          codec: phase === 'effects' ? 'prores' : s.codec, encoder: enc, quality: s.quality,
          audio: phase === 'effects' ? null : audio, audioCopy: s.audioCopy && !shaped, start: shaped ? 0 : from, duration: frames / fps,
        }), 30, 'Starting the encoder');
      } finally { clearTimeout(starting); }
      const t0 = performance.now();
      let pending: Promise<void> | null = null;
      let lastSrc = -1;
      // what the frame is doing now: shown when it takes more than a few seconds
      let step = '', stepSince = performance.now(), done = 0;
      // where each frame's time goes, written to the export's log every 100 frames
      const spent: Record<string, number> = {};
      const doing = (what: string) => {
        const now = performance.now();
        if (step) spent[step] = (spent[step] ?? 0) + now - stepSince;
        step = what; stepSince = now;
      };
      const report = (n: number) => {
        const per = Object.entries(spent).map(([k, ms]) => `${k} ${(ms / n).toFixed(1)} ms`).join(', ');
        sink.note?.(`frames ${n}: per frame ${per}; ${(n / ((performance.now() - t0) / 1000)).toFixed(1)} frames/s`).catch(() => {});
      };
      const watch = setInterval(() => {
        if (step && performance.now() - stepSince > 3000) {
          const el = (performance.now() - t0) / 1000;
          args.onProgress({ phase, done, total: frames, elapsed: el, eta: 0, note, waiting: step });
        }
      }, 1000);
      // the video's frames straight from FFmpeg when it can (much faster than jumping the player to each one)
      const firstSrc = Math.max(0, Math.floor(from * srcFps + 1e-6));
      let decoded: DecodedVideo | null = await openDecoded(p, v, firstSrc, srcFps).catch((e) => {
        sink.note?.(`the video reader couldn't start (${String((e as Error)?.message ?? e).slice(0, 200)}); jumping the video player to each frame`).catch(() => {});
        return null;
      });
      sink.note?.(decoded ? 'reading the video straight through with FFmpeg' : 'jumping the video player to each frame').catch(() => {});
      try {
      for (let i = 0; i < frames; i++) {
        if (args.cancelled()) { await within(pending ?? Promise.resolve(), 5, 'The encoder').catch(() => {}); await within(sink.cancel(), 10, 'Stopping the encoder').catch(() => {}); throw new Error('cancelled'); }
        const t = from - lead + i / fps;
        // the video frame on screen at time t (frames repeat when exporting at a higher frame rate; during a
        // ring-out the last one holds while the effects play on)
        const si = Math.min(Math.floor(Math.max(from, Math.min(t, to - 0.5 / srcFps)) * srcFps + 1e-6), Math.max(0, Math.floor(args.duration * srcFps) - 1));
        let frameImg: FrameSource;
        if (decoded) {
          doing('the video');
          try { frameImg = await within(decoded.frame(si), 40, 'Reading the video'); } catch (e) {
            // the reader failed: on with the video player for the rest
            sink.note?.(`the video reader stopped (${String((e as Error)?.message ?? e).slice(0, 200)}); jumping the video player to each frame instead`).catch(() => {});
            decoded.close(); decoded = null; lastSrc = -1;
          }
        }
        if (!decoded) {
          if (si !== lastSrc) { doing('the video'); await seekTo(v, (si + 0.5) / srcFps); lastSrc = si; }
          doing('the video frame');
          frameImg = videoFrame(v);
        }
        // the swell fades in from black and the ring-out fades to black (unless a title card is showing)
        const dark = fadeTail && t > to ? smoothFade((t - to) / tail) : fadeLead && t < from ? 1 - smoothFade((t - (from - lead)) / lead) : 0;
        if (cam) { const c = cameraFrameAt(p, Math.max(from, Math.min(t, to)), args.duration); r.setView(c.view, [Math.max(c.fade[0], dark), dark > c.fade[0] ? 0 : c.fade[1]]); }
        else if (tail > 0 || lead > 0) r.setView(null, [dark, 0]);
        doing('the graphics card');
        const img = await within(r.capture(frameImg!, t), 30, 'The graphics card');
        doing('the encoder');
        if (pending) await pending;
        // the encoder side gives up on its own after 20 s; this is the last line of defence
        pending = within(sink.frame(img.data), 60, 'The encoder');
        done = i + 1;
        doing('');
        if (done % 100 === 0) report(done);
        if (i % 6 === 0 || i === frames - 1) {
          const el = (performance.now() - t0) / 1000;
          let preview: string | undefined;
          if (i % 60 === 0) preview = thumb(img);
          args.onProgress({ phase, done: i + 1, total: frames, elapsed: el, eta: (el / (i + 1)) * (frames - i - 1), preview, note });
        }
      }
      doing('the encoder');
      if (pending) await pending;
      report(frames);
      doing('the encoder to finish');
      saved.push(await within(sink.finish(), 180, 'The encoder'));
      doing('');
      if (phase === 'video') learnSpeed(enc, frames, outW, outH, (performance.now() - t0) / 1000);
      } finally { clearInterval(watch); decoded?.close(); }
      break;
      } catch (e) {
        const m = String((e as Error)?.message ?? e);
        if (m === 'cancelled' || !isHardware(enc)) throw e;
        const why = m === 'stalled' ? 'stopped responding' : `stopped (${m.replace(/^The encoder stopped:?\s*/, '').slice(0, 160)})`;
        await within(sink.cancel(true, `${encoderLabel(enc)} ${why}; starting again on the processor`), 10, 'Stopping the encoder').catch(() => {});
        const was = encoderLabel(enc);
        enc = s.codec === 'hevc' ? 'libx265' : 'libx264';
        note = `${was} ${why}, so this export is being made on the processor (a little slower). Next export tries ${was} again.`;
        args.onProgress({ phase, done: 0, total: frames, elapsed: 0, eta: 0, note });
      }
      }
    }
  } finally {
    r.alphaOut = false;
    r.cardSpan = null;
    if (cam) r.setOutput(oldOutput);
    if (cam || tail > 0 || lead > 0) r.setView(null);
    r.setScale(oldScale);
    if (!wasPaused) v.play().catch(() => {});
  }
  return saved;
}

const smoothFade = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };

/** a small preview image of a captured frame */
function thumb(img: { width: number; height: number; data: Uint8Array }): string {
  const k = 240 / Math.max(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height), 0, 0);
  const s = document.createElement('canvas');
  s.width = Math.round(img.width * k); s.height = Math.round(img.height * k);
  s.getContext('2d')!.drawImage(c, 0, 0, s.width, s.height);
  return s.toDataURL('image/jpeg', 0.8);
}

/** the current frame as a PNG at the export size */
export async function framePng(r: Renderer, v: HTMLVideoElement, p: CalibratedProject, s: ExportSettings, t: number, duration = p.video.frames / (p.video.fps || 30)): Promise<Blob> {
  const oldScale = r.scaleFactor;
  const oldOutput = r.output;
  const cam = cameraOn(p);
  const { w, h } = outSize(s, p);
  try {
    if (cam) { r.setOutput([w, h]); r.setScale(1); const c = cameraFrameAt(p, t, duration); r.setView(c.view, c.fade); } else r.setScale(renderScale(s, p));
    const img = await r.capture(videoFrame(v), t);
    const src = document.createElement('canvas');
    src.width = img.width; src.height = img.height;
    src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height), 0, 0);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const k = s.fit === 'fit' ? Math.min(w / img.width, h / img.height) : Math.max(w / img.width, h / img.height);
    const dw = img.width * k, dh = img.height * k;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the PNG'))), 'image/png'));
  } finally {
    if (cam) { r.setView(null); r.setOutput(oldOutput); }
    r.setScale(oldScale);
  }
}
