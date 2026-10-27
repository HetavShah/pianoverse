// Piano note finder: Transkun 2.0 (Yujia Yan & Zhiyao Duan, "Scoring intervals using non-hierarchical transformer
// for automatic piano transcription", ISMIR 2024; MIT licence), run with ONNX Runtime.
//
// The recording is handled in 16 s windows, 8 s apart (model.ts), each transcribed on its own (decode.ts) and the
// windows stitched exactly as the original does. The sustain pedal is folded into each note's held end, like a
// MIDI file.
import { velocityToLoudness } from '../../notes';
import type { RawNote } from '../../project';
import type { NoteFinder } from '../noteFinder';
import { Ev, transcribeWindow } from './decode';
import { HOP, NSYM, SEG, STEP, TK_RATE, transkunModel } from './model';

export { TK_RATE } from './model';

export class TranskunFinder implements NoteFinder {
  readonly sampleRate = TK_RATE;
  /** base: where the model files are served */
  constructor(private base = 'models/transkun/') {}

  async find(audio: Float32Array, onProgress: (done: number) => void): Promise<RawNote[]> {
    const pct = (p: number) => onProgress(p / 100);
    const m = await transkunModel(this.base, pct);
    pct(15);
    const events = await this.transcribe(m, audio, pct);
    return withPedal(events);
  }

  /** every window, stitched: overlapping events of a key are merged, as the original does */
  private async transcribe(m: Awaited<ReturnType<typeof transkunModel>>, audio: Float32Array, pct: (p: number) => void): Promise<Ev[]> {
    const padT = SEG - STEP;
    const pad = Math.ceil(padT * TK_RATE);
    const x = new Float32Array(audio.length + 2 * pad);
    x.set(audio, pad);
    let startPos = new Array(NSYM).fill(Math.floor((padT * TK_RATE) / HOP));
    const step = Math.ceil((STEP * TK_RATE) / HOP) * HOP, seg = Math.ceil(SEG * TK_RATE);
    const byType = new Map<number, Ev[]>();
    for (let i = 0; i < x.length; i += step) {
      const j = Math.min(i + seg, x.length);
      const t0 = i / TK_RATE - padT;
      const sl = new Float32Array(seg);
      sl.set(x.subarray(i, j));
      const { ev, lastP } = await transcribeWindow(m, sl, startPos, Math.round(seg / HOP));
      startPos = lastP.map((k) => Math.max(k - Math.trunc(step / HOP), 0));
      for (const e of ev) { e.start = Math.max(e.start + t0, 0); e.end = Math.max(e.end + t0, e.start); }
      for (const e of ev) {
        let L = byType.get(e.pitch);
        if (!L) byType.set(e.pitch, (L = []));
        if (L.length && e.start < L[L.length - 1].end) {
          if (e.on) L[L.length - 1] = e;
          else { const l = L[L.length - 1]; l.off = e.off; l.end = Math.max(e.end, l.end); }
          continue;
        }
        if (e.on) L.push(e);
      }
      pct(15 + (85 * Math.min(x.length, i + step)) / x.length);
      await new Promise((r) => setTimeout(r, 0)); // let the progress bar draw
    }
    for (const L of byType.values()) if (L.length) L[L.length - 1].off = true;
    const all = [...byType.values()].flat().filter((e) => e.off);
    all.sort((p, q) => p.start - q.start || p.end - q.end || p.pitch - q.pitch);
    // a key can't sound twice at once: an earlier note ends where the next starts
    const last = new Map<number, Ev>();
    for (const e of all) { const l = last.get(e.pitch); if (l && l.end > e.start) l.end = e.start; last.set(e.pitch, e); }
    return all.filter((e) => e.start < e.end);
  }
}

/** piano notes with the sustain pedal folded in: a note released while the pedal is down rings until it comes up */
function withPedal(events: Ev[]): RawNote[] {
  const pedal = events.filter((e) => e.pitch === -64).map((e) => [e.start, e.end] as [number, number]);
  const notes = events.filter((e) => e.pitch > 0).map((e) => {
    const pd = pedal.find(([a, b]) => e.end >= a && e.end < b);
    return { s: e.start, e: e.end, p: e.pitch, v: velocityToLoudness(e.vel), h: pd ? pd[1] : e.end };
  });
  // a re-struck key cuts the pedal ring of the previous note
  const lastBy = new Map<number, RawNote>();
  for (const n of notes) { const l = lastBy.get(n.p); if (l && (l.h ?? l.e) > n.s) l.h = Math.max(l.e, n.s); lastBy.set(n.p, n); }
  return notes;
}
