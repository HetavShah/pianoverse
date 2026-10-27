// Notes and sync: the video's audio waveform with a tick for every note above it. Ticks should sit on the attacks in
// the audio. Bright ticks land on a heard attack, faded ones don't. Click or drag on the waveform or the ruler to move
// the playhead; drag the row of ticks sideways to nudge the notes; scroll to zoom, Shift+scroll to pan, drag the bottom
// edge to resize.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FONT, INK } from '../components/palette';
import type { RawNote } from '../../engine/project';
import { RATE } from '../../engine/audio/sync';
import { PEAK_RATE, VideoAudio } from '../services/audio';
import Icon from '../components/icons';

const MATCH_MS = 25;
const LS_HEIGHT = 'pv.waveHeight';
const RULER = 24, TICKS = 30;

const fmtT = (t: number) => {
  const s = Math.max(0, t), m = Math.floor(s / 60);
  return `${m}:${Math.floor(s - m * 60).toString().padStart(2, '0')}`;
};

/** clear attacks heard in the audio (seconds) */
export function attackTimes(env: Float32Array): number[] {
  const out: number[] = [];
  const W = 15;
  for (let i = 2; i < env.length - 2; i++) {
    const v = env[i];
    if (v <= 0 || v < env[i - 1] || v < env[i + 1] || v < env[i - 2] || v < env[i + 2]) continue;
    let mx = 0;
    for (let k = Math.max(0, i - W); k < Math.min(env.length, i + W); k++) mx = Math.max(mx, env[k]);
    if (v >= 0.5 * mx) out.push(i / RATE);
  }
  return out;
}

export function nearestDist(sorted: number[], t: number): number {
  let lo = 0, hi = sorted.length - 1;
  if (hi < 0) return Infinity;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < t) lo = m + 1; else hi = m; }
  let d = Math.abs(sorted[lo] - t);
  if (lo > 0) d = Math.min(d, Math.abs(sorted[lo - 1] - t));
  return d;
}

/** share of note starts (inside the part of the audio in use, range in seconds) that land on a heard attack, 0..1 */
export function matchScore(attacks: number[], notes: RawNote[], range: [number, number], shift = 0): number | null {
  let n = 0, hit = 0;
  for (const x of notes) {
    const s = x.s + shift;
    if (s < range[0] + 0.1 || s > range[1] - 0.1) continue;
    n++;
    if (nearestDist(attacks, s) * 1000 <= MATCH_MS) hit++;
  }
  return n >= 5 ? hit / n : null;
}

