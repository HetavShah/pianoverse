// Sync timeline (Notes tab): the sounds heard in the video against the notes, so you can see whether they
// line up. Each note's start line is green when a sound is heard there, red when not; the match score
// above says how many notes line up. Drag the notes sideways to slide them; resize, zoom and pan freely.
import { useEffect, useMemo, useRef, useState } from 'react';
import { pal, RawNote } from '../engine/project';
import { RATE } from '../engine/sync';

const MATCH_MS = 25; // tuned on the sample: lined up 73 %, one frame off 40 %, two or more 20–30 %
const LS_HEIGHT = 'pv.syncHeight';
const GUTTER = 64; // lane labels on the left

const fmtT = (t: number) => {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s - m * 60).toString().padStart(2, '0')}`;
};

/** Attack times (seconds): local peaks of the onset envelope that stand out from their surroundings. */
function attackTimes(env: Float32Array): number[] {
  const out: number[] = [];
  const W = 15; // ±150 ms neighbourhood
  for (let i = 2; i < env.length - 2; i++) {
    const v = env[i];
    if (v <= 0 || v < env[i - 1] || v < env[i + 1] || v < env[i - 2] || v < env[i + 2]) continue;
    let mx = 0;
    for (let k = Math.max(0, i - W); k < Math.min(env.length, i + W); k++) mx = Math.max(mx, env[k]);
    if (v >= 0.5 * mx) out.push(i / RATE); // clear attacks only
  }
  return out;
}

function nearest(sorted: number[], t: number): number {
  let lo = 0, hi = sorted.length - 1;
  if (hi < 0) return Infinity;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < t) lo = m + 1; else hi = m; }
  let d = Math.abs(sorted[lo] - t);
  if (lo > 0) d = Math.min(d, Math.abs(sorted[lo - 1] - t));
  return d;
}

/** Share of note starts (within the audio) that land on a heard attack. */
export function matchScore(attacks: number[], notes: RawNote[], duration: number, shift = 0): number | null {
  let n = 0, hit = 0;
  for (const x of notes) {
    const s = x.s + shift;
    if (s < 0.1 || s > duration - 0.1) continue;
    n++;
    if (nearest(attacks, s) * 1000 <= MATCH_MS) hit++;
  }
  return n >= 5 ? hit / n : null;
}

export default function SyncTimeline(props: {
  envelope: Float32Array | null;
  notes: RawNote[];
  time: number;
  duration: number;
  playing: boolean;
  onSlide: (deltaSeconds: number) => void;
  onSeek: (t: number) => void;
}) {
  const { envelope, notes, time, duration, playing, onSlide, onSeek } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [height, setHeight] = useState(() => {
    try { return Number(localStorage.getItem(LS_HEIGHT)) || 190; } catch { return 190; }
  });
  const [span, setSpan] = useState(8); // seconds visible
  const [follow, setFollow] = useState(true);
  const [start, setStart] = useState(0); // left edge when not following
  const [drag, setDrag] = useState<{ kind: 'notes' | 'pan' | 'resize'; x: number; y: number; d: number; v0: number } | null>(null);
  const [width, setWidth] = useState(800);

  const attacks = useMemo(() => (envelope ? attackTimes(envelope) : []), [envelope]);
  const dur = duration || (envelope ? envelope.length / RATE : 0);
  const shift = drag?.kind === 'notes' ? drag.d : 0;
  const score = useMemo(() => (envelope ? matchScore(attacks, notes, dur, shift) : null), [attacks, notes, dur, shift, envelope]);

  // follow the playhead (also whenever playing)
  const t0 = follow || playing ? Math.max(0, Math.min(Math.max(0, dur - span), time - span / 2)) : start;
  useEffect(() => { if (playing) setFollow(true); }, [playing]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ro = new ResizeObserver(() => setWidth(cv.clientWidth));
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  const laneH = height - 34 - 22; // minus header and ruler
  const soundH = Math.round(laneH * 0.42);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const w = width, h = laneH + 22, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0e12'; ctx.fillRect(0, 0, w, h);
    const plotW = w - GUTTER;
    const pxs = plotW / span;
    const X = (t: number) => GUTTER + (t - t0) * pxs;
    const rulerH = 22, sTop = rulerH, sBot = rulerH + soundH, nTop = sBot + 1, nBot = h;
    ctx.font = '11px Inter, "Segoe UI", system-ui, sans-serif';
    // ruler
    ctx.fillStyle = '#10141a'; ctx.fillRect(0, 0, w, rulerH);
    const step = span <= 3 ? 0.5 : span <= 12 ? 1 : span <= 40 ? 5 : span <= 120 ? 10 : 30;
    for (let s = Math.ceil(t0 / step) * step; s <= t0 + span; s += step) {
      const x = Math.round(X(s));
      ctx.fillStyle = '#1b2027'; ctx.fillRect(x, rulerH, 1, h - rulerH);
      ctx.fillStyle = '#7d8896'; ctx.fillRect(x, rulerH - 5, 1, 5);
      if (Number.isInteger(s) || step < 1) ctx.fillText(step < 1 ? s.toFixed(1) : fmtT(s), x + 3, 14);
    }
    // gutter labels
    ctx.fillStyle = '#0e1115'; ctx.fillRect(0, rulerH, GUTTER, h - rulerH);
    ctx.fillStyle = '#a3acb7'; ctx.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Sound', 10, sTop + soundH / 2 + 4);
    ctx.fillText('Notes', 10, nTop + (nBot - nTop) / 2 + 4);
    ctx.fillStyle = '#1f252d'; ctx.fillRect(GUTTER, sBot, plotW, 1); ctx.fillRect(GUTTER - 1, rulerH, 1, h - rulerH);
    ctx.save();
    ctx.beginPath(); ctx.rect(GUTTER, 0, plotW, h); ctx.clip();
    // sound lane
    if (envelope) {
      const f0 = Math.max(0, Math.floor(t0 * RATE)), f1 = Math.min(envelope.length, Math.ceil((t0 + span) * RATE));
      let mx = 1e-6;
      for (let f = f0; f < f1; f++) mx = Math.max(mx, envelope[f]);
      ctx.fillStyle = '#8f9baa';
      const bw = Math.max(1, pxs / RATE - (pxs / RATE > 3 ? 1 : 0));
      for (let f = f0; f < f1; f++) {
        const v = Math.sqrt(envelope[f] / mx);
        if (v < 0.05) continue;
        const bh = v * (soundH - 8);
        ctx.fillRect(X(f / RATE), sBot - 2 - bh, bw, bh);
      }
    } else {
      ctx.fillStyle = '#6b7684'; ctx.fillText('Reading the soundtrack…', GUTTER + 10, sTop + soundH / 2 + 4);
    }
    // notes lane (pitch range of the whole piece, so it doesn't jump around)
    let pLo = 127, pHi = 0;
    for (const n of notes) { if (n.p < pLo) pLo = n.p; if (n.p > pHi) pHi = n.p; }
    if (pLo > pHi) { pLo = 48; pHi = 72; }
    const rows = pHi - pLo + 1, rollTop = nTop + 4, rollH = nBot - nTop - 8;
    const Y = (p: number) => rollTop + rollH - ((p - pLo + 0.5) / rows) * rollH;
    const nh = Math.max(3, Math.min(10, rollH / rows - 1));
    for (const n of notes) {
      const s = n.s + shift, e = n.e + shift;
      if (e < t0 - 0.1 || s > t0 + span + 0.1) continue;
      const c = pal(n.p);
      ctx.fillStyle = `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},0.55)`;
      ctx.fillRect(X(s), Y(n.p) - nh / 2, Math.max(2, (e - s) * pxs), nh);
      // start line: green when a sound is heard there, red when not
      const ok = envelope ? nearest(attacks, s) * 1000 <= MATCH_MS : null;
      ctx.fillStyle = ok === null ? 'rgba(232,234,237,0.5)' : ok ? 'rgba(76,217,140,0.85)' : 'rgba(240,110,90,0.75)';
      ctx.fillRect(Math.round(X(s)), sTop + 2, 1.5, nBot - sTop - 2);
      ctx.fillRect(X(s) - 1, Y(n.p) - nh / 2 - 1, 3, nh + 2);
    }
    // playhead
    ctx.fillStyle = '#e8eaed'; ctx.fillRect(Math.round(X(time)), 0, 1.5, h);
    ctx.beginPath(); ctx.moveTo(X(time) - 5, 0); ctx.lineTo(X(time) + 5, 0); ctx.lineTo(X(time), 7); ctx.fill();
    if (drag?.kind === 'notes') {
      const label = `${drag.d >= 0 ? 'later' : 'earlier'} by ${Math.abs(drag.d * 1000).toFixed(0)} ms`;
      ctx.font = '600 12px Inter, "Segoe UI", system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(11,14,18,0.9)'; ctx.fillRect(X(time) + 8, nTop + 6, tw + 16, 22);
      ctx.fillStyle = '#2FD3B5'; ctx.fillText(label, X(time) + 16, nTop + 21);
    }
    ctx.restore();
  });

  // ---------- interaction ----------
  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const timeAt = (x: number) => t0 + ((x - GUTTER) / (width - GUTTER)) * span;
  const zoom = (k: number, around?: number) => {
    const c = around ?? (follow || playing ? time : t0 + span / 2);
    const ns = Math.min(Math.max(1, dur || 60), Math.max(1, span * k));
    setSpan(ns);
    if (!(follow || playing)) setStart(Math.max(0, c - ((c - t0) / span) * ns));
  };

  const onDown = (e: React.PointerEvent) => {
    const { x, y } = local(e);
    if (x < GUTTER) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (y < 22) { onSeek(timeAt(x)); return; } // ruler: jump there
    if (y < 22 + soundH) { setDrag({ kind: 'pan', x, y, d: 0, v0: t0 }); setFollow(false); setStart(t0); return; }
    setDrag({ kind: 'notes', x, y, d: 0, v0: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag || drag.kind === 'resize') return;
    const { x } = local(e);
    const dt = ((x - drag.x) / (width - GUTTER)) * span;
    if (drag.kind === 'pan') setStart(Math.max(0, Math.min(Math.max(0, dur - span), drag.v0 - dt)));
    else setDrag({ ...drag, d: dt });
  };
  const onUp = () => {
    if (drag?.kind === 'notes' && Math.abs(drag.d) > 0.0005) onSlide(drag.d);
    setDrag(null);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const d = ((e.shiftKey ? e.deltaY : e.deltaX) / (width - GUTTER)) * span;
      setFollow(false);
      setStart(Math.max(0, Math.min(Math.max(0, dur - span), t0 + d)));
    } else {
      const { x } = local(e);
      zoom(Math.exp(e.deltaY * 0.0015), timeAt(x));
    }
  };

  // resize handle
  const startResize = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: 'resize', x: e.clientX, y: e.clientY, d: 0, v0: height });
  };
  const moveResize = (e: React.PointerEvent) => {
    if (drag?.kind !== 'resize') return;
    const hgt = Math.max(130, Math.min(Math.round(window.innerHeight * 0.6), drag.v0 - (e.clientY - drag.y)));
    setHeight(hgt);
  };
  const endResize = () => {
    if (drag?.kind === 'resize') { try { localStorage.setItem(LS_HEIGHT, String(height)); } catch { /* per-viewer convenience only */ } }
    setDrag(null);
  };

  const pct = score === null ? null : Math.round(score * 100);
  return (
    <section className="sync-panel" style={{ height }}>
      <div className="resize-handle" onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={endResize} title="Drag to resize" aria-label="Resize the sync timeline" />
      <header className="sync-head">
        <b>Sync</b>
        {pct !== null && (
          <span className={'score ' + (pct >= 60 ? 'good' : pct >= 40 ? 'mid' : 'bad')}>{pct}% of notes match a sound</span>
        )}
        <span className="dim hint-text">
          <i className="sw green" />on a sound <i className="sw red" />no sound there · drag the notes sideways until most lines are green
        </span>
        <span className="zoom">
          <button type="button" className="btn small" onClick={() => zoom(1 / 1.6)} aria-label="Zoom in" title="Zoom in">+</button>
          <span className="span-label">{span < 10 ? span.toFixed(1) : Math.round(span)} s</span>
          <button type="button" className="btn small" onClick={() => zoom(1.6)} aria-label="Zoom out" title="Zoom out">−</button>
          <button type="button" className="btn small" onClick={() => { setSpan(Math.max(1, dur)); setStart(0); setFollow(false); }}>Whole video</button>
          <button type="button" className={'btn small' + (follow ? ' on' : '')} onClick={() => setFollow(true)} title="Keep the playhead in view">Follow playhead</button>
        </span>
      </header>
      <canvas
        ref={canvasRef}
        className="sync-canvas"
        style={{ height: laneH + 22, cursor: drag?.kind === 'pan' ? 'grabbing' : 'ew-resize' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onWheel={onWheel}
        aria-label="Sync timeline: sounds in the video above, notes below. Drag the notes sideways to line them up."
      />
    </section>
  );
}
