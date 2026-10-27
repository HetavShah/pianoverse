import { userTextureFiles } from './ui/textureStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_LAYERS, Layers, Renderer, View } from './engine/render';
import { CalibratedProject, testNotes } from './engine/calibration';
import { UpdatePill, updateStatusText, useUpdater } from './updater';
import { calibrationFromTracking, newProject, useCalibration } from './ui/useCalibration';
import { saveProject } from './ui/saveProject';
import { convertVideo, inTauri, onNativeDrop, openFiles, openPaths, Picked, PickedMidi, PickedVideo, PickKind, pickNative } from './ui/media';
import { useNotes } from './ui/useNotes';
import { ago, fileExists, loadFromStore, makeThumb, newId, saveToStore } from './ui/projectStore';
import { Step, STEPS, VideoIssue, WS } from './ui/workspace';
import Home from './ui/Home';
import { loadBrand, loadPresets, saveBrand } from './ui/presetStore';
import { applyPreset, BUILT_IN_PRESETS, Preset } from './engine/look';
import { Brand, DEFAULT_BRAND, loadTitleFonts } from './engine/titles';
import ImportStep from './ui/steps/ImportStep';
import NotesStep from './ui/steps/NotesStep';
import CalibrateStep from './ui/steps/CalibrateStep';
import StyleStep from './ui/steps/StyleStep';
import ExportStep from './ui/steps/ExportStep';
import CameraStep from './ui/steps/CameraStep';
import LightStep from './ui/steps/LightStep';
import { trimRange } from './engine/project';
import { cameraFrameAt } from './ui/exportRun';
import { aspectInfo } from './engine/camera';
import { RecordOpts, useHistory } from './ui/history';
import { toast, toastError, Toasts } from './ui/toast';
import Shortcuts from './ui/Shortcuts';

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

