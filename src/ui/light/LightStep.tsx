// Light step: the lighting of the video itself. Exposure, contrast, highlights, shadows, warmth and saturation of the
// whole picture, and the room around the keyboard, which can be darkened so the keys and your hands stand out (the
// lit area follows the tracked keyboard). Hold Compare to see the video as filmed.
import { useEffect, useState } from 'react';
import Dial from '../components/Dial';
import Transport from '../components/Transport';
import ScrubBar from '../components/ScrubBar';
import { DEFAULT_LIGHTING, LIGHT_PRESETS, Lighting, lightPresetOf, resolveLighting } from '../../engine/lighting';
import { sourceRect, trimRange } from '../../engine/project';
import type { WS } from '../app/workspace';

type Ctl = { key: keyof Lighting; label: string; min: number; max: number; step: number; fmt: (v: number) => string; hint?: string };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
const WHOLE: Ctl[] = [
  { key: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.05, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV` },
  { key: 'contrast', label: 'Contrast', min: 0.5, max: 1.8, step: 0.01, fmt: pct },
  { key: 'highlights', label: 'Highlights', min: -1, max: 1, step: 0.01, fmt: signed },
  { key: 'shadows', label: 'Shadows', min: -1, max: 1, step: 0.01, fmt: signed },
  { key: 'warmth', label: 'Warmth', min: -1, max: 1, step: 0.01, fmt: signed },
  { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, fmt: pct },
];
const ROOM: Ctl[] = [
  { key: 'room', label: 'Room brightness', min: 0, max: 1, step: 0.01, fmt: pct, hint: 'Lower it to darken everything away from the keyboard' },
  { key: 'reach', label: 'Light around the keys', min: 0.3, max: 3, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'softness', label: 'Softness', min: 0.1, max: 2, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1.5, step: 0.01, fmt: pct },
];

export default function LightStep({ ws, attachPreview }: { ws: WS; attachPreview: (c: HTMLCanvasElement | null) => void }) {
  const project = ws.project!;
  const [compare, setCompare] = useState(false);
  const L = resolveLighting(project.lighting);
  const preset = lightPresetOf(L);
  const R = sourceRect(project);
  const duration = ws.duration || project.video.frames / (project.video.fps || 30);
  const tracked = project.tracking.frames.length > 0;

  // Compare: the renderer shows the video without its lighting while held
  useEffect(() => {
    const r = ws.renderer;
    if (!r) return;
    r.lightingOff = compare;
    ws.redraw();
    return () => { r.lightingOff = false; };
  }, [compare, ws.renderer]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Lighting>) => ws.setProject({ ...project, lighting: { ...L, ...patch } });
  const dial = (c: Ctl) => {
    const v = L[c.key];
    const changed = Math.abs(v - DEFAULT_LIGHTING[c.key]) > 1e-4;
    const off = (c.key === 'reach' || c.key === 'softness') && L.room >= 0.999;
    return (
      <div className={'ctl' + (off ? ' off' : '')} key={c.key}>
        <div className="ctl-head">
          <span>{c.label}</span>
          {changed && <button type="button" className="link inline small-text" onClick={() => set({ [c.key]: DEFAULT_LIGHTING[c.key] })} title="Back to as filmed">Reset</button>}
          <span className="mono val">{c.fmt(v)}</span>
        </div>
        <Dial value={v} min={c.min} max={c.max} step={c.step} label={c.label} fmt={c.fmt} base={DEFAULT_LIGHTING[c.key]} disabled={off} onChange={(x) => set({ [c.key]: x })} />
        {c.hint && <small className="help">{c.hint}</small>}
      </div>
    );
  };

  return (
    <div className="camera-page light-page">
      <main className="style-center">
        <div className="preview-bar">
          <span className="section-label" style={{ margin: 0 }}>Light</span>
          <span className="spacer" />
          <button type="button" className={'btn small' + (compare ? ' on' : '')}
            onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setCompare(true); } }}
            onKeyUp={() => setCompare(false)}
            title="Hold to see the video as filmed">Hold to compare</button>
        </div>
        <div className="preview-stage">
          <div className="preview-frame" style={{ aspectRatio: `${Math.round(R.w)} / ${Math.round(R.h)}` }} onClick={ws.togglePlay} title={ws.playing ? 'Click to pause' : 'Click to play'}>
            <canvas ref={attachPreview} className="preview-canvas" />
            {compare && <div className="badge">As filmed</div>}
          </div>
        </div>
      </main>

      <aside className="style-side">
        <div className="insp-head"><h2>Light</h2><span className="insp-kind">{LIGHT_PRESETS.find((p) => p.id === preset)?.label ?? 'Custom'}</span></div>
        <div className="light-presets">
          {LIGHT_PRESETS.map((p) => (
            <button key={p.id} type="button" className={'choice' + (preset === p.id ? ' on' : '')} onClick={() => set(p.set)}>
              <span className="radio" /><b>{p.label}</b>
            </button>
          ))}
        </div>
        <div className="section-label">Whole video</div>
        {WHOLE.map(dial)}
        <div className="section-label">Surroundings</div>
        {!tracked && <p className="help">Track the keyboard on the Calibrate step to light the keys and darken the room.</p>}
        {ROOM.map(dial)}
        <p className="help">Effects are drawn on top of this, so notes and particles stay bright in a dark room.</p>
      </aside>

      <div className="score">
        <Transport ws={ws} />
        <div className="light-timeline"><ScrubBar time={ws.time} duration={duration} trim={project.edit?.trim ? trimRange(project, duration) : null} onSeek={ws.seek} /></div>
      </div>
    </div>
  );
}
