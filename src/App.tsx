// The app shell: wires the session (open project and video), playback, the preview renderer, undo history,
// autosave and shortcuts together, and shows the Projects page or the current step. Each concern lives in its own
// hook under ui/app; the steps get everything through one workspace object (ui/workspace.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalibratedProject } from './engine/calibration';
import { useCalibration } from './ui/calibrate/useCalibration';
import { saveProject } from './ui/services/saveProject';
import type { PickedMidi } from './ui/services/media';
import { useNotes } from './ui/notes/useNotes';
import { loadFromStore } from './ui/services/projectStore';
import type { WS } from './ui/app/workspace';
import Home from './ui/home/Home';
import ImportStep from './ui/import/ImportStep';
import VideoStep from './ui/video/VideoStep';
import AudioStep from './ui/audio/AudioStep';
import CalibrateStep from './ui/calibrate/CalibrateStep';
import StyleStep from './ui/style/StyleStep';
import LightStep from './ui/light/LightStep';
import CameraStep from './ui/camera/CameraStep';
import ExportStep from './ui/export/ExportStep';
import { RecordOpts, useHistory } from './ui/app/history';
import { toast, toastError, Toasts } from './ui/components/toast';
import Shortcuts from './ui/components/Shortcuts';
import TopBar from './ui/app/TopBar';
import { useAutosave } from './ui/app/useAutosave';
import { useLibrary } from './ui/app/useLibrary';
import { usePlayback } from './ui/app/usePlayback';
import { usePreview } from './ui/app/usePreview';
import { useSession } from './ui/app/useSession';
import { useShortcuts } from './ui/app/useShortcuts';
import { useSound } from './ui/app/useSound';
import { exposeForTests } from './ui/app/testHooks';
import { trimRange } from './engine/project';
import { installSlidingInk } from './ui/components/slidingInk';
import { warmEncoders } from './ui/export/exportRun';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [project, setProjectState] = useState<CalibratedProject | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  // an export in progress locks the workspace: the export owns the video, the renderer and the project meanwhile
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const exportingRef = useRef(exporting);
  exportingRef.current = exporting;
  const library = useLibrary();
  // the orange underline that slides to the chosen step or choice, everywhere in the app
  useEffect(() => installSlidingInk(), []);
  // the export's encoder test, in the background a few seconds after start (so Export doesn't wait for it)
  useEffect(() => { const t = window.setTimeout(() => { warmEncoders().catch(() => {}); }, 4000); return () => window.clearTimeout(t); }, []);

  // undo history: every edit goes through setProject
  const history = useHistory(project, setProjectState);
  const setProject: (p: CalibratedProject, o?: RecordOpts) => void = history.record;
  const undo = useCallback(() => { const what = history.undo(); toast(what ? `Undone: ${what}` : 'Nothing to undo'); }, [history.undo]); // eslint-disable-line react-hooks/exhaustive-deps
  const redo = useCallback(() => { const what = history.redo(); toast(what ? `Redone: ${what}` : 'Nothing to redo'); }, [history.redo]); // eslint-disable-line react-hooks/exhaustive-deps

  // the session needs a few things made after it (the notes, playback, autosave): handed over through refs
  const onFrame = useRef<(t?: number) => void>(() => {});
  const importMidi = useRef<(m: PickedMidi) => void>(() => {});
  const late = useRef({ time: 0, pause: () => {}, resetPlayback: () => {}, setDuration: (_d: number) => {}, forgetThumb: () => {} });
  const session = useSession({
    project, setProjectState, defaultPreset: library.defaultPreset,
    importMidi: (m) => importMidi.current(m),
    get time() { return late.current.time; },
    pause: () => late.current.pause(),
    resetPlayback: () => late.current.resetPlayback(),
    setDuration: (d) => late.current.setDuration(d),
    forgetThumb: () => late.current.forgetThumb(),
    busy: () => (exportingRef.current ? 'An export is running. Finish or cancel it first.' : null),
  });
  const { route, step, video, videoIssue } = session;
  const videoUrl = video?.url ?? null;
  const ready = !!project && !!video && !videoIssue;

  const playback = usePlayback(videoRef, { project, canPlay: !!videoUrl && !videoIssue, onFrame });
  const inProject = route === 'project';
  const preview = usePreview(videoRef, {
    project, duration: playback.duration, playing: playback.playing, brand: library.brand,
    previewing: inProject && (step === 'style' || step === 'light' || step === 'camera'),
    cameraStep: inProject && step === 'camera',
  });
  onFrame.current = preview.redraw;
  useEffect(() => { preview.setInspect(null); }, [step, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sound = useSound(videoRef, { project, videoUrl: ready ? videoUrl : null, playing: playback.playing, duration: playback.duration });
  const autosave = useAutosave(project, { videoRef, videoOk: !videoIssue, renderer: preview.renderer, step });
  late.current = { time: playback.time, pause: playback.pause, resetPlayback: playback.reset, setDuration: playback.setDuration, forgetThumb: autosave.forgetThumb };

  const calib = useCalibration({ project, setProject, time: playback.time, videoUrl });
  const notes = useNotes({ project, setProject, videoUrl });
  importMidi.current = notes.importMidi;

  useShortcuts(videoRef, {
    active: inProject && !exporting, fps: project?.video.fps ?? 30, canLeaveImport: ready,
    undo, redo, goStep: session.goStep, togglePlay: playback.togglePlay, seek: playback.seek,
    trim: project && playback.duration ? trimRange(project, playback.duration) : null,
    loop: playback.loop, setLoop: playback.setLoop,
    toggleStats: () => setShowStats((s) => !s), toggleHelp: () => setShortcuts((s) => !s), closeHelp: () => setShortcuts(false),
  });

  // test hooks: let automated checks read the project and set the playhead or a loop
  useEffect(() => { exposeForTests('pianoverseProject', project); }, [project]);
  exposeForTests('pianoverseSetLoop', playback.setLoop);
  exposeForTests('pianoverseSeek', playback.seek);

  const ws: WS = {
    project, setProject, video, videoEl: videoRef, videoIssue, convert: session.convert,
    time: playback.time, duration: playback.duration, playing: playback.playing, togglePlay: playback.togglePlay, seek: playback.seek,
    frameTick: preview.frameTick, calib, notes, renderer: preview.renderer,
    layers: preview.layers, setLayers: preview.setLayers, scale: preview.scale, setScale: preview.setScale, sweep: preview.sweep, setSweep: preview.setSweep,
    pick: session.pick, onFiles: session.onFiles, loop: playback.loop, setLoop: playback.setLoop,
    presets: library.presets, defaultPresetId: library.defaultPresetId, refreshPresets: library.refreshPresets,
    goStep: session.goStep, goHome: session.goHome, brand: library.brand, setBrand: library.setBrand,
    inspect: preview.inspect, setInspect: preview.setInspect, redraw: () => preview.redraw(), sound,
    exporting, setExporting,
  };

  // closing the window during an export asks first
  useEffect(() => {
    if (!exporting || !('__TAURI_INTERNALS__' in window)) return;
    let off: (() => void) | null = null, gone = false;
    (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const { ask } = await import('@tauri-apps/plugin-dialog');
      const un = await getCurrentWindow().onCloseRequested(async (e) => {
        const stop = await ask('An export is running. Stop it and close Pianoverse?', { title: 'Pianoverse', kind: 'warning', okLabel: 'Stop and close', cancelLabel: 'Keep exporting' });
        if (!stop) e.preventDefault();
      });
      if (gone) un(); else off = un;
    })().catch(() => {});
    return () => { gone = true; off?.(); };
  }, [!!exporting]); // eslint-disable-line react-hooks/exhaustive-deps

  // the steps that draw with the graphics card need it
  const gpu = (el: JSX.Element) => (preview.gpuError ? <div className="notice">This window can't use the graphics card: {preview.gpuError}</div> : el);

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); session.onFiles(e.dataTransfer.files); }}>
      <TopBar
        inProject={inProject} project={project} step={step} ready={ready} goStep={session.goStep} goHome={session.goHome}
        canUndo={history.canUndo} canRedo={history.canRedo} undo={undo} redo={redo} saveText={autosave.text}
        gpuName={preview.gpuName} gpuError={preview.gpuError}
        exporting={exporting}
        onShortcuts={() => setShortcuts(true)} onSaveFile={() => project && saveProject(project, project.video.file).catch(toastError)}
      />

      <div className="route">
        {route === 'home' && <Home onNew={session.startNewProject} onOpen={(id) => loadFromStore(id).then(session.openProject).catch(toastError)} onPick={session.pick} onFiles={session.onFiles} refreshKey={session.homeKey} />}
        {inProject && step === 'import' && <ImportStep ws={ws} />}
        {inProject && ready && step === 'video' && <VideoStep ws={ws} />}
        {inProject && ready && step === 'audio' && <AudioStep ws={ws} />}
        {inProject && ready && step === 'calibrate' && <CalibrateStep ws={ws} />}
        {inProject && ready && step === 'style' && gpu(<StyleStep ws={ws} attachPreview={preview.attachPreview} fps={preview.fps} stats={showStats ? `${preview.fps} fps · ${preview.stats}` : ''} />)}
        {inProject && ready && step === 'light' && gpu(<LightStep ws={ws} attachPreview={preview.attachPreview} />)}
        {inProject && ready && step === 'camera' && gpu(<CameraStep ws={ws} attachPreview={preview.attachPreview} />)}
        {inProject && ready && step === 'export' && gpu(<ExportStep ws={ws} />)}
      </div>

      <video
        ref={videoRef}
        src={videoUrl || undefined}
        crossOrigin="anonymous"
        preload="auto"
        playsInline
        style={{ display: 'none' }}
        onLoadedMetadata={(e) => session.onMetadata(e.currentTarget)}
        onLoadedData={() => preview.redraw()}
        onSeeked={() => preview.redraw()}
        onEnded={() => playback.setPlaying(false)}
        onError={() => { if (videoUrl) session.setVideoIssue((cur) => cur ?? { kind: 'unsupported' }); }}
      />
      {shortcuts && <Shortcuts onClose={() => setShortcuts(false)} />}
      <Toasts />
    </div>
  );
}