export default function App() {
  const videoRef = useRef<RVFCVideo>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [gpuName, setGpuName] = useState('');
  const [route, setRoute] = useState<'home' | 'project'>('home');
  const [step, setStep] = useState<Step>('import');
  const [project, setProjectState] = useState<CalibratedProject | null>(null);
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [videoIssue, setVideoIssue] = useState<VideoIssue | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [frameTick, setFrameTick] = useState(0);
  const [scale, setScale] = useState(0.5);
  const [layers, setLayers] = useState<Layers>({ ...DEFAULT_LAYERS });
  const [sweep, setSweep] = useState(false);
  const [fps, setFps] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState('');
  const [saved, setSaved] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; at: number }>({ state: 'idle', at: 0 });
  const [, setClock] = useState(0);
  const [menu, setMenu] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [loop, setLoop] = useState<{ on: boolean; range: [number, number] | null }>({ on: false, range: null });
  const loopRef = useRef(loop);
  /** the part of the video kept on the Import step (null: all of it) */
  const trimRef = useRef<[number, number] | null>(null);
  loopRef.current = loop;
  const [homeKey, setHomeKey] = useState(0);
  const [presets, setPresets] = useState<Preset[]>(BUILT_IN_PRESETS);
  const [defaultPresetId, setDefaultPresetId] = useState(BUILT_IN_PRESETS[0].id);
  const refreshPresets = useCallback(async () => { const r = await loadPresets(); setPresets(r.presets); setDefaultPresetId(r.defaultId); }, []);
  useEffect(() => { refreshPresets(); }, [refreshPresets]);
  // the brand kit: saved once, used by every project's cards
  const [brand, setBrandState] = useState<Brand>(DEFAULT_BRAND);
  useEffect(() => { loadBrand().then(setBrandState).catch(() => {}); loadTitleFonts(); }, []);
  const brandSave = useRef<number | null>(null);
  const setBrand = useCallback((b: Brand) => {
    setBrandState(b);
    if (brandSave.current) window.clearTimeout(brandSave.current);
    brandSave.current = window.setTimeout(() => { saveBrand(b).catch(toastError); }, 400);
  }, []);
  const frameTimes = useRef<number[]>([]);
  const wantNewProject = useRef(false);
  const editCopyOf = useRef<string | null>(null);
  const pendingMidi = useRef<PickedMidi | null>(null);
  const lastThumb = useRef<string | undefined>(undefined);
  const stepRef = useRef<Step>('import');
  const updater = useUpdater();
  stepRef.current = step;
  const videoUrl = video && !videoIssue ? video.url : video?.url ?? null;

  const history = useHistory(project, setProjectState);
  const setProject: (p: CalibratedProject, o?: RecordOpts) => void = history.record;
  const undo = useCallback(() => { const what = history.undo(); toast(what ? `Undone: ${what}` : 'Nothing to undo'); }, [history.undo]); // eslint-disable-line react-hooks/exhaustive-deps
  const redo = useCallback(() => { const what = history.redo(); toast(what ? `Redone: ${what}` : 'Nothing to redo'); }, [history.redo]); // eslint-disable-line react-hooks/exhaustive-deps
  const calib = useCalibration({ project, setProject, time, videoUrl });
  const notesApi = useNotes({ project, setProject, videoUrl });
  // test hook: lets automated checks read the current project
  useEffect(() => { (window as unknown as { pianoverseProject: unknown }).pianoverseProject = project; }, [project]);

  // GPU: one renderer for the app; the Style screen lends it a canvas
  useEffect(() => {
    let cancelled = false;
    if (rendererRef.current) return;
    Renderer.create(document.createElement('canvas'))
      .then((r) => {
        if (cancelled) return;
        rendererRef.current = r;
        r.userFiles = userTextureFiles;
        setGpuName(r.adapterName);
        (window as unknown as { pianoverse: unknown }).pianoverse = { renderer: r };
      })
      .catch((e) => setGpuError(String(e?.message || e)));
    return () => { cancelled = true; };
  }, []);

  // what the renderer sees: real notes, or a sweep over every key when there are none yet
  const noNotes = !!project && project.notes.length === 0;
  const renderProject = useMemo(() => {
    if (!project) return null;
    if (!(sweep || noNotes)) return project;
    return { ...project, notes: testNotes(project.keyboard.lowestNote, project.keyboard.keys, duration || project.video.frames / project.video.fps) };
  }, [project, sweep, noNotes, duration]);

  const camStep = route === 'project' && step === 'camera';
  const previewing = route === 'project' && (step === 'style' || step === 'light' || camStep);
  // on the Camera step the preview looks through the camera; everywhere else it shows the whole video
  const camOn = camStep && !!project?.cameraTrack?.on;
  trimRef.current = project?.edit?.trim && duration ? trimRange(project, duration) : null;
  const camRef = useRef<{ p: CalibratedProject; dur: number } | null>(null);
  // zoomed in on the Style preview to check detail: the part of the video shown (null = all of it)
  const [inspect, setInspect] = useState<View | null>(null);
  const inspectRef = useRef<View | null>(null);
  inspectRef.current = camOn ? null : inspect;
  camRef.current = camOn && project ? { p: project, dur: duration || project.video.frames / (project.video.fps || 30) } : null;
  const draw = useCallback((t?: number) => {
    const r = rendererRef.current;
    const v = videoRef.current;
    if (!r || !v || v.readyState < 2 || !v.videoWidth) return;
    const tt = t ?? v.currentTime;
    const cam = camRef.current;
    if (cam) { const f = cameraFrameAt(cam.p, tt, cam.dur); r.setView(f.view, f.fade); } else r.setView(inspectRef.current);
    if ((window as unknown as { __pvHeadless?: boolean }).__pvHeadless) return; // automated tests capture offscreen
    r.render(v, tt);
    const now = performance.now();
    const ft = frameTimes.current;
    ft.push(now);
    while (ft.length > 30) ft.shift();
    // frame rate only means something during playback (seeks would read as a tiny number)
    if (ft.length > 5 && !videoRef.current?.paused) setFps(Math.round(((ft.length - 1) * 1000) / (ft[ft.length - 1] - ft[0])));
    const s = r.stats;
    setStats(`${r.size.width}×${r.size.height} · ${s.notes} notes · ${s.emitters} emitters · CPU ${s.cpuMs.toFixed(1)} ms`);
  }, []);
  const redraw = useCallback((t?: number) => {
    if (previewing) draw(t);
    setFrameTick((k) => k + 1);
  }, [previewing, draw]);

  useEffect(() => {
    if (previewing && renderProject && rendererRef.current) { rendererRef.current.setProject(renderProject); draw(); }
  }, [renderProject, gpuName, draw, previewing]);
  // a note texture finished loading: show it even while paused
  useEffect(() => { const r = rendererRef.current; if (r) r.onTexture = () => { if (previewing) draw(); }; }, [gpuName, draw, previewing]);
  useEffect(() => { rendererRef.current?.setScale(scale); if (previewing) draw(); }, [scale, gpuName, draw, previewing]);
  const camAspect = project?.cameraTrack?.aspect;
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setOutput(camOn && camAspect ? aspectInfo(camAspect).size : null);
    if (!camOn) r.setView(null);
    if (previewing) draw();
  }, [camOn, camAspect, gpuName, draw, previewing]);
  useEffect(() => { if (rendererRef.current) { rendererRef.current.layers = layers; if (previewing) draw(); } }, [layers, draw, previewing]);
  useEffect(() => { if (previewing) draw(); }, [inspect, draw, previewing]);
  useEffect(() => { setInspect(null); }, [step, project?.id]);
  useEffect(() => { if (rendererRef.current) { rendererRef.current.setBrand(brand); if (previewing) draw(); } }, [brand, gpuName, draw, previewing]);
  const attachPreview = useCallback((c: HTMLCanvasElement | null) => {
    const r = rendererRef.current;
    if (!c || !r) return;
    r.attach(c);
    if (renderProject) r.setProject(renderProject);
    r.setScale(scale);
    requestAnimationFrame(() => draw());
  }, [renderProject, scale, draw, gpuName]); // eslint-disable-line react-hooks/exhaustive-deps

  // render every decoded video frame while playing
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing) return;
    let stop = false;
    if (v.requestVideoFrameCallback) {
      const tick = (_now: number, meta: { mediaTime: number }) => {
        if (stop) return;
        // the part kept on the Import step: play inside it (loop round it, or stop at its end)
        const tr = trimRef.current;
        const lp = loopRef.current;
        if (tr && !(lp.on && lp.range)) {
          if (meta.mediaTime >= tr[1] - 0.01) {
            if (lp.on) { v.currentTime = tr[0]; v.requestVideoFrameCallback!(tick); return; }
            v.pause(); v.currentTime = tr[1]; setPlaying(false); setTime(tr[1]); return;
          }
          if (meta.mediaTime < tr[0] - 0.25) { v.currentTime = tr[0]; v.requestVideoFrameCallback!(tick); return; }
        }
        // looping a selected section: jump back to its start at its end
        if (lp.on && lp.range && (meta.mediaTime >= lp.range[1] || meta.mediaTime < lp.range[0] - 0.25)) {
          v.currentTime = lp.range[0];
          v.requestVideoFrameCallback!(tick);
          return;
        }
        redraw(meta.mediaTime);
        setTime(meta.mediaTime);
        v.requestVideoFrameCallback!(tick);
      };
      v.requestVideoFrameCallback(tick);
    } else {
      const loop = () => { if (stop) return; redraw(); setTime(v.currentTime); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    return () => { stop = true; };
  }, [playing, redraw]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !videoUrl || videoIssue) return;
    if (v.paused) {
      const lp = loopRef.current;
      const tr = trimRef.current;
      if (lp.on && lp.range && (v.currentTime < lp.range[0] || v.currentTime >= lp.range[1] - 0.05)) v.currentTime = lp.range[0];
      else if (tr && (v.currentTime < tr[0] - 0.01 || v.currentTime >= tr[1] - 0.05)) v.currentTime = tr[0];
      v.play(); setPlaying(true);
    } else { v.pause(); setPlaying(false); }
  }, [videoUrl, videoIssue]);
  // whole-video looping when no section is selected
  useEffect(() => { const v = videoRef.current; if (v) v.loop = loop.on && !loop.range && !trimRef.current; }, [loop, project?.edit?.trim]);
  // looping belongs to one project
  useEffect(() => { setLoop({ on: false, range: null }); }, [project?.id]);
  const pause = () => { videoRef.current?.pause(); setPlaying(false); };
  useEffect(() => { if (!playing) { frameTimes.current = []; setFps(0); } }, [playing]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration || t));
    setTime(v.currentTime);
  }, []);

  const readyRef = useRef(false);
  const goStepRef = useRef<(s: Step) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || route !== 'project') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const type = (el as HTMLInputElement | null)?.type;
      // text fields keep their own keys (including their own undo); sliders and buttons don't
      const typing = !!el && (el.isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color'].includes(type ?? '')));
      const onSlider = tag === 'INPUT' && type === 'range';
      const v = videoRef.current;
      const st = 1 / (project?.video.fps || 30);
      if (e.ctrlKey || e.metaKey) {
        if (typing || e.altKey) return;
        const k = e.code;
        if (k === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (k === 'KeyY' || (k === 'KeyZ' && e.shiftKey)) { e.preventDefault(); redo(); }
        else if (k === 'KeyS') { e.preventDefault(); toast('Pianoverse saves your project as you go'); }
        else if (/^Digit[1-7]$/.test(k)) {
          e.preventDefault();
          const s = STEPS[Number(k.slice(5)) - 1].id;
          if (s === 'import' || readyRef.current) goStepRef.current(s);
        }
        return;
      }
      if (typing || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight' && v && !onSlider) { e.preventDefault(); seek(v.currentTime + (e.shiftKey ? 1 : st)); }
      else if (e.code === 'ArrowLeft' && v && !onSlider) { e.preventDefault(); seek(v.currentTime - (e.shiftKey ? 1 : st)); }
      else if (e.code === 'Home' && v && !onSlider) { e.preventDefault(); seek(0); }
      else if (e.code === 'End' && v && !onSlider) { e.preventDefault(); seek(v.duration || 0); }
      else if (e.code === 'KeyL') { const l = loopRef.current; setLoop({ ...l, on: !l.on }); toast(l.on ? 'Loop off' : l.range ? 'Looping the selected part' : 'Looping the whole video'); }
      else if (e.code === 'KeyP') setShowStats((s) => !s);
      else if (e.key === '?') setShortcuts((s) => !s);
      else if (e.code === 'Escape') setShortcuts(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, project?.video.fps, route, undo, redo]);

  // ---------- autosave ----------
  useEffect(() => {
    if (!project?.id) return;
    setSaved((s) => ({ ...s, state: 'saving' }));
    const t = setTimeout(async () => {
      try {
        const v = videoRef.current;
        let thumb = lastThumb.current;
        if (v && v.videoWidth && !videoIssue) {
          // on the Style screen the thumbnail shows the effects, like the design's project cards
          const r = rendererRef.current;
          if ((stepRef.current === 'style' || stepRef.current === 'camera') && r && !(window as unknown as { __pvHeadless?: boolean }).__pvHeadless) {
            try {
              const img = await r.capture(v, v.currentTime);
              const c = document.createElement('canvas');
              c.width = img.width; c.height = img.height;
              c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
              thumb = makeThumb(c);
            } catch { thumb = makeThumb(v); }
          } else if (!thumb || thumb.startsWith('plain:')) {
            thumb = makeThumb(v);
          }
        }
        lastThumb.current = thumb;
        await saveToStore(project, thumb);
        setSaved({ state: 'saved', at: Date.now() });
      } catch {
        setSaved({ state: 'error', at: Date.now() });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const i = setInterval(() => setClock((c) => c + 1), 30000); return () => clearInterval(i); }, []);

  // ---------- opening videos and projects ----------
  const loadVideo = (v: PickedVideo, createProject: boolean) => {
    if (video?.url.startsWith('blob:') && video.url !== v.url) URL.revokeObjectURL(video.url);
    setVideo(v);
    setPlaying(false);
    setVideoIssue(null);
    wantNewProject.current = createProject;
  };

  const chooseStep = (p: CalibratedProject): Step => (!p.notes.length ? 'notes' : !p.progress?.calibrated ? 'calibrate' : 'style');

  const openProject = async (p: CalibratedProject) => {
    const proj: CalibratedProject = { ...p, id: p.id ?? newId() };
    lastThumb.current = undefined;
    pause();
    setProjectState(proj);
    setRoute('project');
    setVideo(null);
    setVideoIssue(null);
    setDuration(0);
    setTime(0);
    // find its video again
    if (inTauri()) {
      for (const path of [proj.video.editPath, proj.video.path]) {
        if (path && (await fileExists(path))) {
          const [v] = await openPaths([path]);
          if (v?.kind === 'video') { loadVideo({ ...v, name: proj.video.file, path: proj.video.path ?? path }, false); setStep(chooseStep(proj)); return; }
        }
      }
    }
    setVideo({ kind: 'video', name: proj.video.file, url: '' });
    setVideoIssue({ kind: 'missing' });
    setStep('import');
  };

  const applyProjectText = (text: string) => {
    try {
      const data = JSON.parse(text) as CalibratedProject;
      if (data.format !== 'pianoverse-project') throw new Error('Not a Pianoverse project file.');
      openProject(data);
    } catch (e) {
      toast(`Could not open the project: ${(e as Error).message}`, { kind: 'error' });
    }
  };

  const openItems = (items: Picked[]) => {
    const proj = items.find((i) => i.kind === 'project');
    const vid = items.find((i): i is PickedVideo => i.kind === 'video');
    const mid = items.find((i): i is PickedMidi => i.kind === 'midi');
    if (proj) { applyProjectText(proj.text); if (vid) setTimeout(() => loadVideo(vid, false), 0); return; }
    if (vid) {
      const fresh = route === 'home' || !project;
      if (fresh) { setProjectState(null); setRoute('project'); setStep('import'); }
      loadVideo(vid, fresh);
      if (mid) pendingMidi.current = mid;
      return;
    }
    if (mid) {
      if (!project || route !== 'project') { toast('Open or start a project with its video first, then add the MIDI file.', { kind: 'error' }); return; }
      notesApi.importMidi(mid);
    }
  };
  const openItemsRef = useRef(openItems);
  openItemsRef.current = openItems;

  const onFiles = (files: FileList | null | undefined) => {
    if (files?.length) openFiles(Array.from(files)).then(openItems);
  };
  const pick = (what: PickKind) => {
    pickNative(what).then(openItems).catch(toastError);
  };

  // native drag and drop in the desktop app (gives file paths, so videos can be converted)
  useEffect(() => {
    if (!inTauri()) return;
    let un: (() => void) | undefined;
    let gone = false;
    onNativeDrop((items) => openItemsRef.current(items)).then((u) => { if (gone) u(); else un = u; });
    return () => { gone = true; un?.(); };
  }, []);

  // a MIDI file dropped together with a new video is imported once the project exists
  useEffect(() => {
    const m = pendingMidi.current;
    if (m && project && video && !videoIssue) { pendingMidi.current = null; notesApi.importMidi(m); }
  }, [project?.id, video, videoIssue]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMetadata = (v: HTMLVideoElement) => {
    // a video track the player can't decode shows up as 0 x 0 (audio only)
    if (!v.videoWidth) { setVideoIssue({ kind: 'unsupported' }); return; }
    setDuration(v.duration);
    if (!video) return;
    const original = editCopyOf.current;
    editCopyOf.current = null;
    const paths = original ? { path: original, editPath: video.path } : { path: video.path, editPath: undefined };
    if (wantNewProject.current && !project) {
      wantNewProject.current = false;
      const base = video.name.replace(/\.[^.]+$/, '') || 'Untitled';
      const p = newProject(base, video.name, v.videoWidth, v.videoHeight, v.duration || 0);
      // new projects start with the default preset
      const preset = presets.find((x) => x.id === defaultPresetId) ?? presets[0];
      setProjectState({ ...p, id: newId(), video: { ...p.video, ...paths, duration: v.duration }, look: applyPreset(undefined, preset), presetId: preset.id });
    } else if (project && (project.video.file !== video.name || project.video.width !== v.videoWidth || (paths.path && project.video.path !== paths.path) || (paths.editPath && project.video.editPath !== paths.editPath))) {
      // the project's video was replaced or found again
      setProjectState({ ...project, video: { ...project.video, file: video.name, width: v.videoWidth, height: v.videoHeight, duration: v.duration, ...(paths.path ? paths : {}) } });
    }
  };

  const convert = async () => {
    if (!video?.path) return;
    const createProject = wantNewProject.current || !project;
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
    if (s === 'export') pause();
    if (s === 'calibrate' && project && !project.calibration) setProjectState({ ...project, calibration: calibrationFromTracking(project, time) });
    if (s === 'calibrate') pause();
    setStep(s);
  };
  const goHome = () => { pause(); setRoute('home'); setHomeKey((k) => k + 1); };
  const newProjectFlow = () => { lastThumb.current = undefined; pause(); setProjectState(null); setVideo(null); setVideoIssue(null); setDuration(0); setTime(0); setRoute('project'); setStep('import'); };

  // test hook: the camera's window at a moment (null when the Camera step isn't showing it)
  (window as unknown as { pianoverseCamera: unknown }).pianoverseCamera = (t: number) => { const c = camRef.current; return c ? cameraFrameAt(c.p, t, c.dur) : null; };
  // test hook: lets automated checks pick a part of the timeline
  (window as unknown as { pianoverseSetLoop: unknown }).pianoverseSetLoop = setLoop;
  (window as unknown as { pianoverseSeek: unknown }).pianoverseSeek = seek;
  const ws: WS = {
    project, setProject, video, videoEl: videoRef, videoIssue, convert,
    time, duration, playing, togglePlay, seek, frameTick,
    calib, notes: notesApi, renderer: rendererRef.current, layers, setLayers, scale, setScale, sweep, setSweep,
    pick, onFiles, loop, setLoop, presets, defaultPresetId, refreshPresets, goStep, goHome,
    brand, setBrand, inspect, setInspect, redraw: () => redraw(),
  };

  const ready = !!project && !!video && !videoIssue;
  readyRef.current = ready;
  goStepRef.current = goStep;
  const doneStep = (s: Step) =>
    s === 'import' ? ready : s === 'notes' ? !!project?.notes.length : s === 'calibrate' ? !!project?.progress?.calibrated : s === 'camera' ? !!project?.cameraTrack : false;
  const saveText = saved.state === 'saving' ? 'Saving…' : saved.state === 'error' ? 'Not saved' : saved.state === 'saved' ? `Saved ${ago(saved.at)}` : '';

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}>
      <header className="topbar">
        <button type="button" className="brand" onClick={goHome} title="Projects">Pianoverse</button>
        {route === 'project' && <span className="project-name" title={project?.name}>{project?.name ?? 'New project'}</span>}
        {route === 'project' && (
          <nav className="stepper" aria-label="Steps">
            <span className="trail">
              {STEPS.slice(0, 3).map((s, i) => {
                const done = doneStep(s.id);
                return (
                  <button key={s.id} type="button" className={'step-btn' + (step === s.id ? ' on' : '') + (done ? ' done' : '')} disabled={s.id !== 'import' && !ready}
                    onClick={() => goStep(s.id)} aria-current={step === s.id ? 'step' : undefined}>
                    <span className="dot">{i + 1}</span>{s.label}{done && step !== s.id && <svg className="tick" width="11" height="11" viewBox="0 0 12 12" aria-label="done"><path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>}
                  </button>
                );
              })}
            </span>
            <span className="rooms">
              {STEPS.slice(3).map((s) => (
                <button key={s.id} type="button" className={'step-btn room' + (step === s.id ? ' on' : '')} disabled={!ready}
                  onClick={() => goStep(s.id)} aria-current={step === s.id ? 'page' : undefined}>{s.label}</button>
              ))}
            </span>
          </nav>
        )}
        <div className="top-right">
          <UpdatePill phase={updater.phase} />
          {route === 'project' && project && (
            <div className="undo-redo">
              <button type="button" className="btn icon ghost" onClick={undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
              </button>
              <button type="button" className="btn icon ghost" onClick={redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
              </button>
            </div>
          )}
          {route === 'project' ? <span className="saved dim">{saveText}</span> : <span className="gpu">{gpuError ? 'WebGPU unavailable' : gpuName}</span>}
          <div className="menu-wrap">
            <button type="button" className="btn icon" onClick={() => setMenu(!menu)} aria-label="Settings" title="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
            </button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <div className="menu-head"><b>Pianoverse {updater.version && `v${updater.version}`}</b><small>{updateStatusText(updater.phase) || (inTauri() ? '' : 'Browser preview')}</small></div>
                {inTauri() && <button type="button" onClick={() => updater.check()}>Check for updates</button>}
                <button type="button" onClick={() => { setMenu(false); setShortcuts(true); }}>Keyboard shortcuts <kbd>?</kbd></button>
                {project && <button type="button" onClick={() => { setMenu(false); saveProject(project, project.video.file).catch(toastError); }}>Save project file…</button>}
                <div className="menu-foot dim">{gpuError ? `Graphics: ${gpuError}` : `Graphics: ${gpuName || '…'}`}</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="route">
        {route === 'home' && <Home onNew={newProjectFlow} onOpen={(id) => loadFromStore(id).then(openProject).catch(toastError)} onPick={pick} onFiles={onFiles} refreshKey={homeKey} />}
        {route === 'project' && step === 'import' && <ImportStep ws={ws} />}
        {route === 'project' && step === 'notes' && ready && <NotesStep ws={ws} />}
        {route === 'project' && step === 'calibrate' && ready && <CalibrateStep ws={ws} />}
        {route === 'project' && step === 'light' && ready && (gpuError
          ? <div className="notice">This window can't use the graphics card: {gpuError}</div>
          : <LightStep ws={ws} attachPreview={attachPreview} />)}
        {route === 'project' && step === 'camera' && ready && (gpuError
          ? <div className="notice">This window can't use the graphics card: {gpuError}</div>
          : <CameraStep ws={ws} attachPreview={attachPreview} />)}
        {route === 'project' && step === 'style' && ready && (gpuError
          ? <div className="notice">This window can't use the graphics card: {gpuError}</div>
          : <StyleStep ws={ws} attachPreview={attachPreview} fps={fps} stats={showStats ? `${fps} fps · ${stats}` : ''} />)}
        {route === 'project' && step === 'export' && ready && (gpuError
          ? <div className="notice">This window can't use the graphics card: {gpuError}</div>
          : <ExportStep ws={ws} />)}
      </div>

      <video
        ref={videoRef}
        src={videoUrl || undefined}
        crossOrigin="anonymous"
        preload="auto"
        playsInline
        style={{ display: 'none' }}
        onLoadedMetadata={(e) => onMetadata(e.currentTarget)}
        onLoadedData={() => redraw()}
        onSeeked={() => redraw()}
        onEnded={() => setPlaying(false)}
        onError={() => { if (videoUrl) setVideoIssue((cur) => cur ?? { kind: 'unsupported' }); }}
      />
      {shortcuts && <Shortcuts onClose={() => setShortcuts(false)} />}
      <Toasts />
    </div>
  );
}
