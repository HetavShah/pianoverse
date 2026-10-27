// What to draw this frame, worked out on the CPU: the falling notes, their labels, the flashes and star flares where
// notes land, the coloured lights on the hands, the saber's heat along its length and the bar lines. The result is
// plain instance data the GPU layers upload and draw (see layers.ts); nothing here touches the GPU.
import type { Look } from '../look';
import { lighten, Note, RGB } from '../project';
import type { DrawModel } from './model';

export const MAX_NOTES = 512;
export const MAX_BAR_QUADS = 256;
export const MAX_SPRITES = 512;
export const MAX_LIGHTS = 128;
/** saber heat cells along the keyboard (one per white key, up to 64) */
export const HEAT_CELLS = 64;

/** which parts of the picture are drawn (the eye toggles on the Style step) */
export interface Layers {
  notes: boolean;
  keys: boolean;
  impact: boolean;
  saber: boolean;
  particles: boolean;
  bloom: boolean;
}
export const DEFAULT_LAYERS: Layers = { notes: true, keys: true, impact: true, saber: true, particles: true, bloom: true };

/** instance data for one draw call: a fixed number of floats per instance, up to a limit */
export class InstanceBatch {
  readonly data: number[] = [];
  constructor(readonly floats: number, readonly max: number) {}
  get count() { return this.data.length / this.floats; }
  get full() { return this.count >= this.max; }
  push(...v: number[]) { if (!this.full) this.data.push(...v); }
  array() { return new Float32Array(this.data); }
}

/** everything the layers need for one frame */
export class FrameScene {
  /** falling notes: 16 floats each (see glass.wgsl) */
  readonly notes = new InstanceBatch(16, MAX_NOTES);
  /** note names on the notes: 12 floats each (labels.wgsl) */
  readonly labels = new InstanceBatch(12, MAX_NOTES);
  /** bar lines: 6 vertices of 8 floats per line (barlines.wgsl) */
  readonly bars = new InstanceBatch(48, MAX_BAR_QUADS);
  /** flashes, streaks and star flares: 12 floats each (sprites.wgsl) */
  readonly sprites = new InstanceBatch(12, MAX_SPRITES);
  /** coloured lights on the hands and keys: 8 floats each (post.wgsl) */
  readonly lights = new InstanceBatch(8, MAX_LIGHTS);
  /** saber heat: rgb + weight per cell */
  readonly heat = new Float32Array(HEAT_CELLS * 4);
  /** how hard the bass is hitting (0..1), for the bass pulse */
  bass = 0;
  /** notes on screen (stats) */
  visible = 0;
  constructor(readonly t: number) {}

  dot(x: number, y: number, r: number, c: RGB) {
    if (!this.sprites.full) this.sprites.push(x, y, r, 0, 0, 0, 0, 0, c[0], c[1], c[2], 0);
  }
  streak(x: number, y: number, dir: [number, number], len: number, thick: number, c: RGB) {
    if (!this.sprites.full) this.sprites.push(x, y, 0, 1, dir[0], dir[1], len, thick, c[0], c[1], c[2], 0);
  }
  light(x: number, y: number, R: number, c: RGB, k: number) {
    if (!this.lights.full && k > 0.005) this.lights.push(x, y, R, k, c[0], c[1], c[2], 0);
  }
}

const scaled = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
/** keys whose names are spelled with flats (circle of fifths), for each key quality */
const FLAT_KEYS = { major: [5, 10, 3, 8, 1, 6], minor: [2, 7, 0, 5, 10, 3] };

/** Builds a FrameScene for a moment of the project. The model's keyboard must already track that moment. */
export class SceneBuilder {
  constructor(private m: DrawModel) {}

  build(t: number, layers: Layers): FrameScene {
    const s = new FrameScene(t);
    const { look: lk, notes } = this.m;
    // notes in a window around t (sorted by start)
    for (let i = lowerBound(notes, t - 12); i < notes.length; i++) {
      const n = notes[i];
      if (n.s > t + 4) break;
      this.note(s, n, t, layers);
    }
    s.bass = Math.min(1, s.bass);
    if (lk.barLines && layers.notes && this.m.bars.length) this.barLines(s, t);
    return s;
  }

