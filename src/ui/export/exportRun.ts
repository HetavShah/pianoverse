// Export: render every frame with the same engine as the preview and hand the pixels to an encoder.
// In the desktop app the encoder is FFmpeg (NVENC / AMF / Quick Sync / x264, see src-tauri/src/export.rs).
import type { Renderer } from '../../engine/render';
import { loadTitleFonts, resolveTitles } from '../../engine/titles';
import type { CalibratedProject } from '../../engine/calibration';
import { aspectInfo, cameraAt, CameraFrame, followPath, FollowPath } from '../../engine/camera';
import { inTauri } from '../services/media';
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


export interface Encoders { h264: string[]; hevc: string[]; prores: boolean }

export interface SinkOpts {
  out: string; width: number; height: number; fps: number; outWidth: number; outHeight: number; fit: string;
  codec: string; encoder: string; quality: string; audio: string | null; audioCopy: boolean; start: number; duration: number;
}
export interface Sink {
  start(o: SinkOpts): Promise<void>;
  frame(rgba: Uint8Array): Promise<void>;
  finish(): Promise<string>;
  cancel(): Promise<void>;
  /** hand over the export's soundtrack (a WAV file); returns where the encoder can read it */
  audio?(wav: Uint8Array): Promise<string>;
}

/** FFmpeg in the desktop app */
export const tauriSink: Sink = {
  async start(opts) { const { invoke } = await import('@tauri-apps/api/core'); await invoke('export_start', { opts }); },
  async frame(rgba) { const { invoke } = await import('@tauri-apps/api/core'); await invoke('export_frame', rgba); },
  async finish() { const { invoke } = await import('@tauri-apps/api/core'); return invoke<string>('export_finish'); },
  async cancel() { const { invoke } = await import('@tauri-apps/api/core'); await invoke('export_cancel'); },
  async audio(wav) { const { invoke } = await import('@tauri-apps/api/core'); return invoke<string>('export_audio', wav); },
};

/** tests in a plain browser can provide their own encoder */
export const testSink = (): Sink | null => (window as unknown as { __pvExportSink?: Sink }).__pvExportSink ?? null;

export async function detectEncoders(): Promise<Encoders> {
  const forTests = (window as unknown as { __pvEncoders?: Encoders }).__pvEncoders;
  if (!inTauri() && !forTests) return { h264: ['libx264'], hevc: ['libx265'], prores: true };
  const e = forTests ?? await (await import('@tauri-apps/api/core')).invoke<Encoders>('export_encoders');
  // an encoder that got stuck in an export on this computer isn't offered again
  const bad = badEncoders();
  const keep = (l: string[], cpu: string) => { const k = l.filter((x) => !bad.includes(x)); return k.length ? k : [cpu]; };
  return { ...e, h264: keep(e.h264, 'libx264'), hevc: keep(e.hevc, 'libx265') };
}

const BAD_KEY = 'pv.badEncoders';
function badEncoders(): string[] {
  try { return JSON.parse(localStorage.getItem(BAD_KEY) ?? '[]'); } catch { return []; }
}
function markBadEncoder(enc: string) {
  try { localStorage.setItem(BAD_KEY, JSON.stringify([...new Set([...badEncoders(), enc])])); } catch { /* not kept */ }
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

export interface ExportProgress { phase: 'sound' | 'video' | 'effects'; done: number; total: number; elapsed: number; eta: number; preview?: string; /** something that changed on the way (the encoder) */ note?: string }

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
      let enc = phase === 'effects' ? 'prores_ks' : (s.codec === 'hevc' ? args.encoders.hevc[0] : args.encoders.h264[0]) ?? 'libx264';
      let note: string | undefined;
      // a graphics-card encoder that gets stuck or stops: the pass starts again on the processor
      for (;;) {
      try {
      await sink.start({
        out, width, height, fps, outWidth: outW, outHeight: outH, fit: s.fit,
        codec: phase === 'effects' ? 'prores' : s.codec, encoder: enc, quality: s.quality,
        audio: phase === 'effects' ? null : audio, audioCopy: s.audioCopy && !shaped, start: shaped ? 0 : from, duration: frames / fps,
      });
      const t0 = performance.now();
      let pending: Promise<void> | null = null;
      let lastSrc = -1;
      for (let i = 0; i < frames; i++) {
        if (args.cancelled()) { await pending?.catch(() => {}); await sink.cancel(); throw new Error('cancelled'); }
        const t = from - lead + i / fps;
        // the video frame on screen at time t (frames repeat when exporting at a higher frame rate; during a
        // ring-out the last one holds while the effects play on)
        const si = Math.min(Math.floor(Math.max(from, Math.min(t, to - 0.5 / srcFps)) * srcFps + 1e-6), Math.max(0, Math.floor(args.duration * srcFps) - 1));
        if (si !== lastSrc) { await seekTo(v, (si + 0.5) / srcFps); lastSrc = si; }
        // the swell fades in from black and the ring-out fades to black (unless a title card is showing)
        const dark = fadeTail && t > to ? smoothFade((t - to) / tail) : fadeLead && t < from ? 1 - smoothFade((t - (from - lead)) / lead) : 0;
        if (cam) { const c = cameraFrameAt(p, Math.max(from, Math.min(t, to)), args.duration); r.setView(c.view, [Math.max(c.fade[0], dark), dark > c.fade[0] ? 0 : c.fade[1]]); }
        else if (tail > 0 || lead > 0) r.setView(null, [dark, 0]);
        const img = await r.capture(videoFrame(v), t);
        if (pending) await pending;
        pending = sink.frame(img.data);
        if (i % 6 === 0 || i === frames - 1) {
          const el = (performance.now() - t0) / 1000;
          let preview: string | undefined;
          if (i % 60 === 0) preview = thumb(img);
          args.onProgress({ phase, done: i + 1, total: frames, elapsed: el, eta: (el / (i + 1)) * (frames - i - 1), preview, note });
        }
      }
      if (pending) await pending;
      saved.push(await sink.finish());
      break;
      } catch (e) {
        const m = String((e as Error)?.message ?? e);
        if (m === 'cancelled' || !isHardware(enc)) throw e;
        await sink.cancel().catch(() => {});
        markBadEncoder(enc);
        const was = encoderLabel(enc);
        enc = s.codec === 'hevc' ? 'libx265' : 'libx264';
        note = `${was} ${m === 'stalled' ? 'stopped responding' : 'stopped'}, so this export is made on the processor (a little slower). It won't be used again on this computer.`;
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
