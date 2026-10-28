// What every step screen gets from the app shell.
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CalibratedProject } from '../../engine/calibration';
import type { Layers, Renderer } from '../../engine/render';
import type { ConvertProgress, PickedVideo, PickKind } from '../services/media';
import type { useCalibration } from '../calibrate/useCalibration';
import type { useNotes } from '../notes/useNotes';

export type Step = 'import' | 'video' | 'audio' | 'calibrate' | 'style' | 'light' | 'camera' | 'export';
/** the first FLOW_STEPS are done in order; the rest are rooms visited in any order */
export const FLOW_STEPS = 4;
export const STEPS: { id: Step; label: string }[] = [
  { id: 'import', label: 'Import' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'calibrate', label: 'Calibrate' },
  { id: 'style', label: 'Style' },
  { id: 'light', label: 'Light' },
  { id: 'camera', label: 'Camera' },
  { id: 'export', label: 'Export' },
];

export type VideoIssue =
  | { kind: 'unsupported' }
  | { kind: 'converting'; progress: ConvertProgress | null }
  | { kind: 'error'; message: string }
  | { kind: 'missing' };

/** an export in progress: the workspace is locked meanwhile (ui/export/ExportStep.tsx) */
export interface Exporting { done: number; total: number }

export interface WS {
  /** an export is running: nothing else may change the project, the video or the renderer */
  exporting: Exporting | null;
  setExporting: (e: Exporting | null) => void;
  project: CalibratedProject | null;
  setProject: (p: CalibratedProject, opts?: import('./history').RecordOpts) => void;
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
  presets: import('../../engine/look').Preset[];
  defaultPresetId: string;
  refreshPresets: () => Promise<void>;
  goStep: (s: Step) => void;
  /** the brand kit (name, handle, logo) used by the cards */
  brand: import('../../engine/titles').Brand;
  setBrand: (b: import('../../engine/titles').Brand) => void;
  /** zoomed in on the preview: the part of the video shown (null = all of it) */
  inspect: import('../../engine/render').View | null;
  setInspect: (v: import('../../engine/render').View | null) => void;
  goHome: () => void;
  /** draw the preview again (after changing something on the renderer directly) */
  redraw: () => void;
  /** the live sound (Audio → Sound) */
  sound: ReturnType<typeof import('./useSound').useSound>;
}
