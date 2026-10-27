// The virtual camera: a list of shots over the video, each a framing (Wide, Follow your hands, or a fixed Close-up),
// joined by transitions (Cut, Glide, Punch, Dip to black, Dip to white). `cameraAt` gives the window of the video
// to show at any moment; the renderer draws the frame through it.
import { keyboardOf, ProjectFile, RawNote, sourceRect, trackingMatrix, trimRange } from './project';
import { BeatGrid, estimateBeats, nearestBeat } from './audio/beats';

export type Aspect = 'vertical' | 'landscape' | 'square';
export type ShotKind = 'wide' | 'follow' | 'close';
export type Transition = 'cut' | 'glide' | 'punch' | 'dipBlack' | 'dipWhite';
export type Level3<A extends string, B extends string, C extends string> = A | B | C;

export interface Shot {
  id: string;
  start: number; // seconds
  kind: ShotKind;
  /** Follow: how close, as a multiple of the automatic framing (0.7..1.8). Close-up: zoom (1.2..4). */
  zoom: number;
  /** Close-up: the centre of the framing, video pixels */
  cx?: number; cy?: number;
  /** how this shot begins (the first shot's transition is ignored; use fadeEnds) */
  in: Transition;
  /** transition length, seconds */
  inDur: number;
}

export interface AutoSettings {
  cuts: Level3<'none', 'bars', 'often'>;
  movement: Level3<'calm', 'normal', 'lively'>;
  punch: Level3<'off', 'some', 'lots'>;
}

export interface CameraTrack {
  on: boolean;
  aspect: Aspect;
  shots: Shot[];
  /** fade in from black at the start and out at the end */
  fadeEnds: boolean;
  auto: AutoSettings;
}

export const DEFAULT_AUTO: AutoSettings = { cuts: 'bars', movement: 'normal', punch: 'some' };
export const TRANSITION_LABEL: Record<Transition, string> = { cut: 'Cut', glide: 'Glide', punch: 'Punch', dipBlack: 'Dip black', dipWhite: 'Dip white' };
export const DEFAULT_DUR: Record<Transition, number> = { cut: 0, glide: 0.9, punch: 0.9, dipBlack: 0.6, dipWhite: 0.4 };
export const ASPECTS: { id: Aspect; label: string; ratio: number; size: [number, number] }[] = [
  { id: 'vertical', label: 'Vertical 9:16', ratio: 9 / 16, size: [1080, 1920] },
  { id: 'landscape', label: 'Landscape 16:9', ratio: 16 / 9, size: [1920, 1080] },
  { id: 'square', label: 'Square', ratio: 1, size: [1080, 1080] },
];
export const aspectInfo = (a: Aspect) => ASPECTS.find((x) => x.id === a) ?? ASPECTS[0];
/** the frame shape that matches the video (vertical phone video: vertical) */
export const naturalAspect = (w: number, h: number): Aspect => (Math.abs(w / h - 1) < 0.15 ? 'square' : w < h ? 'vertical' : 'landscape');

export interface View { x: number; y: number; w: number; h: number }
export interface CameraFrame { view: View; fade: [number, number]; shot: number; zoom: number }

// ---------- the follow path ----------

/** Where your hands are over time (from the notes and the keyboard calibration), per video frame. */
export interface FollowPath { fps: number; cx: Float32Array; cy: Float32Array; spread: Float32Array; unit: Float32Array; slowY: Float32Array }

const SIGMA: Record<AutoSettings['movement'], number> = { calm: 1.6, normal: 0.9, lively: 0.5 };

