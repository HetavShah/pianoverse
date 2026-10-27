// The open project and its video: starting a new project, opening one (from the Projects page, a file or a drop),
// finding its video again, converting a video the player can't read, and moving between the steps.
import { useEffect, useRef, useState } from 'react';
import { applyPreset, Preset } from '../../engine/look';
import type { CalibratedProject } from '../../engine/calibration';
import { calibrationFromTracking, newProject } from '../calibrate/useCalibration';
import { convertVideo, inTauri, onNativeDrop, openFiles, openPaths, Picked, PickedMidi, PickedVideo, PickKind, pickNative } from '../services/media';
import { fileExists, newId } from '../services/projectStore';
import { toast, toastError } from '../components/toast';
import type { Step, VideoIssue } from './workspace';

export type Route = 'home' | 'project';

export interface SessionDeps {
  project: CalibratedProject | null;
  /** replace the project without an undo step (opening, the video changing) */
  setProjectState: (p: CalibratedProject | null) => void;
  time: number;
  pause: () => void;
  /** a new video or project: back to the start */
  resetPlayback: () => void;
  setDuration: (d: number) => void;
  defaultPreset: () => Preset;
  importMidi: (m: PickedMidi) => void;
  forgetThumb: () => void;
}

/** the step a reopened project continues from */
const resumeStep = (p: CalibratedProject): Step => (!p.notes.length ? 'notes' : !p.progress?.calibrated ? 'calibrate' : 'style');

