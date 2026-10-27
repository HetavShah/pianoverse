// Calibration state and actions for the Calibrate screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyCalibration, CalibratedProject, Calibration, cornersAt, estimateFps, PRESETS, resampleTracking, whiteKeyCount,
} from '../engine/calibration';
import { cornersOf, Quad } from '../engine/geometry';
import { startTracking, TrackJob, TrackProgress } from './trackRun';
import type { KeyFit } from '../engine/project';

export function defaultCorners(w: number, h: number): Quad {
  // a keyboard-shaped box in the lower middle of the frame, to be dragged into place
  const cx = w / 2, cy = h * 0.62, hw = Math.min(w * 0.38, h * 0.3), hd = hw * 0.16;
  return [[cx - hw, cy - hd], [cx + hw, cy - hd], [cx + hw, cy + hd], [cx - hw, cy + hd]];
}

/** A project for a video that has no project file yet. */
export function newProject(name: string, file: string, w: number, h: number, duration: number): CalibratedProject {
  const p = PRESETS.find((x) => x.keys === 61)!;
  const proj: CalibratedProject = {
    format: 'pianoverse-project',
    version: 1,
    name,
    video: { file, width: w, height: h, fps: 30, frames: Math.max(1, Math.round(duration * 30)) },
    keyboard: { keys: p.keys, lowestNote: p.lowestNote, whiteKeys: whiteKeyCount(p.lowestNote, p.keys), edge: { a: -0.03, b: 0 } },
    tracking: { space: 'video-pixels', frames: [] },
    notes: [],
  };
  const cal: Calibration = { refTime: 0, corners: defaultCorners(w, h), cameraMoves: false, fixes: [] };
  return applyCalibration(proj, cal, proj.keyboard);
}

/** Calibration for a project that came with tracking but no calibration (e.g. the sample). */
export function calibrationFromTracking(proj: CalibratedProject, time: number): Calibration {
  const frames = proj.tracking.frames;
  const raw = frames.map((h) => cornersOf([...h, 1], proj.keyboard.whiteKeys).flat());
  const f = Math.min(frames.length - 1, Math.max(0, Math.round(time * proj.video.fps)));
  return {
    refTime: time,
    corners: cornersOf([...frames[f], 1], proj.keyboard.whiteKeys),
    cameraMoves: frames.length > 1,
    cornersSet: true,
    raw: frames.length > 1 ? raw : undefined,
    quality: frames.length > 1 ? frames.map(() => 1) : undefined,
    fixes: [],
  };
}

export type TrackState =
  | { kind: 'idle' }
  | { kind: 'running'; progress: TrackProgress | null }
  | { kind: 'done'; lost: number; frames: number; seconds: number }
  | { kind: 'error'; message: string };

