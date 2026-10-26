// Gallery thumbnails: each look rendered on the user's own video at the current moment,
// cropped to where the notes meet the keys.
import { applyPreset, Preset } from '../engine/look';
import { Keyboard, trackingMatrix, type ProjectFile } from '../engine/project';
import type { Renderer } from '../engine/renderer';
import { videoFrame } from './exportRun';

export const THUMB_W = 240, THUMB_H = 180;

/** a short fingerprint of a look, so a changed user preset gets a fresh picture */
export function lookKey(p: Preset): string {
  const s = JSON.stringify(p.look);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${p.id}:${h}`;
}

/** the part of the video a card shows (video pixels): the keyboard's back edge, with room above for the notes */
function cropRect(p: ProjectFile, t: number) {
  const W = p.video.width, H = p.video.height;
  const cw = Math.min(W, H / (THUMB_H / THUMB_W)), ch = cw * (THUMB_H / THUMB_W);
  let cx = W / 2, ey = H * 0.6;
  if (p.tracking?.frames?.length) {
    const kb = new Keyboard(p.keyboard.lowestNote, p.keyboard.edge.a, p.keyboard.edge.b);
    kb.H = trackingMatrix(p, Math.round(t * (p.video.fps || 30)));
    const mid = p.keyboard.whiteKeys / 2;
    [cx, ey] = kb.P(mid, kb.edgeY(mid));
  }
  const x = Math.min(W - cw, Math.max(0, cx - cw / 2));
  const y = Math.min(H - ch, Math.max(0, ey - ch * 0.72));
  return { x, y, w: cw, h: ch };
}

/**
 * Render one thumbnail per preset (in order), calling onThumb as each is ready. The renderer's project is
 * restored afterwards and the preview redrawn. Stops early when cancelled().
 */
export async function renderLookThumbs(r: Renderer, v: HTMLVideoElement, presets: Preset[], t: number,
  onThumb: (key: string, url: string) => void, cancelled: () => boolean, redraw: boolean) {
  const base = r.project;
  if (!base || !v.videoWidth) return;
  const src = document.createElement('canvas');
  const out = document.createElement('canvas');
  out.width = THUMB_W; out.height = THUMB_H;
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  const crop = cropRect(base, t);
  let mine: ProjectFile | null = null;
  try {
    for (const p of presets) {
      if (cancelled()) break;
      mine = { ...base, look: applyPreset(base.look, p), titles: undefined }; // the look alone, no cards
      r.setProject(mine);
      await r.texturesReady?.();
      if (cancelled()) break;
      const img = await r.capture(videoFrame(v), t);
      src.width = img.width; src.height = img.height;
      src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height), 0, 0);
      const k = img.width / base.video.width;
      g.drawImage(src, crop.x * k, crop.y * k, crop.w * k, crop.h * k, 0, 0, THUMB_W, THUMB_H);
      onThumb(lookKey(p), out.toDataURL('image/jpeg', 0.82));
    }
  } finally {
    // put the project back, unless the app has shown another one meanwhile
    if (mine && r.project === mine) { r.setProject(base); if (redraw) r.render(v, t); }
  }
}
