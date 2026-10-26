// Looks: every saved style as a picture of your own video. Rest the pointer on one to see it on the
// preview; click to use it.
import { useEffect, useRef, useState } from 'react';
import { applyPreset, PALETTES, Preset, resolveLook } from '../engine/look';
import { lookKey, renderLookThumbs } from './lookThumbs';
import type { WS } from './workspace';

// pictures survive switching layers and steps (they are redrawn from a new moment on request)
const cache: Record<string, string> = {};
let cacheAt = -1;
let cacheProject = '';

/** a stand-in picture while the real one renders: the look's colours */
function swatch(p: Preset): string {
  const l = resolveLook(p.look);
  if (l.colorBy === 'single') return `linear-gradient(180deg, #000 30%, ${l.colorA})`;
  const stops = PALETTES.find((x) => x.id === l.palette)?.stops;
  const css = (c: number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
  return stops ? `linear-gradient(90deg, ${stops.map(([k, c]) => `${css(c)} ${Math.round(k * 100)}%`).join(', ')})` : '#222';
}

export default function LookGallery({ ws, current, modified }: { ws: WS; current: Preset; modified: boolean }) {
  const project = ws.project!;
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);
  const playingRef = useRef(ws.playing);
  playingRef.current = ws.playing;

  const render = (t: number) => {
    const r = ws.renderer, v = ws.videoEl.current;
    if (!r || !v || ws.playing) return;
    const id = ++run.current;
    if (cacheAt !== t || cacheProject !== project.id) { for (const k of Object.keys(cache)) delete cache[k]; cacheAt = t; cacheProject = project.id ?? ''; }
    const todo = ws.presets.filter((p) => !cache[lookKey(p)]);
    if (!todo.length) return;
    setBusy(true);
    renderLookThumbs(r, v, todo, t, (k, url) => { cache[k] = url; setTick((n) => n + 1); },
      () => id !== run.current || playingRef.current, !(window as unknown as { __pvHeadless?: boolean }).__pvHeadless)
      .catch((e) => console.warn('[looks]', e))
      .finally(() => { if (id === run.current) setBusy(false); });
  };

  // first open (or new presets): draw the missing pictures at the moment on screen
  useEffect(() => {
    render(cacheAt >= 0 && cacheProject === project.id ? cacheAt : ws.time);
    return () => { run.current++; ws.previewLook(null); };
  }, [ws.presets, ws.playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (p: Preset) => {
    ws.previewLook(null);
    ws.setProject({ ...project, look: applyPreset(project.look, p), presetId: p.id });
  };
  const builtIn = ws.presets.filter((p) => p.builtIn);
  const mine = ws.presets.filter((p) => !p.builtIn);

  const card = (p: Preset) => {
    const on = p.id === current.id;
    const img = cache[lookKey(p)];
    return (
      <button key={p.id} type="button" className={'look-card' + (on ? ' on' : '')} onClick={() => choose(p)}
        onPointerEnter={() => { if (!on || modified) ws.previewLook(applyPreset(project.look, p)); }}
        onPointerLeave={() => ws.previewLook(null)}
        aria-pressed={on} title={on && modified ? `${p.name} (you changed it)` : p.name}>
        <span className="pic" style={img ? undefined : { background: swatch(p) }}>{img && <img src={img} alt="" />}</span>
        <span className="name">{p.name}{on && modified ? ' ·' : ''}</span>
      </button>
    );
  };

  return (
    <div className="looks">
      <p className="help">Rest the pointer on a look to see it on your video. Click to use it.</p>
      <div className="look-grid">{builtIn.map(card)}</div>
      {mine.length > 0 && (
        <>
          <span className="section-label">Yours</span>
          <div className="look-grid">{mine.map(card)}</div>
        </>
      )}
      <button type="button" className="link inline small-text" disabled={busy || ws.playing}
        onClick={() => { cacheAt = -2; render(ws.time); }}>
        {busy ? 'Drawing pictures…' : 'Redraw pictures at this moment'}
      </button>
    </div>
  );
}
