// Under the style controls: which look this is based on, and saving your own.
import { useState } from 'react';
import { Preset, presetLookFrom } from '../../engine/look';
import { deletePreset, savePreset, setDefaultPreset } from '../services/presetStore';
import type { WS } from '../app/workspace';

export default function PresetBar({ ws, preset, modified, onOpenLooks }: { ws: WS; preset: Preset; modified: boolean; onOpenLooks?: () => void }) {
  const project = ws.project!;
  const [naming, setNaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isDefault = ws.defaultPresetId === preset.id;

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
      <span className="section-label">Look</span>
      {onOpenLooks
        ? <button type="button" className="look-open" onClick={onOpenLooks} title="See every look (press 0)"><span>{preset.name}{preset.id === ws.defaultPresetId ? ' (default)' : ''}</span><span aria-hidden="true">→</span></button>
        : <span className="look-name">{preset.name}{preset.id === ws.defaultPresetId ? ' (default)' : ''}</span>}
      {modified && <small className="mod">Changed from “{preset.name}”</small>}
      {naming === null ? (
        <div className="preset-actions">
          <button type="button" className="btn small" onClick={() => setNaming(modified ? `${preset.name} 2` : 'My look')}>Save as a new look</button>
          {modified && !preset.builtIn && <button type="button" className="btn small" disabled={busy} onClick={update}>Update “{preset.name}”</button>}
          {!isDefault && <button type="button" className="link inline small-text" onClick={async () => { await setDefaultPreset(preset.id); await ws.refreshPresets(); }}>Use for new projects</button>}
          {!preset.builtIn && <button type="button" className="link inline small-text danger-text" disabled={busy} onClick={remove}>Delete this look</button>}
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
