// In-memory stand-in for the texture library (ui/services/textureStore.ts), for unit tests.
type Maps = { color?: Blob; video?: Blob; normal?: Blob; rough?: Blob; metal?: Blob };
export const library = new Map<string, { name: string; files: Maps }>();
export async function refreshTextures() { return [...library].map(([id, t]) => ({ id, name: t.name, files: {} })); }
export async function userTextureFiles(id: string) { return library.get(id)?.files ?? null; }
export async function restoreTexture(id: string, name: string, files: Maps) { if (!library.has(id)) library.set(id, { name, files }); }
