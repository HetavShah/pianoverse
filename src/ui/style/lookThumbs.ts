// Gallery pictures: each look rendered on the user's own video, cropped to where the notes meet the keys.
// They are drawn by a renderer of their own, so the main preview is never touched.
import { applyPreset, Preset } from '../../engine/look';
import { sourceRect, trackingMatrix, type ProjectFile } from '../../engine/project';
import { keyboardOf } from '../../engine/keyboard';
import { Renderer } from '../../engine/render';
import type { UserFiles } from '../../engine/noteTextures';

export const THUMB_W = 240, THUMB_H = 180;
/** frames in a card's hover loop, and the time between them (seconds of effects) */
export const ANIM_FRAMES = 5, ANIM_STEP = 1 / 12;

/** a short fingerprint of a look, so a changed user preset gets a fresh picture */
export function lookKey(p: Preset): string {
  const s = JSON.stringify(p.look);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${p.id}:${h}`;
}

/** the part of the video a card shows (video pixels): the keyboard's back edge, with room above for the notes */
function cropRect(p: ProjectFile, t: number) {
  const R = sourceRect(p);   // inside the crop
  const W = R.w, H = R.h;
  const cw = Math.min(W, H / (THUMB_H / THUMB_W)), ch = cw * (THUMB_H / THUMB_W);
  let cx = R.x + W / 2, ey = R.y + H * 0.6;
  if (p.tracking?.frames?.length) {
    const kb = keyboardOf(p);
    kb.H = trackingMatrix(p, Math.round(t * (p.video.fps || 30)));
    const mid = p.keyboard.whiteKeys / 2;
    const e = kb.P(mid, kb.edgeY(mid));
    if (Number.isFinite(e[0]) && Number.isFinite(e[1])) [cx, ey] = e;
  }
  const x = Math.min(R.x + W - cw, Math.max(R.x, cx - cw / 2));
  const y = Math.min(R.y + H - ch, Math.max(R.y, ey - ch * 0.72));
  return { x, y, w: cw, h: ch };
}

let own: Promise<Renderer> | null = null;
/** the gallery's own renderer (made once, on first use) */
function galleryRenderer(files: UserFiles | null): Promise<Renderer> {
  own ??= Renderer.create(document.createElement('canvas')).then((r) => { r.userFiles = files; return r; });
  return own;
}

// one job at a time on the gallery's renderer
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(job: () => Promise<T>): Promise<T> => { const p = queue.then(job, job); queue = p.catch(() => {}); return p; };

/** a still copy of the video frame on screen (the video itself may move on while pictures are drawn) */
export function snapshot(v: HTMLVideoElement): HTMLCanvasElement | null {
  if (!v.videoWidth || v.readyState < 2) return null;
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d')!.drawImage(v, 0, 0);
  return c;
}

/**
 * Draw pictures of each preset at moment t: `frames` pictures, ANIM_STEP apart (one for the grid, more for the
 * hover loop). onThumb gets every preset's pictures as they are ready. Stops early when cancelled().
 */
export function renderLookThumbs(base: ProjectFile, frame: HTMLCanvasElement, presets: Preset[], t: number, frames: number,
  files: UserFiles | null, onThumb: (key: string, urls: string[]) => void, cancelled: () => boolean): Promise<void> {
  return serial(async () => {
    const r = await galleryRenderer(files);
    const crop = cropRect(base, t);
    r.setScale(Math.min(1, (THUMB_W * 2.2) / crop.w));
    const src = document.createElement('canvas');
    const out = document.createElement('canvas');
    out.width = THUMB_W; out.height = THUMB_H;
    const g = out.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    for (const p of presets) {
      if (cancelled()) return;
      r.setProject({ ...base, look: applyPreset(base.look, p), titles: undefined }); // the look alone, no cards
      await r.texturesReady?.();
      const urls: string[] = [];
      for (let f = 0; f < frames; f++) {
        if (cancelled()) return;
        const img = await r.capture(frame, t + f * ANIM_STEP);
        src.width = img.width; src.height = img.height;
        src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height), 0, 0);
        // the rendered frame is the part of the video in use (its crop)
        const R = sourceRect(base);
        const k = img.width / R.w;
        g.drawImage(src, (crop.x - R.x) * k, (crop.y - R.y) * k, crop.w * k, crop.h * k, 0, 0, THUMB_W, THUMB_H);
        urls.push(out.toDataURL('image/jpeg', 0.82));
      }
      onThumb(lookKey(p), urls);
    }
  });
}
