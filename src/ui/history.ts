// Undo and redo for the open project.
// Every edit goes through `record`. Quick runs of edits (a slider drag, typing a name) become one step:
// a step stays open until the pointer is released or nothing has changed for a moment.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalibratedProject } from '../engine/calibration';

type P = CalibratedProject;
export interface RecordOpts {
  /** part of the step before it (e.g. the automatic sync that follows a MIDI import) */
  merge?: boolean;
  /** filled in automatically (e.g. the default export file name): applies, but is never an undo step */
  silent?: boolean;
}

const LIMIT = 150;
const QUIET_MS = 600;

/** what an edit changed, in words, for the "Undone: …" message */
export function describeChange(a: P, b: P): string {
  if (a.lighting !== b.lighting) return 'lighting';
  if (a.edit !== b.edit) return 'trim and crop';
  if (a.particleScenes !== b.particleScenes) return 'particle sections';
  if (a.look !== b.look || a.presetId !== b.presetId) return a.presetId !== b.presetId ? 'preset' : 'style';
  if (a.noteSource !== b.noteSource || a.notes !== b.notes) return 'notes and sync';
  if (a.calibration !== b.calibration || a.keyboard !== b.keyboard) return 'calibration';
  if (a.camera !== b.camera) return 'camera view';
  if (a.name !== b.name) return 'project name';
  if (a.exportSettings !== b.exportSettings) return 'export settings';
  return 'change';
}

/** changes that are bookkeeping, not edits: they apply but never become an undo step */
const bookkeepingOnly = (a: P, b: P) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof P>;
  for (const k of keys) if (a[k] !== b[k] && k !== 'progress' && k !== 'video') return false;
  return true;
};

/** a past state, brought back without undoing things that aren't edits */
const restore = (snap: P, cur: P): P => ({
  ...snap,
  id: cur.id,
  video: cur.video, // the video file can be re-linked or converted; that isn't something to undo
  progress: cur.progress,
  calibration: snap.calibration ?? cur.calibration, // the starting calibration is made automatically
  // so is the export file name
  exportSettings: snap.exportSettings?.out || !cur.exportSettings?.out ? snap.exportSettings : { ...snap.exportSettings, out: cur.exportSettings.out },
});

export function useHistory(project: P | null, setState: (p: P | null) => void) {
  const past = useRef<P[]>([]);
  const future = useRef<P[]>([]);
  const open = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const cur = useRef(project);
  cur.current = project;
  const [, bump] = useState(0);
  const changed = () => bump((n) => n + 1);

  const close = useCallback(() => { open.current = false; window.clearTimeout(timer.current); }, []);

  // a different project: its own history
  useEffect(() => { past.current = []; future.current = []; close(); changed(); }, [project?.id, close]);

  // releasing the mouse ends a step (one slider drag = one undo)
  useEffect(() => {
    const up = () => { if (open.current) close(); };
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', up);
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('blur', up); };
  }, [close]);

  const record = useCallback((next: P, opts?: RecordOpts) => {
    const before = cur.current;
    cur.current = next;
    if (!opts?.silent && before && before.id === next.id && before !== next && !bookkeepingOnly(before, next)) {
      if (!open.current && !(opts?.merge && past.current.length)) {
        past.current.push(before);
        if (past.current.length > LIMIT) past.current.shift();
        future.current = [];
        open.current = true;
        changed();
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(close, QUIET_MS);
    }
    setState(next);
  }, [setState, close]);

  const step = useCallback((from: typeof past, to: typeof future): string | null => {
    close();
    const now = cur.current;
    const snap = from.current.pop();
    if (!now || !snap) return null;
    to.current.push(now);
    const next = restore(snap, now);
    cur.current = next;
    setState(next);
    changed();
    return describeChange(snap, now);
  }, [close, setState]);

  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);

  return { record, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
