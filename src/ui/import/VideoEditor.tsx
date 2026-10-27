// Import step: trim the start and end of the video and crop its frame. Nothing is cut from the file itself: the
// project keeps the trim (seconds) and the crop (video pixels), and every step, the camera and the export follow them.
import { useEffect, useRef, useState } from 'react';
import type { Rect } from '../../engine/project';
import { sourceRect, trimRange } from '../../engine/project';
import type { WS } from '../app/workspace';

const SHAPES: { id: string; label: string; r: number | null }[] = [
  { id: 'free', label: 'Free', r: null },
  { id: '9:16', label: '9:16', r: 9 / 16 },
  { id: '4:5', label: '4:5', r: 4 / 5 },
  { id: '1:1', label: '1:1', r: 1 },
  { id: '16:9', label: '16:9', r: 16 / 9 },
];
const fmt = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };
const MIN = 64; // smallest crop, video pixels
const MIN_LEN = 1; // shortest trim, seconds
const STRIP = 12; // filmstrip pictures

type Drag = { kind: 'move' | 'nw' | 'ne' | 'sw' | 'se'; x: number; y: number; c: Rect } | null;

export default function VideoEditor({ ws }: { ws: WS }) {
  const project = ws.project!;
  const W = project.video.width, H = project.video.height;
  const duration = ws.duration || project.video.duration || project.video.frames / (project.video.fps || 30);
  const crop = sourceRect(project);
  const cropped = crop.w < W - 0.5 || crop.h < H - 0.5;
  const [trimA, trimB] = trimRange(project, duration);
  const [shape, setShape] = useState<string>('free');
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag>(null);
  const [strip, setStrip] = useState<string[]>([]);

  const setEdit = (patch: { trim?: [number, number] | undefined; crop?: Rect | undefined }) => {
    const e = { ...(project.edit ?? {}), ...patch };
    if (!e.trim) delete e.trim;
    if (!e.crop) delete e.crop;
    ws.setProject({ ...project, edit: Object.keys(e).length ? e : undefined });
  };
  const setCrop = (c: Rect | null) => {
    if (!c) { setEdit({ crop: undefined }); return; }
    const x = Math.round(Math.max(0, Math.min(W - MIN, c.x))), y = Math.round(Math.max(0, Math.min(H - MIN, c.y)));
    const w = Math.round(Math.max(MIN, Math.min(W - x, c.w))), h = Math.round(Math.max(MIN, Math.min(H - y, c.h)));
    setEdit({ crop: w >= W - 1 && h >= H - 1 ? undefined : { x, y, w, h } });
  };
  const setTrim = (a: number, b: number) => {
    const A = Math.max(0, Math.min(duration - MIN_LEN, a)), B = Math.min(duration, Math.max(A + MIN_LEN, b));
    setEdit({ trim: A <= 0.01 && B >= duration - 0.01 ? undefined : [Math.round(A * 100) / 100, Math.round(B * 100) / 100] });
  };

  // the frame with the crop drawn over it
  const v = ws.videoEl.current;
  useEffect(() => {
    const c = cv.current;
    if (!c || !v || !v.videoWidth) return;
    const k = Math.min(1, 560 / Math.max(W, H));
    c.width = Math.round(W * k); c.height = Math.round(H * k);
    const g = c.getContext('2d')!;
    g.drawImage(v, 0, 0, c.width, c.height);
    if (!cropped) return;
    const r = { x: crop.x * k, y: crop.y * k, w: crop.w * k, h: crop.h * k };
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, 0, c.width, r.y); g.fillRect(0, r.y + r.h, c.width, c.height - r.y - r.h);
    g.fillRect(0, r.y, r.x, r.h); g.fillRect(r.x + r.w, r.y, c.width - r.x - r.w, r.h);
  }, [v, ws.time, ws.frameTick, crop.x, crop.y, crop.w, crop.h, cropped, W, H]);

  // a filmstrip under the trim bar (drawn from a second, hidden copy of the video so playback isn't disturbed)
  useEffect(() => {
    const src = v?.currentSrc;
    if (!src || !duration) return;
    let stop = false;
    const el = document.createElement('video');
    el.muted = true; el.preload = 'auto'; el.src = src;
    const pics: string[] = [];
    const c = document.createElement('canvas');
    (async () => {
      await new Promise<void>((res, rej) => { el.onloadeddata = () => res(); el.onerror = () => rej(new Error('video')); });
      const h = 54, w = Math.round(h * (el.videoWidth / el.videoHeight));
      c.width = w; c.height = h;
      for (let i = 0; i < STRIP && !stop; i++) {
        await new Promise<void>((res) => { el.onseeked = () => res(); el.currentTime = ((i + 0.5) / STRIP) * duration; });
        c.getContext('2d')!.drawImage(el, 0, 0, w, h);
        pics.push(c.toDataURL('image/jpeg', 0.7));
        if (!stop) setStrip([...pics]);
      }
    })().catch(() => {});
    return () => { stop = true; el.removeAttribute('src'); el.load(); };
  }, [v?.currentSrc, duration]);

  // drag the crop: inside moves it, the corners resize it (keeping the shape when one is chosen)
  const toVideo = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const ratio = SHAPES.find((s) => s.id === shape)?.r ?? null;
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toVideo(e);
    const c = cropped ? crop : { x: 0, y: 0, w: W, h: H };
    const hit = Math.max(W, H) * 0.04;
    const near = (x: number, y: number) => Math.abs(p.x - x) < hit && Math.abs(p.y - y) < hit;
    const kind = near(c.x, c.y) ? 'nw' : near(c.x + c.w, c.y) ? 'ne' : near(c.x, c.y + c.h) ? 'sw' : near(c.x + c.w, c.y + c.h) ? 'se'
      : p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h && cropped ? 'move' : null;
    if (!kind) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, x: p.x, y: p.y, c };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toVideo(e);
    const dx = p.x - d.x, dy = p.y - d.y;
    const c = d.c;
    if (d.kind === 'move') { setCrop({ ...c, x: Math.max(0, Math.min(W - c.w, c.x + dx)), y: Math.max(0, Math.min(H - c.h, c.y + dy)) }); return; }
    // the fixed corner stays put
    const fx = d.kind === 'nw' || d.kind === 'sw' ? c.x + c.w : c.x;
    const fy = d.kind === 'nw' || d.kind === 'ne' ? c.y + c.h : c.y;
    let w = Math.max(MIN, Math.abs(p.x - fx)), h = Math.max(MIN, Math.abs(p.y - fy));
    if (ratio) { if (w / h > ratio) w = h * ratio; else h = w / ratio; }
    w = Math.min(w, p.x < fx ? fx : W - fx); h = Math.min(h, p.y < fy ? fy : H - fy);
    if (ratio) { if (w / h > ratio) w = h * ratio; else h = w / ratio; }
    setCrop({ x: p.x < fx ? fx - w : fx, y: p.y < fy ? fy - h : fy, w, h });
  };
  const pickShape = (id: string) => {
    setShape(id);
    const r = SHAPES.find((s) => s.id === id)?.r;
    if (!r) return;
    // the biggest window of that shape, centred on the current crop
    const c = cropped ? crop : { x: 0, y: 0, w: W, h: H };
    const w = Math.min(W, H * r), h = w / r;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    setCrop({ x: Math.max(0, Math.min(W - w, cx - w / 2)), y: Math.max(0, Math.min(H - h, cy - h / 2)), w, h });
  };

  // the trim bar
  const bar = useRef<HTMLDivElement>(null);
  const tdrag = useRef<'a' | 'b' | 'seek' | null>(null);
  const tAt = (e: React.PointerEvent) => { const r = bar.current!.getBoundingClientRect(); return Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration)); };
  const onTrimDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = tAt(e);
    const r = bar.current!.getBoundingClientRect();
    const px = (s: number) => (s / duration) * r.width;
    const x = e.clientX - r.left;
    tdrag.current = Math.abs(x - px(trimA)) < 10 ? 'a' : Math.abs(x - px(trimB)) < 10 ? 'b' : 'seek';
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tdrag.current === 'seek') ws.seek(t);
  };
  const onTrimMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const k = tdrag.current;
    if (!k) return;
    const t = tAt(e);
    if (k === 'a') { setTrim(t, trimB); ws.seek(Math.min(t, trimB - MIN_LEN)); }
    else if (k === 'b') { setTrim(trimA, t); ws.seek(Math.max(t, trimA + MIN_LEN)); }
    else ws.seek(t);
  };
  const pc = (t: number) => `${(t / Math.max(0.001, duration)) * 100}%`;
  const trimmed = trimA > 0.01 || trimB < duration - 0.01;

  return (
    <section className="video-edit">
      <div className="ve-head">
        <h2>Trim and crop</h2>
        <span className="dim small-text">Your file isn't changed; every step and the export follow this.</span>
      </div>
      <div className="ve-body">
        <div className="ve-frame">
          <canvas ref={cv} className={cropped ? 'crop' : ''} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} aria-label="Crop: drag the corners" />
          {cropped && (
            <div className="ve-box" style={{ left: `${(crop.x / W) * 100}%`, top: `${(crop.y / H) * 100}%`, width: `${(crop.w / W) * 100}%`, height: `${(crop.h / H) * 100}%` }}>
              <i className="nw" /><i className="ne" /><i className="sw" /><i className="se" />
            </div>
          )}
          {!cropped && <div className="ve-corners" aria-hidden="true"><i className="nw" /><i className="ne" /><i className="sw" /><i className="se" /></div>}
        </div>
        <div className="ve-side">
          <span className="section-label">Crop</span>
          <div className="seg">
            {SHAPES.map((s) => <button key={s.id} type="button" className={shape === s.id ? 'on' : ''} onClick={() => pickShape(s.id)}>{s.label}</button>)}
          </div>
          <small className="help">Drag a corner of the picture to crop{ratio ? ' (keeps the shape)' : ''}; drag inside to move it.</small>
          <span className="mono small-text">{Math.round(crop.w)}×{Math.round(crop.h)}{cropped ? ` of ${W}×${H}` : ''}</span>
          {cropped && <button type="button" className="btn small" onClick={() => { setShape('free'); setCrop(null); }}>Reset crop</button>}
        </div>
      </div>

      <div className="ve-trim">
        <div className="ve-trim-head">
          <button type="button" className="btn icon small" onClick={ws.togglePlay} aria-label={ws.playing ? 'Pause' : 'Play'}>
            {ws.playing
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z" /></svg>}
          </button>
          <span className="mono small-text">{fmt(ws.time)}</span>
          <span className="spacer" />
          <span className="small-text">Start <b className="mono">{fmt(trimA)}</b></span>
          <span className="small-text">End <b className="mono">{fmt(trimB)}</b></span>
          <span className="small-text dim">Length <span className="mono">{fmt(trimB - trimA)}</span></span>
        </div>
        <div className="ve-bar" ref={bar} onPointerDown={onTrimDown} onPointerMove={onTrimMove} onPointerUp={() => { tdrag.current = null; }}
          role="group" aria-label="Trim: drag the two handles">
          <div className="ve-strip">{strip.map((s, i) => <img key={i} src={s} alt="" />)}</div>
          <div className="ve-off" style={{ left: 0, width: pc(trimA) }} />
          <div className="ve-off" style={{ left: pc(trimB), right: 0 }} />
          <div className="ve-keep" style={{ left: pc(trimA), width: `calc(${pc(trimB)} - ${pc(trimA)})` }} />
          <div className="ve-handle a" style={{ left: pc(trimA) }} title="Start" />
          <div className="ve-handle b" style={{ left: pc(trimB) }} title="End" />
          <div className="ve-head-line" style={{ left: pc(ws.time) }} />
        </div>
        <div className="row">
          <button type="button" className="btn small" onClick={() => setTrim(ws.time, trimB)} disabled={ws.time >= trimB - MIN_LEN}>Start here</button>
          <button type="button" className="btn small" onClick={() => setTrim(trimA, ws.time)} disabled={ws.time <= trimA + MIN_LEN}>End here</button>
          {trimmed && <button type="button" className="link inline small-text" onClick={() => setEdit({ trim: undefined })}>Use the whole video</button>}
        </div>
      </div>
    </section>
  );
}
