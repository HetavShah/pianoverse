// Calibration editor: the current video frame with the keyboard outline, draggable corners and saber ends.
// Wheel zooms around the cursor, dragging empty space pans, double-click fits, arrow keys nudge the selected handle.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apply, inv, planeToImage, Pt, Quad } from '../engine/geometry';
import { isBlack } from '../engine/calibration';

export interface CalibrateCanvasProps {
  video: HTMLVideoElement | null;
  videoW: number;
  videoH: number;
  /** changes whenever a new frame should be drawn */
  frameKey: number;
  corners: Quad;
  edge: { a: number; b: number };
  whiteKeys: number;
  lowestNote: number;
  keys: number;
  /** this frame carries a manual fix */
  fixed: boolean;
  /** edits on this frame become fixes (tracking exists) */
  fixMode: boolean;
  onCorners: (q: Quad, final: boolean) => void;
  onEdge: (e: { a: number; b: number }, final: boolean) => void;
}

type Handle = { kind: 'corner'; i: number } | { kind: 'saber'; side: 0 | 1 };
interface View { z: number; cx: number; cy: number } // zoom and the video point at the canvas centre

const LABELS = ['Low key · back', 'High key · back', 'High key · front', 'Low key · front'];
const ACCENT = '#2FD3B5';
const SABER_OUT = 2.6; // white keys beyond each end

