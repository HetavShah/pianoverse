import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_LAYERS, Layers, Renderer } from './engine/renderer';
import { autoNoteAngle, MAX_TILT } from './engine/direction';
import { CalibratedProject, testNotes } from './engine/calibration';
import { VersionAndUpdates } from './updater';
import CalibrateCanvas from './ui/CalibrateCanvas';
import CalibratePanel, { QualityStrip } from './ui/CalibratePanel';
import { calibrationFromTracking, newProject, useCalibration } from './ui/useCalibration';
import { saveProject } from './ui/saveProject';
import { ConvertProgress, convertVideo, inTauri, onNativeDrop, openFiles, Picked, PickedVideo, pickNative } from './ui/media';

type VideoIssue =
  | { kind: 'unsupported' }
  | { kind: 'converting'; progress: ConvertProgress | null }
  | { kind: 'error'; message: string };

/** A file-open control: the native dialog in the desktop app, a file input in a browser. */
function PickButton(props: { what: 'video' | 'project' | 'any'; className: string; children: React.ReactNode; onPick: (what: 'video' | 'project' | 'any') => void; onFiles: (f: FileList | null) => void }) {
  const { what, className, children, onPick, onFiles } = props;
  if (inTauri()) return <button type="button" className={className} onClick={() => onPick(what)}>{children}</button>;
  const accept = what === 'video' ? 'video/*,.mp4,.mov,.webm,.mkv' : what === 'project' ? '.json,application/json' : 'video/*,.mp4,.mov,.webm,.mkv,.json,application/json';
  return (
    <label className={className}>
      {children}
      <input type="file" multiple={what === 'any'} accept={accept} hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
    </label>
  );
}

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
  const [videoSrc, setVideoSrc] = useState<PickedVideo | null>(null);
  const [videoIssue, setVideoIssue] = useState<VideoIssue | null>(null);

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
    if (!r || !v || v.readyState < 2 || !v.videoWidth) return;
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

  // ---------- opening videos and projects ----------
  const loadVideo = (v: PickedVideo, createProject: boolean) => {
    if (videoUrl?.startsWith('blob:') && videoUrl !== v.url) URL.revokeObjectURL(videoUrl);
    setVideoSrc(v);
    setVideoUrl(v.url);
    setVideoName(v.name);
    setPlaying(false);
    setVideoIssue(null);
    wantNewProject.current = createProject;
  };

  const applyProjectText = (text: string) => {
    try {
      const data = JSON.parse(text) as CalibratedProject;
      if (data.format !== 'pianoverse-project') throw new Error('Not a Pianoverse project file.');
      wantNewProject.current = false;
      setProject(data);
      setMode('preview');
    } catch (e) {
      alert(`Could not open project: ${(e as Error).message}`);
    }
  };

  const openItems = (items: Picked[]) => {
    const hasProject = items.some((i) => i.kind === 'project');
    for (const i of items) {
      if (i.kind === 'project') applyProjectText(i.text);
      else loadVideo(i, !hasProject);
    }
  };
  const openItemsRef = useRef(openItems);
  openItemsRef.current = openItems;

  const onFiles = (files: FileList | null | undefined) => {
    if (files?.length) openFiles(Array.from(files)).then(openItems);
  };
  const pick = (what: 'video' | 'project' | 'any') => {
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

  const startNewProject = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { wantNewProject.current = true; return; }
    wantNewProject.current = false;
    const base = videoName.replace(/\.[^.]+$/, '') || 'Untitled';
    setProject(newProject(base, videoName, v.videoWidth, v.videoHeight, v.duration || 0));
    setMode('calibrate');
  }, [videoName]);

  const convert = async () => {
    if (!videoSrc) return;
    const createProject = wantNewProject.current || !project || project.video.file !== videoSrc.name;
    setVideoIssue({ kind: 'converting', progress: null });
    try {
      const copy = await convertVideo(videoSrc, (progress) => setVideoIssue({ kind: 'converting', progress }));
      loadVideo(copy, createProject);
    } catch (e) {
      setVideoIssue({ kind: 'error', message: String((e as Error)?.message ?? e) });
    }
  };

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
          <PickButton what="any" className="btn" onPick={pick} onFiles={onFiles}>Open files…</PickButton>
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
            {project && (() => {
              const auto = autoNoteAngle(project);
              const set = project.look?.noteAngle;
              const angle = typeof set === 'number' ? set : auto;
              const setAngle = (v: number | null) => setProject({ ...project, look: { ...project.look, noteAngle: v } });
              return (
                <>
                  <span className="section-label">Note angle</span>
                  <div className="angle">
                    <svg width="34" height="34" viewBox="-17 -17 34 34" aria-hidden="true">
                      <circle r="15" fill="none" stroke="#2c333c" />
                      <g transform={`rotate(${angle})`}>
                        <line x1="0" y1="-12" x2="0" y2="7" stroke="#2FD3B5" strokeWidth="2" strokeLinecap="round" />
                        <path d="M-4.5 4 L0 10 L4.5 4" fill="none" stroke="#2FD3B5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    </svg>
                    <input type="range" min={-MAX_TILT} max={MAX_TILT} step={1} value={angle} onChange={(e) => setAngle(Number(e.target.value))} aria-label="Note angle" />
                    <span className="deg">{angle}°</span>
                  </div>
                  <p className="help">
                    {typeof set === 'number'
                      ? <>Set by you. <button type="button" className="link inline" onClick={() => setAngle(null)}>Back to automatic ({auto}°)</button></>
                      : auto === 0 ? 'Automatic: straight down suits this camera angle.' : 'Automatic: tilted so every key keeps its own lane.'}
                  </p>
                </>
              );
            })()}
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
          {videoIssue && (
            <div className="start issue">
              <h1>{videoIssue.kind === 'converting' ? 'Making an editing copy…' : 'This video needs converting'}</h1>
              <p>
                <b>{videoName}</b> is in a format Pianoverse's player can't read. Phones usually record HEVC (H.265).
                Pianoverse makes an H.264 copy once, on your graphics card when it can. Your original file isn't changed.
              </p>
              {videoIssue.kind === 'converting' && (
                <div className="track-run">
                  <div className="bar"><div style={{ width: `${videoIssue.progress && videoIssue.progress.total ? Math.min(100, (videoIssue.progress.done / videoIssue.progress.total) * 100) : 0}%` }} /></div>
                  <small>
                    {!videoIssue.progress ? 'Starting…'
                      : videoIssue.progress.phase === 'download'
                        ? `${videoIssue.progress.detail} · ${(videoIssue.progress.done / 1048576).toFixed(0)} of ${(videoIssue.progress.total / 1048576).toFixed(0)} MB`
                        : `${videoIssue.progress.detail} · ${videoIssue.progress.total ? Math.round((videoIssue.progress.done / videoIssue.progress.total) * 100) : 0}%`}
                  </small>
                </div>
              )}
              {videoIssue.kind === 'error' && <pre className="error-box">{videoIssue.message}</pre>}
              {videoIssue.kind !== 'converting' && (videoSrc?.path ? (
                <>
                  <button type="button" className="btn primary" onClick={convert}>{videoIssue.kind === 'error' ? 'Try again' : 'Convert video'}</button>
                  <small className="dim">The first time, Pianoverse downloads its video converter (about 90 MB).</small>
                </>
              ) : (
                <p>Open the video with <b>Open files…</b> in the desktop app to convert it, or convert it to H.264 first.</p>
              ))}
            </div>
          )}
          {!gpuError && !ready && !videoIssue && (
            <div className="start">
              <h1>Open your performance</h1>
              <p>Pick a video to set up, or a video together with its saved project. You can also drop files anywhere on this window.</p>
              <div className={'step' + (videoName ? ' done' : '')}>
                <span className="dot">{videoName ? '✓' : '1'}</span>
                <span className="what"><b>Video</b><small>{videoName || 'mp4, mov or webm'}</small></span>
                <PickButton what="video" className="btn" onPick={pick} onFiles={onFiles}>{videoName ? 'Change' : 'Choose video'}</PickButton>
              </div>
              <div className={'step' + (project ? ' done' : '')}>
                <span className="dot">{project ? '✓' : '2'}</span>
                <span className="what"><b>Project</b><small>{project ? project.name : 'a saved .pvproj.json (optional)'}</small></span>
                <PickButton what="project" className="btn" onPick={pick} onFiles={onFiles}>Open project</PickButton>
              </div>
              {videoName && !project ? (
                <button type="button" className="btn primary" onClick={startNewProject}>Set up this video</button>
              ) : (
                <PickButton what="any" className="btn primary" onPick={pick} onFiles={onFiles}>Choose files…</PickButton>
              )}
            </div>
          )}
          <canvas ref={canvasRef} className="preview" style={{ visibility: ready && mode === 'preview' && !videoIssue ? 'visible' : 'hidden' }} />
          {calibrating && !videoIssue && project && calib.corners && (
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
        crossOrigin="anonymous"
        preload="auto"
        playsInline
        style={{ display: 'none' }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          // a video track the player can't decode shows up as 0 x 0 (audio only)
          if (!v.videoWidth) { setVideoIssue({ kind: 'unsupported' }); return; }
          setDuration(v.duration);
          if (wantNewProject.current && (!project || project.video.file !== videoName)) startNewProject();
        }}
        onError={() => { if (videoUrl) setVideoIssue((cur) => cur ?? { kind: 'unsupported' }); }}
        onLoadedData={() => redraw()}
        onSeeked={() => redraw()}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}
