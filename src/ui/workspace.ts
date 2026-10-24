// What every step screen gets from the app shell.
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CalibratedProject } from '../engine/calibration';
import type { Layers, Renderer } from '../engine/renderer';
import type { ConvertProgress, PickedVideo, PickKind } from './media';
import type { useCalibration } from './useCalibration';
import type { useNotes } from './useNotes';

export type Step = 'import' | 'notes' | 'calibrate' | 'style' | 'export';
export const STEPS: { id: Step; label: string }[] = [
  { id: 'import', label: 'Import' },
  { id: 'notes', label: 'Notes and sync' },
  { id: 'calibrate', label: 'Calibrate' },
  { id: 'style', label: 'Style' },
  { id: 'export', label: 'Export' },
];

export type VideoIssue =
  | { kind: 'unsupported' }
  | { kind: 'converting'; progress: ConvertProgress | null }
  | { kind: 'error'; message: string }
  | { kind: 'missing' };

export interface WS {
  project: CalibratedProject | null;
  setProject: (p: CalibratedProject) => void;
  video: PickedVideo | null;
  videoEl: MutableRefObject<HTMLVideoElement | null>;
  videoIssue: VideoIssue | null;
  convert: () => void;
  time: number;
  duration: number;
  playing: boolean;
  togglePlay: () => void;
  seek: (t: number) => void;
  frameTick: number;
  calib: ReturnType<typeof useCalibration>;
  notes: ReturnType<typeof useNotes>;
  renderer: Renderer | null;
  layers: Layers;
  setLayers: Dispatch<SetStateAction<Layers>>;
  scale: number;
  setScale: (s: number) => void;
  sweep: boolean;
  setSweep: (v: boolean) => void;
  pick: (k: PickKind) => void;
  onFiles: (f: FileList | null) => void;
  /** loop playback: a selected section (seconds) or, without one, the whole video */
  loop: { on: boolean; range: [number, number] | null };
  setLoop: (l: { on: boolean; range: [number, number] | null }) => void;
  goStep: (s: Step) => void;
  goHome: () => void;
}