export default function CalibrateCanvas(p: CalibrateCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600, dpr: 1 });
  const [view, setView] = useState<View>({ z: 1, cx: p.videoW / 2, cy: p.videoH / 2 });
  const [sel, setSel] = useState<Handle | null>(null);
  const [drag, setDrag] = useState<{ h: Handle | null; pan?: { x: number; y: number; cx: number; cy: number }; pt?: Pt } | null>(null);
  const [hover, setHover] = useState<Handle | null>(null);
  const live = useRef(p);
  live.current = p;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(50, r.width), h: Math.max(50, r.height), dpr: window.devicePixelRatio || 1 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { setView({ z: 1, cx: p.videoW / 2, cy: p.videoH / 2 }); }, [p.videoW, p.videoH]);

  // video px -> screen (CSS px)
  const fit = Math.min(size.w / p.videoW, size.h / p.videoH) * 0.94;
  const sc = fit * view.z;
  const toScreen = useCallback((x: number, y: number): Pt => [(x - view.cx) * sc + size.w / 2, (y - view.cy) * sc + size.h / 2], [view, sc, size]);
  const toVideo = useCallback((x: number, y: number): Pt => [(x - size.w / 2) / sc + view.cx, (y - size.h / 2) / sc + view.cy], [view, sc, size]);

  const geometry = useCallback(() => {
    const H = planeToImage(p.corners, p.whiteKeys);
    if (!H) return null;
    const ey = (x: number) => p.edge.a + p.edge.b * x;
    // saber handles sit just past the ends of the keys, so they never cover the corner handles
    const xl = -SABER_OUT, xr = p.whiteKeys + SABER_OUT;
    const saber: [Pt, Pt] = [apply(H, xl, ey(xl)), apply(H, xr, ey(xr))];
    return { H, saber };
  }, [p.corners, p.whiteKeys, p.edge]);

  // ---------- drawing ----------
  const drawScene = useCallback((ctx: CanvasRenderingContext2D, T: (x: number, y: number) => Pt, scale: number) => {
    const v = live.current.video;
    const [ox, oy] = T(0, 0);
    if (v && v.readyState >= 2) ctx.drawImage(v, ox, oy, p.videoW * scale, p.videoH * scale);
    else { ctx.fillStyle = '#111'; ctx.fillRect(ox, oy, p.videoW * scale, p.videoH * scale); }
    const g = geometry();
    if (!g) return;
    const { H } = g;
    const P = (x: number, y: number) => { const [u, w] = apply(H, x, y); return T(u, w); };
    const line = (a: Pt, b: Pt) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
    // white key dividers
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    for (let x = 1; x < p.whiteKeys; x++) line(P(x, 0.62), P(x, 1));
    // black keys
    const WHITE_OFF: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
    const BLACK_OFF: Record<number, number> = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
    const ord = (q: number) => { const o = Math.floor(q / 12), r = q - o * 12; return o * 7 + (r in WHITE_OFF ? WHITE_OFF[r] : BLACK_OFF[r]); };
    const base = ord(p.lowestNote);
    ctx.fillStyle = 'rgba(47,211,181,0.10)';
    ctx.strokeStyle = 'rgba(47,211,181,0.6)';
    for (let n = p.lowestNote; n < p.lowestNote + p.keys; n++) {
      if (!isBlack(n)) continue;
      const c = ord(n) - base;
      const q = [P(c - 0.28, 0), P(c + 0.28, 0), P(c + 0.28, 0.6), P(c - 0.28, 0.6)];
      ctx.beginPath(); q.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]))); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    // outline
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    const q = live.current.corners.map(([x, y]) => T(x, y));
    ctx.beginPath(); q.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]))); ctx.closePath(); ctx.stroke();
    // saber line
    const ey = (x: number) => p.edge.a + p.edge.b * x;
    ctx.save();
    ctx.shadowColor = ACCENT; ctx.shadowBlur = 10;
    ctx.strokeStyle = '#9ff5e4'; ctx.lineWidth = 2.4;
    const seg = (x0: number, x1: number) => {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const x = x0 + (x1 - x0) * (i / 40);
        const pt = P(x, ey(x));
        if (i) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]);
      }
      ctx.stroke();
    };
    seg(-0.2, p.whiteKeys + 0.2);
    ctx.shadowBlur = 0; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(159,245,228,0.7)';
    seg(-SABER_OUT, -0.2); seg(p.whiteKeys + 0.2, p.whiteKeys + SABER_OUT);
    ctx.restore();
  }, [geometry, p.videoW, p.videoH, p.whiteKeys, p.lowestNote, p.keys, p.edge]);

  const handlePos = useCallback((h: Handle): Pt | null => {
    if (h.kind === 'corner') return p.corners[h.i];
    const g = geometry();
    return g ? g.saber[h.side] : null;
  }, [p.corners, geometry]);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.fillStyle = '#08090b';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.imageSmoothingEnabled = true;
    drawScene(ctx, toScreen, sc);

    // handles
    const all: Handle[] = [0, 1, 2, 3].map((i) => ({ kind: 'corner', i }) as Handle).concat([{ kind: 'saber', side: 0 }, { kind: 'saber', side: 1 }]);
    const same = (a: Handle | null, b: Handle) => !!a && a.kind === b.kind && (a.kind === 'corner' ? a.i === (b as { i: number }).i : a.side === (b as { side: number }).side);
    for (const h of all) {
      const pos = handlePos(h);
      if (!pos) continue;
      const [x, y] = toScreen(pos[0], pos[1]);
      const active = same(sel, h) || same(drag?.h ?? null, h);
      const hot = active || same(hover, h);
      ctx.save();
      if (h.kind === 'corner') {
        ctx.beginPath(); ctx.arc(x, y, hot ? 9 : 7.5, 0, Math.PI * 2);
        ctx.fillStyle = p.fixed ? '#f6c453' : active ? ACCENT : 'rgba(11,13,16,0.85)';
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = p.fixed ? '#f6c453' : ACCENT; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fillStyle = active ? '#062a24' : '#fff'; ctx.fill();
        // label
        const label = LABELS[h.i];
        ctx.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
        const tw = ctx.measureText(label).width;
        const back = h.i < 2;
        const lx = x - tw / 2 - 8, ly = back ? y - 32 : y + 14;
        ctx.fillStyle = 'rgba(11,13,16,0.82)';
        ctx.beginPath(); ctx.roundRect(lx, ly, tw + 16, 20, 6); ctx.fill();
        ctx.fillStyle = hot ? ACCENT : '#e8eaed';
        ctx.fillText(label, lx + 8, ly + 14);
      } else {
        ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        const s = hot ? 7 : 5.5;
        ctx.fillStyle = active ? ACCENT : '#062a24';
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 2;
        ctx.fillRect(-s, -s, s * 2, s * 2); ctx.strokeRect(-s, -s, s * 2, s * 2);
      }
      ctx.restore();
    }

    // magnifier while dragging a handle
    if (drag?.h && drag.pt) {
      const [px, py] = toScreen(drag.pt[0], drag.pt[1]);
      const R = 74, k = Math.max(4 * sc, 2.2);
      // open on the outside of the keyboard, away from the other handles
      const cen = live.current.corners.reduce((a, c) => [a[0] + c[0] / 4, a[1] + c[1] / 4], [0, 0]);
      const [qx, qy] = toScreen(cen[0], cen[1]);
      let dx = px - qx, dy = py - qy;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const D = R + 40;
      let cx = px + dx * D, cy = py + dy * D;
      if (cx < R + 6 || cx > size.w - R - 6) cx = px - dx * D;
      if (cy < R + 6 || cy > size.h - R - 6) cy = py - dy * D;
      cx = Math.min(size.w - R - 6, Math.max(R + 6, cx));
      cy = Math.min(size.h - R - 6, Math.max(R + 6, cy));
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#000'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      drawScene(ctx, (x, y) => [(x - drag.pt![0]) * k + cx, (y - drag.pt![1]) * k + cy], k);
      ctx.strokeStyle = '#ff5d73'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - 12, cy); ctx.lineTo(cx - 3, cy); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - 3); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 12); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = ACCENT; ctx.stroke();
    }
  }, [size, drawScene, toScreen, sc, handlePos, sel, drag, hover, p.fixed]);

  useEffect(() => { draw(); }, [draw, p.frameKey]);

  // ---------- interaction ----------
  const hit = (x: number, y: number): Handle | null => {
    const cands: Handle[] = [0, 1, 2, 3, { kind: 'saber', side: 0 }, { kind: 'saber', side: 1 }].map((v) => (typeof v === 'number' ? { kind: 'corner', i: v } : v)) as Handle[];
    let best: Handle | null = null, bd = 16;
    for (const h of cands) {
      const pos = handlePos(h);
      if (!pos) continue;
      const [sx, sy] = toScreen(pos[0], pos[1]);
      const d = Math.hypot(sx - x, sy - y);
      if (d < bd - 0.5) { bd = d; best = h; }
    }
    return best;
  };

  const local = (e: React.PointerEvent | React.WheelEvent | React.MouseEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const moveHandle = (h: Handle, pt: Pt, final: boolean) => {
    const cur = live.current;
    if (h.kind === 'corner') {
      const q = cur.corners.map((c) => [...c]) as Quad;
      q[h.i] = [Math.round(pt[0] * 4) / 4, Math.round(pt[1] * 4) / 4];
      cur.onCorners(q, final);
    } else {
      const H = planeToImage(cur.corners, cur.whiteKeys);
      if (!H) return;
      const [, py] = apply(inv(H), pt[0], pt[1]);
      const y = Math.max(-0.8, Math.min(0.8, py));
      // keep the other end where it is; solve the line through both handle positions
      const xl = -SABER_OUT, xr = cur.whiteKeys + SABER_OUT;
      const yl = h.side === 0 ? y : cur.edge.a + cur.edge.b * xl;
      const yr = h.side === 1 ? y : cur.edge.a + cur.edge.b * xr;
      const b = (yr - yl) / (xr - xl);
      const a = yl - b * xl;
      cur.onEdge({ a: Math.round(a * 1e4) / 1e4, b: Math.round(b * 1e6) / 1e6 }, final);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current?.focus();
    const [x, y] = local(e);
    const h = hit(x, y);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (h) {
      setSel(h);
      setDrag({ h, pt: handlePos(h) ?? toVideo(x, y) });
    } else {
      setSel(null);
      setDrag({ h: null, pan: { x, y, cx: view.cx, cy: view.cy } });
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const [x, y] = local(e);
    if (!drag) { setHover(hit(x, y)); return; }
    if (drag.h) {
      const pt = toVideo(x, y);
      setDrag({ ...drag, pt });
      moveHandle(drag.h, pt, false);
    } else if (drag.pan) {
      setView((v) => ({ ...v, cx: drag.pan!.cx - (x - drag.pan!.x) / sc, cy: drag.pan!.cy - (y - drag.pan!.y) / sc }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag?.h && drag.pt) moveHandle(drag.h, toVideo(...local(e)), true);
    setDrag(null);
  };
  const onWheel = (e: React.WheelEvent) => {
    const [x, y] = local(e);
    const before = toVideo(x, y);
    const z = Math.min(12, Math.max(1, view.z * Math.exp(-e.deltaY * 0.0015)));
    const nsc = fit * z;
    setView({ z, cx: before[0] - (x - size.w / 2) / nsc, cy: before[1] - (y - size.h / 2) / nsc });
  };

  // arrow-key nudging of the selected handle (1 video pixel, Shift = 5)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sel) return;
      if (e.key === 'Escape') { setSel(null); e.preventDefault(); return; }
      const d = e.shiftKey ? 5 : 1;
      const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
      const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      if (!dx && !dy) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = handlePos(sel);
      if (pos) moveHandle(sel, [pos[0] + dx, pos[1] + dy], true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <div ref={wrapRef} className="calib-wrap">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        width={Math.round(size.w * size.dpr)}
        height={Math.round(size.h * size.dpr)}
        style={{ width: size.w, height: size.h, cursor: drag?.pan ? 'grabbing' : hover ? 'pointer' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onWheel={onWheel}
        onDoubleClick={() => setView({ z: 1, cx: p.videoW / 2, cy: p.videoH / 2 })}
        aria-label="Keyboard calibration: drag the corners onto your keyboard"
      />
      <div className="calib-hud">
        {p.fixMode ? (p.fixed ? 'This frame has a fix · drag to adjust it' : 'Drag a corner to fix this frame') : 'Drag the four corners onto your keyboard'}
        <span className="dim"> · scroll to zoom · drag to pan · double-click to fit</span>
        {view.z > 1.01 && <span className="dim"> · {view.z.toFixed(1)}×</span>}
      </div>
    </div>
  );
}
