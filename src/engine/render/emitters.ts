// The particle plan: every note becomes one or more emitters, worked out once per project (not per frame). An
// emitter is 16 floats the simulation shader reads (particles_sim.wgsl); the shader is stateless, so a particle's
// position at time t comes from its emitter alone and any frame can be drawn on its own, in any order (export,
// scrubbing).
//
// Emitter row: [start, life, rate, count, pos.xy, vel.xy, col.rgb, loudness, seed, kind, a, b]
// where kind picks the shader's behaviour (see Kind) and a, b are kind-specific.
//
// Each particle style is a strategy (PARTICLE_MODES): given a note it returns its emitters. Add a style by adding an
// entry there and its kind to the shader.
import { Note, trackingMatrix } from '../project';
import { gauss, mulberry32 } from '../random';
import { Keyboard } from '../keyboard';
import type { Look } from '../look';
import type { DrawModel } from './model';

/** particle slots per emitter */
export const PER_EMIT = 1024;
/** floats per emitter row */
export const ROW = 16;

/** what an emitter does (the `kind` the simulation shader switches on) */
export const Kind = {
  Stream: 0, Burst: 1, Fountain: 2, Spray: 3, Vortex: 4, Shape: 5, Layered: 6, Ambient: 7,
} as const;

export interface EmitterRow { start: number; end: number; data: number[] }

/** a note with what every style needs: where it lands and how loud it is */
interface Hit {
  n: Note;
  tg: ReturnType<Keyboard['target']>;
  /** loudness used for sizes (0.5 for every note when "Louder notes, bigger plumes" is off) */
  vv: number;
  /** how long the key is down (particles are only born while it is) */
  dur: number;
  kb: Keyboard;
  m: DrawModel;
}
/** one job for a style: the look's own (slot 0) or a shape section's */
interface Job { slot: number; dir: number; size: number }

type ModeStrategy = (h: Hit, lk: Look, job: Job) => EmitterRow[];

