// Saved looks. Built-in presets ship with the app; yours are stored beside your projects.
import { BUILT_IN_PRESETS, Look, Preset } from '../../engine/look';
import { inTauri } from './media';
import { Brand, DEFAULT_BRAND } from '../../engine/titles';

// the brand kit rides along in the same file (no new storage on disk)
interface PresetFile { presets: Preset[]; defaultId?: string; brand?: Partial<Brand> }
const LS = 'pv.presets';

async function readFile(): Promise<PresetFile> {
  try {
    if (inTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const f = JSON.parse(await invoke<string>('load_presets')) as Partial<PresetFile>;
      return { presets: f.presets ?? [], defaultId: f.defaultId, brand: f.brand };
    }
    const f = JSON.parse(localStorage.getItem(LS) || '{}') as Partial<PresetFile>;
    return { presets: f.presets ?? [], defaultId: f.defaultId, brand: f.brand };
  } catch {
    return { presets: [] };
  }
}

async function writeFile(f: PresetFile) {
  const json = JSON.stringify(f);
  if (inTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('save_presets', { json });
  } else {
    try { localStorage.setItem(LS, json); } catch { /* per-browser convenience only */ }
  }
}

export async function loadPresets(): Promise<{ presets: Preset[]; defaultId: string }> {
  const f = await readFile();
  return { presets: [...BUILT_IN_PRESETS, ...f.presets], defaultId: f.defaultId ?? BUILT_IN_PRESETS[0].id };
}

export async function savePreset(name: string, look: Partial<Look>, id?: string): Promise<Preset> {
  const f = await readFile();
  const p: Preset = { id: id ?? `user-${Date.now().toString(36)}`, name: name.trim() || 'My look', look };
  const i = f.presets.findIndex((x) => x.id === p.id);
  if (i >= 0) f.presets[i] = p; else f.presets.push(p);
  await writeFile(f);
  return p;
}

export async function deletePreset(id: string) {
  const f = await readFile();
  f.presets = f.presets.filter((p) => p.id !== id);
  if (f.defaultId === id) f.defaultId = undefined;
  await writeFile(f);
}

export async function loadBrand(): Promise<Brand> {
  const f = await readFile();
  return { ...DEFAULT_BRAND, ...(f.brand ?? {}) };
}

export async function saveBrand(b: Brand) {
  const f = await readFile();
  f.brand = b;
  await writeFile(f);
}

export async function setDefaultPreset(id: string) {
  const f = await readFile();
  f.defaultId = id;
  await writeFile(f);
}
