import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_LAYERS, Layers, Renderer } from './engine/renderer';
import { CalibratedProject, testNotes } from './engine/calibration';
import { UpdatePill, updateStatusText, useUpdater } from './updater';
import { calibrationFromTracking, newProject, useCalibration } from './ui/useCalibration';
import { saveProject } from './ui/saveProject';
import { convertVideo, inTauri, onNativeDrop, openFiles, openPaths, Picked, PickedMidi, PickedVideo, PickKind, pickNative } from './ui/media';
import { useNotes } from './ui/useNotes';
import { ago, fileExists, loadFromStore, makeThumb, newId, saveToStore } from './ui/projectStore';
import { Step, STEPS, VideoIssue, WS } from './ui/workspace';
import Home from './ui/Home';
import ImportStep from './ui/steps/ImportStep';
import NotesStep from './ui/steps/NotesStep';
import CalibrateStep from './ui/steps/CalibrateStep';
import StyleStep from './ui/steps/StyleStep';

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

const Logo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="none" stroke="#2FD3B5" strokeWidth="1.8" /><path d="M8 6.5v7M12 5v9M16 7.5v6" stroke="#2FD3B5" strokeWidth="1.8" strokeLinecap="round" /><path d="M5.5 17.5h13" stroke="#E8EAED" strokeWidth="1.8" strokeLinecap="round" /></svg>
);

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
  const [loop, setLoop] = useState<{ on: boolean; range: [number, number] | null }>({ on: false, range: null });
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const [homeKey, setHomeKey] = useState(0);
  const frameTimes = useRef<number[]>([]);
  const wantNewProject = useRef(false);
  const editCopyOf = useRef<string | null>(null);
  const pendingMidi = useRef<PickedMidi | null>(null);
  const lastThumb = useRef<string | undefined>(undefined);
  const stepRef = useRef<Step>('import');
  const updater = useUpdater();
  stepRef.current = step;
  const videoUrl = video && !videoIssue ? video.url : video?.url ?? null;

  const setProject = useCallback((p: CalibratedProject) => setProjectState(p), []);
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

  const previewing = route === 'project' && step === 'style';
  const draw = useCallback((t?: number) => {
    const r = rendererRef.current;
    const v = videoRef.current;
    if (!r || !v || v.readyState < 2 || !v.videoWidth) return;
    if ((window as unknown as { __pvHeadless?: boolean }).__pvHeadless) return; // automated tests capture offscreen
    r.render(v, t ?? v.currentTime);
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
  useEffect(() => { rendererRef.current?.setScale(scale); if (previewing) draw(); }, [scale, gpuName, draw, previewing]);
  useEffect(() => { if (rendererRef.current) { rendererRef.current.layers = layers; if (previewing) draw(); } }, [layers, draw, previewing]);
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
        // looping a selected section: jump back to its start at its end
        const lp = loopRef.current;
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
      if (lp.on && lp.range && (v.currentTime < lp.range[0] || v.currentTime >= lp.range[1] - 0.05)) v.currentTime = lp.range[0];
      v.play(); setPlaying(true);
    } else { v.pause(); setPlaying(false); }
  }, [videoUrl, videoIssue]);
  // whole-video looping when no section is selected
  useEffect(() => { const v = videoRef.current; if (v) v.loop = loop.on && !loop.range; }, [loop]);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || route !== 'project') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const v = videoRef.current;
      const st = 1 / (project?.video.fps || 30);
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight' && v) seek(v.currentTime + (e.shiftKey ? 1 : st));
      else if (e.code === 'ArrowLeft' && v) seek(v.currentTime - (e.shiftKey ? 1 : st));
      else if (e.code === 'KeyP') setShowStats((s) => !s);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, project?.video.fps, route]);

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
          if (stepRef.current === 'style' && r && !(window as unknown as { __pvHeadless?: boolean }).__pvHeadless) {
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
      alert(`Could not open project: ${(e as Error).message}`);
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
      if (!project || route !== 'project') { alert('Open or start a project with its video first, then add the MIDI file.'); return; }
      notesApi.importMidi(mid);
    }
  };
  const openItemsRef = useRef(openItems);
  openItemsRef.current = openItems;

  const onFiles = (files: FileList | null | undefined) => {
    if (files?.length) openFiles(Array.from(files)).then(openItems);
  };
  const pick = (what: PickKind) => {
    pickNative(what).then(openItems).catch((e) => alert(String(e?.message ?? e)));
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
      setProjectState({ ...p, id: newId(), video: { ...p.video, ...paths, duration: v.duration } });
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
    if (s === 'export') return;
    if (s === 'calibrate' && project && !project.calibration) setProjectState({ ...project, calibration: calibrationFromTracking(project, time) });
    if (s === 'calibrate') pause();
    setStep(s);
  };
  const goHome = () => { pause(); setRoute('home'); setHomeKey((k) => k + 1); };
  const newProjectFlow = () => { lastThumb.current = undefined; pause(); setProjectState(null); setVideo(null); setVideoIssue(null); setDuration(0); setTime(0); setRoute('project'); setStep('import'); };

  const ws: WS = {
    project, setProject, video, videoEl: videoRef, videoIssue, convert,
    time, duration, playing, togglePlay, seek, frameTick,
    calib, notes: notesApi, renderer: rendererRef.current, layers, setLayers, scale, setScale, sweep, setSweep,
    pick, onFiles, loop, setLoop, goStep, goHome,
  };

  const ready = !!project && !!video && !videoIssue;
  const doneStep = (s: Step) =>
    s === 'import' ? ready : s === 'notes' ? !!project?.notes.length : s === 'calibrate' ? !!project?.progress?.calibrated : false;
  const saveText = saved.state === 'saving' ? 'Saving…' : saved.state === 'error' ? 'Not saved' : saved.state === 'saved' ? `Saved ${ago(saved.at)}` : '';

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}>
      <header className="topbar">
        <button type="button" className="brand" onClick={goHome} title="Projects"><Logo /><span>Pianoverse</span></button>
        {route === 'project' && <span className="project-name">{project?.name ?? 'New project'}</span>}
        {route === 'project' && (
          <nav className="stepper" aria-label="Steps">
            {STEPS.map((s, i) => {
              const done = doneStep(s.id);
              const disabled = s.id === 'export' || (s.id !== 'import' && !ready);
              return (
                <button key={s.id} type="button" className={'step-btn' + (step === s.id ? ' on' : '') + (done ? ' done' : '')} disabled={disabled}
                  onClick={() => goStep(s.id)} title={s.id === 'export' ? 'Export arrives in Milestone 5' : undefined}>
                  <span className="dot">{done && step !== s.id ? '✓' : i + 1}</span>{s.label}
                </button>
              );
            })}
          </nav>
        )}
        <div className="top-right">
          <UpdatePill phase={updater.phase} />
          {route === 'project' ? <span className="saved dim">{saveText}</span> : <span className="gpu">{gpuError ? 'WebGPU unavailable' : gpuName}</span>}
          <div className="menu-wrap">
            <button type="button" className="btn icon" onClick={() => setMenu(!menu)} aria-label="Settings" title="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
            </button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <div className="menu-head"><b>Pianoverse {updater.version && `v${updater.version}`}</b><small>{updateStatusText(updater.phase) || (inTauri() ? '' : 'Browser preview')}</small></div>
                {inTauri() && <button type="button" onClick={() => updater.check()}>Check for updates</button>}
                {project && <button type="button" onClick={() => { setMenu(false); saveProject(project, project.video.file).catch((e) => alert(String(e?.message ?? e))); }}>Save project file…</button>}
                <div className="menu-foot dim">{gpuError ? `Graphics: ${gpuError}` : `Graphics: ${gpuName || '…'}`}</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="route">
        {route === 'home' && <Home onNew={newProjectFlow} onOpen={(id) => loadFromStore(id).then(openProject).catch((e) => alert(String(e?.message ?? e)))} onPick={pick} onFiles={onFiles} refreshKey={homeKey} />}
        {route === 'project' && step === 'import' && <ImportStep ws={ws} />}
        {route === 'project' && step === 'notes' && ready && <NotesStep ws={ws} />}
        {route === 'project' && step === 'calibrate' && ready && <CalibrateStep ws={ws} />}
        {route === 'project' && step === 'style' && ready && (gpuError
          ? <div className="notice">This window can't use the graphics card: {gpuError}</div>
          : <StyleStep ws={ws} attachPreview={attachPreview} fps={fps} stats={showStats ? `${fps} fps · ${stats}` : ''} />)}
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
    </div>
  );
}