/** the main particle effect, by style */
const PARTICLE_MODES: Record<Look['partMode'], ModeStrategy> = {
  // smoke thrown up from the key that arcs over and sinks, for as long as the key is held
  fountain: ({ n, tg, vv, dur }, lk) => {
    const held = Math.min(4, dur);
    // the keyboard line's direction on screen (an angle: a slope can't describe a keyboard running up the picture)
    const lineAngle = Math.atan2(tg.along[1], tg.along[0]);
    const sp = tg.unit * 13 * lk.partSpeed * (0.85 + 0.3 * vv);
    const G = (sp * sp) / (2 * tg.unit * 7 * Math.max(0.2, lk.partRise));
    const life = Math.min(held, 2.5);
    const rate = Math.min(1000 / life, 420 * (0.6 + 0.8 * vv) * lk.partAmount);
    return rate > 0 ? [{ start: n.s, end: n.s + life + 2.5 * lk.partLife, data: [n.s, life, rate, 0, tg.x, tg.y, 0, -sp, ...n.col, vv, n.idx * 16, Kind.Fountain, lineAngle, G] }] : [];
  },
  // a burst on the hit, then a spray while the key is held
  spray: ({ n, tg, vv, dur }, lk) => {
    const held = Math.min(4, dur);
    const sp = tg.unit * 12 * lk.partSpeed * (0.85 + 0.3 * vv);
    const burst = Math.floor(110 * (0.6 + 0.8 * vv) * lk.partAmount);
    const rate = Math.min((1000 - burst) / held, 620 * (0.6 + 0.8 * vv) * lk.partAmount);
    return rate > 0 ? [{ start: n.s, end: n.s + held + 1.5 * lk.partLife, data: [n.s, held, rate, burst, tg.x, tg.y, 0, -sp, ...n.col, vv, n.idx * 16, Kind.Spray, 0, 0] }] : [];
  },
  // sparks that fly to a drawing (a heart, a star, your own SVG) above the keyboard and trace its outline
  shape: ({ n, tg, vv, kb, m }, lk, job) => {
    const mid = m.whiteKeys / 2;
    const c0 = kb.P(mid, kb.edgeY(mid));
    const ends = [kb.P(0, kb.edgeY(0)), kb.P(m.whiteKeys, kb.edgeY(m.whiteKeys))];
    const size = Math.min(m.srcW * 0.8, Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]) * 0.75) * job.size;
    const cy = Math.max(size * 0.55, Math.min(...ends.map((e) => e[1]), c0[1]) - tg.unit * 2.5 - size * 0.5);
    const cx = Math.min(m.srcW - size * 0.55, Math.max(size * 0.55, c0[0]));
    const rate = 450 * (0.6 + 0.8 * vv) * lk.partAmount;
    return rate > 0 ? [{
      start: n.s, end: n.s + 0.15 + (1.6 + 7.5 * lk.partShapeHold) / Math.max(0.1, lk.partSpeed) + 2.1 * lk.partLife,
      data: [n.s, 0.15, rate, job.dir * (job.slot + 1), tg.x, tg.y, cx, cy, ...n.col, vv, n.idx * 16 + 12, Kind.Shape, size, lk.partShapeHold],
    }] : [];
  },
  // a ring of particles circling above the keyboard
  vortex: ({ n, tg, vv, dur, kb, m }, lk) => {
    const mid = m.whiteKeys / 2;
    const c0 = kb.P(mid, kb.edgeY(mid));
    const up = m.up, u = kb.unit(mid, kb.edgeY(mid));
    const ang = Math.atan2(tg.along[1], tg.along[0]);
    const ends = [kb.P(0, kb.edgeY(0)), kb.P(m.whiteKeys, kb.edgeY(m.whiteKeys))];
    const half = Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]) / 2;
    // the ring floats above the keys: its near side (about a third of its radius below the centre) clears them
    const lift = u * 2 + half * (1 + lk.partSpread) * 0.38;
    const C: [number, number] = [c0[0] + up[0] * lift, c0[1] + up[1] * lift];
    const rate = 320 * (0.6 + 0.8 * vv) * lk.partAmount;
    return rate > 0 ? [{ start: n.s, end: n.s + 0.6 + 4.9 * lk.partLife, data: [n.s, Math.min(0.6, dur), rate, 0, tg.x, tg.y, C[0], C[1], ...n.col, vv, n.idx * 16, Kind.Vortex, ang, half * (1 + lk.partSpread)] }] : [];
  },
  // rising streams of dust (one or two per note) and a small burst on the hit
  plume: ({ n, tg, vv, dur }, lk, job) => {
    const rows: EmitterRow[] = [];
    const rnd = mulberry32(n.idx * 7919 + 101 + job.slot * 31);
    const streams = 1 + (rnd() < 0.35 + 0.4 * vv ? 1 : 0);
    for (let j = 0; j < streams; j++) {
      const a = gauss(rnd, -Math.PI / 2, 0.32);
      const sp = (170 + 100 * rnd()) * (0.8 + 0.5 * vv) * lk.partRise * lk.partSpeed;
      const life = Math.min(dur, (0.9 + 0.7 * rnd()) * (0.8 + 0.5 * vv) * lk.partLife);
      const rate = (200 + 120 * rnd()) * (0.6 + 0.8 * vv) * lk.partAmount; // sparse, so each dot reads on its own
      if (rate <= 0) continue;
      let ex = tg.x, ey = tg.y;
      if (lk.partSpread > 0) { ex += gauss(rnd, 0, tg.unit * 0.8 * lk.partSpread); ey += gauss(rnd, 0, tg.unit * 0.3 * lk.partSpread); }
      rows.push({ start: n.s, end: n.s + life + 2.6 * lk.partLife, data: [n.s, life, rate, 0, ex, ey, Math.cos(a) * sp, Math.sin(a) * sp, ...n.col, vv, n.idx * 16 + j, Kind.Stream, 0, 0] });
    }
    const burst = Math.floor((24 + 30 * vv) * lk.partAmount);
    if (burst > 0) rows.push({ start: n.s, end: n.s + 1.4 * lk.partLife, data: [n.s, 0, 0, burst, tg.x, tg.y, 0, 0, ...n.col, vv, n.idx * 16 + 8, Kind.Burst, 0, 0] });
    return rows;
  },
};

/**
 * The layers on every hit, whatever the style (but Shape, which keeps its outline clean): sparks (a fan of short
 * white sparks or long curving trails), glitter, and glows (smoke from the key or a rising haze).
 */
function layers({ n, tg, vv, dur }: Hit, lk: Look): EmitterRow | null {
  const fan = lk.partSparkStyle === 'fan';
  // fan sparks and fountain smoke keep coming for as long as the key is held (half at the strike, half spread over
  // the hold), like a held note pouring into the saber
  const hold = Math.min(dur, 6);
  const nS = Math.min(400, Math.round((fan ? 16 + 22 * vv + 40 * hold : 3 + 4 * vv) * lk.partSparks));
  const nD = Math.round((30 + 45 * vv) * lk.partGlitter);
  const nG = lk.partGlow > 0 ? 1 + Math.min(150, Math.round((lk.partSmokeStyle === 'fountain' ? 12 + 8 * vv + 5 * hold : 1 + vv) * lk.partGlow)) : 0;
  if (nS + nD + nG <= 0) return null;
  const k = Math.min(1, (PER_EMIT - 8) / (nS + nD + nG));
  return { start: n.s, end: n.s + hold + 0.4 + 3.4 * lk.partLife, data: [n.s, Math.round(nG * k), Math.round(nS * k), Math.round(nD * k), tg.x, tg.y, 0, 0, ...n.col, vv, n.idx * 16 + 13, Kind.Layered, tg.unit, dur] };
}