export function followPath(proj: ProjectFile, movement: AutoSettings['movement'] = 'normal'): FollowPath {
  const fps = proj.video.fps || 30;
  const n = Math.max(1, proj.video.frames || Math.ceil((proj.video.duration ?? 1) * fps));
  const kb = keyboardOf(proj);
  const notes = [...proj.notes].sort((a, b) => a.s - b.s);
  const rx = new Float32Array(n), ry = new Float32Array(n), rs = new Float32Array(n), ru = new Float32Array(n);
  const mid = proj.keyboard.whiteKeys / 2;
  let lo = 0;
  for (let f = 0; f < n; f++) {
    const t = f / fps;
    kb.H = trackingMatrix(proj, f);
    while (lo < notes.length && notes[lo].s < t - 6) lo++;
    let sx = 0, sy = 0, sw = 0, xmin = Infinity, xmax = -Infinity;
    for (let k = lo; k < notes.length && notes[k].s < t + 1.0; k++) {
      const nt = notes[k];
      if (nt.e < t - 0.3) continue; // finished before the window
      const g = kb.target(nt.p);
      const w = 0.3 + nt.v;
      sx += g.x * w; sy += g.y * w; sw += w;
      xmin = Math.min(xmin, g.x); xmax = Math.max(xmax, g.x);
    }
    const c = kb.target(Math.round(proj.keyboard.lowestNote + proj.keyboard.keys / 2));
    ru[f] = kb.unit(mid, kb.edgeY(mid));
    if (sw > 0) { rx[f] = sx / sw; ry[f] = sy / sw; rs[f] = xmax - xmin; } else { rx[f] = c.x; ry[f] = c.y; rs[f] = Infinity; }
  }
  // no notes for a while: hold the last place rather than jumping to the middle
  const spread = new Float32Array(n);
  let lastS = 0;
  for (let f = 0; f < n; f++) { if (Number.isFinite(rs[f])) lastS = rs[f]; spread[f] = Number.isFinite(rs[f]) ? rs[f] : lastS; }
  const sig = SIGMA[movement] * fps;
  return { fps, cx: gauss(rx, sig), cy: gauss(ry, sig), spread: gauss(spread, sig), unit: gauss(ru, fps), slowY: gauss(ry, sig * 3) };
}

function gauss(x: Float32Array, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 3), k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-0.5 * (i / Math.max(1e-3, sigma)) ** 2); sum += k[i + r]; }
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let a = 0;
    for (let j = -r; j <= r; j++) a += x[Math.min(x.length - 1, Math.max(0, i + j))] * k[j + r];
    out[i] = a / sum;
  }
  return out;
}

// ---------- framing ----------

interface Framing { cx: number; cy: number; z: number; anchor: number }

/** the biggest window of the frame's shape that fits in the video */
export function baseView(srcW: number, srcH: number, ratio: number) {
  const w = Math.min(srcW, srcH * ratio);
  return { w, h: w / ratio };
}

/** the phone footage is never blown up more than this (output pixels per video pixel), so it stays sharp enough */
const MAX_MAG = 2.4;
/** the most a shot can zoom in this frame shape before the footage gets too soft */
export function maxZoom(srcW: number, srcH: number, aspect: Aspect): number {
  const a = aspectInfo(aspect);
  const { w: bw } = baseView(srcW, srcH, a.ratio);
  return Math.max(1, (MAX_MAG * bw) / a.size[0]);
}

/** how far down the frame the keyboard sits, so the falling notes have room above it */
const ANCHOR: Record<Aspect, number> = { vertical: 0.64, landscape: 0.7, square: 0.66 };

function shotFraming(proj: ProjectFile, path: FollowPath, shot: Shot, t: number, aspect: Aspect): Framing {
  // the camera works inside the part of the frame in use (the crop)
  const R = sourceRect(proj);
  const W = R.w, H = R.h;
  const { w: bw, h: bh } = baseView(W, H, aspectInfo(aspect).ratio);
  const f = Math.min(path.cx.length - 1, Math.max(0, Math.round(t * path.fps)));
  const anchor = ANCHOR[aspect];
  const zMax = maxZoom(W, H, aspect);
  if (shot.kind === 'close') {
    return { cx: shot.cx ?? path.cx[f], cy: shot.cy ?? path.cy[f], z: clamp(shot.zoom, 1, zMax), anchor: Math.max(0.58, anchor - 0.04) };
  }
  if (shot.kind === 'wide') {
    // the whole width; in a frame shorter than the video it keeps your hands' height (slowly)
    return { cx: R.x + W / 2, cy: bh < H - 1 ? path.slowY[f] : R.y + H * anchor, z: 1, anchor };
  }
  // follow: close enough to fill the frame with what you're playing, plus a few keys either side
  const need = path.spread[f] * 1.45 + path.unit[f] * 7;
  const z = clamp(bw / Math.max(1, need), 1, 2.4) * shot.zoom;
  return { cx: path.cx[f], cy: path.cy[f], z: clamp(z, 1, zMax), anchor };
}

function toView(proj: ProjectFile, fr: Framing, aspect: Aspect): View {
  const R = sourceRect(proj);
  const { w: bw, h: bh } = baseView(R.w, R.h, aspectInfo(aspect).ratio);
  const w = bw / fr.z, h = bh / fr.z;
  return { x: clamp(fr.cx - w / 2, R.x, R.x + R.w - w), y: clamp(fr.cy - fr.anchor * h, R.y, R.y + R.h - h), w, h };
}

