import { useEffect, useRef, useState } from 'react';
import Transport from '../Transport';
import Dial from '../Dial';
import { autoNoteAngle, MAX_TILT } from '../../engine/direction';
import type { Layers } from '../../engine/renderer';
import { applyPreset, LayerId, Look, LOOK_SCHEMA, matchesPreset, PALETTES, resolveLook, NOTE_TEXTURES, COLOR_BY, NOTE_2D, NOTE_3D, SABER_STYLES, PARTICLE_PRESETS, sameValue } from '../../engine/look';
import LookControls from '../LookControls';
import PresetBar from '../PresetBar';
import LookGallery from '../LookGallery';
import TitlesPanel from '../TitlesPanel';
import { resolveTitles } from '../../engine/titles';
import StyleTimeline from '../StyleTimeline';
import type { WS } from '../workspace';
import ShapeSections from '../ShapeSections';
import type { ParticleScene } from '../../engine/project';

type Panel = { id: LayerId; label: string; kind: (l: Look) => string; toggle?: keyof Layers };
const PANELS: Panel[] = [
  { id: 'colors', label: 'Colours', kind: (l) => (l.colorBy === 'gradient' ? PALETTES.find((p) => p.id === l.palette)?.label.split(' ')[0] ?? '' : COLOR_BY.find((c) => c.id === l.colorBy)?.label ?? '') },
  { id: 'notes', label: 'Notes', kind: (l) => (l.noteDim === '2d' ? NOTE_2D.find((o) => o.id === l.note2d)?.label ?? '2D' : NOTE_3D.find((o) => o.id === l.note3d)?.label ?? '3D') + (l.texOn ? ' · ' + (NOTE_TEXTURES.find((t) => t.id === l.noteTexture)?.label ?? 'texture') : ''), toggle: 'notes' },
  { id: 'saber', label: 'Saber', kind: (l) => SABER_STYLES.find((x) => x.id === l.saberStyle)?.label ?? 'Plasma', toggle: 'saber' },
  { id: 'impact', label: 'Impact', kind: () => 'Flash', toggle: 'impact' },
  { id: 'particles', label: 'Particles', kind: (l) => PARTICLE_PRESETS.find((p) => Object.entries(p.set).every(([k, v]) => sameValue(l[k as keyof Look], v)))?.label ?? 'Custom', toggle: 'particles' },
  { id: 'lighting', label: 'Lighting', kind: () => 'Relight', toggle: 'keys' },
  { id: 'background', label: 'Background', kind: (l) => (l.bgImageOn ? 'Image' : l.bgColorOn ? 'Colour' : 'Footage') },
  { id: 'finish', label: 'Glow and film', kind: () => 'Bloom', toggle: 'bloom' },
];

type Sel = LayerId | 'looks' | 'titles';

