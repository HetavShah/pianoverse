import { useEffect, useRef } from 'react';
import { INK } from '../components/palette';
import type { CalibratedProject } from '../../engine/calibration';

/** Thin strip above the timeline: tracking confidence per frame, fixes and the reference frame. */
export function QualityStrip({ project, duration, onSeek }: { project: CalibratedProject; duration: number; onSeek: (t: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cal = project.calibration;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!cal || !duration) return;
    const q = cal.cameraMoves ? cal.quality : undefined;
    const fps = project.video.fps;
    if (q?.length) {
      for (let x = 0; x < w; x++) {
        const f0 = Math.floor((x / w) * duration * fps), f1 = Math.max(f0 + 1, Math.floor(((x + 1) / w) * duration * fps));
        let m = 1;
        for (let f = f0; f < f1 && f < q.length; f++) m = Math.min(m, q[f]);
        ctx.fillStyle = m >= 0.45 ? INK.ok : m >= 0.25 ? INK.warn : INK.bad;
        ctx.fillRect(x, 3, 1, h - 6);
      }
    } else {
      ctx.fillStyle = INK.rule;
      ctx.fillRect(0, 3, w, h - 6);
    }
    ctx.fillStyle = INK.live;
    const rx = (cal.refTime / duration) * w;
    ctx.beginPath(); ctx.moveTo(rx - 4, 0); ctx.lineTo(rx + 4, 0); ctx.lineTo(rx, 6); ctx.fill();
    ctx.fillStyle = INK.paper;
    for (const f of cal.fixes) ctx.fillRect((f.t / duration) * w - 1, 0, 2, h);
  });
  return (
    <canvas
      ref={ref}
      className="quality"
      title="Tracking confidence: green locked, amber unsure, red lost. The orange marker is the marked frame; white ticks are fixes"
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * duration); }}
    />
  );
}
