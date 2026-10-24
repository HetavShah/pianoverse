// Controls for one layer of the look, generated from LOOK_SCHEMA.
import { noteName } from '../engine/calibration';
import { Control, LayerId, Look, LOOK_SCHEMA, noteColor, PALETTES, PaletteId, toHex } from '../engine/look';

const swatch = (look: Look, id: PaletteId) => {
  const l = { ...look, palette: id };
  const stops = [40, 52, 63, 74, 86].map((p) => toHex(noteColor(l, p)));
  return `linear-gradient(90deg, ${stops.join(', ')})`;
};

function Row({ c, look, base, set }: { c: Control; look: Look; base: Look; set: (k: keyof Look, v: unknown) => void }) {
  const v = look[c.key];
  const changed = v !== base[c.key];
  const reset = changed ? (
    <button type="button" className="reset" onClick={() => set(c.key, base[c.key])} title="Back to the preset's value" aria-label={`Reset ${c.label}`}>↺</button>
  ) : null;
  if ('when' in c && c.when && !c.when(look)) return null;
  switch (c.kind) {
    case 'slider': {
      const n = v as number;
      return (
        <div className="ctl" title={c.hint}>
          <div className="ctl-head"><span>{c.label}</span>{reset}<span className="mono val">{c.fmt ? c.fmt(n) : n}</span></div>
          <input type="range" min={c.min} max={c.max} step={c.step} value={n} onChange={(e) => set(c.key, Number(e.target.value))} onDoubleClick={() => set(c.key, base[c.key])} aria-label={c.label} />
        </div>
      );
    }
    case 'toggle':
      return (
        <label className="toggle-row compact ctl">
          <span>{c.label}{reset}</span>
          <input type="checkbox" checked={!!v} onChange={(e) => set(c.key, e.target.checked)} />
        </label>
      );
    case 'color':
      return (
        <label className="ctl color-row">
          <span>{c.label}{reset}</span>
          <span className="color-pick"><input type="color" value={v as string} onChange={(e) => set(c.key, e.target.value)} /><span className="mono">{String(v).toUpperCase()}</span></span>
        </label>
      );
    case 'note': {
      const opts: number[] = [];
      for (let p = 36; p <= 84; p++) opts.push(p);
      return (
        <label className="ctl color-row">
          <span>{c.label}{reset}</span>
          <select value={v as number} onChange={(e) => set(c.key, Number(e.target.value))} style={{ width: 110 }}>
            {opts.map((p) => <option key={p} value={p}>{noteName(p)}</option>)}
          </select>
        </label>
      );
    }
    case 'select':
      if (c.key === 'palette') {
        return (
          <div className="palettes">
            {PALETTES.map((p) => (
              <button key={p.id} type="button" className={'pal' + (look.palette === p.id ? ' on' : '')} onClick={() => set('palette', p.id)}>
                <span className="strip" style={{ background: swatch(look, p.id) }} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        );
      }
      return (
        <label className="ctl">
          <span>{c.label}</span>
          <select value={String(v)} onChange={(e) => set(c.key, e.target.value)}>{c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </label>
      );
  }
}

export default function LookControls({ layer, look, base, set }: { layer: LayerId; look: Look; base: Look; set: (k: keyof Look, v: unknown) => void }) {
  return (
    <>
      {LOOK_SCHEMA[layer].map((sec) => (
        <div key={sec.title} className="ctl-section">
          <span className="section-label">{sec.title}</span>
          {sec.controls.map((c, i) => <Row key={c.key + i} c={c} look={look} base={base} set={set} />)}
        </div>
      ))}
    </>
  );
}
