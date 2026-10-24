import { useEffect, useRef, useState } from 'react';
import { autoNoteAngle, MAX_TILT } from '../../engine/direction';
import type { Layers } from '../../engine/renderer';
import { applyPreset, LayerId, Look, LOOK_SCHEMA, matchesPreset, PALETTES, resolveLook, NOTE_TEXTURES, COLOR_BY, NOTE_2D, NOTE_3D, SABER_STYLES, PARTICLE_PRESETS, sameValue } from '../../engine/look';
import LookControls from '../LookControls';
import PresetBar from '../PresetBar';
import StyleTimeline from '../StyleTimeline';
import type { WS } from '../workspace';

const fmtT = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };

type Panel = { id: LayerId; label: string; kind: (l: Look) => string; icon: string; toggle?: keyof Layers };
const PANELS: Panel[] = [
  { id: 'colors', label: 'Colours', kind: (l) => (l.colorBy === 'gradient' ? PALETTES.find((p) => p.id === l.palette)?.label.split(' ')[0] ?? '' : COLOR_BY.find((c) => c.id === l.colorBy)?.label ?? ''), icon: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1-.8-1.4-.8-2.4 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4c0-4.7-4-8.4-9-8.4zM7.5 11a1 1 0 1 0 0 .1M10 7a1 1 0 1 0 0 .1M15 7.5a1 1 0 1 0 0 .1' },
  { id: 'notes', label: 'Notes', kind: (l) => (l.noteDim === '2d' ? NOTE_2D.find((o) => o.id === l.note2d)?.label ?? '2D' : NOTE_3D.find((o) => o.id === l.note3d)?.label ?? '3D') + (l.texOn ? ' · ' + (NOTE_TEXTURES.find((t) => t.id === l.noteTexture)?.label ?? 'texture') : ''), icon: 'M9 3h6v18H9z', toggle: 'notes' },
  { id: 'saber', label: 'Saber', kind: (l) => SABER_STYLES.find((x) => x.id === l.saberStyle)?.label ?? 'Plasma', icon: 'M3 14h18M6 11c2-2 4-2 6 0s4 2 6 0', toggle: 'saber' },
  { id: 'impact', label: 'Impact', kind: () => 'Flash', icon: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6', toggle: 'impact' },
  { id: 'particles', label: 'Particles', kind: (l) => PARTICLE_PRESETS.find((p) => Object.entries(p.set).every(([k, v]) => sameValue(l[k as keyof Look], v)))?.label ?? 'Custom', icon: 'M7 17a1 1 0 1 0 0 .1M12 9a1 1 0 1 0 0 .1M16 14a1 1 0 1 0 0 .1M10 5a1 1 0 1 0 0 .1M17 6a1 1 0 1 0 0 .1', toggle: 'particles' },
  { id: 'lighting', label: 'Lighting', kind: () => 'Relight', icon: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z', toggle: 'keys' },
  { id: 'background', label: 'Background', kind: (l) => (l.bgImageOn ? 'Image' : l.bgColorOn ? 'Colour' : 'Footage'), icon: 'M3 5h18v14H3zM3 15l5-4 4 3 3-2 6 5' },
  { id: 'finish', label: 'Glow and film', kind: () => 'Bloom', icon: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 2v2M12 20v2M2 12h2M20 12h2', toggle: 'bloom' },
];

export default function StyleStep({ ws, attachPreview, fps, stats }: { ws: WS; attachPreview: (c: HTMLCanvasElement | null) => void; fps: number; stats: string }) {
  const { project } = ws;
  const [sel, setSel] = useState<LayerId>('notes');
  const [original, setOriginal] = useState(false);
  const [guides, setGuides] = useState(false);
  const [flash, setFlash] = useState<{ n: number; play: boolean }>({ n: 0, play: false });
  const origRef = useRef<HTMLCanvasElement>(null);
  const v = ws.videoEl.current;

  // "Original": the plain video frame, drawn on top of the effects canvas
  useEffect(() => {
    const cv = origRef.current;
    if (!original || !cv || !v || !v.videoWidth) return;
    cv.width = v.videoWidth / 2; cv.height = v.videoHeight / 2;
    cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height);
  }, [original, v, ws.time, ws.frameTick]);

  if (!project) return null;
  const noNotes = project.notes.length === 0;
  const layer = PANELS.find((l) => l.id === sel)!;
  const look = resolveLook(project.look);
  const preset = ws.presets.find((p) => p.id === project.presetId) ?? ws.presets.find((p) => p.id === 'interstellar-teal')!;
  const base = resolveLook(applyPreset(project.look, preset));
  const setLook = (patch: Partial<Look>) => ws.setProject({ ...project, look: { ...project.look, ...patch } });
  const setKey = (k: keyof Look, v: unknown) => setLook({ [k]: v } as Partial<Look>);
  const layerKeys = LOOK_SCHEMA[sel].flatMap((sec) => sec.controls.map((c) => c.key));
  const layerChanged = layerKeys.some((k) => !sameValue(look[k], base[k]));
  const autoAngle = autoNoteAngle(project);
  const setAngle = project.look?.noteAngle;
  const angle = typeof setAngle === 'number' ? setAngle : autoAngle;
  const setNoteAngle = (a: number | null) => setLook({ noteAngle: a });
  const tall = project.video.height > project.video.width;

  return (
    <div className="style-page">
      <nav className="style-layers" aria-label="Layers">
        <span className="section-label">Layers</span>
        {PANELS.map((l) => (
          <div key={l.id} className={'layer-row' + (sel === l.id ? ' on' : '') + (l.toggle && !ws.layers[l.toggle] ? ' off' : '')} onClick={() => setSel(l.id)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d={l.icon} /></svg>
            <span className="name">{l.label}</span>
            <span className="kind">{l.kind(look)}</span>
            {l.toggle ? (
              <input type="checkbox" checked={ws.layers[l.toggle]} onClick={(e) => e.stopPropagation()} onChange={(e) => ws.setLayers({ ...ws.layers, [l.toggle!]: e.target.checked })} aria-label={`Show ${l.label}`} />
            ) : <span className="cb-space" />}
          </div>
        ))}
        <PresetBar ws={ws} preset={preset} modified={!matchesPreset(project.look, preset)} />
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
          <div
            className="preview-frame"
            style={{ aspectRatio: `${project.video.width} / ${project.video.height}` }}
            onClick={() => { setFlash({ n: flash.n + 1, play: !ws.playing }); ws.togglePlay(); }}
            title={ws.playing ? 'Click to pause' : 'Click to play'}
          >
            <canvas ref={attachPreview} className="preview-canvas" />
            {original && <canvas ref={origRef} className="preview-canvas over" />}
            {guides && (
              <div className="shorts-guides" aria-hidden="true">
                <div className="g top">Title and status bar</div>
                <div className="g right">Buttons</div>
                <div className="g bottom">Caption and channel</div>
              </div>
            )}
            {flash.n > 0 && (
              <div key={flash.n} className="play-flash" aria-hidden="true">
                {flash.play
                  ? <svg width="34" height="34" viewBox="0 0 24 24" fill="#fff"><path d="M7 4.5v15l12-7.5z" /></svg>
                  : <svg width="34" height="34" viewBox="0 0 24 24" fill="#fff"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>}
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
          {ws.loop.on && <span className="loop-tag mono">{ws.loop.range ? `loop ${fmtT(ws.loop.range[0])}–${fmtT(ws.loop.range[1])}` : 'loop all'}</span>}
          <button type="button" className={'btn icon' + (ws.loop.on ? ' on' : ' ghost')} onClick={() => ws.setLoop({ ...ws.loop, on: !ws.loop.on })} aria-label="Loop"
            title={ws.loop.range ? 'Loop the selected section' : 'Loop the whole video (drag on the timeline to loop a section)'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" /></svg>
          </button>
        </div>
      </main>

      <aside className="style-side">
        <div className="row"><h2>{layer.label}</h2>{layer.toggle && <label className="check-inline">On <input type="checkbox" checked={ws.layers[layer.toggle]} onChange={(e) => ws.setLayers({ ...ws.layers, [layer.toggle!]: e.target.checked })} /></label>}</div>
        {sel === 'notes' && (
          <>
            <div className="ctl-section"><span className="section-label">Direction</span>
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
            </div>
          </>
        )}
        <LookControls layer={sel} look={look} base={base} set={setKey} patch={setLook} />
        {layerChanged && (
          <button type="button" className="btn small ghost" onClick={() => setLook(Object.fromEntries(layerKeys.map((k) => [k, base[k]])) as Partial<Look>)}>
            Reset {layer.label.toLowerCase()} to “{preset.name}”
          </button>
        )}
      </aside>

      <StyleTimeline
        project={project}
        time={ws.time}
        duration={ws.duration}
        range={ws.loop.range}
        onRange={(r) => ws.setLoop({ on: !!r, range: r })}
        onSeek={ws.seek}
      />
    </div>
  );
}