export function useSession(deps: SessionDeps) {
  const d = useRef(deps);
  d.current = deps;
  const [route, setRoute] = useState<Route>('home');
  const [step, setStep] = useState<Step>('import');
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [videoIssue, setVideoIssue] = useState<VideoIssue | null>(null);
  /** bumped to make the Projects page list its projects again */
  const [homeKey, setHomeKey] = useState(0);
  // a video was chosen for a new project: the project is made once its size is known (onMetadata)
  const wantNewProject = useRef(false);
  // a converted copy is playing: the original's path
  const editCopyOf = useRef<string | null>(null);
  // a MIDI file dropped together with a new video waits for the project
  const pendingMidi = useRef<PickedMidi | null>(null);

  const loadVideo = (v: PickedVideo, createProject: boolean) => {
    if (video?.url.startsWith('blob:') && video.url !== v.url) URL.revokeObjectURL(video.url);
    setVideo(v);
    d.current.pause();
    setVideoIssue(null);
    wantNewProject.current = createProject;
  };

  const openProject = async (p: CalibratedProject) => {
    const proj: CalibratedProject = { ...p, id: p.id ?? newId() };
    d.current.forgetThumb();
    d.current.pause();
    d.current.setProjectState(proj);
    setRoute('project');
    setVideo(null);
    setVideoIssue(null);
    d.current.resetPlayback();
    // find its video again (the edit copy first)
    if (inTauri()) {
      for (const path of [proj.video.editPath, proj.video.path]) {
        if (path && (await fileExists(path))) {
          const [v] = await openPaths([path]);
          if (v?.kind === 'video') { loadVideo({ ...v, name: proj.video.file, path: proj.video.path ?? path }, false); setStep(resumeStep(proj)); return; }
        }
      }
    }
    setVideo({ kind: 'video', name: proj.video.file, url: '' });
    setVideoIssue({ kind: 'missing' });
    setStep('import');
  };

  const openProjectText = (text: string) => {
    try {
      const data = JSON.parse(text) as CalibratedProject;
      if (data.format !== 'pianoverse-project') throw new Error('Not a Pianoverse project file.');
      openProject(data);
    } catch (e) {
      toast(`Could not open the project: ${(e as Error).message}`, { kind: 'error' });
    }
  };

  /** files chosen or dropped: a project file, a video (with its MIDI), or a MIDI file for the open project */
  const openItems = (items: Picked[]) => {
    const proj = items.find((i) => i.kind === 'project');
    const vid = items.find((i): i is PickedVideo => i.kind === 'video');
    const mid = items.find((i): i is PickedMidi => i.kind === 'midi');
    if (proj) { openProjectText(proj.text); if (vid) setTimeout(() => loadVideo(vid, false), 0); return; }
    if (vid) {
      const fresh = route === 'home' || !d.current.project;
      if (fresh) { d.current.setProjectState(null); setRoute('project'); setStep('import'); }
      loadVideo(vid, fresh);
      if (mid) pendingMidi.current = mid;
      return;
    }
    if (mid) {
      if (!d.current.project || route !== 'project') { toast('Open or start a project with its video first, then add the MIDI file.', { kind: 'error' }); return; }
      d.current.importMidi(mid);
    }
  };
  const openItemsRef = useRef(openItems);
  openItemsRef.current = openItems;

  const onFiles = (files: FileList | null | undefined) => { if (files?.length) openFiles(Array.from(files)).then(openItems); };
  const pick = (what: PickKind) => { pickNative(what).then(openItems).catch(toastError); };

  // native drag and drop in the desktop app (gives file paths, so videos can be converted)
  useEffect(() => {
    if (!inTauri()) return;
    let un: (() => void) | undefined;
    let gone = false;
    onNativeDrop((items) => openItemsRef.current(items)).then((u) => { if (gone) u(); else un = u; });
    return () => { gone = true; un?.(); };
  }, []);

  // a MIDI file dropped together with a new video is imported once the project exists
  const project = deps.project;
  useEffect(() => {
    const m = pendingMidi.current;
    if (m && project && video && !videoIssue) { pendingMidi.current = null; d.current.importMidi(m); }
  }, [project?.id, video, videoIssue]); // eslint-disable-line react-hooks/exhaustive-deps

  /** the video element knows the video's size and length */
  const onMetadata = (v: HTMLVideoElement) => {
    // a video track the player can't decode shows up as 0 x 0 (audio only)
    if (!v.videoWidth) { setVideoIssue({ kind: 'unsupported' }); return; }
    d.current.setDuration(v.duration);
    if (!video) return;
    const original = editCopyOf.current;
    editCopyOf.current = null;
    const paths = original ? { path: original, editPath: video.path } : { path: video.path, editPath: undefined };
    const p0 = d.current.project;
    if (wantNewProject.current && !p0) {
      wantNewProject.current = false;
      const base = video.name.replace(/\.[^.]+$/, '') || 'Untitled';
      const p = newProject(base, video.name, v.videoWidth, v.videoHeight, v.duration || 0);
      // new projects start with the default preset
      const preset = d.current.defaultPreset();
      d.current.setProjectState({ ...p, id: newId(), video: { ...p.video, ...paths, duration: v.duration }, look: applyPreset(undefined, preset), presetId: preset.id });
    } else if (p0 && (p0.video.file !== video.name || p0.video.width !== v.videoWidth || (paths.path && p0.video.path !== paths.path) || (paths.editPath && p0.video.editPath !== paths.editPath))) {
      // the project's video was replaced or found again
      d.current.setProjectState({ ...p0, video: { ...p0.video, file: video.name, width: v.videoWidth, height: v.videoHeight, duration: v.duration, ...(paths.path ? paths : {}) } });
    }
  };

  /** make an editing copy of a video the player can't read (phones record HEVC) */
  const convert = async () => {
    if (!video?.path) return;
    const createProject = wantNewProject.current || !d.current.project;
    setVideoIssue({ kind: 'converting', progress: null });
    try {
      const copy = await convertVideo(video, (progress) => setVideoIssue({ kind: 'converting', progress }));
      editCopyOf.current = video.path;
      loadVideo(copy, createProject);
    } catch (e) {
      setVideoIssue({ kind: 'error', message: String((e as Error)?.message ?? e) });
    }
  };

  const goStep = (s: Step) => {
    const { project: p, time, pause } = d.current;
    if (s === 'export' || s === 'calibrate') pause();
    if (s === 'calibrate' && p && !p.calibration) d.current.setProjectState({ ...p, calibration: calibrationFromTracking(p, time) });
    setStep(s);
  };
  const goHome = () => { d.current.pause(); setRoute('home'); setHomeKey((k) => k + 1); };
  const startNewProject = () => {
    d.current.forgetThumb(); d.current.pause(); d.current.setProjectState(null);
    setVideo(null); setVideoIssue(null); d.current.resetPlayback(); setRoute('project'); setStep('import');
  };

  return {
    route, step, video, videoIssue, setVideoIssue, homeKey,
    openProject, openItems, onFiles, pick, onMetadata, convert, goStep, goHome, startNewProject,
  };
}
