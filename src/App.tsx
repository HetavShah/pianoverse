import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_LAYERS, Layers, Renderer } from './engine/renderer';
import { CalibratedProject, testNotes } from './engine/calibration';
import { VersionAndUpdates } from './updater';
import CalibrateCanvas from './ui/CalibrateCanvas';
import CalibratePanel, { QualityStrip } from './ui/CalibratePanel';
import { calibrationFromTracking, newProject, useCalibration } from './ui/useCalibration';
import { saveProject } from './ui/saveProject';

const LAYER_LABELS: [keyof Layers, string][] = [
  ['notes', 'Notes'],
  ['saber', 'Saber'],
  ['particles', 'Particles'],
  ['impact', 'Impact and light'],
  ['keys', 'Key glow'],
  ['bloom', 'Bloom'],
];

type Mode = 'calibrate' | 'preview';

function fmt(t: number) {
  if (!isFinite(t)) return '0:00.0';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<RVFCVideo>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [gpuName, setGpuName] = useState('');
  const [project, setProject] = useState<CalibratedProject | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState('');
  const [mode, setMode] = useState<Mode>('preview');
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
  const [saveMsg, setSaveMsg] = useState('');
  const frameTimes = useRef<number[]>([]);
  const wantNewProject = useRef(false);

  const calib = useCalibration({ project, setProject, time, videoUrl });
  // test hook: lets automated checks read the current project
  useEffect(() => { (window as unknown as { pianoverseProject: unknown }).pianoverseProject = project; }, [project]);

  // GPU setup
  useEffect(() => {
    let cancelled = false;
    if (!canvasRef.current || rendererRef.current) return;
    Renderer.create(canvasRef.current)
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

  const draw = useCallback((t?: number) => {
    const r = rendererRef.current;
    const v = videoRef.current;
    if (!r || !v || v.readyState < 2) return;
    if ((window as unknown as { __pvHeadless?: boolean }).__pvHeadless) return; // automated tests capture offscreen
    r.render(v, t ?? v.currentTime);
    const now = performance.now();
    const ft = frameTimes.current;
    ft.push(now);
    while (ft.length > 30) ft.shift();
    if (ft.length > 5) setFps(Math.round(((ft.length - 1) * 1000) / (ft[ft.length - 1] - ft[0])));
    const s = r.stats;
    setStats(`${r.size.width}×${r.size.height} · ${s.notes} notes · ${s.emitters} emitters · CPU ${s.cpuMs.toFixed(1)} ms`);
  }, []);

  const redraw = useCallback((t?: number) => {
    if (mode === 'preview') draw(t);
    else setFrameTick((k) => k + 1);
  }, [mode, draw]);

  // keep renderer in sync with project, quality and layers (only while previewing; calibration edits are cheap to skip)
  useEffect(() => {
    if (mode === 'preview' && renderProject && rendererRef.current) { rendererRef.current.setProject(renderProject); draw(); }
  }, [renderProject, gpuName, draw, mode]);
  useEffect(() => { rendererRef.current?.setScale(scale); if (mode === 'preview') draw(); }, [scale, gpuName, draw, mode]);
  useEffect(() => { if (rendererRef.current) { rendererRef.current.layers = layers; if (mode === 'preview') draw(); } }, [layers, draw, mode]);

  // render every decoded video frame while playing
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing) return;
    let stop = false;
    if (v.requestVideoFrameCallback) {
      const tick = (_now: number, meta: { mediaTime: number }) => {
        if (stop) return;
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
    if (!v || !videoUrl) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }, [videoUrl]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration || t));
    setTime(v.currentTime);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // handled by the calibration editor
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      const v = videoRef.current;
      const step = 1 / (project?.video.fps || 30);
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight' && v) seek(v.currentTime + (e.shiftKey ? 1 : step));
      else if (e.code === 'ArrowLeft' && v) seek(v.currentTime - (e.shiftKey ? 1 : step));
      else if (e.code === 'KeyP') setShowStats((s) => !s);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, project?.video.fps]);

  const onVideoFile = (f: File | undefined, createProject = false) => {
    if (!f) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(f));
    setVideoName(f.name);
    setPlaying(false);
    wantNewProject.current = createProject;
  };

  const onProjectFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as CalibratedProject;
      if (data.format !== 'pianoverse-project') throw new Error('Not a Pianoverse project file.');
      wantNewProject.current = false;
      setProject(data);
      setMode('preview');
    } catch (e) {
      alert(`Could not open project: ${(e as Error).message}`);
    }
  };

  const onFiles = (files: FileList | null | undefined) => {
    if (!files) return;
    const list = Array.from(files);
    const hasProject = list.some((f) => f.name.toLowerCase().endsWith('.json'));
    for (const f of list) {
      const name = f.name.toLowerCase();
      if (name.endsWith('.json')) onProjectFile(f);
      else if (f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/.test(name)) onVideoFile(f, !hasProject);
    }
  };

  const startNewProject = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { wantNewProject.current = true; return; }
    wantNewProject.current = false;
    const base = videoName.replace(/\.[^.]+$/, '') || 'Untitled';
    setProject(newProject(base, videoName, v.videoWidth, v.videoHeight, v.duration || 0));
    setMode('calibrate');
  }, [videoName]);

  const enterCalibrate = () => {
    if (!project) return;
    if (!project.calibration) setProject({ ...project, calibration: calibrationFromTracking(project, time) });
    setPlaying(false);
    videoRef.current?.pause();
    setMode('calibrate');
  };

  const doSave = async () => {
    if (!project) return;
    try {
      const where = await saveProject(project, videoName);
      if (where) { setSaveMsg('Saved'); setTimeout(() => setSaveMsg(''), 2500); }
    } catch (e) {
      alert(String((e as Error)?.message ?? e));
    }
  };

  const ready = !!project && !!videoUrl;
  const calibrating = ready && mode === 'calibrate' && !!calib.corners;

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}>
      <header className="topbar">
        <div className="brand">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="none" stroke="#2FD3B5" strokeWidth="1.8" /><path d="M8 6.5v7M12 5v9M16 7.5v6" stroke="#2FD3B5" strokeWidth="1.8" strokeLinecap="round" /><path d="M5.5 17.5h13" stroke="#E8EAED" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <span>Pianoverse</span>
        </div>
        <VersionAndUpdates />
        <span className="project-name">{project?.name ?? 'No project open'}</span>
        {ready && (
          <div className="seg modes" role="tablist" aria-label="Mode">
            <button type="button" role="tab" aria-selected={mode === 'calibrate'} className={mode === 'calibrate' ? 'on' : ''} onClick={enterCalibrate}>Calibrate</button>
            <button type="button" role="tab" aria-selected={mode === 'preview'} className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')} disabled={calib.track.kind === 'running'}>Preview</button>
          </div>
        )}
        <div className="open-buttons">
          {saveMsg && <span className="saved">{saveMsg}</span>}
          {project && <button type="button" className="btn" onClick={doSave}>Save project…</button>}
          <label className="btn">
            Open files…
            <input type="file" multiple accept="video/*,.mp4,.mov,.webm,.json,application/json" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        <span className="gpu">{gpuError ? 'WebGPU unavailable' : gpuName}</span>
      </header>

      <div className="body">
        {calibrating && project ? (
          <CalibratePanel project={project} c={calib} sweep={sweep} setSweep={setSweep} seek={seek} onDone={() => setMode('preview')} />
        ) : (
          <nav className="layers" aria-label="Layers">
            <span className="section-label">Layers</span>
            {LAYER_LABELS.map(([key, label]) => (
              <label key={key} className="layer">
                <input type="checkbox" checked={layers[key]} onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
            <span className="section-label">Preview quality</span>
            <select value={scale} onChange={(e) => setScale(Number(e.target.value))} aria-label="Preview quality">
              <option value={0.25}>Quarter</option>
              <option value={0.5}>Half</option>
              <option value={1}>Full</option>
            </select>
            {project && (
              <>
                <span className="section-label">Notes</span>
                {noNotes ? (
                  <p className="help">No notes yet, so a sweep across every key is shown. MIDI import comes in the next milestone.</p>
                ) : (
                  <label className="layer">
                    <input type="checkbox" checked={sweep} onChange={(e) => setSweep(e.target.checked)} />
                    Key sweep instead of notes
                  </label>
                )}
              </>
            )}
            <div className="hint">Space play/pause · ← → step a frame · P stats</div>
          </nav>
        )}

        <main className="stage">
          {gpuError && <div className="notice">This window can't use the graphics card: {gpuError}</div>}
          {!gpuError && !ready && (
            <div className="start">
              <h1>Open your performance</h1>
              <p>Pick a video to set up, or a video together with its saved project. You can also drop files anywhere on this window.</p>
              <div className={'step' + (videoName ? ' done' : '')}>
                <span className="dot">{videoName ? '✓' : '1'}</span>
                <span className="what"><b>Video</b><small>{videoName || 'mp4, mov or webm'}</small></span>
                <label className="btn">
                  {videoName ? 'Change' : 'Choose video'}
                  <input type="file" accept="video/*,.mp4,.mov,.webm" hidden onChange={(e) => { onVideoFile(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </div>
              <div className={'step' + (project ? ' done' : '')}>
                <span className="dot">{project ? '✓' : '2'}</span>
                <span className="what"><b>Project</b><small>{project ? project.name : 'a saved .pvproj.json (optional)'}</small></span>
                <label className="btn">
                  Open project
                  <input type="file" accept=".json,application/json" hidden onChange={(e) => { onProjectFile(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </div>
              {videoName && !project ? (
                <button type="button" className="btn primary" onClick={startNewProject}>Set up this video</button>
              ) : (
                <label className="btn primary">
                  Choose files…
                  <input type="file" multiple accept="video/*,.mp4,.mov,.webm,.json,application/json" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
                </label>
              )}
            </div>
          )}
          <canvas ref={canvasRef} className="preview" style={{ visibility: ready && mode === 'preview' ? 'visible' : 'hidden' }} />
          {calibrating && project && calib.corners && (
            <CalibrateCanvas
              video={videoRef.current}
              videoW={project.video.width}
              videoH={project.video.height}
              frameKey={frameTick + time}
              corners={calib.corners}
              edge={calib.edge}
              whiteKeys={project.keyboard.whiteKeys}
              lowestNote={project.keyboard.lowestNote}
              keys={project.keyboard.keys}
              fixed={!!calib.fixHere}
              fixMode={calib.tracked}
              onCorners={calib.onCorners}
              onEdge={calib.onEdge}
            />
          )}
          {showStats && mode === 'preview' && <div className="stats">{fps} fps · {stats}</div>}
          {ready && mode === 'preview' && (noNotes || sweep) && <div className="badge">Key sweep · test notes</div>}
        </main>
      </div>

      <footer className="transport">
        <button type="button" className="play" onClick={togglePlay} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'}>
          {playing
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="#0B0D10" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="#0B0D10" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>}
        </button>
        <span className="time">{fmt(time)} <span className="dim">/ {fmt(duration)}</span></span>
        <div className="scrub-wrap">
          {calibrating && project && <QualityStrip project={project} duration={duration} onSeek={seek} />}
          <input
            className="scrub" type="range" min={0} max={duration || 1} step={0.001} value={time}
            onChange={(e) => seek(Number(e.target.value))} disabled={!ready} aria-label="Timeline"
          />
        </div>
      </footer>

      <video
        ref={videoRef}
        src={videoUrl ?? undefined}
        preload="auto"
        playsInline
        style={{ display: 'none' }}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          if (wantNewProject.current && !project) startNewProject();
        }}
        onLoadedData={() => redraw()}
        onSeeked={() => redraw()}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}
