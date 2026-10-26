// Looks: every saved style as a picture of your own video. Rest the pointer on one and it plays a moment of
// that look inside the card; click to use it. The main preview only changes on a click.
import { useEffect, useRef, useState } from 'react';
import { applyPreset, PALETTES, Preset, resolveLook } from '../engine/look';
import { ANIM_FRAMES, lookKey, renderLookThumbs, snapshot } from './lookThumbs';
import type { WS } from './workspace';

// pictures survive switching layers and steps (they are redrawn from a new moment on request)
const stills: Record<string, string> = {};
const loops: Record<string, string[]> = {};
let drawnAt = -1;
let drawnFor = '';
let frameAt: HTMLCanvasElement | null = null;

/** a stand-in picture while the real one renders: the look's colours */
function swatch(p: Preset): string {
  const l = resolveLook(p.look);
  if (l.colorBy === 'single') return `linear-gradient(180deg, #000 30%, ${l.colorA})`;
  const stops = PALETTES.find((x) => x.id === l.palette)?.stops;
  const css = (c: number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
  return stops ? `linear-gradient(90deg, ${stops.map(([k, c]) => `${css(c)} ${Math.round(k * 100)}%`).join(', ')})` : '#222';
}

function Card({ p, on, modified, onChoose, onHover, playing }: {
  p: Preset; on: boolean; modified: boolean; onChoose: () => void; onHover: (h: boolean) => void; playing: boolean;
}) {
  const key = lookKey(p);
  const [k, setK] = useState(0);
  const loop = loops[key];
  useEffect(() => {
    if (!playing || !loop) { setK(0); return; }
    const id = window.setInterval(() => setK((n) => (n + 1) % loop.length), 110);
    return () => window.clearInterval(id);
  }, [playing, loop]);
  const img = (playing && loop?.[k]) || stills[key];
  return (
    <button type="button" className={'look-card' + (on ? ' on' : '')} onClick={onChoose}
      onPointerEnter={() => onHover(true)} onPointerLeave={() => onHover(false)}
      aria-pressed={on} title={on && modified ? `${p.name} (you changed it)` : p.name}>
      <span className="pic" style={img ? undefined : { background: swatch(p) }}>{img && <img src={img} alt="" />}</span>
      <span className="name">{p.name}{on && modified ? ' ·' : ''}</span>
    </button>
  );
}

export default function LookGallery({ ws, current, modified }: { ws: WS; current: Preset; modified: boolean }) {
  const project = ws.project!;
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const run = useRef(0);
  const hoverRun = useRef(0);
  const files = ws.renderer?.userFiles ?? null;

  /** stills of every look at moment t (from a copy of the frame on screen) */
  const drawStills = (t: number, fresh: boolean) => {
    const v = ws.videoEl.current;
    if (!v) return;
    if (fresh || drawnFor !== (project.id ?? '') || !frameAt) {
      const f = snapshot(v);
      if (!f) return;
      frameAt = f;
      for (const k of Object.keys(stills)) delete stills[k];
      for (const k of Object.keys(loops)) delete loops[k];
      drawnAt = t; drawnFor = project.id ?? '';
    }
    const todo = ws.presets.filter((p) => !stills[lookKey(p)]);
    if (!todo.length) return;
    const id = ++run.current;
    setBusy(true);
    renderLookThumbs(project, frameAt, todo, drawnAt, 1, files, (k, urls) => { stills[k] = urls[0]; setTick((n) => n + 1); }, () => id !== run.current)
      .catch((e) => console.warn('[looks]', e))
      .finally(() => { if (id === run.current) setBusy(false); });
  };

  useEffect(() => { drawStills(ws.time, false); return () => { run.current++; hoverRun.current++; }; }, [ws.presets]); // eslint-disable-line react-hooks/exhaustive-deps

  // resting on a card: draw its short loop once, then play it inside the card
  const onHover = (p: Preset, h: boolean) => {
    const key = lookKey(p);
    setHover(h ? key : null);
    if (!h || loops[key] || !frameAt) return;
    const id = ++hoverRun.current;
    renderLookThumbs(project, frameAt, [p], drawnAt, ANIM_FRAMES, files, (k, urls) => { loops[k] = urls; setTick((n) => n + 1); }, () => id !== hoverRun.current)
      .catch((e) => console.warn('[looks]', e));
  };

  const choose = (p: Preset) => ws.setProject({ ...project, look: applyPreset(project.look, p), presetId: p.id });
  const builtIn = ws.presets.filter((p) => p.builtIn);
  const mine = ws.presets.filter((p) => !p.builtIn);
  const card = (p: Preset) => (
    <Card key={p.id} p={p} on={p.id === current.id} modified={modified} playing={hover === lookKey(p)}
      onChoose={() => choose(p)} onHover={(h) => onHover(p, h)} />
  );

  return (
    <div className="looks">
      <p className="help">Rest the pointer on a look to see it move. Click to use it.</p>
      <div className="look-grid">{builtIn.map(card)}</div>
      {mine.length > 0 && (
        <>
          <span className="section-label">Yours</span>
          <div className="look-grid">{mine.map(card)}</div>
        </>
      )}
      <button type="button" className="link inline small-text" disabled={busy} onClick={() => drawStills(ws.time, true)}>
        {busy ? 'Drawing pictures…' : 'Redraw pictures at this moment'}
      </button>
    </div>
  );
}
