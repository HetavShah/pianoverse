// The value over a dial, which you can also type into: click it, type a number in the units shown ("0" for an offset
// shown as "+421 ms", "50" for "50%"), Enter to set it, Esc to leave it as it was.
//
// Any dial's formatting works without a parser of its own: the typed number is matched against the formatted value of
// every step on the dial and the closest is taken (a dial has at most a few thousand steps). A dial whose units change
// across its range (an offset shown in ms, then in s) passes `parse`.
import { useRef, useState } from 'react';

/** the first number in a formatted value ("−3.5 dB" → −3.5, "Off" → 0) */
const numberIn = (s: string) => {
  const m = s.replace(/[−–]/g, '-').match(/[-+]?\d*\.?\d+/);
  return m ? Number(m[0]) : 0;
};

export default function ValueEdit({ value, min, max, step, fmt, onChange, disabled, label, parse }: {
  value: number; min: number; max: number; step: number;
  fmt?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
  label: string;
  /** typed text → value, for formatting that the steps can't be matched against */
  parse?: (text: string) => number | null;
}) {
  const [text, setText] = useState<string | null>(null);
  // Esc unmounts the field, which also blurs it: the blur mustn't set the value
  const cancelled = useRef(false);
  const shown = fmt ? fmt(value) : String(value);

  const commit = () => {
    if (text === null || cancelled.current) { cancelled.current = false; return; }
    setText(null);
    cancelled.current = true;   // the field unmounts and blurs: that second commit is skipped
    if (!/\d/.test(text)) return;
    if (parse) { const v = parse(text); if (v !== null && Number.isFinite(v)) onChange(v); return; }
    const want = numberIn(text);
    // the step whose formatted value is closest to what was typed
    const n = Math.max(1, Math.round((max - min) / step));
    let best = value, bestD = Infinity;
    for (let i = 0; i <= n; i++) {
      const v = Math.min(max, min + i * step);
      const d = Math.abs(numberIn(fmt ? fmt(v) : String(v)) - want);
      if (d < bestD - 1e-9) { bestD = d; best = v; }
    }
    onChange(Number(best.toFixed(6)));
  };

  if (text === null) {
    return (
      <button type="button" className="mono val val-edit" disabled={disabled} onClick={() => { cancelled.current = false; setText(String(numberIn(shown))); }}
        title="Click to type a value" aria-label={`${label}: ${shown}. Click to type a value`}>{shown}</button>
    );
  }
  return (
    <input className="mono val val-input" autoFocus value={text} aria-label={`${label}, type a value`}
      onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; setText(null); } e.stopPropagation(); }} />
  );
}
