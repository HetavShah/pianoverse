// Note detection from audio with Spotify's basic-pitch model (the same model the original sample used).
import { addPitchBendsToNoteEvents, BasicPitch, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import type { RawNote } from './project';

import { DEFAULT_DETECT, DETECT_RATE, DetectOptions } from './detectConfig';

/** model: a URL to model.json, or an already loaded tf.GraphModel promise */
export async function detectNotes(
  audio: Float32Array,
  model: ConstructorParameters<typeof BasicPitch>[0],
  onProgress: (pct: number) => void,
  opts: DetectOptions = DEFAULT_DETECT,
): Promise<RawNote[]> {
  const bp = new BasicPitch(model);
  const frames: number[][] = [], onsets: number[][] = [], contours: number[][] = [];
  await bp.evaluateModel(audio, (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); }, onProgress);
  const minFrames = Math.max(1, Math.round((opts.minMs / 1000) * (DETECT_RATE / 256)));
  const events = noteFramesToTime(addPitchBendsToNoteEvents(contours, outputToNotesPoly(frames, onsets, opts.onset, opts.frame, minFrames)));
  return events
    .map((n) => ({ s: n.startTimeSeconds, e: n.startTimeSeconds + n.durationSeconds, p: n.pitchMidi, v: n.amplitude }))
    .sort((a, b) => a.s - b.s || a.p - b.p);
}
