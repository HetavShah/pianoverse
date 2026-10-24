// Opening videos and projects. In the desktop app files are picked with the native dialog (so we know
// their paths and can convert them); in a plain browser the usual file inputs are used.

export const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface PickedVideo { kind: 'video'; name: string; url: string; path?: string }
export interface PickedProject { kind: 'project'; name: string; text: string }
export interface PickedMidi { kind: 'midi'; name: string; data: ArrayBuffer }
export type Picked = PickedVideo | PickedProject | PickedMidi;

const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv'];
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const isVideoName = (n: string) => VIDEO_EXT.includes(n.toLowerCase().split('.').pop() ?? '');
export const isProjectName = (n: string) => n.toLowerCase().endsWith('.json');
export const isMidiName = (n: string) => /\.(mid|midi)$/i.test(n);

async function videoFromPath(path: string): Promise<PickedVideo> {
  const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
  await invoke('allow_media', { path });
  return { kind: 'video', name: baseName(path), url: convertFileSrc(path), path };
}

async function midiFromPath(path: string): Promise<PickedMidi> {
  const { invoke } = await import('@tauri-apps/api/core');
  const data = await invoke<ArrayBuffer>('read_file_bytes', { path });
  return { kind: 'midi', name: baseName(path), data };
}

async function projectFromPath(path: string): Promise<PickedProject> {
  const { invoke } = await import('@tauri-apps/api/core');
  return { kind: 'project', name: baseName(path), text: await invoke<string>('read_text_file', { path }) };
}

/** Turn file paths (from the dialog or a drop) into opened items. */
export async function openPaths(paths: string[]): Promise<Picked[]> {
  const out: Picked[] = [];
  for (const p of paths) {
    if (isProjectName(p)) out.push(await projectFromPath(p));
    else if (isMidiName(p)) out.push(await midiFromPath(p));
    else if (isVideoName(p)) out.push(await videoFromPath(p));
  }
  return out;
}

/** Native open dialog. what: which kinds of files to offer. Returns [] if cancelled. */
export type PickKind = 'video' | 'project' | 'midi' | 'any';

export async function pickNative(what: PickKind): Promise<Picked[]> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const filters = what === 'video'
    ? [{ name: 'Video', extensions: VIDEO_EXT }]
    : what === 'project'
      ? [{ name: 'Pianoverse project', extensions: ['json'] }]
      : what === 'midi'
        ? [{ name: 'MIDI file', extensions: ['mid', 'midi'] }]
        : [{ name: 'Video, project or MIDI', extensions: [...VIDEO_EXT, 'json', 'mid', 'midi'] }];
  const res = await open({ multiple: what === 'any', directory: false, filters });
  if (!res) return [];
  return openPaths(Array.isArray(res) ? res : [res]);
}

/** Files from an <input type=file> or an HTML drop (browser only). */
export async function openFiles(files: File[]): Promise<Picked[]> {
  const out: Picked[] = [];
  for (const f of files) {
    if (isProjectName(f.name)) out.push({ kind: 'project', name: f.name, text: await f.text() });
    else if (isMidiName(f.name)) out.push({ kind: 'midi', name: f.name, data: await f.arrayBuffer() });
    else if (f.type.startsWith('video/') || isVideoName(f.name)) out.push({ kind: 'video', name: f.name, url: URL.createObjectURL(f) });
  }
  return out;
}

/** Native drag and drop in the desktop app. Returns an unsubscribe function. */
export async function onNativeDrop(cb: (items: Picked[]) => void): Promise<() => void> {
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  return getCurrentWebview().onDragDropEvent((ev) => {
    if (ev.payload.type === 'drop') openPaths(ev.payload.paths).then(cb).catch((e) => alert(String(e?.message ?? e)));
  });
}

export interface ConvertProgress { phase: 'download' | 'convert'; done: number; total: number; detail: string }

/** Make an H.264 editing copy of a video the player can't decode. Resolves to the copy. */
export async function convertVideo(source: PickedVideo, onProgress: (p: ConvertProgress) => void): Promise<PickedVideo> {
  if (!source.path) throw new Error('This video can only be converted in the desktop app.');
  const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  const un = await listen<ConvertProgress>('media-progress', (e) => onProgress(e.payload));
  try {
    const out = await invoke<string>('convert_video', { path: source.path });
    return { kind: 'video', name: source.name, url: convertFileSrc(out), path: out };
  } finally {
    un();
  }
}

export async function converterReady(): Promise<boolean> {
  if (!inTauri()) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('converter_ready');
}
