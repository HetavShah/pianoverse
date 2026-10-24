// The user's own note textures. In the desktop app they live in the app's texture library on disk
// (imported with the normal / roughness / metalness maps that sit next to the picked image);
// in a plain browser they are kept for this session only.
import { useEffect, useState } from 'react';
import { inTauri } from './media';

export interface UserTexture { id: string; name: string; files: Partial<Record<'color' | 'normal' | 'rough' | 'metal', string>> }

type Maps = { color: Blob; normal?: Blob; rough?: Blob; metal?: Blob };
const memory = new Map<string, { tex: UserTexture; blobs: Maps }>(); // browser-only textures
const blobCache = new Map<string, Maps>();
let list: UserTexture[] = [];
const listeners = new Set<(l: UserTexture[]) => void>();
const emit = () => listeners.forEach((f) => f(list));

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp'];
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' };

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
    const res = await open({ multiple: false, directory: false, filters: [{ name: 'Texture image', extensions: IMAGE_EXT }] });
    if (!res || Array.isArray(res)) return null;
    const { invoke } = await import('@tauri-apps/api/core');
    const tex = await invoke<UserTexture>('import_texture', { path: res });
    await refreshTextures();
    return tex;
  }
  const file = await new Promise<File | null>((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => resolve(inp.files?.[0] ?? null);
    inp.click();
  });
  return file ? addBrowserTexture(file) : null;
}

/** browser / tests: add an image File as a texture for this session */
export async function addBrowserTexture(file: Blob & { name?: string }): Promise<UserTexture> {
  const id = 'b' + Date.now().toString(36);
  const tex: UserTexture = { id, name: (file.name ?? 'Texture').replace(/\.[a-z0-9]+$/i, '').replace(/[_-](color|albedo|basecolor|diffuse)$/i, '').replace(/_/g, ' '), files: { color: URL.createObjectURL(file) } };
  memory.set(id, { tex, blobs: { color: file } });
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
  if (!tex?.files.color) return null;
  const f = tex.files;
  const [color, normal, rough, metal] = await Promise.all([f.color, f.normal, f.rough, f.metal].map((p) => (p ? readBlob(p) : Promise.resolve(undefined))));
  const maps: Maps = { color: color!, normal, rough, metal };
  blobCache.set(id, maps);
  return maps;
}

/** a small preview image URL for the picker */
const thumbs = new Map<string, string>();
export async function textureThumb(t: UserTexture): Promise<string> {
  if (thumbs.has(t.id)) return thumbs.get(t.id)!;
  const maps = await userTextureFiles(t.id);
  const url = maps ? URL.createObjectURL(maps.color) : '';
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
