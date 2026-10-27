// Lines the key layout up with the picture. Tracking finds the keyboard, but its sense of depth can be a little
// off, so the keys slant across the real ones. This compares the expected pattern of the keys (bright white keys,
// dark gaps, dark black keys) with a few frames of the video, and finds the sideways shift, width and slant
// (see KeyFit) that match them best. Only an improvement worth having is kept.
import { Keyboard, KeyFit, NO_FIT, ProjectFile, trackingMatrix } from '../project';

/** one frame of the video in grey (0..1), scaled by `scale` from video pixels */
export interface FitShot { frame: number; gray: Float32Array; w: number; h: number; scale: number }

interface Sample { x: number; y: number; v: number }

function template(proj: ProjectFile, step: number): Sample[] {
  const kb = new Keyboard(proj.keyboard.lowestNote, 0, 0);
  const W = proj.keyboard.whiteKeys;
  const blacks: number[] = [];
  for (let n = proj.keyboard.lowestNote; n < proj.keyboard.lowestNote + proj.keyboard.keys; n++) {
    const fp = kb.footprint(n);
    if (fp.black) blacks.push((fp.quad[0][0] + fp.quad[1][0]) / 2);
  }
  const out: Sample[] = [];
  for (let x = step / 2; x < W; x += step) {
    const gap = Math.abs(x - Math.round(x)) < 0.05;
    const black = blacks.some((c) => Math.abs(x - c) < 0.29);
    for (const y of [0.12, 0.25, 0.38, 0.5]) out.push({ x, y, v: black ? 0 : gap ? 0.4 : 1 });
    for (const y of [0.72, 0.82, 0.92]) out.push({ x, y, v: gap ? 0.4 : 1 });
  }
  return out;
}

/** how well the layout matches the frames: mean correlation of expected and seen brightness (-1..1) */
function scoreFit(proj: ProjectFile, shots: FitShot[], pts: Sample[], f: KeyFit): number {
  let total = 0;
  for (const s of shots) {
    const H = trackingMatrix(proj, s.frame);
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (const p of pts) {
      const X = f.x0 + (1 + f.k) * p.x + f.sh * p.y;
      const w = H[6] * X + H[7] * p.y + H[8];
      const u = ((H[0] * X + H[1] * p.y + H[2]) / w) * s.scale, v = ((H[3] * X + H[4] * p.y + H[5]) / w) * s.scale;
      if (!(u >= 0 && v >= 0 && u < s.w - 1 && v < s.h - 1)) continue;
      const g = s.gray[(v | 0) * s.w + (u | 0)];
      n++; sa += g; sb += p.v; saa += g * g; sbb += p.v * p.v; sab += g * p.v;
    }
    if (n < 50) return -1;
    const cov = sab / n - (sa / n) * (sb / n);
    const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
    total += va > 1e-9 && vb > 1e-9 ? cov / Math.sqrt(va * vb) : 0;
  }
  return total / shots.length;
}

/**
 * Find the key fit for these frames. Returns the fit and how well the layout matched before and after
 * (the fit is NO_FIT when it would not clearly help).
 */
export async function fitKeys(proj: ProjectFile, shots: FitShot[], onProgress?: (pct: number) => void): Promise<{ fit: KeyFit; before: number; after: number }> {
  const coarse = template(proj, 0.1), fine = template(proj, 0.05);
  const before = scoreFit(proj, shots, fine, NO_FIT);
  let best = { s: scoreFit(proj, shots, coarse, NO_FIT), f: NO_FIT };
  const ks = [-0.1, -0.08, -0.06, -0.04, -0.02, 0, 0.02, 0.04, 0.06, 0.08, 0.1];
  let i = 0;
  const N = 41 * 41;
  for (let a = -20; a <= 20; a++) {
    for (let b = -20; b <= 20; b++) {
      for (const k of ks) {
        const f = { x0: a / 10, k, sh: b / 10 };
        const s = scoreFit(proj, shots, coarse, f);
        if (s > best.s) best = { s, f };
      }
      if (++i % 41 === 0) { onProgress?.((i / N) * 80); await new Promise((r) => setTimeout(r, 0)); }
    }
  }
  // refine round the best
  let fineBest = { s: scoreFit(proj, shots, fine, best.f), f: best.f };
  for (let a = -5; a <= 5; a++) {
    for (let b = -5; b <= 5; b++) {
      for (let c = -3; c <= 3; c++) {
        const f = { x0: best.f.x0 + a * 0.02, k: best.f.k + c * 0.005, sh: best.f.sh + b * 0.02 };
        const s = scoreFit(proj, shots, fine, f);
        if (s > fineBest.s) fineBest = { s, f };
      }
    }
    onProgress?.(80 + ((a + 6) / 11) * 20);
    await new Promise((r) => setTimeout(r, 0));
  }
  const round = (x: number) => Math.round(x * 1000) / 1000;
  const fit = { x0: round(fineBest.f.x0), k: round(fineBest.f.k), sh: round(fineBest.f.sh) };
  // keep it only when it clearly lines the keys up better
  return fineBest.s > before + 0.03 ? { fit, before, after: fineBest.s } : { fit: NO_FIT, before, after: before };
}

/** grab a few frames of a video element as grey images (seeks the element; puts it back afterwards) */
export async function grabShots(v: HTMLVideoElement, proj: ProjectFile, times: number[], maxDim = 960): Promise<FitShot[]> {
  const back = v.currentTime, wasPaused = v.paused;
  v.pause();
  const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
  const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const out: FitShot[] = [];
  const seek = (t: number) => new Promise<void>((res) => {
    if (Math.abs(v.currentTime - t) < 1e-3) { res(); return; }
    v.addEventListener('seeked', () => res(), { once: true });
    v.currentTime = t;
  });
  try {
    for (const t of times) {
      await seek(t);
      g.drawImage(v, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      const gray = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) gray[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
      out.push({ frame: Math.round(t * (proj.video.fps || 30)), gray, w, h, scale: (w / v.videoWidth) * (v.videoWidth / proj.video.width) });
    }
  } finally {
    await seek(back);
    if (!wasPaused) v.play().catch(() => {});
  }
  return out;
}
