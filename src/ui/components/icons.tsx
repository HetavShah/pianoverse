// Every icon in the app comes from here: one set (Lucide, ISC licence), one size and one line weight, so they read as
// a family. Screens ask for an icon by what it stands for (a step, a Style panel, an action), never by its drawing,
// so changing an icon is a one-line change in this file.
import {
  Aperture, ArrowLeft, ArrowLeftToLine, ArrowRightToLine, AudioLines, AudioWaveform, Columns2, Crop, Crosshair, Download,
  Droplets, Eraser, Eye, FileMusic, Film, FolderOpen, Headphones, Image, ImageDown, Keyboard, LayoutGrid, Lightbulb,
  LocateFixed, LucideIcon, Maximize2, Music2, Palette, Pause, Play, Plus, RefreshCw, Repeat, Replace, RotateCcw, RotateCw,
  Save, Scissors, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Star, Sun, Trash2, Type, Upload, Video, Wand2, X, Zap, ZoomIn, ZoomOut,
} from 'lucide-react';

const ICONS = {
  // the steps
  import: Upload, video: Film, audio: AudioLines, calibrate: Crosshair, style: Palette, light: Sun, camera: Video, export: Download,
  // the Style panels
  looks: LayoutGrid, colors: Droplets, notes: Music2, saber: Wand2, impact: Zap, particles: Sparkles, lighting: Lightbulb,
  background: Image, finish: Aperture, titles: Type,
  // the Audio pages
  notesSync: Music2, sound: AudioWaveform,
  // playback
  play: Play, pause: Pause, toStart: SkipBack, toEnd: SkipForward, loop: Repeat, zoomIn: ZoomIn, zoomOut: ZoomOut, fit: Maximize2, follow: LocateFixed,
  // actions
  newProject: Plus, openFile: FolderOpen, save: Save, update: RefreshCw, shortcuts: Keyboard,
  reset: RotateCcw, remove: Trash2, clear: Eraser, replace: Replace, folder: FolderOpen, saveImage: ImageDown, back: ArrowLeft,
  cancel: X, settings: SlidersHorizontal, midiFile: FileMusic, detect: Wand2, compareVideo: Columns2, compareSound: Headphones,
  trimStart: ArrowLeftToLine, trimEnd: ArrowRightToLine, crop: Crop, cut: Scissors, auto: Wand2, clockwise: RotateCw,
  anticlockwise: RotateCcw, show: Eye, favourite: Star, convert: RefreshCw,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export default function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const I = ICONS[name];
  return <I size={size} strokeWidth={1.75} className={'icon' + (className ? ' ' + className : '')} aria-hidden="true" />;
}