export default function WaveSync(props: {
  audio: VideoAudio | null;
  notes: RawNote[];
  time: number;
  duration: number;
  playing: boolean;
  onNudge: (deltaSeconds: number) => void;
  onSeek: (t: number) => void;
  attacks: number[];
  /** the part of the video kept on the Video step: only that is shown */
  range: [number, number];
  /** the transport, right under the waveform */
  transport?: React.ReactNode;
}) {
  const { audio, notes, time, duration, playing, onNudge, onSeek, attacks, range, transport } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(900);
  const [height, setHeight] = useState(() => { try { return Number(localStorage.getItem(LS_HEIGHT)) || 230; } catch { return 230; } });
  const [span, setSpan] = useState(12);
  const [follow, setFollow] = useState(true);
  const [start, setStart] = useState(0);
  const [drag, setDrag] = useState<{ kind: 'nudge' | 'scrub' | 'resize'; x: number; y: number; d: number; moved: boolean; v0: number } | null>(null);
  /** the pointer is over the row of ticks (drag there nudges the notes) */
  const [overTicks, setOverTicks] = useState(false);
  const dur = duration || audio?.duration || 0;
  // the trimmed part: the view, the playhead and the zoom stay inside it
  const keptA = Math.max(0, range[0]), keptB = Math.min(dur || range[1], range[1]), len = Math.max(0.5, keptB - keptA);
  const view = Math.min(span, len);
  const clampT0 = (t: number) => Math.max(keptA, Math.min(Math.max(keptA, keptB - view), t));
  const t0 = clampT0(follow || playing ? time - view * 0.35 : start);
  const inside = (t: number) => Math.max(keptA, Math.min(keptB, t));
  useEffect(() => { if (playing) setFollow(true); }, [playing]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shift = drag?.kind === 'nudge' ? drag.d : 0;
  const onsets = useMemo(() => notes.map((n) => n.s).sort((a, b) => a - b), [notes]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = width, h = height, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pxs = w / view;
    const X = (t: number) => (t - t0) * pxs;
    // ruler
    ctx.font = `500 11px ${FONT}`;
    ctx.fillStyle = INK.stone;
    const step = view <= 4 ? 0.5 : view <= 16 ? 2 : view <= 40 ? 5 : view <= 120 ? 10 : 30;
    for (let s = Math.ceil(t0 / step) * step; s <= t0 + view + 1e-6; s += step) {
      const x = Math.round(X(s));
      ctx.fillText(step < 1 ? s.toFixed(1) : fmtT(s), Math.min(w - 34, x + 2), 14);
      ctx.fillStyle = INK.rule; ctx.fillRect(x, RULER, 1, h - RULER); ctx.fillStyle = INK.stone;
    }
    // panel
    const top = RULER, waveTop = top + TICKS + 6, waveH = h - waveTop - 2, mid = waveTop + waveH / 2;
    ctx.fillStyle = INK.stage;
    ctx.fillRect(0, top, w, h - top);
    // waveform: min/max per pixel column
    if (audio) {
      ctx.fillStyle = '#4e4c47';
      const perPx = view / w;
      for (let x = 0; x < w; x++) {
        const ta = t0 + x * perPx, tb = ta + perPx;
        if (ta < keptA - perPx || ta > keptB) continue;
        let lo = 0, hi = 0;
        if (perPx * PEAK_RATE >= 1) {
          const a = Math.max(0, Math.floor(ta * PEAK_RATE)), b = Math.min(audio.peaks.length / 2, Math.ceil(tb * PEAK_RATE));
          for (let i = a; i < b; i++) { lo = Math.min(lo, audio.peaks[i * 2]); hi = Math.max(hi, audio.peaks[i * 2 + 1]); }
        } else {
          const a = Math.max(0, Math.floor(ta * audio.rate)), b = Math.min(audio.mono.length, Math.ceil(tb * audio.rate) + 1);
          for (let i = a; i < b; i++) { const v = audio.mono[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
        }
        if (hi - lo < 1e-4) continue;
        const k = waveH / 2 / 0.6; // a little headroom: piano rarely exceeds ±0.6
        ctx.fillRect(x, mid - Math.min(waveH / 2, hi * k), 1, Math.max(1, Math.min(waveH / 2, hi * k) + Math.min(waveH / 2, -lo * k)));
      }
    } else {
      ctx.fillStyle = INK.stone; ctx.font = `13px ${FONT}`;
      ctx.fillText('Reading the soundtrack…', 12, mid);
    }
    // note ticks (bright on a heard attack, faded otherwise) + faint guide into the waveform
    for (const s0 of onsets) {
      const s = s0 + shift;
      if (s < t0 - 0.05 || s > t0 + view + 0.05 || s < keptA || s > keptB) continue;
      const x = Math.round(X(s));
      const on = attacks.length ? nearestDist(attacks, s) * 1000 <= MATCH_MS : true;
      ctx.fillStyle = on ? INK.paper : 'rgba(242,239,232,0.3)';
      ctx.fillRect(x - 1, top + 6, 2.5, TICKS - 6);
      ctx.fillStyle = on ? 'rgba(242,239,232,0.2)' : 'rgba(242,239,232,0.06)';
      ctx.fillRect(x, waveTop, 1, waveH);
    }
    // playhead, with a handle on the ruler
    const px = Math.round(X(time));
    ctx.fillStyle = INK.live; ctx.fillRect(px - 1, top, 2, h - top);
    ctx.beginPath(); ctx.moveTo(px - 6, top - 9); ctx.lineTo(px + 6, top - 9); ctx.lineTo(px + 6, top - 3); ctx.lineTo(px, top + 2); ctx.lineTo(px - 6, top - 3); ctx.closePath(); ctx.fill();
    if (drag?.kind === 'nudge' && drag.moved) {
      const label = `${drag.d >= 0 ? '+' : '−'}${Math.abs(drag.d * 1000).toFixed(0)} ms`;
      ctx.font = `600 12px ${FONT}`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = INK.paper; ctx.fillRect(px + 8, top + 8, tw + 14, 20);
      ctx.fillStyle = INK.ground; ctx.fillText(label, px + 15, top + 22);
    }
  });

  const localX = (e: React.PointerEvent | React.WheelEvent) => e.clientX - ref.current!.getBoundingClientRect().left;
  const timeAt = (x: number) => t0 + (x / width) * view;
  const zoom = (k: number, around?: number) => {
    const c = around ?? time;
    const ns = Math.min(Math.max(2, len), Math.max(1, view * k));
    if (!(follow || playing)) setStart(clampT0(c - ((c - t0) / view) * ns));
    setSpan(ns);
  };

  return (
    <div className="wave-sync">
      <canvas
        ref={ref}
        style={{ height, cursor: drag?.kind === 'nudge' ? 'grabbing' : overTicks ? 'grab' : 'pointer' }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const y = e.clientY - ref.current!.getBoundingClientRect().top;
          const inTicks = y >= RULER && y < RULER + TICKS + 4;
          if (!inTicks) { setFollow(false); setStart(t0); onSeek(inside(timeAt(localX(e)))); }
          setDrag({ kind: inTicks ? 'nudge' : 'scrub', x: e.clientX, y: e.clientY, d: 0, moved: false, v0: 0 });
        }}
        onPointerMove={(e) => {
          const y = e.clientY - ref.current!.getBoundingClientRect().top;
          setOverTicks(y >= RULER && y < RULER + TICKS + 4);
          if (drag?.kind === 'scrub') { onSeek(inside(timeAt(localX(e)))); return; }
          if (drag?.kind !== 'nudge') return;
          const dx = e.clientX - drag.x;
          if (!drag.moved && Math.abs(dx) < 3) return;
          setDrag({ ...drag, moved: true, d: (dx / width) * view });
        }}
        onPointerLeave={() => setOverTicks(false)}
        onPointerUp={(e) => {
          if (drag?.kind === 'nudge') {
            if (drag.moved) { if (Math.abs(drag.d) > 0.0005) onNudge(drag.d); }
            else onSeek(inside(timeAt(localX(e))));
          }
          setDrag(null);
        }}
        onWheel={(e) => {
          if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            const d = ((e.shiftKey ? e.deltaY : e.deltaX) / width) * view;
            setFollow(false);
            setStart(clampT0(t0 + d));
          } else zoom(Math.exp(e.deltaY * 0.0015), timeAt(localX(e)));
        }}
        aria-label="Audio waveform with a tick for every note. Drag on the waveform to move the playhead; drag the ticks sideways to nudge the notes."
      />
      <div
        className="resize-bottom"
        title="Drag to resize"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag({ kind: 'resize', x: e.clientX, y: e.clientY, d: 0, moved: false, v0: height }); }}
        onPointerMove={(e) => { if (drag?.kind === 'resize') setHeight(Math.max(140, Math.min(560, drag.v0 + e.clientY - drag.y))); }}
        onPointerUp={() => { if (drag?.kind === 'resize') { try { localStorage.setItem(LS_HEIGHT, String(height)); } catch { /* convenience only */ } } setDrag(null); }}
      />
      {transport}
      <div className="wave-foot">
        <span className="legend"><i className="lg-tick" />Notes <i className="lg-tick faded" />no sound there <i className="lg-wave" />Audio</span>
        <span className="zoom">
          <button type="button" className="btn icon ghost" onClick={() => zoom(1.6)} aria-label="Zoom out" title="Zoom out (scroll)"><Icon name="zoomOut" /></button>
          <span className="span-label">{view < 10 ? view.toFixed(1) : Math.round(view)} s</span>
          <button type="button" className="btn icon ghost" onClick={() => zoom(1 / 1.6)} aria-label="Zoom in" title="Zoom in (scroll)"><Icon name="zoomIn" /></button>
          <button type="button" className="btn icon ghost" onClick={() => { setSpan(len); setStart(keptA); setFollow(false); }} aria-label="Show all of it" title="Show all of it (the part kept on Video)"><Icon name="fit" /></button>
          <button type="button" className={'btn icon' + (follow ? ' on' : ' ghost')} onClick={() => setFollow(true)} aria-label="Follow the playhead" aria-pressed={follow} title="Follow the playhead"><Icon name="follow" /></button>
        </span>
        <span className="dim">Drag to move the playhead · drag the ticks to nudge the notes</span>
      </div>
    </div>
  );
}