const mixF = (a: Framing, b: Framing, k: number): Framing => ({
  cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k,
  z: Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * k), anchor: a.anchor + (b.anchor - a.anchor) * k,
});
const ease = (k: number) => k * k * (3 - 2 * k);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** which shot is showing at t */
export function shotIndexAt(shots: Shot[], t: number): number {
  let i = 0;
  for (let k = 0; k < shots.length; k++) if (shots[k].start <= t + 1e-6) i = k;
  return i;
}

/** The camera at time t: the window of the video, a fade (amount, white) and which shot it is. */
export function cameraAt(proj: ProjectFile, track: CameraTrack, path: FollowPath, t: number, duration: number): CameraFrame {
  const shots = track.shots.length ? track.shots : [{ id: 'all', start: 0, kind: 'wide' as ShotKind, zoom: 1, in: 'cut' as Transition, inDur: 0 }];
  const i = shotIndexAt(shots, t);
  const sh = shots[i];
  let fr = shotFraming(proj, path, sh, t, track.aspect);
  const since = t - sh.start;
  if (i > 0 && sh.in === 'glide' && since < sh.inDur) {
    fr = mixF(shotFraming(proj, path, shots[i - 1], t, track.aspect), fr, ease(clamp(since / sh.inDur, 0, 1)));
  }
  if (i > 0 && sh.in === 'punch' && since >= 0) {
    // a quick push in (0.18 s), then a slower settle back
    const up = 0.18, peak = 0.38;
    const extra = since < up ? peak * Math.sin((since / up) * Math.PI / 2) : peak * Math.exp(-(since - up) / Math.max(0.1, sh.inDur * 0.45));
    if (extra > 0.002) fr = { ...fr, z: fr.z * (1 + extra) };
  }
  // dips: down into the colour before the join, up out of it after
  let fade = 0, white = 0;
  const dip = (s: Shot, d: number) => { const half = Math.max(0.05, s.inDur / 2); return clamp(1 - Math.abs(d) / half, 0, 1); };
  if (i > 0 && (sh.in === 'dipBlack' || sh.in === 'dipWhite')) { const a = dip(sh, since); if (a > fade) { fade = a; white = sh.in === 'dipWhite' ? 1 : 0; } }
  const nx = shots[i + 1];
  if (nx && (nx.in === 'dipBlack' || nx.in === 'dipWhite')) { const a = dip(nx, t - nx.start); if (a > fade) { fade = a; white = nx.in === 'dipWhite' ? 1 : 0; } }
  if (track.fadeEnds) {
    // fade in and out at the ends of the part in use (the trim)
    const [t0, t1] = trimRange(proj, duration);
    const a = Math.max(clamp(1 - (t - t0) / 1.2, 0, 1), clamp(1 - (t1 - t) / 1.2, 0, 1));
    if (a > fade) { fade = a; white = 0; }
  }
  return { view: toView(proj, fr, track.aspect), fade: [ease(fade), white], shot: i, zoom: fr.z };
}

// ---------- Auto camera ----------

let idSeq = 0;
export const shotId = () => `s${Date.now().toString(36)}${(idSeq++).toString(36)}`;

