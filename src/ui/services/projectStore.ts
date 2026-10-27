// Recent projects: saved automatically. Desktop app: the app's data folder; browser: local storage.
import type { CalibratedProject } from '../../engine/calibration';
import { serializeProject } from './saveProject';
import { inTauri } from './media';

export interface ProjectMeta {
  id: string;
  name: string;
  updated: number; // ms since epoch
  duration: number; // seconds
  width: number;
  height: number;
  thumb?: string; // small JPEG data URL
  video?: string; // file name
}

const LS_INDEX = 'pv.projects';
const lsKey = (id: string) => `pv.project.${id}`;

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  let metas: ProjectMeta[] = [];
  if (inTauri()) {
    const raw = await invoke<string[]>('list_projects');
    metas = raw.map((s) => { try { return JSON.parse(s) as ProjectMeta; } catch { return null; } }).filter((m): m is ProjectMeta => !!m);
  } else {
    try { metas = JSON.parse(localStorage.getItem(LS_INDEX) || '[]'); } catch { metas = []; }
  }
  return metas.sort((a, b) => b.updated - a.updated);
}

export async function saveToStore(p: CalibratedProject, thumb?: string): Promise<ProjectMeta> {
  if (!p.id) throw new Error('project has no id');
  const meta: ProjectMeta = {
    id: p.id, name: p.name, updated: Date.now(),
    duration: p.video.duration ?? p.video.frames / (p.video.fps || 30),
    width: p.video.width, height: p.video.height, thumb, video: p.video.file,
  };
  const json = serializeProject(p, p.video.file);
  if (inTauri()) {
    await invoke('save_project', { id: p.id, project: json, meta: JSON.stringify(meta) });
  } else {
    try {
      localStorage.setItem(lsKey(p.id), json);
      const idx = (await listProjects()).filter((m) => m.id !== p.id);
      localStorage.setItem(LS_INDEX, JSON.stringify([meta, ...idx]));
    } catch { /* storage full or unavailable: the project still works, it just isn't remembered */ }
  }
  return meta;
}

export async function loadFromStore(id: string): Promise<CalibratedProject> {
  const text = inTauri() ? await invoke<string>('load_project', { id }) : localStorage.getItem(lsKey(id));
  if (!text) throw new Error('This project could not be found.');
  return JSON.parse(text) as CalibratedProject;
}

export async function deleteFromStore(id: string) {
  if (inTauri()) await invoke('delete_project', { id });
  else {
    try {
      localStorage.removeItem(lsKey(id));
      localStorage.setItem(LS_INDEX, JSON.stringify((await listProjects()).filter((m) => m.id !== id)));
    } catch { /* ignore */ }
  }
}

export async function fileExists(path: string): Promise<boolean> {
  return inTauri() ? invoke<boolean>('file_exists', { path }) : false;
}

/** A small thumbnail of the current video frame (or of a rendered frame, when given a canvas). */
export function makeThumb(src: HTMLVideoElement | HTMLCanvasElement, w = 240): string | undefined {
  try {
    const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.width;
    const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
    if (!sw || !sh) return undefined;
    const c = document.createElement('canvas');
    c.width = w; c.height = Math.round((w * sh) / sw);
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  } catch {
    return undefined;
  }
}

export function ago(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'yesterday';
  const days = Math.round(s / 86400);
  return days < 14 ? `${days} days ago` : d.toLocaleDateString();
}

export function aspectLabel(w: number, h: number): string {
  const r = w / h;
  const known: [number, string][] = [[9 / 16, '9:16'], [16 / 9, '16:9'], [1, '1:1'], [4 / 5, '4:5'], [3 / 4, '3:4'], [4 / 3, '4:3']];
  for (const [v, l] of known) if (Math.abs(r - v) < 0.02) return l;
  return `${w}×${h}`;
}

export const fmtDur = (t: number) => {
  const m = Math.floor(t / 60);
  return `${m}:${Math.floor(t - m * 60).toString().padStart(2, '0')}`;
};