export default function StyleStep({ ws, attachPreview, fps, stats }: { ws: WS; attachPreview: (c: HTMLCanvasElement | null) => void; fps: number; stats: string }) {
  const { project } = ws;
  const [sel, setSel] = useState<Sel>('notes');
  const [scene, setScene] = useState<string | null>(null);
  const [original, setOriginal] = useState(false);
  const [guides, setGuides] = useState(false);
  const [flash, setFlash] = useState<{ n: number; play: boolean }>({ n: 0, play: false });
  const origRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; v: { x: number; y: number; w: number; h: number } | null; moved: boolean } | null>(null);
  const inspectRef = useRef(ws.inspect);
  inspectRef.current = ws.inspect;
  const W = project?.video.width ?? 1, Hh = project?.video.height ?? 1;
  /** keep a zoom window inside the video */
  const fitView = (x: number, y: number, w: number) => {
    const h = w * (Hh / W);
    return { x: Math.min(W - w, Math.max(0, x)), y: Math.min(Hh - h, Math.max(0, y)), w, h };
  };

  // scroll on the preview: zoom in and out round the pointer (the effects are redrawn sharp at every zoom)
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const v = inspectRef.current ?? { x: 0, y: 0, w: W, h: Hh };
      const z = Math.min(8, Math.max(1, (W / v.w) * Math.exp(-e.deltaY * 0.0016)));
      if (z <= 1.01) { ws.setInspect(null); return; }
      const w = W / z;
      ws.setInspect(fitView(v.x + fx * v.w - fx * w, v.y + fy * v.h - fy * (w * Hh / W), w));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [W, Hh, ws.setInspect]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = ws.videoEl.current;

  // "Original": the plain video frame, drawn on top of the effects canvas
  useEffect(() => {
    const cv = origRef.current;
    if (!original || !cv || !v || !v.videoWidth) return;
    cv.width = v.videoWidth / 2; cv.height = v.videoHeight / 2;
    const iv = ws.inspect;
    if (iv) cv.getContext('2d')!.drawImage(v, iv.x, iv.y, iv.w, iv.h, 0, 0, cv.width, cv.height);
    else cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height);
  }, [original, v, ws.time, ws.frameTick, ws.inspect]);

  // 1–8 pick a layer, in the order of the list
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type)))) return;
      // 0 Looks, 1–8 the layers, 9 Titles
      const n = /^Digit([0-9])$/.exec(e.code);
      if (n) { e.preventDefault(); const k = Number(n[1]); setSel(k === 0 ? 'looks' : k === 9 ? 'titles' : PANELS[k - 1].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!project) return null;
  const noNotes = project.notes.length === 0;
  const isLayer = sel !== 'looks' && sel !== 'titles';
  const layer = PANELS.find((l) => l.id === sel) ?? PANELS[1];
  const look = resolveLook(project.look);
  const preset = ws.presets.find((p) => p.id === project.presetId) ?? ws.presets.find((p) => p.id === 'interstellar-teal')!;
  const base = resolveLook(applyPreset(project.look, preset));
  const setLook = (patch: Partial<Look>) => ws.setProject({ ...project, look: { ...project.look, ...patch } });
  const setKey = (k: keyof Look, v: unknown) => setLook({ [k]: v } as Partial<Look>);
  const layerKeys = isLayer ? LOOK_SCHEMA[sel as LayerId].flatMap((sec) => sec.controls.map((c) => c.key)) : [];
  const modified = !matchesPreset(project.look, preset);
  const titles = resolveTitles(project.titles);
  const titlesKind = [titles.intro.on && 'Opening', titles.outro.on && 'End card'].filter(Boolean).join(' · ') || 'Off';
  const layerChanged = layerKeys.some((k) => !sameValue(look[k], base[k]));
  const autoAngle = autoNoteAngle(project);
  const setAngle = project.look?.noteAngle;
  const angle = typeof setAngle === 'number' ? setAngle : autoAngle;
  const setNoteAngle = (a: number | null) => setLook({ noteAngle: a });
  const tall = project.video.height > project.video.width;
  const scenes = project.particleScenes ?? [];
  const setScenes = (list: ParticleScene[]) => ws.setProject({ ...project, particleScenes: list });
  const pickScene = (id: string | null) => { setScene(id); if (id) setSel('particles'); };

  return (
    <div className="style-page">
      <nav className="style-layers" aria-label="Layers">
        <button type="button" className={'layer-row looks-row' + (sel === 'looks' ? ' on' : '')} onClick={() => setSel('looks')}
          aria-current={sel === 'looks' ? 'true' : undefined} title={`Looks · ${preset.name}${modified ? ' (changed)' : ''} (press 0)`}>
          <span className="num" aria-hidden="true">00</span>
          <span className="name">Looks</span>
        </button>
        {PANELS.map((l, i) => {
          const hidden = !!l.toggle && !ws.layers[l.toggle];
          return (
            <button key={l.id} type="button" className={'layer-row' + (sel === l.id ? ' on' : '') + (hidden ? ' off' : '')} onClick={() => setSel(l.id)}
              aria-current={sel === l.id ? 'true' : undefined} title={`${l.label} · ${l.kind(look)}${hidden ? ' · hidden' : ''} (press ${i + 1})`}>
              <span className="num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <span className="name">{l.label}</span>
            </button>
          );
        })}
        <button type="button" className={'layer-row titles-row' + (sel === 'titles' ? ' on' : '')} onClick={() => setSel('titles')}
          aria-current={sel === 'titles' ? 'true' : undefined} title={`Titles · ${titlesKind} (press 9)`}>
          <span className="num" aria-hidden="true">09</span>
          <span className="name">Titles</span>
        </button>
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
            ref={frameRef}
            onPointerDown={(e) => { if (e.button !== 0) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pan.current = { x: e.clientX, y: e.clientY, v: ws.inspect, moved: false }; }}
            onPointerMove={(e) => {
              const p = pan.current;
              if (!p) return;
              if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
              p.moved = true;
              if (!p.v) return;
              // drag: move round the zoomed video
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              ws.setInspect(fitView(p.v.x - ((e.clientX - p.x) / r.width) * p.v.w, p.v.y - ((e.clientY - p.y) / r.height) * p.v.h, p.v.w));
            }}
            onPointerUp={() => {
              const p = pan.current;
              pan.current = null;
              if (p && !p.moved) { setFlash({ n: flash.n + 1, play: !ws.playing }); ws.togglePlay(); }
            }}
            style={{ aspectRatio: `${project.video.width} / ${project.video.height}`, cursor: ws.inspect ? (pan.current?.moved ? 'grabbing' : 'grab') : 'pointer' }}
            title={ws.inspect ? 'Drag to look around · scroll to zoom · click to play or pause' : 'Scroll to zoom in · click to play or pause'}
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
            {ws.inspect && (
              <div className="zoom-chip" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
                <span className="mono">{Math.round((project.video.width / ws.inspect.w) * 100)}%</span>
                <button type="button" onClick={() => ws.setInspect(null)}>Fit</button>
              </div>
            )}
            {noNotes && <div className="badge">Key sweep · add notes in step 2</div>}
            {!noNotes && ws.sweep && <div className="badge">Key sweep</div>}
          </div>
          {stats && <div className="stats">{stats}</div>}
        </div>
      </main>

      <aside className="style-side">
        {sel === 'looks' && <div className="insp-head"><div><h2>Looks</h2><span className="insp-kind">{preset.name}{modified ? ' · changed' : ''}</span></div></div>}
        {sel === 'looks' && <LookGallery ws={ws} current={preset} modified={modified} />}
        {sel === 'titles' && <div className="insp-head"><div><h2>Titles</h2><span className="insp-kind">{titlesKind}</span></div></div>}
        {sel === 'titles' && <TitlesPanel ws={ws} />}
        {isLayer && <>
        <div className="insp-head"><div><h2>{layer.label}</h2><span className="insp-kind">{layer.kind(look)}</span></div>{layer.toggle && <label className="check-inline">Shown <input type="checkbox" checked={ws.layers[layer.toggle]} onChange={(e) => ws.setLayers({ ...ws.layers, [layer.toggle!]: e.target.checked })} /></label>}</div>
        {sel === 'notes' && (
          <>
            <div className="ctl-section"><span className="section-label">Direction</span>
            <div className="angle">
              <svg width="34" height="34" viewBox="-17 -17 34 34" aria-hidden="true">
                <circle r="15" fill="none" stroke="var(--rule-2)" />
                <g transform={`rotate(${angle})`}>
                  <line x1="0" y1="-12" x2="0" y2="7" stroke="var(--paper)" strokeWidth="2" strokeLinecap="round" />
                  <path d="M-4.5 4 L0 10 L4.5 4" fill="none" stroke="var(--paper)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </svg>
              <Dial value={angle} min={-MAX_TILT} max={MAX_TILT} step={1} label="Note angle" fmt={(v) => `${v}°`} base={autoAngle} onChange={(v) => setNoteAngle(v)} />
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
        <LookControls layer={sel as LayerId} look={look} base={base} set={setKey} patch={setLook} />
        {/* shape sections come after the particle look, so the first thing on screen is a value to change */}
        {sel === 'particles' && (
          <ShapeSections scenes={scenes} setScenes={setScenes} selected={scene} setSelected={pickScene}
            duration={ws.duration} time={ws.time} range={ws.loop.range} seek={ws.seek} />
        )}
        {layerChanged && (
          <button type="button" className="btn small ghost" onClick={() => setLook(Object.fromEntries(layerKeys.map((k) => [k, base[k]])) as Partial<Look>)}>
            Reset {layer.label.toLowerCase()} to “{preset.name}”
          </button>
        )}
        </>}
        {sel !== 'titles' && <PresetBar ws={ws} preset={preset} modified={modified} onOpenLooks={sel === 'looks' ? undefined : () => setSel('looks')} />}
      </aside>

      <div className="score">
      <Transport ws={ws} />
      <StyleTimeline
        project={project}
        time={ws.time}
        duration={ws.duration}
        range={ws.loop.range}
        onRange={(r) => ws.setLoop({ on: !!r, range: r })}
        onSeek={ws.seek}
        scenes={scenes}
        setScenes={setScenes}
        selectedScene={scene}
        onSelectScene={pickScene}
      />
      </div>
    </div>
  );
}
