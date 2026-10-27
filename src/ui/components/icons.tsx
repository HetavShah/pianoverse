// Every icon in the app comes from here: one set (Lucide, ISC licence), one size and one line weight, so they read as
// a family. Screens ask for an icon by what it stands for (a step, a Style panel, an action), never by its drawing,
// so changing an icon is a one-line change in this file.
import {
  Aperture, AudioLines, AudioWaveform, Crosshair, Download, Droplets, Film, FolderOpen, Image, Keyboard, LayoutGrid,
  Lightbulb, LucideIcon, Music2, Palette, Plus, RefreshCw, Save, Sparkles, Sun, Type, Upload, Video, Wand2, Zap,
} from 'lucide-react';

const ICONS = {
  // the steps
  import: Upload, video: Film, audio: AudioLines, calibrate: Crosshair, style: Palette, light: Sun, camera: Video, export: Download,
  // the Style panels
  looks: LayoutGrid, colors: Droplets, notes: Music2, saber: Wand2, impact: Zap, particles: Sparkles, lighting: Lightbulb,
  background: Image, finish: Aperture, titles: Type,
  // the Audio pages
  notesSync: Music2, sound: AudioWaveform,
  // actions
  newProject: Plus, openFile: FolderOpen, save: Save, update: RefreshCw, shortcuts: Keyboard,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export default function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const I = ICONS[name];
  return <I size={size} strokeWidth={1.75} className={'icon' + (className ? ' ' + className : '')} aria-hidden="true" />;
}
