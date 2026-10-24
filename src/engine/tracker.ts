// Keyboard tracker: follows the keyboard plane through a video, frame by frame.
//
// Features are picked once on the reference frame (where the user marked the corners), inside the
// keyboard area. For every new frame each feature is searched for with pyramidal Lucas-Kanade,
// starting from where the previous frame's motion predicts it, always matched against the reference
// frame itself, so errors do not pile up over a long clip. A RANSAC homography over the matches then
// gives the keyboard's position; hands covering keys simply become outliers.
//
// Pure TypeScript, no DOM: runs in a Web Worker in the app and in Node for tests.

import { apply, findHomography, inv, mul, Pt, Quad } from './geometry';
import type { Mat3 } from './project';

export interface GrayImage { w: number; h: number; data: Float32Array } // 0..1

export interface TrackResult {
  corners: Quad | null; // video pixels; null when the keyboard was lost on this frame
  inliers: number;
  tracked: number;
  method: 'motion' | 'search' | 'lost';
}

const LEVELS = 4;
const R = 7; // patch half size: 15 x 15
const PATCH = (2 * R + 1) * (2 * R + 1);
const MAX_FEATURES = 360;
const MIN_INLIERS = 14;

// ---------- image helpers ----------

function blurDown(src: GrayImage): GrayImage {
  // 5-tap binomial blur, evaluated only at the pixels that survive the 2x downsample
  const { w, h, data } = src;
  const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
  const tmp = new Float32Array(nw * h);
  for (let y = 0; y < h; y++) {
    const row = y * w, trow = y * nw;
    for (let x = 0; x < nw; x++) {
      const c = x * 2;
      const xm2 = c >= 2 ? c - 2 : 0, xm1 = c >= 1 ? c - 1 : 0;
      const xp1 = c + 1 < w ? c + 1 : w - 1, xp2 = c + 2 < w ? c + 2 : w - 1;
      tmp[trow + x] = (data[row + xm2] + 4 * data[row + xm1] + 6 * data[row + c] + 4 * data[row + xp1] + data[row + xp2]) * 0.0625;
    }
  }
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const c = y * 2;
    const ym2 = (c >= 2 ? c - 2 : 0) * nw, ym1 = (c >= 1 ? c - 1 : 0) * nw, y0 = c * nw;
    const yp1 = (c + 1 < h ? c + 1 : h - 1) * nw, yp2 = (c + 2 < h ? c + 2 : h - 1) * nw;
    const orow = y * nw;
    for (let x = 0; x < nw; x++) {
      out[orow + x] = (tmp[ym2 + x] + 4 * tmp[ym1 + x] + 6 * tmp[y0 + x] + 4 * tmp[yp1 + x] + tmp[yp2 + x]) * 0.0625;
    }
  }
  return { w: nw, h: nh, data: out };
}

export function pyramid(img: GrayImage, levels = LEVELS): GrayImage[] {
  const p = [img];
  for (let i = 1; i < levels; i++) p.push(blurDown(p[i - 1]));
  return p;
}

