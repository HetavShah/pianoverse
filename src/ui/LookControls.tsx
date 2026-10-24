// Controls for one layer of the look, generated from LOOK_SCHEMA.
import { noteName } from '../engine/calibration';
import { useEffect, useRef, useState } from 'react';
import { COLOR_BY, Control, GRADIENTS, hexToHsv, hsvToHex, LayerId, Look, LOOK_SCHEMA, NOTE_STYLE_CARDS, NOTE_TEXTURES, noteColor, PaletteId, toHex } from '../engine/look';
import { deleteTexture, importTexture, textureThumb, UserTexture, useUserTextures } from './textureStore';

type Set = (k: keyof Look, v: unknown) => void;
type Patch = (p: Partial<Look>) => void;

const swatch = (look: Look, id: PaletteId) => {
  const l: Look = { ...look, palette: id, colorBy: 'pitch' };
  const stops = [40, 46, 52, 58, 63, 69, 74, 80, 86].map((p) => toHex(noteColor(l, p)));
  return `linear-gradient(90deg, ${stops.join(', ')})`;
};

function UserThumb({ t }: { t: UserTexture }) {
  const [url, setUrl] = useState('');
  useEffect(() => { textureThumb(t).then(setUrl).catch(() => {}); }, [t]);
  return url ? <img src={url} alt="" /> : <span className="tex-blank" />;
}

/** Glass first, then the built-in textures, the user's own, and an Upload button */
function TexturePicker({ look, patch }: { look: Look; patch: Patch }) {
  const mine = useUserTextures();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const base = import.meta.env.BASE_URL ?? '/';
  const current = look.texOn ? look.noteTexture : 'none';
  const pick = (id: string) => patch(id === 'none' ? { texOn: false } : { noteTexture: id, texOn: true });
  const upload = async () => {
    setErr(''); setBusy(true);
    try {
      const t = await importTexture();
      if (t) pick('user:' + t.id);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally { setBusy(false); }
  };
  return (
    <div className="ctl">
      <div className="tex-grid">
        <button type="button" className={'tex' + (current === 'none' ? ' on' : '')} onClick={() => pick('none')} title="Plain notes, no texture">
          <span className="tex-blank none">—</span><span>None</span>
        </button>
        {NOTE_TEXTURES.map((t) => (
          <button key={t.id} type="button" className={'tex' + (current === t.id ? ' on' : '')} onClick={() => pick(t.id)} title={t.credit}>
            <img src={`${base}textures/${t.id}/thumb.jpg`} alt="" /><span>{t.label}</span>
          </button>
        ))}
        {mine.map((t) => (
          <div key={t.id} className={'tex mine' + (current === 'user:' + t.id ? ' on' : '')} title={t.name + (t.files.normal ? ' · with normal map' : '')}>
            <button type="button" className="tex-pick" onClick={() => pick('user:' + t.id)}><UserThumb t={t} /><span>{t.name}</span></button>
            <button type="button" className="tex-del" aria-label={`Remove ${t.name}`} title="Remove from your textures"
              onClick={async () => { if (current === 'user:' + t.id) pick(NOTE_TEXTURES[0].id); await deleteTexture(t.id); }}>×</button>
          </div>
        ))}
        <button type="button" className="tex add" onClick={upload} disabled={busy} title="Use your own image. Picking a *_Color file from ambientCG or Poly Haven also brings in its normal and roughness maps.">
          <span className="plus">+</span><span>{busy ? 'Adding…' : 'Upload'}</span>
        </button>
      </div>
      {err && <small className="danger-text">{err}</small>}
    </div>
  );
}

/** a colour wheel: hue round the edge, strength towards the edge; brightness beside it */
function ColorWheel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [h, s, v] = hexToHsv(value);
  const ref = useRef<HTMLDivElement>(null);
  const pickAt = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const rad = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    const hue = ((Math.atan2(dx, -dy) / (2 * Math.PI)) % 1 + 1) % 1; // 0 at the top, clockwise
    onChange(hsvToHex(hue, rad, Math.max(v, 0.15)));
  };
  const ang = h * 2 * Math.PI;
  return (
    <div className="wheel-wrap">
      <div ref={ref} className="wheel" role="slider" aria-label="Colour wheel" aria-valuenow={Math.round(h * 360)}
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); pickAt(e); }}
        onPointerMove={(e) => { if (e.buttons) pickAt(e); }}>
        <div className="wheel-shade" style={{ opacity: 1 - v }} />
        <span className="wheel-dot" style={{ left: `${50 + 50 * s * Math.sin(ang)}%`, top: `${50 - 50 * s * Math.cos(ang)}%`, background: value }} />
      </div>
      <div className="wheel-side">
        <div className="wheel-hex"><span className="wheel-chip" style={{ background: value }} /><span className="mono">{value.toUpperCase()}</span></div>
        <span className="wheel-lab">Brightness</span>
        <input type="range" min={0.15} max={1} step={0.01} value={v} aria-label="Brightness" className="tint-track"
          style={{ background: `linear-gradient(90deg, #000, ${hsvToHex(h, s, 1)})` }}
          onChange={(e) => onChange(hsvToHex(h, s, Number(e.target.value)))} />
        <label className="wheel-exact"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} /> Exact colour</label>
      </div>
    </div>
  );
}

