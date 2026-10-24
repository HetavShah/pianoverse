// Settings shared with the note detector, kept apart so the model code loads only when detection runs.
export const DETECT_RATE = 22050; // basic-pitch expects mono audio at 22.05 kHz

export interface DetectOptions {
  /** how sure the model must be that a note starts (0..1); lower finds more, quieter notes */
  onset: number;
  /** how sure it must be that a note continues (0..1) */
  frame: number;
  /** shortest note kept, milliseconds */
  minMs: number;
}
export const DEFAULT_DETECT: DetectOptions = { onset: 0.5, frame: 0.3, minMs: 128 };