function sample(img: GrayImage, x: number, y: number): number {
  const { w, h, data } = img;
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0, y0 = y | 0;
  const fx = x - x0, fy = y - y0;
  const i = y0 * w + x0;
  const a = data[i], b = data[i + 1], c = data[i + w], d = data[i + w + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function inPoly(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shi-Tomasi corners inside a polygon, strongest first, spaced at least minDist apart. */
export function detectFeatures(img: GrayImage, poly: Pt[], max = MAX_FEATURES, minDist = 9): Pt[] {
  const { w, h, data } = img;
  const score = new Float32Array(w * h);
  const ix = new Float32Array(w * h), iy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    ix[i] = (data[i + 1] - data[i - 1]) * 0.5;
    iy[i] = (data[i + w] - data[i - w]) * 0.5;
  }
  const B = 3;
  let best = 0;
  const xs: number[] = poly.map((p) => p[0]), ys: number[] = poly.map((p) => p[1]);
  const x0 = Math.max(R + 2, Math.floor(Math.min(...xs))), x1 = Math.min(w - R - 3, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(R + 2, Math.floor(Math.min(...ys))), y1 = Math.min(h - R - 3, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inPoly(poly, x, y)) continue;
    let a = 0, b = 0, c = 0;
    for (let dy = -B; dy <= B; dy++) for (let dx = -B; dx <= B; dx++) {
      const j = (y + dy) * w + x + dx;
      a += ix[j] * ix[j]; b += ix[j] * iy[j]; c += iy[j] * iy[j];
    }
    const s = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b); // smaller eigenvalue
    score[y * w + x] = s;
    if (s > best) best = s;
  }
  const cand: [number, number, number][] = [];
  const thr = best * 0.02;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const s = score[y * w + x];
    if (s <= thr) continue;
    let isMax = true;
    for (let dy = -1; dy <= 1 && isMax; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && score[(y + dy) * w + x + dx] > s) { isMax = false; break; }
    }
    if (isMax) cand.push([s, x, y]);
  }
  cand.sort((p, q) => q[0] - p[0]);
  const out: Pt[] = [];
  const cell = minDist;
  const gw = Math.ceil(w / cell), grid = new Map<number, Pt[]>();
  for (const [, x, y] of cand) {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    let ok = true;
    for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1 && ok; i++) {
      for (const p of grid.get((gy + j) * gw + gx + i) ?? []) {
        if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < minDist * minDist) { ok = false; break; }
      }
    }
    if (!ok) continue;
    const pt: Pt = [x, y];
    out.push(pt);
    const key = gy * gw + gx;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(pt);
    if (out.length >= max) break;
  }
  return out;
}

// ---------- deterministic randomness ----------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RANSAC homography src -> dst. Returns the model refit on all inliers and the inlier mask. */
export function ransacHomography(src: Pt[], dst: Pt[], thresh: number, iters = 250, seed = 7) {
  const n = src.length;
  if (n < 4) return null;
  const rnd = rng(seed);
  let bestCount = 0;
  let bestMask: boolean[] = [];
  const t2 = thresh * thresh;
  const countInliers = (H: Mat3) => {
    const mask = new Array<boolean>(n);
    let c = 0;
    for (let i = 0; i < n; i++) {
      const [u, v] = apply(H, src[i][0], src[i][1]);
      const ok = (u - dst[i][0]) ** 2 + (v - dst[i][1]) ** 2 < t2;
      mask[i] = ok;
      if (ok) c++;
    }
    return { c, mask };
  };
  for (let it = 0; it < iters; it++) {
    const idx = new Set<number>();
    while (idx.size < 4) idx.add(Math.floor(rnd() * n));
    const ids = [...idx];
    const H = findHomography(ids.map((i) => src[i]), ids.map((i) => dst[i]));
    if (!H) continue;
    const { c, mask } = countInliers(H);
    if (c > bestCount) {
      bestCount = c; bestMask = mask;
      if (c > n * 0.9) break;
    }
  }
  if (bestCount < 4) return null;
  let H: Mat3 | null = null;
  let mask = bestMask;
  for (let pass = 0; pass < 2; pass++) {
    const s = src.filter((_, i) => mask[i]), d = dst.filter((_, i) => mask[i]);
    const fit = findHomography(s, d);
    if (!fit) break;
    H = fit;
    mask = countInliers(H).mask;
  }
  if (!H) return null;
  return { H, mask, inliers: mask.filter(Boolean).length };
}

// ---------- the tracker ----------

interface Feature {
  p: Pt; // position in the reference image (tracking scale)
  // per level: patch values (mean removed) and the inverse of the gradient matrix
  patch: Float32Array[];
  gx: Float32Array[];
  gy: Float32Array[];
  ginv: [number, number, number][]; // [a, b, c] of the symmetric inverse
}

export interface TrackerOptions {
  /** reference frame, grayscale at tracking scale */
  ref: GrayImage;
  /** tracking scale: tracking pixels per video pixel */
  scale: number;
  /** keyboard corners on the reference frame, video pixels */
  corners: Quad;
  /** white keys across the keyboard (plane width) */
  whiteKeys: number;
}

export class KeyboardTracker {
  private refPyr: GrayImage[];
  private feats: Feature[] = [];
  private refCorners: Pt[]; // tracking scale
  private poly: Pt[]; // search region on the reference frame
  private prevH: Mat3 | null = null; // ref -> current (tracking scale)
  private prev2H: Mat3 | null = null;
  readonly featureCount: number;

