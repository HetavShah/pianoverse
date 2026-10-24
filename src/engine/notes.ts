// Note sources: MIDI files, and how notes in MIDI time map to video time.
import { Midi } from '@tonejs/midi';
import type { RawNote } from './project';

export interface NoteSource {
  kind: 'midi' | 'audio';
  /** file name (MIDI) or a description (audio detection) */
  name: string;
  /** notes in the source's own clock, seconds */
  notes: RawNote[];
  /** video time = source time + offset (seconds) */
  offset: number;
  /** how sure automatic alignment was, 0..1 (undefined = not run) */
  confidence?: number;
  /** octaves to shift every note by (shown as "Transpose") */
  transpose?: number;
  /** the MIDI file used the sustain pedal */
  sustain?: boolean;
  /** start of every bar, in the source's clock (MIDI files) */
  bars?: number[];
  /** how many tracks / channels the notes use (MIDI files) */
  tracks?: number; channels?: number;
}

/** MIDI velocity 1..127 -> the 0..1 loudness scale the renderer uses (detected notes use the same scale) */
export const velocityToLoudness = (vel127: number) => 0.3 + 0.3 * Math.min(1, Math.max(0, (vel127 - 30) / 80));

export interface MidiInfo { notes: RawNote[]; tracks: number; skippedDrums: number; duration: number; name: string; sustain: boolean; bars: number[]; channels: number }

export function parseMidi(data: ArrayBuffer | Uint8Array, name = ''): MidiInfo {
  const midi = new Midi(data instanceof Uint8Array ? data : new Uint8Array(data));
  const notes: RawNote[] = [];
  let skippedDrums = 0, sustain = false;
  const trackIds = new Map<number, number>(), chans = new Set<number>();
  midi.tracks.forEach((tr, ti) => {
    const drums = tr.channel === 9 || tr.instrument?.percussion;
    // sustain pedal: periods where CC64 is down
    const pedal: [number, number][] = [];
    let down: number | null = null;
    for (const c of tr.controlChanges?.[64] ?? []) {
      if (c.value >= 0.5 && down === null) down = c.time;
      else if (c.value < 0.5 && down !== null) { pedal.push([down, c.time]); down = null; }
    }
    if (down !== null) pedal.push([down, midi.duration]);
    if (pedal.length) sustain = true;
    for (const n of tr.notes) {
      if (drums) { skippedDrums++; continue; }
      if (!trackIds.has(ti)) trackIds.set(ti, trackIds.size);
      chans.add(tr.channel);
      const e = n.time + Math.max(0.03, n.duration);
      // held by the pedal: the note rings until the pedal comes up (or the same key is played again)
      const pd = pedal.find(([a, b]) => e >= a && e < b);
      notes.push({ s: n.time, e, p: n.midi, v: velocityToLoudness(Math.round(n.velocity * 127)), h: pd ? pd[1] : e, k: trackIds.get(ti)!, c: tr.channel });
    }
  });
  notes.sort((a, b) => a.s - b.s || a.p - b.p);
  // a re-struck key cuts the pedal-held ring of the previous note
  const lastByPitch = new Map<number, RawNote>();
  for (const n of notes) { const prev = lastByPitch.get(n.p); if (prev && prev.h! > n.s) prev.h = Math.max(prev.e, n.s); lastByPitch.set(n.p, n); }
  // bar lines from the tempo map and time signatures
  const bars: number[] = [];
  const ppq = midi.header.ppq || 480;
  const sigs = (midi.header.timeSignatures.length ? midi.header.timeSignatures : [{ ticks: 0, timeSignature: [4, 4] }])
    .map((t) => ({ ticks: t.ticks, len: Math.round(ppq * 4 * (t.timeSignature[0] / t.timeSignature[1])) }));
  const endTicks = midi.durationTicks;
  for (let si = 0; si < sigs.length; si++) {
    const until = si + 1 < sigs.length ? sigs[si + 1].ticks : endTicks + 1;
    for (let tk = sigs[si].ticks; tk < until && bars.length < 5000; tk += Math.max(1, sigs[si].len)) bars.push(midi.header.ticksToSeconds(tk));
  }
  return { notes, tracks: trackIds.size, skippedDrums, duration: midi.duration, name, sustain, bars, channels: chans.size };
}

/** Notes placed on the video's timeline. */
export function placeNotes(src: NoteSource): RawNote[] {
  const o = src.offset, tp = 12 * (src.transpose ?? 0);
  return src.notes.map((n) => ({ ...n, s: n.s + o, e: n.e + o, h: n.h !== undefined ? n.h + o : undefined, p: n.p + tp }));
}

/** How many notes fall outside the keyboard's range (they would not be drawn). */
export function outOfRange(notes: RawNote[], lowest: number, keys: number) {
  let below = 0, above = 0;
  for (const n of notes) {
    if (n.p < lowest) below++;
    else if (n.p > lowest + keys - 1) above++;
  }
  return { below, above };
}

/** Lowest and highest pitch, or null when there are no notes. */
export function pitchRange(notes: RawNote[]): [number, number] | null {
  if (!notes.length) return null;
  let lo = 127, hi = 0;
  for (const n of notes) { if (n.p < lo) lo = n.p; if (n.p > hi) hi = n.p; }
  return [lo, hi];
}
