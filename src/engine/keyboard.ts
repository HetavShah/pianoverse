// Keyboard geometry: where each key is on the keyboard's plane (white-key units across, 0 = back .. 1 = front), and
// from there in the video through the tracking homography H. Ported from the approved Python pipeline.
import type { Mat3, ProjectFile } from './project';

const WHITE_OFF: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const BLACK_OFF: Record<number, number> = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
/** where each black key's centre is, in white keys from the octave's C */
const BLACK_CENTRE: Record<number, number> = { 1: 0.92, 3: 2.08, 6: 3.88, 8: 5.0, 10: 6.12 };

/**
 * A small correction of the key layout found by fitting it to the picture (see keyFit): plane x becomes
 * x0 + (1 + k) * x + sh * y, so the keys can shift sideways, be a little wider or narrower, and slant from back
 * to front the way the real keys run. Tracking places the keyboard; this lines up the keys inside it.
 */
export interface KeyFit { x0: number; k: number; sh: number }
export const NO_FIT: KeyFit = { x0: 0, k: 0, sh: 0 };

export class Keyboard {
  H: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  constructor(public lowest: number, public edgeA: number, public edgeB: number, public fit: KeyFit = NO_FIT) {}

  P(x0: number, y: number): [number, number] {
    const f = this.fit;
    const x = f.x0 + (1 + f.k) * x0 + f.sh * y;
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
    // black keys sit unevenly within the octave on a real keyboard (C♯ a little left of the C–D line, and so on)
    const c = Math.floor(p / 12) * 7 + BLACK_CENTRE[r] - base;
    return { quad: [[c - 0.29, 0.02], [c + 0.29, 0.02], [c + 0.29, 0.6], [c - 0.29, 0.6]], black: true };
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

/** the keyboard model for a project (its lowest note, saber edge and key fit) */
export function keyboardOf(proj: ProjectFile): Keyboard {
  return new Keyboard(proj.keyboard.lowestNote, proj.keyboard.edge.a, proj.keyboard.edge.b, proj.keyboard.fit ?? NO_FIT);
}