function Row({ c, look, base, set, patch }: { c: Control; look: Look; base: Look; set: Set; patch: Patch }) {
  const v = look[c.key];
  const changed = v !== base[c.key];
  const reset = changed ? (
    <button type="button" className="reset" onClick={() => set(c.key, base[c.key])} title="Back to the preset's value" aria-label={`Reset ${c.label}`}>↺</button>
  ) : null;
  switch (c.kind) {
    case 'slider': {
      const n = v as number;
      return (
        <div className="ctl" title={c.hint}>
          <div className="ctl-head"><span>{c.label}</span>{reset}<span className="mono val">{c.fmt ? c.fmt(n) : n}</span></div>
          <input type="range" min={c.min} max={c.max} step={c.step} value={n} className={c.hue ? 'hue-track' : undefined}
            onChange={(e) => set(c.key, Number(e.target.value))} onDoubleClick={() => set(c.key, base[c.key])} aria-label={c.label} />
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
    case 'wheel':
      return (
        <div className="ctl">
          <div className="ctl-head"><span>{c.label}</span>{reset}</div>
          <ColorWheel value={v as string} onChange={(x) => set(c.key, x)} />
        </div>
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
    case 'colorBy':
      return (
        <div className="by-grid">
          {COLOR_BY.map((o) => (
            <button key={o.id} type="button" className={'by' + (look.colorBy === o.id ? ' on' : '')} onClick={() => set('colorBy', o.id)} title={o.hint}>{o.label}</button>
          ))}
        </div>
      );
    case 'texture':
      return <TexturePicker look={look} patch={patch} />;
    case 'noteStyle': {
      const base = import.meta.env.BASE_URL ?? '/';
      const cur = NOTE_STYLE_CARDS.find((c) => Object.entries(c.set).every(([k, val]) => look[k as keyof Look] === val))?.id;
      return (
        <div className="tex-grid">
          {NOTE_STYLE_CARDS.map((c) => (
            <button key={c.id} type="button" className={'tex' + (cur === c.id ? ' on' : '')} onClick={() => patch(c.set)}>
              <img src={`${base}notestyles/${c.id}.jpg`} alt="" /><span>{c.label}</span>
            </button>
          ))}
        </div>
      );
    }
    case 'select':
      if (c.segmented) {
        return (
          <div className="ctl">
            <div className="ctl-head"><span>{c.label}</span>{reset}</div>
            <div className="seg full">
              {c.options.map((o) => <button key={o.value} type="button" className={String(v) === o.value ? 'on' : ''} onClick={() => set(c.key, o.value)}>{o.label}</button>)}
            </div>
          </div>
        );
      }
      if (c.key === 'palette') {
        return (
          <div className="palettes grid2">
            {GRADIENTS.map((p) => (
              <button key={p.id} type="button" className={'pal' + (look.palette === p.id ? ' on' : '')} onClick={() => set('palette', p.id)} title={p.label}>
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
          <select value={String(v)} onChange={(e) => set(c.key, typeof v === 'number' ? Number(e.target.value) : e.target.value)}>{c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </label>
      );
  }
}

const visible = (c: Control, look: Look) => !('when' in c && c.when && !c.when(look));

export default function LookControls({ layer, look, base, set, patch }: { layer: LayerId; look: Look; base: Look; set: Set; patch: Patch }) {
  const [more, setMore] = useState(false);
  const all = LOOK_SCHEMA[layer];
  const section = (sec: (typeof all)[number]) => {
    const rows = sec.controls.filter((c) => visible(c, look));
    if (!rows.length) return null;
    return (
      <div key={sec.title} className="ctl-section">
        <span className="section-label">{sec.title}</span>
        {rows.map((c, i) => <Row key={c.key + c.kind + i} c={c} look={look} base={base} set={set} patch={patch} />)}
      </div>
    );
  };
  const extra = all.filter((sec) => sec.more);
  const extraChanged = extra.some((sec) => sec.controls.some((c) => look[c.key] !== base[c.key]));
  return (
    <>
      {all.filter((sec) => !sec.more).map(section)}
      {extra.length > 0 && (
        <button type="button" className="more-toggle" onClick={() => setMore(!more)} aria-expanded={more}>
          <span>{more ? 'Fewer settings' : 'More settings'}{extraChanged && !more ? ' · changed' : ''}</span>
          <span className="chev">{more ? '▴' : '▾'}</span>
        </button>
      )}
      {more && extra.map(section)}
    </>
  );
}
