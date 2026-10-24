// Save the project as a .pvproj.json file: native save dialog in the app, a download in a plain browser.
import type { CalibratedProject } from '../engine/calibration';

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const r2 = (v: number) => Math.round(v * 100) / 100;

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

/** Returns where it was saved, or null if the user cancelled. */
export async function saveProject(p: CalibratedProject, videoName: string): Promise<string | null> {
  const json = serializeProject(p, videoName);
  const fileName = `${(p.name || 'project').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.pvproj.json`;
  if (inTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await save({ defaultPath: fileName, filters: [{ name: 'Pianoverse project', extensions: ['json'] }] });
    if (!path) return null;
    await invoke('write_text_file', { path, contents: json });
    return path;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return fileName;
}
