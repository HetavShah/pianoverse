// The user's own note textures. In the desktop app they live in the app's texture library on disk
// (imported with the normal / roughness / metalness maps that sit next to the picked image);
// in a plain browser they are kept for this session only.
import { useEffect, useState } from 'react';
import { inTauri } from './media';

export interface UserTexture { id: string; name: string; files: Partial<Record<'color' | 'video' | 'normal' | 'rough' | 'metal', string>> }

type Maps = { color?: Blob; video?: Blob; normal?: Blob; rough?: Blob; metal?: Blob };
const memory = new Map<string, { tex: UserTexture; blobs: Maps }>(); // browser-only textures
const blobCache = new Map<string, Maps>();
let list: UserTexture[] = [];
const listeners = new Set<(l: UserTexture[]) => void>();
const emit = () => listeners.forEach((f) => f(list));

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp'];
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v'];
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

export async function refreshTextures(): Promise<UserTexture[]> {
  if (inTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    list = await invoke<UserTexture[]>('list_textures');
  } else {
    list = [...memory.values()].map((m) => m.tex);
  }
  emit();
  return list;
}

/** pick an image and add it to the library; returns the new texture (or null if cancelled) */
export async function importTexture(): Promise<UserTexture | null> {
  if (inTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const res = await open({ multiple: false, directory: false, filters: [{ name: 'Texture image or video', extensions: [...IMAGE_EXT, ...VIDEO_EXT] }] });
    if (!res || Array.isArray(res)) return null;
    const { invoke } = await import('@tauri-apps/api/core');
    const tex = await invoke<UserTexture>('import_texture', { path: res });
    await refreshTextures();
    return tex;
  }
  const file = await new Promise<File | null>((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*,video/*';
    inp.onchange = () => resolve(inp.files?.[0] ?? null);
    inp.click();
  });
  return file ? addBrowserTexture(file) : null;
}

/** browser / tests: add an image File as a texture for this session */
export async function addBrowserTexture(file: Blob & { name?: string }): Promise<UserTexture> {
  const id = 'b' + Date.now().toString(36);
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name ?? '');
  const name = (file.name ?? 'Texture').replace(/\.[a-z0-9]+$/i, '').replace(/[_-](color|albedo|basecolor|diffuse)$/i, '').replace(/_/g, ' ');
  const tex: UserTexture = { id, name, files: isVideo ? { video: URL.createObjectURL(file) } : { color: URL.createObjectURL(file) } };
  memory.set(id, { tex, blobs: isVideo ? { video: file } : { color: file } });
  await refreshTextures();
  return tex;
}

export async function deleteTexture(id: string) {
  if (inTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('delete_texture', { id });
  } else {
    memory.delete(id);
  }
  blobCache.delete(id);
  await refreshTextures();
}

async function readBlob(path: string): Promise<Blob> {
  const { invoke } = await import('@tauri-apps/api/core');
  const data = await invoke<ArrayBuffer>('read_file_bytes', { path });
  return new Blob([data], { type: MIME[path.split('.').pop()?.toLowerCase() ?? 'png'] ?? 'image/png' });
}

/** the renderer's loader for 'user:<id>' textures */
export async function userTextureFiles(id: string): Promise<Maps | null> {
  if (blobCache.has(id)) return blobCache.get(id)!;
  if (!inTauri()) return memory.get(id)?.blobs ?? null;
  let tex = list.find((t) => t.id === id);
  if (!tex) tex = (await refreshTextures()).find((t) => t.id === id);
  if (!tex || !(tex.files.color || tex.files.video)) return null;
  const f = tex.files;
  const [color, video, normal, rough, metal] = await Promise.all([f.color, f.video, f.normal, f.rough, f.metal].map((p) => (p ? readBlob(p) : Promise.resolve(undefined))));
  const maps: Maps = { color, video, normal, rough, metal };
  blobCache.set(id, maps);
  return maps;
}

/** a small preview image URL for the picker */
const thumbs = new Map<string, string>();
export async function textureThumb(t: UserTexture): Promise<string> {
  if (thumbs.has(t.id)) return thumbs.get(t.id)!;
  const maps = await userTextureFiles(t.id);
  let url = '';
  if (maps?.color) url = URL.createObjectURL(maps.color);
  else if (maps?.video) url = await videoThumb(maps.video);
  thumbs.set(t.id, url);
  return url;
}

export function useUserTextures(): UserTexture[] {
  const [l, setL] = useState(list);
  useEffect(() => {
    listeners.add(setL);
    refreshTextures().catch(() => {});
    return () => { listeners.delete(setL); };
  }, []);
  return l;
}

/** a still from a video texture, for the picker */
async function videoThumb(b: Blob): Promise<string> {
  const v = document.createElement('video');
  v.muted = true; v.src = URL.createObjectURL(b);
  await new Promise<void>((res) => { v.onloadeddata = () => res(); v.onerror = () => res(); setTimeout(res, 5000); });
  if (v.duration > 0.6) { v.currentTime = 0.5; await new Promise<void>((res) => { v.onseeked = () => res(); setTimeout(res, 3000); }); }
  const c = document.createElement('canvas'); c.width = 96; c.height = 96;
  const s = Math.min(v.videoWidth, v.videoHeight) || 1;
  c.getContext('2d')?.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, 96, 96);
  return c.toDataURL('image/jpeg', 0.85);
}
