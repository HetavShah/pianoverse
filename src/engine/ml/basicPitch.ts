// "Any instrument" note finder: Spotify's Basic Pitch (Apache 2.0), a small convolutional model run with
// TensorFlow.js. It gives, for every 11.6 ms frame and key, how likely a note starts, sounds and bends; the library's
// own post-processing turns that into notes.
import { addPitchBendsToNoteEvents, BasicPitch, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import type { RawNote } from '../project';
import type { NoteFinder } from './noteFinder';

/** Basic Pitch listens to mono audio at 22.05 kHz */
export const BASIC_PITCH_RATE = 22050;
const MODEL_URL = '/models/basic-pitch/model.json';

export interface BasicPitchOptions {
  /** how sure the model must be that a note starts (0..1); lower finds more, quieter notes */
  onset: number;
  /** how sure it must be that a note continues (0..1) */
  frame: number;
  /** shortest note kept, milliseconds */
  minMs: number;
}

export class BasicPitchFinder implements NoteFinder {
  readonly sampleRate = BASIC_PITCH_RATE;
  private opts: BasicPitchOptions;
  constructor(opts: Partial<BasicPitchOptions> = {}) {
    this.opts = { onset: 0.5, frame: 0.3, minMs: 128, ...opts };
  }

  async find(audio: Float32Array, onProgress: (done: number) => void): Promise<RawNote[]> {
    const bp = new BasicPitch(MODEL_URL);
    const frames: number[][] = [], onsets: number[][] = [], contours: number[][] = [];
    await bp.evaluateModel(audio, (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); }, onProgress);
    const minFrames = Math.max(1, Math.round((this.opts.minMs / 1000) * (BASIC_PITCH_RATE / 256)));
    const events = noteFramesToTime(addPitchBendsToNoteEvents(contours, outputToNotesPoly(frames, onsets, this.opts.onset, this.opts.frame, minFrames)));
    return events
      .map((n) => ({ s: n.startTimeSeconds, e: n.startTimeSeconds + n.durationSeconds, p: n.pitchMidi, v: n.amplitude }))
      .sort((a, b) => a.s - b.s || a.p - b.p);
  }
}
