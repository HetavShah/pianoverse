import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_LAYERS, Layers, Renderer } from './engine/renderer';
import type { ProjectFile } from './engine/project';

const LAYER_LABELS: [keyof Layers, string][] = [
  ['notes', 'Notes'],
  ['saber', 'Saber'],
  ['particles', 'Particles'],
  ['impact', 'Impact and light'],
  ['keys', 'Key glow'],
  ['bloom', 'Bloom'],
];

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
  const [project, setProject] = useState<ProjectFile | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState('');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scale, setScale] = useState(0.5);
  const [layers, setLayers] = useState<Layers>({ ...DEFAULT_LAYERS });
  const [fps, setFps] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState('');
  const frameTimes = useRef<number[]>([]);

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

  // keep renderer in sync with project, quality and layers
  useEffect(() => { if (project && rendererRef.current) { rendererRef.current.setProject(project); draw(); } }, [project, gpuName, draw]);
  useEffect(() => { rendererRef.current?.setScale(scale); draw(); }, [scale, gpuName, draw]);
  useEffect(() => { if (rendererRef.current) { rendererRef.current.layers = layers; draw(); } }, [layers, draw]);

  // render every decoded video frame while playing
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing) return;
    let stop = false;
    if (v.requestVideoFrameCallback) {
      const tick = (_now: number, meta: { mediaTime: number }) => {
        if (stop) return;
        draw(meta.mediaTime);
        setTime(meta.mediaTime);
        v.requestVideoFrameCallback!(tick);
      };
      v.requestVideoFrameCallback(tick);
    } else {
      const loop = () => { if (stop) return; draw(); setTime(v.currentTime); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    return () => { stop = true; };
  }, [playing, draw]);

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
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const v = videoRef.current;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight' && v) seek(v.currentTime + (e.shiftKey ? 1 : 1 / 30));
      else if (e.code === 'ArrowLeft' && v) seek(v.currentTime - (e.shiftKey ? 1 : 1 / 30));
      else if (e.code === 'KeyP') setShowStats((s) => !s);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seek]);

  const onVideoFile = (f: File | undefined) => {
    if (!f) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(f));
    setVideoName(f.name);
    setPlaying(false);
  };

  const onProjectFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as ProjectFile;
      if (data.format !== 'pianoverse-project') throw new Error('Not a Pianoverse project file.');
      setProject(data);
    } catch (e) {
      alert(`Could not open project: ${(e as Error).message}`);
    }
  };

  const ready = !!project && !!videoUrl;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="none" stroke="#2FD3B5" strokeWidth="1.8" /><path d="M8 6.5v7M12 5v9M16 7.5v6" stroke="#2FD3B5" strokeWidth="1.8" strokeLinecap="round" /><path d="M5.5 17.5h13" stroke="#E8EAED" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <span>Pianoverse</span>
        </div>
        <span className="project-name">{project?.name ?? 'No project open'}</span>
        <div className="open-buttons">
          <label className="btn">
            Open video…
            <input type="file" accept="video/*" hidden onChange={(e) => onVideoFile(e.target.files?.[0])} />
          </label>
          <label className="btn">
            Open project data…
            <input type="file" accept=".json,application/json" hidden onChange={(e) => onProjectFile(e.target.files?.[0])} />
          </label>
        </div>
        <span className="gpu">{gpuError ? 'WebGPU unavailable' : gpuName}</span>
      </header>

      <div className="body">
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
          <div className="hint">Space play/pause · ← → step a frame · P stats</div>
        </nav>

        <main className="stage">
          {gpuError && <div className="notice">This window can't use the graphics card: {gpuError}</div>}
          {!gpuError && !ready && (
            <div className="notice">
              Open the video and its project data to start.<br />
              The sample is in <code>F:\Pianoverse\samples</code>: <code>interstellar-take1.mp4</code> and <code>interstellar-take1.pvproj.json</code>.
              {videoName && <><br />Video: {videoName}</>}
              {project && <><br />Project: {project.name}</>}
            </div>
          )}
          <canvas ref={canvasRef} className="preview" style={{ visibility: ready ? 'visible' : 'hidden' }} />
          {showStats && <div className="stats">{fps} fps · {stats}</div>}
        </main>
      </div>

      <footer className="transport">
        <button type="button" className="play" onClick={togglePlay} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'}>
          {playing
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="#0B0D10" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="#0B0D10" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>}
        </button>
        <span className="time">{fmt(time)} <span className="dim">/ {fmt(duration)}</span></span>
        <input
          className="scrub" type="range" min={0} max={duration || 1} step={0.001} value={time}
          onChange={(e) => seek(Number(e.target.value))} disabled={!ready} aria-label="Timeline"
        />
      </footer>

      <video
        ref={videoRef}
        src={videoUrl ?? undefined}
        preload="auto"
        playsInline
        style={{ display: 'none' }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onLoadedData={() => draw()}
        onSeeked={() => draw()}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}
