// Bottom of the layer list: which preset the look is based on, and saving your own.
import { useState } from 'react';
import { applyPreset, Preset, presetLookFrom } from '../engine/look';
import { deletePreset, savePreset, setDefaultPreset } from './presetStore';
import type { WS } from './workspace';

export default function PresetBar({ ws, preset, modified }: { ws: WS; preset: Preset; modified: boolean }) {
  const project = ws.project!;
  const [naming, setNaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isDefault = ws.defaultPresetId === preset.id;

  const choose = (id: string) => {
    const p = ws.presets.find((x) => x.id === id);
    if (p) ws.setProject({ ...project, look: applyPreset(project.look, p), presetId: p.id });
  };
  const saveNew = async () => {
    if (naming === null) return;
    setBusy(true);
    try {
      const p = await savePreset(naming, presetLookFrom(project.look));
      await ws.refreshPresets();
      ws.setProject({ ...project, presetId: p.id });
      setNaming(null);
    } finally { setBusy(false); }
  };
  const update = async () => {
    setBusy(true);
    try { await savePreset(preset.name, presetLookFrom(project.look), preset.id); await ws.refreshPresets(); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await deletePreset(preset.id);
      await ws.refreshPresets();
      ws.setProject({ ...project, presetId: 'interstellar-teal' });
    } finally { setBusy(false); }
  };

  return (
    <div className="preset-bar">
      <span className="section-label">Preset</span>
      <select value={preset.id} onChange={(e) => choose(e.target.value)} aria-label="Preset">
        {ws.presets.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === ws.defaultPresetId ? ' (default)' : ''}</option>)}
      </select>
      {modified && <small className="mod">Changed from “{preset.name}”</small>}
      {naming === null ? (
        <div className="preset-actions">
          <button type="button" className="btn small" onClick={() => setNaming(modified ? `${preset.name} 2` : 'My look')}>Save as new preset</button>
          {modified && !preset.builtIn && <button type="button" className="btn small" disabled={busy} onClick={update}>Update “{preset.name}”</button>}
          {!isDefault && <button type="button" className="link inline small-text" onClick={async () => { await setDefaultPreset(preset.id); await ws.refreshPresets(); }}>Use for new projects</button>}
          {!preset.builtIn && <button type="button" className="link inline small-text danger-text" disabled={busy} onClick={remove}>Delete preset</button>}
        </div>
      ) : (
        <form className="preset-actions" onSubmit={(e) => { e.preventDefault(); saveNew(); }}>
          <input type="text" autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} aria-label="Preset name" />
          <div className="row">
            <button type="button" className="btn small ghost" onClick={() => setNaming(null)}>Cancel</button>
            <button type="submit" className="btn small primary" disabled={busy || !naming.trim()}>Save</button>
          </div>
        </form>
      )}
    </div>
  );
}
