// The project file (what is saved), the part of the video in use (trim and crop), and notes prepared for
// drawing. Keyboard geometry is in keyboard.ts.
import { noteColor, noteColorTop } from './look';

export interface RawNote {
  s: number; e: number; p: number; v: number;
  /** end including the sustain pedal (MIDI files that use it) */
  h?: number;
  /** MIDI track and channel the note came from */
  k?: number; c?: number;
}

export interface ProjectFile {
  format: 'pianoverse-project';
  version: number;
  name: string;
  video: {
    file: string; width: number; height: number; fps: number; frames: number;
    /** where the video is on this computer, and its H.264 editing copy if one was made */
    path?: string; editPath?: string; duration?: number; codec?: string; bytes?: number;
  };
  /** recent-projects identity and the five-step flow's progress */
  id?: string;
  camera?: 'angled' | 'topdown';
  progress?: { calibrated?: boolean };
  keyboard: { keys: number; lowestNote: number; whiteKeys: number; edge: { a: number; b: number }; fit?: import('./keyboard').KeyFit };
  tracking: { space: 'video-pixels'; frames: number[][] }; // 8 values per frame, h33 = 1
  notes: RawNote[];
  /** appearance settings saved with the project */
  look?: Partial<import('./look').Look>;
  /** the preset the look started from */
  presetId?: string;
  /** export choices (size, format, where to save) */
  exportSettings?: Partial<import('./exportSettings').ExportSettings>;
  /** sections of the video where particles trace a shape instead of the normal particle style */
  particleScenes?: ParticleScene[];
  /** where the notes came from and how they are lined up with the video */
  noteSource?: import('./notes').NoteSource;
  /** the virtual camera: shots, transitions and the frame's shape */
  cameraTrack?: import('./camera').CameraTrack;
  /** opening title and end card */
  titles?: Partial<import('./titles').Titles>;
  /** trim and crop chosen on the Import step (the video file itself is never changed) */
  edit?: VideoEdit;
  /** the video's own lighting (Light step) */
  lighting?: Partial<import('./lighting').Lighting>;
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface VideoEdit {
  /** the part of the video used, in seconds */
  trim?: [number, number];
  /** the part of the frame used, in video pixels */
  crop?: Rect;
}

/** the part of the frame in use (the crop, or the whole video) */
export function sourceRect(p: ProjectFile): Rect {
  const W = p.video.width, H = p.video.height;
  const c = p.edit?.crop;
  if (!c || c.w < 16 || c.h < 16) return { x: 0, y: 0, w: W, h: H };
  const x = Math.max(0, Math.min(W - 16, c.x)), y = Math.max(0, Math.min(H - 16, c.y));
  return { x, y, w: Math.min(W - x, c.w), h: Math.min(H - y, c.h) };
}

/** the part of the timeline in use (the trim, or all of it), seconds */
export function trimRange(p: ProjectFile, duration: number): [number, number] {
  const t = p.edit?.trim;
  if (!t || !(t[1] > t[0])) return [0, duration];
  const a = Math.max(0, Math.min(duration, t[0])), b = Math.max(a, Math.min(duration, t[1]));
  return b - a > 0.2 ? [a, b] : [0, duration];
}

export interface ParticleScene {
  id: string;
  start: number; end: number; // seconds: notes played in this section send sparks along the shape
  shape: string; // built-in name or 'user:<id>' SVG
  size: number; // x the default size
  dir: 'cw' | 'ccw';
  /** notes in the section also send the usual particles (default on) */
  keep?: boolean;
}

export type RGB = [number, number, number]; // 0..1

export interface Note {
  idx: number;
  s: number;
  e: number;
  p: number;
  v: number;
  vn: number; // loudness 0..1
  col: RGB; // pitch colour
  col2: RGB | null; // colour at the note's top end (gradients along the notes)
  h: number; // end including the sustain pedal
  k: number; c: number; // track, channel
}

export type Mat3 = number[]; // row-major 3x3, length 9


// pitch palette: low azure -> teal -> mint
const STOPS: [number, RGB][] = [
  [0.0, [60 / 255, 110 / 255, 1.0]],
  [0.45, [20 / 255, 215 / 255, 190 / 255]],
  [1.0, [120 / 255, 1.0, 170 / 255]],
];
const LO_P = 40, HI_P = 86;

export function pal(p: number): RGB {
  const x = Math.min(1, Math.max(0, (p - LO_P) / (HI_P - LO_P)));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i];
    const [b, cb] = STOPS[i + 1];
    if (x <= b) {
      const k = (x - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function lighten(c: RGB, k: number): RGB {
  return [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k];
}

export function prepareNotes(raw: RawNote[], lowest: number, keys: number, look?: import('./look').Look): Note[] {
  const sorted = [...raw].sort((a, b) => a.s - b.s);
  const last = new Map<number, number>();
  const out: Note[] = [];
  for (const n of sorted) {
    if (n.p < lowest || n.p > lowest + keys - 1) continue;
    const prev = last.get(n.p);
    if (prev !== undefined && n.s - prev < 0.12) continue; // drop re-trigger duplicates
    last.set(n.p, n.s);
    out.push({
      idx: out.length, s: n.s, e: n.e, p: n.p, v: n.v, h: Math.max(n.e, n.h ?? n.e), k: n.k ?? 0, c: n.c ?? 0,
      vn: Math.min(1, Math.max(0, (n.v - 0.3) / 0.3)),
      col: look ? noteColor(look, n.p, { idx: out.length, s: n.s, v: n.v, k: n.k ?? 0, c: n.c ?? 0 }) : pal(n.p),
      col2: look ? noteColorTop(look, n.p, { idx: out.length, s: n.s, v: n.v, k: n.k ?? 0, c: n.c ?? 0 }) : null,
    });
  }
  return out;
}

/** the tracking homography of a video frame (video pixels of the keyboard's plane) */
export function trackingMatrix(proj: ProjectFile, frame: number): Mat3 {
  const f = proj.tracking.frames;
  const h = f[Math.min(f.length - 1, Math.max(0, frame))];
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
