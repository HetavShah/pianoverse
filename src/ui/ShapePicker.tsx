// Shapes for shape particles: the built-in drawings, the user's own SVGs, and an Upload button.
import { useEffect, useState } from 'react';
import { deleteTexture, importShape, isSvg, UserTexture, userTextureFiles, useUserTextures } from './textureStore';

export const BUILT_IN_SHAPES = [
  { id: 'heart', label: 'Heart' },
  { id: 'star', label: 'Star' },
  { id: 'note', label: 'Music note' },
];

function SvgThumb({ t }: { t: UserTexture }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let u = '';
    userTextureFiles(t.id).then((m) => { if (m?.color) { u = URL.createObjectURL(m.color); setUrl(u); } }).catch(() => {});
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [t]);
  return url ? <img src={url} alt="" className="shape-img" /> : <span className="tex-blank" />;
}

export default function ShapePicker({ value, onPick }: { value: string; onPick: (key: string) => void }) {
  const mine = useUserTextures().filter(isSvg);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const base = import.meta.env.BASE_URL ?? '/';
  const upload = async () => {
    setErr(''); setBusy(true);
    try { const t = await importShape(); if (t) onPick('user:' + t.id); }
    catch (e) { setErr(String((e as Error)?.message ?? e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="ctl">
      <div className="tex-grid">
        {BUILT_IN_SHAPES.map((s) => (
          <button key={s.id} type="button" className={'tex' + (value === s.id ? ' on' : '')} onClick={() => onPick(s.id)}>
            <img src={`${base}shapes/${s.id}.svg`} alt="" className="shape-img" /><span>{s.label}</span>
          </button>
        ))}
        {mine.map((t) => (
          <div key={t.id} className={'tex mine' + (value === 'user:' + t.id ? ' on' : '')} title={t.name}>
            <button type="button" className="tex-pick" onClick={() => onPick('user:' + t.id)}><SvgThumb t={t} /><span>{t.name}</span></button>
            <button type="button" className="tex-del" aria-label={`Remove ${t.name}`} title="Remove from your shapes"
              onClick={async () => { if (value === 'user:' + t.id) onPick('heart'); await deleteTexture(t.id); }}>×</button>
          </div>
        ))}
        <button type="button" className="tex add" onClick={upload} disabled={busy} title="Use your own SVG drawing. Simple line art works best: the sparks trace its outlines.">
          <span className="plus">+</span><span>{busy ? 'Adding…' : 'Upload SVG'}</span>
        </button>
      </div>
      {err && <small className="danger-text">{err}</small>}
    </div>
  );
}
