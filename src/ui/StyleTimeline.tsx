// Style screen timeline: the whole clip at a glance. A time ruler, every note (higher = higher pitch), and how
// well the keyboard was tracked. Click to jump; drag across it to pick a section to loop; drag the section's
// edges to adjust it.
import { useEffect, useRef, useState } from 'react';
import type { CalibratedProject } from '../engine/calibration';
import { pal, ParticleScene } from '../engine/project';
import { sceneName } from './ShapeSections';

const LABEL_W = 0; // labels live in HTML beside the canvas
const RULER = 20, NOTES_H = 54, GAP = 8, TRACK_H = 12, GAP2 = 18, PART_H = 18;
export const TIMELINE_H = RULER + NOTES_H + GAP + TRACK_H + GAP2 + PART_H + 12;

const fmt = (t: number, fine = false) => {
  const s = Math.max(0, t), m = Math.floor(s / 60);
  return fine ? `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}` : `${m}:${Math.floor(s - m * 60).toString().padStart(2, '0')}`;
};

export default function StyleTimeline(props: {
  project: CalibratedProject;
  time: number;
  duration: number;
  range: [number, number] | null;
  onRange: (r: [number, number] | null) => void;
  onSeek: (t: number) => void;
  scenes: ParticleScene[];
  setScenes: (s: ParticleScene[]) => void;
  selectedScene: string | null;
  onSelectScene: (id: string | null) => void;
}) {
  const { project, time, duration, range, onRange, onSeek, scenes, setScenes, selectedScene, onSelectScene } = props;
  const [sdrag, setSdrag] = useState<{ id: string; edge: 'a' | 'b' | 'move'; t0: number; s0: ParticleScene; cur: ParticleScene } | null>(null);
  const sceneList = sdrag ? scenes.map((s) => (s.id === sdrag.id ? sdrag.cur : s)) : scenes;
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(1000);
  const [drag, setDrag] = useState<{ mode: 'new' | 'a' | 'b'; x0: number; t0: number; moved: boolean; r: [number, number] | null } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const dur = duration || 1;
  const cal = project.calibration;
  const tracked = !!cal?.cameraMoves && !!cal.quality?.length;
  const imported = !cal && project.tracking.frames.length > 1; // tracking that came with a project file
  const shown = drag?.r ?? range;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const h = TIMELINE_H, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const X = (t: number) => LABEL_W + (t / dur) * (w - LABEL_W);
    // ruler
    ctx.font = '11px "Cascadia Mono", Consolas, monospace';
    const step = dur <= 20 ? 2 : dur <= 60 ? 5 : dur <= 180 ? 15 : dur <= 600 ? 30 : 60;
    for (let s = 0; s <= dur + 1e-6; s += step) {
      const x = Math.round(X(s));
      ctx.fillStyle = '#4a525d'; ctx.fillRect(x, RULER - 6, 1, 6);
      ctx.fillStyle = '#7d8896'; ctx.fillText(fmt(s), Math.min(w - 32, x + 3), 12);
    }
    const nTop = RULER, tTop = RULER + NOTES_H + GAP, pTop = tTop + TRACK_H + GAP2;
    // lanes background
    ctx.fillStyle = '#0b0e12';
    ctx.beginPath(); ctx.roundRect(0, nTop, w, NOTES_H, 6); ctx.fill();
    ctx.beginPath(); ctx.roundRect(0, tTop, w, TRACK_H, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(0, pTop, w, PART_H, 4); ctx.fill();
    // particles lane: normal particles everywhere, shape sections on top
    ctx.font = '11px Inter, "Segoe UI", sans-serif';
    ctx.fillStyle = '#3a424d'; ctx.fillText('Normal particles', 8, pTop + 13);
    for (const sc of sceneList) {
      const a = X(sc.start), b = X(sc.end), on = sc.id === selectedScene;
      ctx.fillStyle = on ? '#a77bff' : '#6d4fc2';
      ctx.beginPath(); ctx.roundRect(a, pTop + 1, Math.max(3, b - a), PART_H - 2, 4); ctx.fill();
      if (on) { ctx.fillStyle = '#fff'; ctx.fillRect(a, pTop + 1, 2, PART_H - 2); ctx.fillRect(b - 2, pTop + 1, 2, PART_H - 2); }
      ctx.save(); ctx.beginPath(); ctx.rect(a + 4, pTop, Math.max(0, b - a - 8), PART_H); ctx.clip();
      ctx.fillStyle = '#fff'; ctx.fillText('✦ ' + sceneName(sc), a + 6, pTop + 13); ctx.restore();
    }
    // selection
    if (shown) {
      const a = X(shown[0]), b = X(shown[1]);
      ctx.fillStyle = 'rgba(47,211,181,0.12)'; ctx.fillRect(a, nTop - 2, b - a, NOTES_H + GAP + TRACK_H + 2);
      ctx.fillStyle = '#2FD3B5';
      for (const x of [a, b]) { ctx.fillRect(x - 1, nTop - 2, 2, NOTES_H + GAP + TRACK_H + 2); ctx.beginPath(); ctx.roundRect(x - 4, nTop + NOTES_H / 2 - 9, 8, 18, 3); ctx.fill(); }
    }
    // notes: piano roll of the whole clip
    const notes = project.notes;
    let lo = 127, hi = 0;
    for (const n of notes) { if (n.p < lo) lo = n.p; if (n.p > hi) hi = n.p; }
    const rows = Math.max(1, hi - lo + 1);
    for (const n of notes) {
      const c = pal(n.p);
      ctx.fillStyle = `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
      ctx.fillRect(X(n.s), nTop + NOTES_H - 4 - ((n.p - lo + 0.5) / rows) * (NOTES_H - 8), Math.max(1.5, X(n.e) - X(n.s)), 2);
    }
    if (!notes.length) { ctx.fillStyle = '#6b7684'; ctx.font = '12px Inter, "Segoe UI", sans-serif'; ctx.fillText('No notes yet: add them in step 2 (Notes and sync)', 10, nTop + NOTES_H / 2 + 4); }
    // tracking quality
    if (tracked) {
      const q = cal!.quality!;
      const fps = project.video.fps || 30;
      for (let x = 0; x < w; x++) {
        const f0 = Math.floor((x / w) * dur * fps), f1 = Math.max(f0 + 1, Math.floor(((x + 1) / w) * dur * fps));
        let m = 1;
        for (let f = f0; f < f1 && f < q.length; f++) m = Math.min(m, q[f]);
        ctx.fillStyle = m >= 0.45 ? '#1f8a74' : m >= 0.25 ? '#c79533' : '#c0503f';
        ctx.fillRect(x, tTop + 2, 1, TRACK_H - 4);
      }
      ctx.fillStyle = '#f6c453';
      for (const f of cal!.fixes) ctx.fillRect(X(f.t) - 1, tTop, 2, TRACK_H);
    } else if (imported) {
      ctx.fillStyle = '#1f8a74'; ctx.fillRect(0, tTop + 2, w, TRACK_H - 4);
    } else {
      ctx.fillStyle = '#2a3038'; ctx.fillRect(0, tTop + 4, w, TRACK_H - 8);
    }
    // hover and playhead
    if (hover !== null && !drag) { ctx.fillStyle = 'rgba(232,234,237,0.35)'; ctx.fillRect(Math.round(X(hover)), RULER, 1, h - RULER); }
    const px = Math.round(X(time));
    ctx.fillStyle = '#e8eaed'; ctx.fillRect(px, 0, 2, h);
    ctx.beginPath(); ctx.moveTo(px - 5, 0); ctx.lineTo(px + 7, 0); ctx.lineTo(px + 1, 7); ctx.fill();
  });

  const tAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur));
  };
  const xOf = (t: number) => (t / dur) * w;

  return (
    <section className="style-timeline">
      <div className="tl-head">
        <b>Timeline</b>
        <span className="dim">{range ? <>Loop section <span className="mono">{fmt(range[0], true)} – {fmt(range[1], true)}</span></> : 'Click to jump · drag across the timeline to pick a section to loop'}</span>
        {range && <button type="button" className="btn small ghost" onClick={() => onRange(null)}>Clear section</button>}
        <span className="spacer" />
        <span className="tl-legend"><i className="sw locked" />Locked <i className="sw unsure" />Unsure <i className="sw lost" />Lost <i className="sw fix" />Fix</span>
      </div>
      <div className="tl-body">
        <div className="tl-labels">
          <span style={{ height: RULER }} />
          <span style={{ height: NOTES_H + GAP }} title="Every note in the clip. Each bar is one note: further right is later, higher up is a higher pitch.">
            <b>Notes</b><small>higher = higher pitch</small>
          </span>
          <span style={{ height: TRACK_H + GAP2 }} title="How well the keyboard was followed through the clip. Green: locked on; amber: unsure; red: lost (filled in from nearby frames).">
            <b>Tracking</b><small>{tracked || imported ? 'keyboard followed' : cal?.cameraMoves ? 'not tracked yet' : 'camera fixed: not needed'}</small>
          </span>
          <span style={{ height: PART_H + 12 }} title="Where notes send sparks along a shape. Add sections in the Particles panel; click one to edit it, drag its edges to resize it, or drag it to move it.">
            <b>Particles</b><small>{scenes.length ? `${scenes.length} shape section${scenes.length > 1 ? 's' : ''}` : 'normal'}</small>
          </span>
        </div>
        <canvas
          ref={ref}
          style={{ height: TIMELINE_H, cursor: drag || sdrag ? 'ew-resize' : 'pointer' }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            const t = tAt(e.clientX);
            const x = e.clientX - ref.current!.getBoundingClientRect().left;
            const y = e.clientY - ref.current!.getBoundingClientRect().top;
            const pTop = RULER + NOTES_H + GAP + TRACK_H + GAP2;
            if (y >= pTop - 2) {
              // particles lane: pick a section, or drag its edges / move it
              const hit = scenes.find((sc) => x >= xOf(sc.start) - 6 && x <= xOf(sc.end) + 6);
              if (!hit) { onSelectScene(null); onSeek(t); return; }
              onSelectScene(hit.id);
              const edge = Math.abs(x - xOf(hit.start)) < 7 ? 'a' : Math.abs(x - xOf(hit.end)) < 7 ? 'b' : 'move';
              setSdrag({ id: hit.id, edge, t0: t, s0: hit, cur: hit });
              return;
            }
            if (range && Math.abs(x - xOf(range[0])) < 7) setDrag({ mode: 'a', x0: x, t0: t, moved: false, r: range });
            else if (range && Math.abs(x - xOf(range[1])) < 7) setDrag({ mode: 'b', x0: x, t0: t, moved: false, r: range });
            else setDrag({ mode: 'new', x0: x, t0: t, moved: false, r: null });
          }}
          onPointerMove={(e) => {
            const t = tAt(e.clientX);
            if (sdrag) {
              const d = t - sdrag.t0, s0 = sdrag.s0;
              let cur = s0;
              if (sdrag.edge === 'a') cur = { ...s0, start: Math.max(0, Math.min(s0.end - 1, s0.start + d)) };
              else if (sdrag.edge === 'b') cur = { ...s0, end: Math.min(dur, Math.max(s0.start + 1, s0.end + d)) };
              else { const len = s0.end - s0.start; const st = Math.max(0, Math.min(dur - len, s0.start + d)); cur = { ...s0, start: st, end: st + len }; }
              setSdrag({ ...sdrag, cur });
              return;
            }
            if (!drag) { setHover(t); return; }
            const x = e.clientX - ref.current!.getBoundingClientRect().left;
            const moved = drag.moved || Math.abs(x - drag.x0) > 4;
            if (!moved) return;
            let r: [number, number];
            if (drag.mode === 'new') r = [Math.min(drag.t0, t), Math.max(drag.t0, t)];
            else if (drag.mode === 'a') r = [Math.min(t, drag.r![1] - 0.2), drag.r![1]];
            else r = [drag.r![0], Math.max(t, drag.r![0] + 0.2)];
            setDrag({ ...drag, moved, r });
          }}
          onPointerUp={(e) => {
            if (sdrag) {
              if (sdrag.cur !== sdrag.s0) setScenes(scenes.map((sc) => (sc.id === sdrag.id ? sdrag.cur : sc)).sort((x, y) => x.start - y.start));
              setSdrag(null);
              return;
            }
            if (drag) {
              if (!drag.moved) onSeek(tAt(e.clientX));
              else if (drag.r && drag.r[1] - drag.r[0] >= 0.2) onRange(drag.r);
            }
            setDrag(null);
          }}
          onPointerLeave={() => setHover(null)}
          aria-label="Timeline: click to jump, drag to choose a section to loop"
        />
      </div>
    </section>
  );
}
