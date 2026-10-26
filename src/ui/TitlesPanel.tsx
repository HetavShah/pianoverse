// Opening title and end card for this project, and the brand kit they use (saved for every project).
import { useRef } from 'react';
import Dial from './Dial';
import { cardTimes, resolveTitles, Titles, TITLE_STYLES } from '../engine/titles';
import { toastError } from './toast';
import type { WS } from './workspace';

/** a picked logo, shrunk to at most 512 px and kept as a PNG data URL */
async function logoFrom(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('That file is not an image Pianoverse can read.')); img.src = url; });
    const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

export default function TitlesPanel({ ws }: { ws: WS }) {
  const project = ws.project!;
  const T = resolveTitles(project.titles);
  const brand = ws.brand;
  const logoInput = useRef<HTMLInputElement>(null);
  const set = (patch: { intro?: Partial<Titles['intro']>; outro?: Partial<Titles['outro']> }, merge = false) =>
    ws.setProject({ ...project, titles: { intro: { ...T.intro, ...patch.intro }, outro: { ...T.outro, ...patch.outro } } }, merge ? { merge: true } : undefined);
  const dur = ws.duration || project.video.frames / (project.video.fps || 30);
  const times = cardTimes({ intro: { ...T.intro, on: true }, outro: { ...T.outro, on: true } }, [0, dur]);
  const secs = (v: number) => `${v.toFixed(1)} s`;

  return (
    <div className="titles-panel">
      <div className="ctl-section">
        <label className="toggle-row compact"><span className="section-label">Opening title</span>
          <input type="checkbox" checked={T.intro.on} onChange={(e) => { set({ intro: { on: e.target.checked } }); if (e.target.checked) ws.seek(0.8); }} aria-label="Opening title on" /></label>
        {T.intro.on && (
          <>
            <label className="ctl"><span className="ctl-head">Title</span>
              <input type="text" value={T.intro.title} placeholder={project.name} onChange={(e) => set({ intro: { title: e.target.value } }, true)} /></label>
            <label className="ctl"><span className="ctl-head">Under the title</span>
              <input type="text" value={T.intro.subtitle} placeholder="Composer or film, e.g. Hans Zimmer" onChange={(e) => set({ intro: { subtitle: e.target.value } }, true)} /></label>
            <label className="toggle-row compact"><span>Show “Played by {brand.name.trim() || 'your name'}”</span>
              <input type="checkbox" checked={T.intro.credit} onChange={(e) => set({ intro: { credit: e.target.checked } })} /></label>
            <div className="ctl"><div className="ctl-head"><span>Length</span><span className="val">{secs(T.intro.dur)}</span></div>
              <Dial value={T.intro.dur} min={2} max={8} step={0.5} label="Opening title length" fmt={secs} base={4.5} onChange={(v) => set({ intro: { dur: v } }, true)} /></div>
            <button type="button" className="link inline small-text" onClick={() => ws.seek(Math.min(1.6, (times.intro?.[1] ?? 2) / 2))}>Show it on the preview</button>
          </>
        )}
      </div>

      <div className="ctl-section">
        <label className="toggle-row compact"><span className="section-label">End card</span>
          <input type="checkbox" checked={T.outro.on} onChange={(e) => { set({ outro: { on: e.target.checked } }); if (e.target.checked && times.outro) ws.seek(times.outro[0] + 2.4); }} aria-label="End card on" /></label>
        {T.outro.on && (
          <>
            <label className="ctl"><span className="ctl-head">Line</span>
              <input type="text" value={T.outro.line} placeholder="Thanks for listening" onChange={(e) => set({ outro: { line: e.target.value } }, true)} /></label>
            <label className="toggle-row compact"><span>Show your logo{!brand.logo && <small>Add one under Your brand</small>}</span>
              <input type="checkbox" checked={T.outro.logo} disabled={!brand.logo} onChange={(e) => set({ outro: { logo: e.target.checked } })} /></label>
            <div className="ctl"><div className="ctl-head"><span>Length</span><span className="val">{secs(T.outro.dur)}</span></div>
              <Dial value={T.outro.dur} min={3} max={10} step={0.5} label="End card length" fmt={secs} base={5} onChange={(v) => set({ outro: { dur: v } }, true)} /></div>
            <button type="button" className="link inline small-text" onClick={() => times.outro && ws.seek(times.outro[0] + 2.4)}>Show it on the preview</button>
          </>
        )}
      </div>

      <div className="ctl-section">
        <span className="section-label">Your brand</span>
        <p className="help">Saved once, used on every project’s cards.</p>
        <label className="ctl"><span className="ctl-head">Name</span>
          <input type="text" value={brand.name} placeholder="Your name" onChange={(e) => ws.setBrand({ ...brand, name: e.target.value })} /></label>
        <label className="ctl"><span className="ctl-head">Handle</span>
          <input type="text" value={brand.handle} placeholder="@yourchannel" onChange={(e) => ws.setBrand({ ...brand, handle: e.target.value })} /></label>
        <label className="ctl"><span className="ctl-head">Where to find you</span>
          <input type="text" value={brand.links} placeholder="YouTube · Instagram" onChange={(e) => ws.setBrand({ ...brand, links: e.target.value })} /></label>
        <div className="ctl"><span className="ctl-head">Type</span>
          <div className="seg">{TITLE_STYLES.map((s) => <button key={s.id} type="button" className={brand.style === s.id ? 'on' : ''} onClick={() => ws.setBrand({ ...brand, style: s.id })}>{s.label}</button>)}</div></div>
        <label className="ctl color-row"><span>Accent</span>
          <span className="color-pick"><input type="color" value={brand.accent} onChange={(e) => ws.setBrand({ ...brand, accent: e.target.value })} /><span className="mono">{brand.accent.toUpperCase()}</span></span></label>
        <div className="ctl color-row"><span>Logo</span>
          <span className="logo-pick">
            {brand.logo && <img src={brand.logo} alt="Your logo" />}
            <button type="button" className="btn small" onClick={() => logoInput.current?.click()}>{brand.logo ? 'Replace' : 'Add image'}</button>
            {brand.logo && <button type="button" className="link inline small-text" onClick={() => ws.setBrand({ ...brand, logo: '' })}>Remove</button>}
          </span>
          <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden
            onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { ws.setBrand({ ...brand, logo: await logoFrom(f) }); } catch (err) { toastError(err); } }} />
        </div>
      </div>
    </div>
  );
}
