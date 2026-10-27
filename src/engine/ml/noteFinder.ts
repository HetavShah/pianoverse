// Note finders: machine-learning models that listen to a recording and write down the notes played.
//
//   piano  Transkun 2.0, a piano transcription transformer (about 97% of notes right on piano)
//   any    Spotify's Basic Pitch, for any instrument (less exact on piano)
//
// The app only knows this interface and the factory below; each model lives in its own module, loaded the first
// time it is asked for, so the models' code and weights stay out of start-up.
import type { RawNote } from '../project';

export type NoteFinderId = 'piano' | 'any';

export interface NoteFinder {
  /** the audio it listens to: mono, at this many samples per second */
  readonly sampleRate: number;
  /** find the notes; onProgress gets 0..1 */
  find(audio: Float32Array, onProgress: (done: number) => void): Promise<RawNote[]>;
}

export interface NoteFinderOptions {
  /** Basic Pitch only: how sure the model must be that a note starts (0..1); lower finds more, quieter notes */
  sensitivity?: number;
}

/** Basic Pitch's default sensitivity (its onset threshold) */
export const DEFAULT_SENSITIVITY = 0.5;

/** Factory: the note finder for an id, with its model code loaded on first use. */
export async function createNoteFinder(id: NoteFinderId, opts: NoteFinderOptions = {}): Promise<NoteFinder> {
  if (id === 'piano') {
    const { TranskunFinder } = await import('./transkun');
    return new TranskunFinder();
  }
  const { BasicPitchFinder } = await import('./basicPitch');
  return new BasicPitchFinder({ onset: opts.sensitivity ?? DEFAULT_SENSITIVITY });
}