  /** one note: its falling bar and label, the flash and light where it lands, and its heat on the saber */
  private note(s: FrameScene, n: Note, t: number, L: Layers) {
    const { look: lk, kb, up: U } = this.m;
    const FALL = lk.noteSpeed;
    const tg = kb.target(n.p);
    const col = n.col;
    const vn = n.vn;
    const dd = n.s - t;
    let w = Math.max(24, tg.unit * 1.05) * (lk.noteVelocity === 1 ? 0.9 + 0.2 * vn : 1 + (0.2 * vn - 0.1) * lk.noteVelocity) * lk.noteWidth;
    if (lk.noteBWRatio !== 1 && kb.footprint(n.p).black) w /= lk.noteBWRatio;
    const end = lk.noteSustain ? n.h : n.e;
    const len0 = Math.min(300 * (FALL / 680) * (lk.noteSustain ? 4 : 1), Math.max(w * lk.noteMinLen, (end - n.s) * FALL * 0.8 - 8));
    const len = lk.noteLength === 1 ? len0 : Math.max(w * 0.6, len0 * lk.noteLength);
    // distances measured from the landing point back along the fall direction
    const sB = dd * FALL;
    const sT = sB + len;
    const sMax = exitDist(tg.x, tg.y, U, this.m.srcW, this.m.srcH);
    const at = (d: number): [number, number] => [tg.x + U[0] * d, tg.y + U[1] * d];

    if (L.notes && sT > 0 && sB < sMax + 40 && !s.notes.full) {
      const fade = lk.noteFade > 0 ? Math.min(1, Math.max(0, (sMax - sB + 60) / (220 * lk.noteFade))) : 1;
      const c2 = n.col2;
      s.notes.push(tg.x, tg.y, sB, sT, w, fade * (0.85 + 0.3 * vn * lk.noteVelocity), fade, U[0], col[0], col[1], col[2], U[1],
        c2 ? c2[0] : 0, c2 ? c2[1] : 0, c2 ? c2[2] : 0, c2 ? 1 : 0);
      if (lk.labels && sT - Math.max(sB, 0) > w * 0.75) this.label(s, n, tg, w, sB, fade);
      s.visible++;
      if (sB <= 0 && L.impact) s.dot(tg.x, tg.y, tg.unit * 0.3 * lk.flashSize, scaled(lighten(col, 0.6), 0.5 * lk.flashBright));
    }

    if (dd > 0) {
      // about to land: an early glow (Light up before landing)
      const near = lk.keyAnticipate > 0 ? 1 - Math.min(1, dd / lk.keyAnticipate) : 0;
      if (near > 0) {
        const [lx, ly] = at(sB);
        if (L.impact) s.light(lx, ly, tg.unit * 3 * lk.relightRadius, col, 0.35 * near);
      }
    } else if ((t <= n.e || dd >= -lk.impactTime) && L.impact) {
      this.impact(s, n, tg, -dd, t <= n.e);
    }
    this.saberHeat(s, n, t);
  }

  /** the note's name, near its bottom end */
  private label(s: FrameScene, n: Note, tg: { x: number; y: number }, w: number, sB: number, fade: number) {
    const { look: lk, kb, up: U } = this.m;
    if (s.labels.full) return;
    const sl = Math.max(sB, 0) + w * 0.7;
    let lx = tg.x + U[0] * sl, ly = tg.y + U[1] * sl, half = w * 0.48 * lk.labelSize;
    if (lk.noteDistort !== 0) {
      // the perspective distortion spreads notes out from the keyboard's middle; the label follows its note
      const midX = this.m.whiteKeys / 2;
      const distC = kb.P(midX, kb.edgeY(midX));
      const k = Math.min(4, Math.max(0.05, 1 + (lk.noteDistort * sl) / this.m.srcH));
      const Nx = -U[1], Ny = U[0];
      const lat = (tg.x - distC[0]) * Nx + (tg.y - distC[1]) * Ny;
      lx += Nx * lat * (k - 1); ly += Ny * lat * (k - 1); half *= k;
    }
    const pc = ((n.p % 12) + 12) % 12;
    const lc = lighten(n.col, 0.85);
    s.labels.push(lx, ly, half, pc + (flatSpelling(lk) ? 12 : 0), U[0], U[1], 0, 0, lc[0], lc[1], lc[2], lk.labelOpacity * fade);
  }