/** All the emitters of a project, sorted by start, with a quick way to find those alive at a moment. */
export class EmitterPlan {
  /** rows, ROW floats each */
  readonly rows: Float32Array;
  readonly start: number[];
  readonly end: number[];
  /** the longest an emitter lives (how far back to look for ones still alive) */
  readonly span: number;
  /** shapes in use: slot 0 is the look's own shape (Shape style for the whole video), then one per section */
  readonly shapeKeys: string[];

  constructor(m: DrawModel) {
    const lk = m.look;
    this.shapeKeys = [lk.partShape || 'heart', ...m.scenes.map((sc) => sc.shape || 'heart')];
    const kb = new Keyboard(m.kb.lowest, m.kb.edgeA, m.kb.edgeB, m.kb.fit);
    const rows: EmitterRow[] = [];
    for (const n of m.notes) {
      const scene = m.scenes.findIndex((sc) => n.s >= sc.start && n.s < sc.end);
      const sc = scene >= 0 ? m.scenes[scene] : null;
      kb.H = trackingMatrix(m.proj, Math.round(n.s * m.fps));
      const hit: Hit = { n, tg: kb.target(n.p), vv: lk.partVelocity ? n.vn : 0.5, dur: Math.max(0.05, n.e - n.s), kb, m };
      if (lk.partMode !== 'shape' && !sc) { const r = layers(hit, lk); if (r) rows.push(r); }
      // in a shape section the note sends sparks to the shape, and (unless turned off) its usual particles too
      if (!sc || sc.keep !== false) rows.push(...PARTICLE_MODES[lk.partMode](hit, lk, { slot: 0, dir: lk.partShapeDir === 'ccw' ? -1 : 1, size: lk.partShapeSize }));
      if (sc) rows.push(...PARTICLE_MODES.shape(hit, lk, { slot: scene + 1, dir: sc.dir === 'ccw' ? -1 : 1, size: sc.size }));
    }
    rows.sort((a, b) => a.start - b.start);
    this.rows = new Float32Array(rows.length * ROW);
    rows.forEach((r, i) => this.rows.set(r.data, i * ROW));
    this.start = rows.map((r) => r.start);
    this.end = rows.map((r) => r.end);
    // how far back an emitter can still be alive (long-lived modes like Shape need more than plumes)
    this.span = Math.max(5, ...rows.map((r) => r.end - r.start));
  }

  /** indices of the emitters alive at t, newest first, at most max */
  aliveAt(t: number, max: number): number[] {
    const out: number[] = [];
    for (let i = upperBound(this.start, t) - 1; i >= 0 && this.start[i] >= t - this.span && out.length < max; i--) {
      if (this.end[i] >= t) out.push(i);
    }
    return out;
  }

  /** floating dust: one emitter over the space above the keys, always on (null when the look has none) */
  static ambient(m: DrawModel): Float32Array | null {
    const lk = m.look;
    if (!(lk.partAmbient > 0)) return null;
    const kb = m.kb, nK = m.whiteKeys;
    // a band over the keyboard: along its back edge, up to about nine keys high (not the whole room)
    const a = kb.P(0, kb.edgeY(0)), b = kb.P(nK, kb.edgeY(nK));
    // tinted by the look: the average colour of the notes
    let r = 0, g = 0, bl = 0;
    const n = Math.min(64, m.notes.length);
    for (let i = 0; i < n; i++) { const c = m.notes[Math.floor((i * m.notes.length) / n)].col; r += c[0]; g += c[1]; bl += c[2]; }
    const col = n ? [r / n, g / n, bl / n] : [0.6, 0.9, 1];
    const unit = kb.unit(nK / 2, kb.edgeY(nK / 2));
    const count = Math.min(PER_EMIT, Math.round(420 * lk.partAmbient));
    const ul = Math.hypot(m.up[0], m.up[1]) || 1;
    return new Float32Array([0, m.up[0] / ul, m.up[1] / ul, count, a[0], a[1], b[0], b[1], col[0], col[1], col[2], 0.5, 9973, Kind.Ambient, unit, unit * 9]);
  }
}

function upperBound(arr: number[], v: number) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m + 1; else hi = m; }
  return lo;
}