export function useCalibration(opts: {
  project: CalibratedProject | null;
  setProject: (p: CalibratedProject) => void;
  time: number;
  videoUrl: string | null;
}) {
  const { project, setProject, time, videoUrl } = opts;
  const [dragCorners, setDragCorners] = useState<Quad | null>(null);
  const [dragEdge, setDragEdge] = useState<{ a: number; b: number } | null>(null);
  const [track, setTrack] = useState<TrackState>({ kind: 'idle' });
  const job = useRef<TrackJob | null>(null);
  // lining the keys up with the picture (see keyFit)
  const [fitting, setFitting] = useState<number | null>(null);
  const [fitResult, setFitResult] = useState<{ fit: KeyFit; before: number; after: number } | null>(null);
  const latest = useRef(project);
  latest.current = project;

  useEffect(() => () => job.current?.cancel(), []);

  const cal = project?.calibration ?? null;
  const fps = project?.video.fps ?? 30;
  const tracked = !!cal && cal.cameraMoves && !!cal.raw?.length;
  const frame = Math.round(time * fps);
  const fixHere = cal?.fixes.find((f) => Math.abs(f.t - time) < 0.5 / fps) ?? null;

  const baseCorners: Quad | null = !project || !cal ? null : tracked ? cornersAt(project, frame) : cal.corners;
  const corners = dragCorners ?? baseCorners;
  const edge = dragEdge ?? project?.keyboard.edge ?? { a: 0, b: 0 };

  const commit = useCallback((c: Calibration, kb?: Partial<{ keys: number; lowestNote: number; edge: { a: number; b: number } }>) => {
    if (!project) return;
    setProject(applyCalibration(project, c, { ...project.keyboard, ...kb }));
  }, [project, setProject]);

  const onCorners = useCallback((q: Quad, final: boolean) => {
    if (!final) { setDragCorners(q); return; }
    setDragCorners(null);
    if (!cal) return;
    if (tracked) {
      const fixes = cal.fixes.filter((f) => Math.abs(f.t - time) >= 0.5 / fps).concat({ t: time, corners: q });
      fixes.sort((a, b) => a.t - b.t);
      commit({ ...cal, fixes });
    } else {
      commit({ ...cal, corners: q, refTime: time, cornersSet: true });
    }
  }, [cal, tracked, time, fps, commit]);

  const onEdge = useCallback((e: { a: number; b: number }, final: boolean) => {
    if (!final) { setDragEdge(e); return; }
    setDragEdge(null);
    if (cal) commit(cal, { edge: e });
  }, [cal, commit]);

  const setPreset = useCallback((keys: number, lowestNote: number) => {
    if (cal) commit(cal, { keys, lowestNote });
  }, [cal, commit]);

  const setCameraMoves = useCallback((moves: boolean) => {
    if (!cal) return;
    // switching to a still camera keeps the corners as seen on the current frame
    if (!moves && baseCorners) commit({ ...cal, cameraMoves: false, corners: baseCorners, refTime: time, fixes: [] });
    else commit({ ...cal, cameraMoves: moves });
  }, [cal, baseCorners, time, commit]);

  const removeFix = useCallback((t: number) => {
    if (cal) commit({ ...cal, fixes: cal.fixes.filter((f) => f.t !== t) });
  }, [cal, commit]);

  const clearTracking = useCallback(() => {
    if (!cal || !baseCorners) return;
    commit({ ...cal, raw: undefined, quality: undefined, fixes: [], corners: baseCorners, refTime: time });
    setTrack({ kind: 'idle' });
  }, [cal, baseCorners, time, commit]);

  const runTracking = useCallback(async () => {
    if (!project || !cal || !videoUrl || job.current) return;
    // track from the frame on screen, with the corners as they are now
    const ref = { refTime: time, corners: (baseCorners ?? cal.corners) as Quad };
    setTrack({ kind: 'running', progress: null });
    const started = performance.now();
    const j = startTracking({
      src: videoUrl, refTime: ref.refTime, corners: ref.corners, whiteKeys: project.keyboard.whiteKeys,
      onProgress: (p) => setTrack({ kind: 'running', progress: p }),
    });
    job.current = j;
    try {
      const { samples, times } = await j.promise;
      const fpsEst = estimateFps(times);
      const duration = Math.max(times[times.length - 1] ?? 0, project.video.frames / project.video.fps);
      const frames = Math.max(1, Math.round(duration * fpsEst));
      const { raw, quality } = resampleTracking(samples, fpsEst, frames);
      const next: CalibratedProject = { ...project, video: { ...project.video, fps: fpsEst, frames } };
      const c: Calibration = { ...cal, ...ref, cameraMoves: true, raw, quality, fixes: [] };
      setProject(applyCalibration(next, c, next.keyboard));
      setTrack({ kind: 'done', lost: samples.filter((s) => !s.corners).length, frames: samples.length, seconds: (performance.now() - started) / 1000 });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      setTrack(msg === 'cancelled' ? { kind: 'idle' } : { kind: 'error', message: msg });
    } finally {
      job.current = null;
    }
  }, [project, cal, videoUrl, time, baseCorners, setProject]);

  const cancelTracking = useCallback(() => { job.current?.cancel(); }, []);

  const fitKeysNow = useCallback(async (v: HTMLVideoElement | null) => {
    const p0 = latest.current;
    if (!p0 || !v || !v.videoWidth || fitting !== null || job.current) return;
    setFitting(0);
    try {
      const { fitKeys, grabShots } = await import('../engine/keyFit');
      const dur = p0.video.frames / (p0.video.fps || 30);
      const times = [0.15, 0.35, 0.55, 0.75, 0.9].map((k) => Math.min(dur - 0.1, k * dur));
      const shots = await grabShots(v, p0, times);
      const r = await fitKeys(p0, shots, (pct) => setFitting(pct));
      const p1 = latest.current;
      if (p1) setProject({ ...p1, keyboard: { ...p1.keyboard, fit: r.fit } });
      setFitResult(r);
    } catch (e) {
      console.warn('[key fit]', e);
    } finally {
      setFitting(null);
    }
  }, [fitting, setProject]);

  return {
    cal, tracked, corners, edge, fixHere, track, fitting, fitResult,
    onCorners, onEdge, setPreset, setCameraMoves, removeFix, clearTracking, runTracking, cancelTracking, fitKeysNow,
  };
}
