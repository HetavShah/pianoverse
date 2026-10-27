// The .pianoverse project file: a ZIP container (like .docx or .sketch) holding the project and what it needs to
// open on another computer:
//
//   mimetype                   "application/vnd.pianoverse.project+zip" (first, uncompressed: identifies the file)
//   project.json               the project (the same JSON the app keeps internally)
//   thumbnail.jpg              the picture on its card, when there is one
//   assets/<id>/name.txt       your own textures, background images and shape drawings the project uses,
//   assets/<id>/<map>.<ext>    so they come along (the video itself stays where it is: it's too big)
//
// Files saved before this format (.pvproj.json, plain JSON) still open.
import { strFromU8, strToU8, unzipSync, zipSync, Zippable } from 'fflate';
import type { CalibratedProject } from '../../engine/calibration';
import { refreshTextures, restoreTexture, userTextureFiles } from './textureStore';

export const PROJECT_EXT = 'pianoverse';
export const PROJECT_MIME = 'application/vnd.pianoverse.project+zip';
/** extensions the Open dialog offers (the old JSON files too) */
export const PROJECT_EXTS = [PROJECT_EXT, 'json'];

const MAPS = ['color', 'video', 'normal', 'rough', 'metal'] as const;
const EXT_OF: Record<string, string> = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/bmp': 'bmp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
const MIME_OF: Record<string, string> = Object.fromEntries(Object.entries(EXT_OF).map(([m, e]) => [e, m]));

const r2 = (v: number) => Math.round(v * 100) / 100;

/** the project as JSON (calibration numbers rounded: a hundredth of a pixel is plenty) */
export function serializeProject(p: CalibratedProject, videoName: string): string {
  const cal = p.calibration;
  const out: CalibratedProject = {
    ...p,
    video: { ...p.video, file: videoName || p.video.file },
    calibration: cal && {
      ...cal,
      corners: cal.corners.map(([x, y]) => [r2(x), r2(y)]) as typeof cal.corners,
      raw: cal.raw?.map((row) => (row ? row.map(r2) : null)),
      quality: cal.quality?.map(r2),
    },
  };
  return JSON.stringify(out);
}

/** the user's own textures and drawings a project uses ('user:<id>' in its look and shape sections) */
export function userAssetIds(p: CalibratedProject): string[] {
  const keys = [p.look?.noteTexture, p.look?.bgImage, p.look?.partShape, ...(p.particleScenes ?? []).map((s) => s.shape)];
  return [...new Set(keys.filter((k): k is string => !!k && k.startsWith('user:')).map((k) => k.slice(5)))];
}

/** pack a project into a .pianoverse file */
export async function packProject(p: CalibratedProject, videoName: string, thumb?: string): Promise<Uint8Array> {
  const files: Zippable = {
    mimetype: [strToU8(PROJECT_MIME), { level: 0 }],
    'project.json': strToU8(serializeProject(p, videoName)),
  };
  const jpg = thumb && /^data:image\/jpeg;base64,/.test(thumb) ? Uint8Array.from(atob(thumb.split(',')[1]), (c) => c.charCodeAt(0)) : null;
  if (jpg) files['thumbnail.jpg'] = [jpg, { level: 0 }];
  const names = new Map((await refreshTextures().catch(() => [])).map((t) => [t.id, t.name]));
  for (const id of userAssetIds(p)) {
    const maps = await userTextureFiles(id).catch(() => null);
    if (!maps) continue;
    files[`assets/${id}/name.txt`] = strToU8(names.get(id) ?? id);
    for (const m of MAPS) {
      const b = maps[m];
      if (b) files[`assets/${id}/${m}.${EXT_OF[b.type] ?? 'png'}`] = [new Uint8Array(await b.arrayBuffer()), { level: m === 'video' ? 0 : 6 }];
    }
  }
  return zipSync(files);
}

/** is this a .pianoverse container (a ZIP) rather than an older JSON project? */
export const isPackage = (bytes: Uint8Array) => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

/** read a project file (container or older JSON); the textures it carries are added to the library */
export async function unpackProject(bytes: Uint8Array): Promise<CalibratedProject> {
  if (!isPackage(bytes)) return parseProject(new TextDecoder().decode(bytes));
  const z = unzipSync(bytes);
  if (z.mimetype && strFromU8(z.mimetype) !== PROJECT_MIME) throw new Error('This isn\'t a Pianoverse project file.');
  if (!z['project.json']) throw new Error('This project file is damaged (it has no project in it).');
  const project = parseProject(strFromU8(z['project.json']));
  // your own textures and drawings: added to the library under the same id, unless already there
  const ids = new Set(Object.keys(z).filter((k) => k.startsWith('assets/')).map((k) => k.split('/')[1]));
  for (const id of ids) {
    const files: Partial<Record<(typeof MAPS)[number], Blob>> = {};
    for (const m of MAPS) {
      const key = Object.keys(z).find((k) => k.startsWith(`assets/${id}/${m}.`));
      if (key) { const ext = key.split('.').pop()!; files[m] = new Blob([z[key]], { type: MIME_OF[ext] ?? 'application/octet-stream' }); }
    }
    const name = z[`assets/${id}/name.txt`] ? strFromU8(z[`assets/${id}/name.txt`]) : id;
    await restoreTexture(id, name, files);
  }
  return project;
}

function parseProject(text: string): CalibratedProject {
  const data = JSON.parse(text) as CalibratedProject;
  if (data.format !== 'pianoverse-project') throw new Error('Not a Pianoverse project file.');
  return data;
}

/** a file name for the project: its name, made safe for Windows */
export const projectFileName = (p: CalibratedProject) => `${(p.name || 'project').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'project'}.${PROJECT_EXT}`;
