// "Save project file…": the project as a .pianoverse file (see projectFile.ts), through the native save dialog in
// the app or as a download in a plain browser.
import type { CalibratedProject } from '../../engine/calibration';
import { inTauri } from './media';
import { packProject, PROJECT_EXT, projectFileName } from './projectFile';
import { listProjects } from './projectStore';

/** Returns where it was saved, or null if the user cancelled. */
export async function saveProject(p: CalibratedProject, videoName: string): Promise<string | null> {
  const thumb = p.id ? (await listProjects().catch(() => [])).find((m) => m.id === p.id)?.thumb : undefined;
  const bytes = await packProject(p, videoName, thumb);
  const fileName = projectFileName(p);
  if (inTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await save({ defaultPath: fileName, filters: [{ name: 'Pianoverse project', extensions: [PROJECT_EXT] }] });
    if (!path) return null;
    await invoke('write_file_bytes', bytes, { headers: { path: encodeURIComponent(path) } });
    return path;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.pianoverse.project+zip' }));
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  // the link stays a moment: removing it at once can lose the file name
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 5000);
  return fileName;
}
