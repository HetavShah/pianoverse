import { useEffect, useRef, useState } from 'react';
import { autoNoteAngle, MAX_TILT } from '../../engine/direction';
import { pal } from '../../engine/project';
import type { Layers } from '../../engine/renderer';
import { QualityStrip } from '../QualityStrip';
import type { WS } from '../workspace';

const fmtT = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };

const LAYERS: { id: keyof Layers; label: string; kind: string; icon: string }[] = [
  { id: 'notes', label: 'Notes', kind: 'Glass', icon: 'M9 3h6v18H9z' },
  { id: 'saber', label: 'Saber', kind: 'Plasma', icon: 'M3 14h18M6 11c2-2 4-2 6 0s4 2 6 0' },
  { id: 'impact', label: 'Impact', kind: 'Flash', icon: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6' },
  { id: 'particles', label: 'Particles', kind: 'Plumes', icon: 'M7 17a1 1 0 1 0 0 .1M12 9a1 1 0 1 0 0 .1M16 14a1 1 0 1 0 0 .1M10 5a1 1 0 1 0 0 .1M17 6a1 1 0 1 0 0 .1' },
  { id: 'keys', label: 'Key glow', kind: 'Relight', icon: 'M4 6h16v12H4zM9 6v7M15 6v7' },
  { id: 'bloom', label: 'Bloom', kind: 'Soft', icon: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 2v2M12 20v2M2 12h2M20 12h2' },
];

/** whole-clip overview: notes as a piano roll, playhead, click to jump */
function NotesOverview({ ws }: { ws: WS }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const notes = ws.project?.notes ?? [];
  const dur = ws.duration || 1;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    let lo = 127, hi = 0;
    for (const n of notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
    const rows = Math.max(1, hi - lo + 1);
    for (const n of notes) {
      const c = pal(n.p);
      ctx.fillStyle = `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
      ctx.fillRect((n.s / dur) * w, h - 3 - ((n.p - lo + 0.5) / rows) * (h - 6), Math.max(1.5, ((n.e - n.s) / dur) * w), 2);
    }
    ctx.fillStyle = '#e8eaed';
    ctx.fillRect(Math.round((ws.time / dur) * w), 0, 1.5, h);
  });
  return <canvas ref={ref} className="overview" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); ws.seek(((e.clientX - r.left) / r.width) * dur); }} />;
}

export default function StyleStep({ ws, attachPreview, fps, stats }: { ws: WS; attachPreview: (c: HTMLCanvasElement | null) => void; fps: number; stats: string }) {
  const { project } = ws;
  const [sel, setSel] = useState<keyof Layers>('notes');
  const [original, setOriginal] = useState(false);
  const [guides, setGuides] = useState(false);
  const [loop, setLoop] = useState(false);
  const origRef = useRef<HTMLCanvasElement>(null);
  const v = ws.videoEl.current;

  useEffect(() => { if (v) v.loop = loop; }, [v, loop]);
  // "Original": the plain video frame, drawn on top of the effects canvas
  useEffect(() => {
    const cv = origRef.current;
    if (!original || !cv || !v || !v.videoWidth) return;
    cv.width = v.videoWidth / 2; cv.height = v.videoHeight / 2;
    cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height);
  }, [original, v, ws.time, ws.frameTick]);

  if (!project) return null;
  const noNotes = project.notes.length === 0;
  const layer = LAYERS.find((l) => l.id === sel)!;
  const autoAngle = autoNoteAngle(project);
  const setAngle = project.look?.noteAngle;
  const angle = typeof setAngle === 'number' ? setAngle : autoAngle;
  const setNoteAngle = (a: number | null) => ws.setProject({ ...project, look: { ...project.look, noteAngle: a } });
  const tall = project.video.height > project.video.width;

  return (
    <div className="style-page">
      <nav className="style-layers" aria-label="Layers">
        <span className="section-label">Layers</span>
        {LAYERS.map((l) => (
          <div key={l.id} className={'layer-row' + (sel === l.id ? ' on' : '') + (ws.layers[l.id] ? '' : ' off')} onClick={() => setSel(l.id)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d={l.icon} /></svg>
            <span className="name">{l.label}</span>
            <span className="kind">{l.kind}</span>
            <input type="checkbox" checked={ws.layers[l.id]} onClick={(e) => e.stopPropagation()} onChange={(e) => ws.setLayers({ ...ws.layers, [l.id]: e.target.checked })} aria-label={`Show ${l.label}`} />
          </div>
        ))}
        <div className="hint">Space play/pause · ← → step a frame · P stats</div>
      </nav>

      <main className="style-center">
        <div className="preview-bar">
          <div className="seg">
            <button type="button" className={original ? 'on' : ''} onClick={() => setOriginal(true)}>Original</button>
            <button type="button" className={original ? '' : 'on'} onClick={() => setOriginal(false)}>With effects</button>
          </div>
          {tall && <label className="check-inline"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />Shorts guides</label>}
          <span className="spacer" />
          <label className="quality-sel mono dim">
            Preview ·
            <select value={ws.scale} onChange={(e) => ws.setScale(Number(e.target.value))} aria-label="Preview quality">
              <option value={0.25}>quarter res</option>
              <option value={0.5}>half res</option>
              <option value={1}>full res</option>
            </select>
            {fps ? `· ${fps} fps` : ''}
          </label>
        </div>
        <div className="preview-stage">
          <div className="preview-frame" style={{ aspectRatio: `${project.video.width} / ${project.video.height}` }}>
            <canvas ref={attachPreview} className="preview-canvas" />
            {original && <canvas ref={origRef} className="preview-canvas over" />}
            {guides && (
              <div className="shorts-guides" aria-hidden="true">
                <div className="g top">Title and status bar</div>
                <div className="g right">Buttons</div>
                <div className="g bottom">Caption and channel</div>
              </div>
            )}
            {noNotes && <div className="badge">Key sweep · add notes in step 2</div>}
            {!noNotes && ws.sweep && <div className="badge">Key sweep</div>}
          </div>
          {stats && <div className="stats">{stats}</div>}
        </div>
        <div className="transport-row">
          <button type="button" className="btn icon ghost" onClick={() => ws.seek(Math.max(0, ws.time - 5))} aria-label="Back 5 seconds" title="Back 5 s">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM19 5v14l-10-7z" /></svg>
          </button>
          <button type="button" className="play" onClick={ws.togglePlay} aria-label={ws.playing ? 'Pause' : 'Play'}>
            {ws.playing ? <svg width="18" height="18" viewBox="0 0 24 24" fill="#0B0D10"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="#0B0D10"><path d="M7 4.5v15l12-7.5z" /></svg>}
          </button>
          <button type="button" className="btn icon ghost" onClick={() => ws.seek(Math.min(ws.duration, ws.time + 5))} aria-label="Forward 5 seconds" title="Forward 5 s">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM5 5v14l10-7z" /></svg>
          </button>
          <span className="time">{fmtT(ws.time)} <span className="dim">/ {fmtT(ws.duration)}</span></span>
          <button type="button" className={'btn icon' + (loop ? ' on' : ' ghost')} onClick={() => setLoop(!loop)} aria-label="Loop" title="Loop">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" /></svg>
          </button>
        </div>
      </main>

      <aside className="style-side">
        <div className="row"><h2>{layer.label}</h2><label className="check-inline">On <input type="checkbox" checked={ws.layers[sel]} onChange={(e) => ws.setLayers({ ...ws.layers, [sel]: e.target.checked })} /></label></div>
        {sel === 'notes' && (
          <>
            <span className="section-label">Direction</span>
            <div className="angle">
              <svg width="34" height="34" viewBox="-17 -17 34 34" aria-hidden="true">
                <circle r="15" fill="none" stroke="#2c333c" />
                <g transform={`rotate(${angle})`}>
                  <line x1="0" y1="-12" x2="0" y2="7" stroke="#2FD3B5" strokeWidth="2" strokeLinecap="round" />
                  <path d="M-4.5 4 L0 10 L4.5 4" fill="none" stroke="#2FD3B5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </svg>
              <input type="range" min={-MAX_TILT} max={MAX_TILT} step={1} value={angle} onChange={(e) => setNoteAngle(Number(e.target.value))} aria-label="Note angle" />
              <span className="deg">{angle}°</span>
            </div>
            <p className="help">
              {typeof setAngle === 'number'
                ? <>Set by you. <button type="button" className="link inline" onClick={() => setNoteAngle(null)}>Back to automatic ({autoAngle}°)</button></>
                : autoAngle === 0 ? 'Automatic: straight down suits this camera angle.' : 'Automatic: tilted so every key keeps its own lane.'}
            </p>
            {!noNotes && (
              <label className="toggle-row compact">
                <span>Key sweep instead of notes</span>
                <input type="checkbox" checked={ws.sweep} onChange={(e) => ws.setSweep(e.target.checked)} />
              </label>
            )}
          </>
        )}
        <p className="help soon">Colours, sizes, speed and the rest of the {layer.label.toLowerCase()} settings arrive with style panels and presets (Milestone 4).</p>
      </aside>

      <section className="style-timeline">
        <div className="lane"><span>Notes</span><NotesOverview ws={ws} /></div>
        <div className="lane"><span>Tracking</span><QualityStrip project={project} duration={ws.duration} onSeek={ws.seek} /></div>
      </section>
    </div>
  );
}