  /** where a note has landed: light on the hands, a flash and streak on the hit, and the star flare */
  private impact(s: FrameScene, n: Note, tg: ReturnType<DrawModel['kb']['target']>, tt: number, held: boolean) {
    const { look: lk, up: U } = this.m;
    const col = n.col, vn = n.vn;
    const lx = tg.x + U[0] * tg.unit * 0.6, ly = tg.y + U[1] * tg.unit * 0.6;
    s.light(lx, ly, tg.unit * (4 + 2 * vn) * lk.relightRadius, col, (0.55 + 0.5 * vn) * Math.exp(-tt * 3.5) + (held ? 0.12 : 0));
    if (tt < 0.35 * (lk.impactTime / 1.3)) {
      const e = Math.exp(-tt * 11 * (1.3 / lk.impactTime)) * (0.75 + 0.45 * vn);
      s.dot(tg.x, tg.y, tg.unit * 0.45 * lk.flashSize, scaled(lighten(col, 0.5), 0.8 * e * lk.flashBright));
      if (lk.streakLen > 0) s.streak(tg.x, tg.y, tg.along, tg.unit * 1.8 * lk.streakLen, 1.2, scaled(lighten(col, 0.4), 0.4 * e * lk.streakBright));
    }
    if (lk.flashStar > 0) {
      // star flare: a cross of light on the key, bright on the hit and glowing softly while the note is held
      const k = lk.flashStar * (Math.exp(-tt * 5 * (1.3 / lk.impactTime)) * (0.8 + 0.5 * vn) + (held ? 0.28 : 0));
      const ul = Math.hypot(U[0], U[1]) || 1;
      const c2 = lighten(col, 0.7);
      s.streak(tg.x, tg.y, [U[0] / ul, U[1] / ul], tg.unit * 1.1 * lk.flashStar, 0.9, scaled(c2, 0.55 * k));
      s.streak(tg.x, tg.y, tg.along, tg.unit * 2.6 * lk.flashStar, 0.8, scaled(c2, 0.45 * k));
      s.dot(tg.x, tg.y, tg.unit * 0.35 * lk.flashSize, scaled(c2, 0.5 * k));
    }
  }

  /** the saber lights up round the key that was hit (and, for a saber lit only where you play, over held notes) */
  private saberHeat(s: FrameScene, n: Note, t: number) {
    const lk = this.m.look;
    const since = t - n.s;
    const local = 1 - Math.min(1, lk.saberIdle);
    const heldGlow = local > 0 && since >= 0 && t <= n.e ? 0.32 * local * lk.keyHeld : 0;
    if (!(since >= 0 && (since < 0.9 || heldGlow > 0))) return;
    const c = this.m.kb.keyCenterX(n.p);
    const wd = 2.2 - 0.7 * local;
    const col = n.col;
    for (let k = 0; k < HEAT_CELLS; k++) {
      const wgt = (Math.exp(-since * 3.5) + heldGlow) * Math.exp(-(((k + 0.5 - c) / wd) ** 2));
      s.heat[k * 4] += wgt * col[0];
      s.heat[k * 4 + 1] += wgt * col[1];
      s.heat[k * 4 + 2] += wgt * col[2];
      s.heat[k * 4 + 3] += wgt;
    }
    if (n.p < 50 && since < 0.9) s.bass += Math.exp(-since * 4) * (0.6 + 0.6 * n.vn);
  }

  /** a line across the keyboard at the start of every bar, falling with the notes */
  private barLines(s: FrameScene, t: number) {
    const { look: lk, kb, up: U } = this.m;
    const nK = this.m.whiteKeys;
    const A = kb.P(-0.2, kb.edgeY(-0.2)), B = kb.P(nK + 0.2, kb.edgeY(nK + 0.2));
    const th = 3, c = 1.1 * lk.barOpacity;
    const sMax = Math.hypot(this.m.srcW, this.m.srcH);
    for (const b of this.m.bars) {
      const s0 = (b - t) * lk.noteSpeed;
      if (s0 < 0 || s0 > sMax) continue;
      if (s.bars.full) break;
      const q = [[A[0] + U[0] * s0, A[1] + U[1] * s0], [B[0] + U[0] * s0, B[1] + U[1] * s0], [B[0] + U[0] * (s0 + th), B[1] + U[1] * (s0 + th)], [A[0] + U[0] * (s0 + th), A[1] + U[1] * (s0 + th)]];
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const quad: number[] = [];
      for (const i of [0, 1, 2, 0, 2, 3]) quad.push(q[i][0], q[i][1], uv[i][0] * 0.4 + 0.3, uv[i][1], c, c, c, 0); // last float: padding
      s.bars.push(...quad);
    }
  }
}

/** spell note names with flats? (set by the look, or from the key) */
function flatSpelling(lk: Look) {
  return lk.labelAccidental === 'flat' || (lk.labelAccidental === 'auto' && FLAT_KEYS[lk.labelQuality].includes(lk.labelKey));
}

/** first note starting at or after s (notes sorted by start) */
function lowerBound(arr: Note[], s: number) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].s < s) lo = m + 1; else hi = m; }
  return lo;
}

/** distance from (x, y) along direction u to the edge of the frame */
function exitDist(x: number, y: number, u: [number, number], w: number, h: number): number {
  let d = Infinity;
  if (u[0] > 1e-6) d = Math.min(d, (w - x) / u[0]);
  if (u[0] < -1e-6) d = Math.min(d, -x / u[0]);
  if (u[1] > 1e-6) d = Math.min(d, (h - y) / u[1]);
  if (u[1] < -1e-6) d = Math.min(d, -y / u[1]);
  return Math.max(0, isFinite(d) ? d : 0);
}