/** A first edit from the music: cuts on bar lines, framings chosen by what's being played, punches on big chords. */
export function autoCamera(proj: ProjectFile, settings: AutoSettings, aspect: Aspect, duration: number, grid?: BeatGrid): Shot[] {
  const g = grid ?? estimateBeats(proj.notes, duration);
  const path = followPath(proj, settings.movement);
  const fps = path.fps;
  const R = sourceRect(proj);
  const W = R.w;
  const { w: bw } = baseView(W, R.h, aspectInfo(aspect).ratio);
  // cut points: every few bars, never shorter than about 3 seconds
  const every = settings.cuts === 'often' ? 2 : 4;
  const cuts: number[] = [0];
  if (settings.cuts !== 'none') {
    const bars = g.bars.length > 1 ? g.bars : g.beats.filter((_, k) => k % 4 === 0);
    for (let k = every; k < bars.length; k += every) {
      const b = bars[k];
      if (b - cuts[cuts.length - 1] >= 3 && duration - b >= 3) cuts.push(b);
    }
  }
  // what's played in each part: how spread out, how loud
  const parts = cuts.map((s, k) => {
    const e = cuts[k + 1] ?? duration;
    const ns = proj.notes.filter((n) => n.s >= s && n.s < e);
    const f0 = Math.round(s * fps), f1 = Math.max(f0 + 1, Math.round(e * fps));
    let sp = 0, cnt = 0;
    for (let f = f0; f < f1 && f < path.spread.length; f += 3) { sp += path.spread[f]; cnt++; }
    const loud = ns.length ? ns.reduce((a, n) => a + n.v, 0) / Math.max(1, e - s) : 0;
    return { s, e, spread: cnt ? sp / cnt : bw, loud, density: ns.length / Math.max(1, e - s) };
  });
  const loudSorted = [...parts.map((p) => p.loud)].sort((a, b) => a - b);
  const loudHi = loudSorted[Math.floor(loudSorted.length * 0.75)] ?? Infinity;
  const shots: Shot[] = [];
  parts.forEach((p, k) => {
    let kind: ShotKind;
    if (parts.length === 1) kind = 'follow';
    else if (k === 0) kind = 'wide';
    else if (p.loud >= loudHi && parts.length > 3) kind = 'wide';
    else if (p.spread < bw * 0.32 && shots[shots.length - 1]?.kind !== 'close') kind = 'close';
    else kind = 'follow';
    if (shots.length && shots[shots.length - 1].kind === kind && kind !== 'follow') kind = 'follow';
    const prev = shots[shots.length - 1]?.kind;
    let tr: Transition = 'cut';
    if (prev === 'wide' && kind === 'follow') tr = settings.movement === 'lively' ? 'cut' : 'glide';
    if (prev === 'close' && kind === 'follow') tr = 'glide';
    const mid = Math.min(path.cx.length - 1, Math.round(((p.s + p.e) / 2) * fps));
    shots.push({
      id: shotId(), start: k === 0 ? 0 : p.s, kind, zoom: kind === 'close' ? Math.min(2, maxZoom(W, R.h, aspect)) : 1,
      ...(kind === 'close' ? { cx: path.cx[mid], cy: path.cy[mid] } : {}),
      in: tr, inDur: DEFAULT_DUR[tr],
    });
  });
  // the biggest jump in loudness (the drop): dip to white into it
  if (settings.movement !== 'calm' && parts.length > 2) {
    let bestK = -1, bestJump = 0;
    for (let k = 1; k < parts.length; k++) { const j = parts[k].loud - parts[k - 1].loud; if (j > bestJump) { bestJump = j; bestK = k; } }
    if (bestK > 0 && bestJump > loudSorted[Math.floor(loudSorted.length / 2)] * 0.35) { shots[bestK].in = 'dipWhite'; shots[bestK].inDur = DEFAULT_DUR.dipWhite; }
  }
  // punches on the biggest chords, away from cuts
  if (settings.punch !== 'off') {
    const per = settings.punch === 'lots' ? 6 : 12;
    const want = Math.max(1, Math.floor(duration / per));
    const chords = chordHits(proj.notes).sort((a, b) => b.w - a.w);
    const taken: number[] = [];
    for (const c of chords) {
      if (taken.length >= want) break;
      const t = nearestBeat(g, c.t);
      if (Math.abs(t - c.t) > 0.12) continue;
      if (shots.some((s) => Math.abs(s.start - t) < 1.6) || taken.some((x) => Math.abs(x - t) < 4) || t < 1.5 || duration - t < 1.5) continue;
      taken.push(t);
    }
    for (const t of taken) {
      const i = shotIndexAt(shots, t);
      const cur = shots[i];
      shots.splice(i + 1, 0, { ...cur, id: shotId(), start: t, in: 'punch', inDur: DEFAULT_DUR.punch });
    }
  }
  return shots.sort((a, b) => a.start - b.start);
}

/** moments where several loud notes start together */
function chordHits(notes: RawNote[]): { t: number; w: number }[] {
  const ns = [...notes].sort((a, b) => a.s - b.s);
  const out: { t: number; w: number }[] = [];
  for (let i = 0; i < ns.length;) {
    let j = i, w = 0;
    while (j < ns.length && ns[j].s - ns[i].s < 0.06) { w += ns[j].v; j++; }
    if (j - i >= 3) out.push({ t: ns[i].s, w: w * (1 + (j - i) * 0.15) });
    i = j;
  }
  return out;
}

export function newCameraTrack(proj: ProjectFile): CameraTrack {
  const R = sourceRect(proj);
  return { on: true, aspect: naturalAspect(R.w, R.h), shots: [], fadeEnds: true, auto: { ...DEFAULT_AUTO } };
}
