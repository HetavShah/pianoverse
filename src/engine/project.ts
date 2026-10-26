// Project data model + keyboard geometry (ported from the approved Python pipeline).
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
  keyboard: { keys: number; lowestNote: number; whiteKeys: number; edge: { a: number; b: number } };
  tracking: { space: 'video-pixels'; frames: number[][] }; // 8 values per frame, h33 = 1
  notes: RawNote[];
  /** appearance settings saved with the project */
  look?: Partial<import('./look').Look>;
  /** the preset the look started from */
  presetId?: string;
  /** export choices (size, format, where to save) */
  exportSettings?: Partial<import('../ui/exportRun').ExportSettings>;
  /** sections of the video where particles trace a shape instead of the normal particle style */
  particleScenes?: ParticleScene[];
  /** where the notes came from and how they are lined up with the video */
  noteSource?: import('./notes').NoteSource;
  /** the virtual camera: shots, transitions and the frame's shape */
  cameraTrack?: import('./camera').CameraTrack;
  /** opening title and end card */
  titles?: Partial<import('./titles').Titles>;
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

const WHITE_OFF: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const BLACK_OFF: Record<number, number> = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };

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

export class Keyboard {
  H: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  constructor(public lowest: number, public edgeA: number, public edgeB: number) {}

  P(x: number, y: number): [number, number] {
    const h = this.H;
    const w = h[6] * x + h[7] * y + h[8];
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  }

  /** pixels per white-key width at plane point */
  unit(x: number, y: number): number {
    const a = this.P(x - 0.5, y), b = this.P(x + 0.5, y);
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  edgeY(x: number): number {
    return this.edgeA + this.edgeB * x;
  }

  /** key footprint in plane coords (white-key units across, 0 = back .. 1 = front) */
  footprint(p: number): { quad: [number, number][]; black: boolean } {
    // white-key ordinals counted from C-1, so keyboards starting on A or E line up too
    const ord = (q: number) => {
      const o = Math.floor(q / 12), r = q - o * 12;
      return r in WHITE_OFF ? o * 7 + WHITE_OFF[r] : o * 7 + BLACK_OFF[r];
    };
    const base = ord(this.lowest);
    const r = ((p % 12) + 12) % 12;
    if (r in WHITE_OFF) {
      const w = ord(p) - base;
      return { quad: [[w + 0.08, 0.66], [w + 0.92, 0.66], [w + 0.92, 0.97], [w + 0.08, 0.97]], black: false };
    }
    const c = ord(p) - base;
    return { quad: [[c - 0.26, 0.06], [c + 0.26, 0.06], [c + 0.26, 0.58], [c - 0.26, 0.58]], black: true };
  }

  keyCenterX(p: number): number {
    const q = this.footprint(p).quad;
    return (q[0][0] + q[1][0]) / 2;
  }

  /** where this key's lane meets the saber line */
  target(p: number) {
    const cx = this.keyCenterX(p);
    const cy = this.edgeY(cx);
    const [u, v] = this.P(cx, cy);
    const a = this.P(cx - 1, cy), b = this.P(cx + 1, cy);
    return { x: u, y: v, unit: this.unit(cx, cy), along: [b[0] - a[0], b[1] - a[1]] as [number, number], plane: cx };
  }
}

export function trackingMatrix(proj: ProjectFile, frame: number): Mat3 {
  const f = proj.tracking.frames;
  const h = f[Math.min(f.length - 1, Math.max(0, frame))];
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

// deterministic random numbers
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rnd: () => number, mu: number, sigma: number) {
  const u = Math.max(1e-9, rnd()), v = rnd();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
