// A scroll-wheel dial in place of a plain slider: a tape of ticks slides under a fixed centre line. Drag the
// tape, turn the mouse wheel over it (Shift for fine steps), or click one of the stops. A real range input sits
// underneath for the keyboard, screen readers and the automated checks.
import { useEffect, useRef, useState } from 'react';

const TAPE = 480; // px of tape for the whole range

export default function Dial(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  /** the preset's value: one of the stops lands on it, and a double-click goes back to it */
  base?: number;
  stops?: boolean;
  disabled?: boolean;
}) {
  const { value, min, max, step, label, onChange, fmt, base, disabled } = props;
  const span = max - min || 1;
  const ruler = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; v: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const live = useRef({ value, onChange });
  live.current = { value, onChange };
  const snap = (v: number) => {
    const d = Math.min(max, Math.max(min, v));
    const s = Math.round((d - min) / step) * step + min;
    return Number(Math.min(max, Math.max(min, s)).toFixed(6));
  };
  const frac = Math.min(1, Math.max(0, (value - min) / span));

  // the wheel turns the dial instead of scrolling the panel
  useEffect(() => {
    const el = ruler.current;
    if (!el || disabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const notch = e.shiftKey ? Math.max(step, span / 400) : Math.max(step, span / 60);
      const dir = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) > 0 ? -1 : 1;
      live.current.onChange(snap(live.current.value + dir * notch));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  let stopList: number[] = [];
  if (props.stops !== false) {
    stopList = [0, 1 / 3, 2 / 3, 1].map((k) => snap(min + k * span));
    if (base !== undefined && !stopList.some((s) => Math.abs(s - base) < step / 2)) {
      let near = 0;
      stopList.forEach((s, i) => { if (Math.abs(s - base) < Math.abs(stopList[near] - base)) near = i; });
      stopList[near] = snap(base);
    }
    stopList = [...new Set(stopList)].sort((a, b) => a - b);
  }
  const show = (v: number) => (fmt ? fmt(v) : String(v));

  return (
    <div className={'dial' + (disabled ? ' off' : '')}>
      {stopList.length > 1 && (
        <div className="dial-stops" role="group" aria-label={`${label} presets`}>
          {stopList.map((s) => (
            <button key={s} type="button" disabled={disabled} className={Math.abs(s - value) < step / 2 ? 'on' : ''} onClick={() => onChange(s)}
              title={base !== undefined && Math.abs(s - base) < step / 2 ? 'The preset’s value' : undefined}>
              {show(s)}{base !== undefined && Math.abs(s - base) < step / 2 && <i className="dial-base" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
      <div
        ref={ruler}
        className={'dial-ruler' + (dragging ? ' dragging' : '')}
        aria-hidden="true"
        onPointerDown={(e) => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, v: value }; setDragging(true); }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; onChange(snap(d.v - ((e.clientX - d.x) / TAPE) * span * (e.shiftKey ? 0.2 : 1))); }}
        onPointerUp={() => { drag.current = null; setDragging(false); }}
        onPointerCancel={() => { drag.current = null; setDragging(false); }}
        onDoubleClick={() => { if (base !== undefined && !disabled) onChange(base); }}
        title={base !== undefined ? 'Drag or scroll to change · Shift for fine steps · double-click for the preset’s value' : 'Drag or scroll to change · Shift for fine steps'}
      >
        <div className="dial-tape" style={{ width: TAPE, transform: `translateX(${-frac * TAPE}px)` }}>
          {base !== undefined && <span className="dial-tick-base" style={{ left: ((base - min) / span) * TAPE }} />}
        </div>
        <span className="dial-mark" />
      </div>
      <input className="dial-input" type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </div>
  );
}
