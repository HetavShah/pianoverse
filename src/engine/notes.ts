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
}

/** MIDI velocity 1..127 -> the 0..1 loudness scale the renderer uses (detected notes use the same scale) */
export const velocityToLoudness = (vel127: number) => 0.3 + 0.3 * Math.min(1, Math.max(0, (vel127 - 30) / 80));

export interface MidiInfo { notes: RawNote[]; tracks: number; skippedDrums: number; duration: number; name: string; sustain: boolean }

export function parseMidi(data: ArrayBuffer | Uint8Array, name = ''): MidiInfo {
  const midi = new Midi(data instanceof Uint8Array ? data : new Uint8Array(data));
  const notes: RawNote[] = [];
  let skippedDrums = 0, sustain = false;
  for (const tr of midi.tracks) {
    if ((tr.controlChanges?.[64] ?? []).some((c) => c.value >= 0.5)) sustain = true;
    const drums = tr.channel === 9 || tr.instrument?.percussion;
    for (const n of tr.notes) {
      if (drums) { skippedDrums++; continue; }
      notes.push({ s: n.time, e: n.time + Math.max(0.03, n.duration), p: n.midi, v: velocityToLoudness(Math.round(n.velocity * 127)) });
    }
  }
  notes.sort((a, b) => a.s - b.s || a.p - b.p);
  return { notes, tracks: midi.tracks.filter((t) => t.notes.length).length, skippedDrums, duration: midi.duration, name, sustain };
}

/** Notes placed on the video's timeline. */
export function placeNotes(src: NoteSource): RawNote[] {
  const o = src.offset, tp = 12 * (src.transpose ?? 0);
  return src.notes.map((n) => ({ s: n.s + o, e: n.e + o, p: n.p + tp, v: n.v }));
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
