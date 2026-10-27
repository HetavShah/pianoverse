// A plain timeline: click or drag to move the playhead. The parts trimmed off on the Import step are shaded.
import { useRef } from 'react';

export default function ScrubBar({ time, duration, trim, onSeek }: {
  time: number; duration: number; trim?: [number, number] | null; onSeek: (t: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const D = Math.max(0.001, duration);
  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onSeek(Math.min(D, Math.max(0, ((e.clientX - r.left) / r.width) * D)));
  };
  const pct = (t: number) => `${(Math.min(D, Math.max(0, t)) / D) * 100}%`;
  return (
    <div className="scrub" ref={ref}
      onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); at(e); }}
      onPointerMove={(e) => { if (drag.current) at(e); }}
      onPointerUp={() => { drag.current = false; }}
      role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={Math.round(D)} aria-valuenow={Math.round(time)}>
      <div className="scrub-track" />
      {trim && trim[0] > 0 && <div className="scrub-off" style={{ left: 0, width: pct(trim[0]) }} />}
      {trim && trim[1] < D && <div className="scrub-off" style={{ left: pct(trim[1]), right: 0 }} />}
      <div className="scrub-head" style={{ left: pct(time) }} />
    </div>
  );
}