  constructor(private o: TrackerOptions) {
    const s = o.scale;
    this.refCorners = o.corners.map(([x, y]) => [x * s, y * s] as Pt);
    // the region to take features from: the keyboard plane, a little wider and including the body behind the keys
    const planeToRef = findHomography([[0, 0], [o.whiteKeys, 0], [o.whiteKeys, 1], [0, 1]], this.refCorners)!;
    const W = o.whiteKeys;
    this.poly = [[-1.2, -0.8], [W + 1.2, -0.8], [W + 1.2, 1.15], [-1.2, 1.15]].map(([x, y]) => apply(planeToRef, x, y));
    this.refPyr = pyramid(o.ref);
    const pts = detectFeatures(o.ref, this.poly);
    for (const p of pts) {
      const f = this.makeFeature(p);
      if (f) this.feats.push(f);
    }
    this.featureCount = this.feats.length;
  }

  /** search region outline on the reference frame, in video pixels (for display) */
  get region(): Pt[] { return this.poly.map(([x, y]) => [x / this.o.scale, y / this.o.scale] as Pt); }

  private makeFeature(p: Pt): Feature | null {
    const f: Feature = { p, patch: [], gx: [], gy: [], ginv: [] };
    for (let L = 0; L < LEVELS; L++) {
      const img = this.refPyr[L];
      const k = 1 / (1 << L);
      const cx = p[0] * k, cy = p[1] * k;
      const patch = new Float32Array(PATCH), gx = new Float32Array(PATCH), gy = new Float32Array(PATCH);
      let a = 0, b = 0, c = 0, m = 0, i = 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++, i++) {
        const x = cx + dx, y = cy + dy;
        patch[i] = sample(img, x, y);
        gx[i] = (sample(img, x + 1, y) - sample(img, x - 1, y)) * 0.5;
        gy[i] = (sample(img, x, y + 1) - sample(img, x, y - 1)) * 0.5;
        m += patch[i];
        a += gx[i] * gx[i]; b += gx[i] * gy[i]; c += gy[i] * gy[i];
      }
      m /= PATCH;
      for (let j = 0; j < PATCH; j++) patch[j] -= m;
      const det = a * c - b * b;
      if (det < 1e-9) { if (L === 0) return null; f.ginv.push([0, 0, 0]); }
      else f.ginv.push([c / det, -b / det, a / det]);
      f.patch.push(patch); f.gx.push(gx); f.gy.push(gy);
    }
    return f;
  }

  /** Pyramidal LK for one feature; guess is in tracking-scale pixels of the current frame. */
  private track(f: Feature, cur: GrayImage[], guess: Pt, A: [number, number, number, number]): { pt: Pt; err: number } | null {
    // A: local 2x2 warp (reference -> current) so the patch is compared after rotation and zoom
    const [a00, a01, a10, a11] = A;
    let px = guess[0] / (1 << (LEVELS - 1)), py = guess[1] / (1 << (LEVELS - 1));
    const vals = new Float32Array(PATCH);
    let err = 0;
    for (let L = LEVELS - 1; L >= 0; L--) {
      const img = cur[L];
      const [ia, ib, ic] = f.ginv[L];
      const patch = f.patch[L], gx = f.gx[L], gy = f.gy[L];
      if (ia === 0 && ic === 0) { if (L > 0) { px *= 2; py *= 2; } continue; }
      // coarse levels only need to get close; the finest level does the precise work
      const maxIt = L === 0 ? 12 : 6, eps = L === 0 ? 1e-4 : 4e-3;
      for (let it = 0; it < maxIt; it++) {
        let m = 0, i = 0;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++, i++) {
          const v = sample(img, px + a00 * dx + a01 * dy, py + a10 * dx + a11 * dy);
          vals[i] = v; m += v;
        }
        m /= PATCH;
        let ex = 0, ey = 0;
        err = 0;
        for (let j = 0; j < PATCH; j++) {
          const d = patch[j] - (vals[j] - m);
          ex += d * gx[j]; ey += d * gy[j];
          err += Math.abs(d);
        }
        const ux = ia * ex + ib * ey, uy = ib * ex + ic * ey;
        px += a00 * ux + a01 * uy; py += a10 * ux + a11 * uy;
        if (!isFinite(px) || !isFinite(py)) return null;
        if (ux * ux + uy * uy < eps) break;
      }
      if (L > 0) { px *= 2; py *= 2; }
    }
    const { w, h } = cur[0];
    if (px < R || py < R || px > w - R - 1 || py > h - R - 1) return null;
    return { pt: [px, py], err: err / PATCH };
  }

  private solve(cur: GrayImage[], guessH: Mat3) {
    const src: Pt[] = [], dst: Pt[] = [];
    for (const f of this.feats) {
      const g = apply(guessH, f.p[0], f.p[1]);
      const gx = apply(guessH, f.p[0] + 1, f.p[1]), gy = apply(guessH, f.p[0], f.p[1] + 1);
      const r = this.track(f, cur, g, [gx[0] - g[0], gy[0] - g[0], gx[1] - g[1], gy[1] - g[1]]);
      if (!r || r.err > 0.12) continue;
      src.push(f.p); dst.push(r.pt);
    }
    if (src.length < MIN_INLIERS) return { tracked: src.length, fit: null };
    return { tracked: src.length, fit: ransacHomography(src, dst, 1.6) };
  }

  /** Coarse translation between the reference and the current frame at the top pyramid level. */
  private coarseShift(cur: GrayImage[]): Mat3 {
    const L = LEVELS - 1;
    const a = this.refPyr[L], b = cur[L];
    const k = 1 / (1 << L);
    const xs = this.poly.map((p) => p[0] * k), ys = this.poly.map((p) => p[1] * k);
    const x0 = Math.max(2, Math.floor(Math.min(...xs))), x1 = Math.min(a.w - 3, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(2, Math.floor(Math.min(...ys))), y1 = Math.min(a.h - 3, Math.ceil(Math.max(...ys)));
    const S = 14;
    let best = Infinity, bx = 0, by = 0;
    for (let dy = -S; dy <= S; dy++) for (let dx = -S; dx <= S; dx++) {
      let s = 0, n = 0;
      for (let y = y0; y <= y1; y += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= b.h) continue;
        for (let x = x0; x <= x1; x += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= b.w) continue;
          s += Math.abs(a.data[y * a.w + x] - b.data[yy * b.w + xx]); n++;
        }
      }
      if (n > 50 && s / n < best) { best = s / n; bx = dx; by = dy; }
    }
    const f = 1 << L;
    return [1, 0, bx * f, 0, 1, by * f, 0, 0, 1];
  }

  /** Track one frame (grayscale at tracking scale, same size as the reference). */
  step(frame: GrayImage): TrackResult {
    const cur = pyramid(frame);
    // prediction: constant velocity on the last two good poses, damped
    let guess: Mat3 = this.prevH ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (this.prevH && this.prev2H) {
      const vel = mul(this.prevH, inv(this.prev2H));
      const damped = vel.map((v, i) => (([0, 4, 8].includes(i) ? 1 : 0) * 0.5 + v * 0.5));
      guess = mul(damped, this.prevH);
    }
    let method: TrackResult['method'] = 'motion';
    let res = this.solve(cur, guess);
    const good = (r: typeof res) => !!r.fit && r.fit.inliers >= Math.max(MIN_INLIERS, r.tracked * 0.3);
    if (!good(res)) {
      const shift = this.coarseShift(cur);
      const alt = this.solve(cur, this.prevH ? mul(shift, [1, 0, 0, 0, 1, 0, 0, 0, 1]) : shift);
      if (good(alt) && (!res.fit || alt.fit!.inliers > res.fit.inliers)) { res = alt; method = 'search'; }
    }
    if (!good(res)) {
      return { corners: null, inliers: res.fit?.inliers ?? 0, tracked: res.tracked, method: 'lost' };
    }
    const H = res.fit!.H;
    this.prev2H = this.prevH;
    this.prevH = H;
    const s = this.o.scale;
    const corners = this.refCorners.map(([x, y]) => {
      const [u, v] = apply(H, x, y);
      return [u / s, v / s] as Pt;
    }) as Quad;
    return { corners, inliers: res.fit!.inliers, tracked: res.tracked, method };
  }
}

/** RGBA pixels -> grayscale 0..1 */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): GrayImage {
  const data = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    data[i] = (rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114) / 255;
  }
  return { w, h, data };
}
