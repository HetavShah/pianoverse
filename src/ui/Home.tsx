import { useEffect, useState } from 'react';
import PickButton from './PickButton';
import type { PickKind } from './media';
import { ago, aspectLabel, deleteFromStore, fmtDur, listProjects, ProjectMeta } from './projectStore';

export default function Home(props: {
  onNew: () => void;
  onOpen: (id: string) => void;
  onPick: (k: PickKind) => void;
  onFiles: (f: FileList | null) => void;
  refreshKey: number;
}) {
  const [items, setItems] = useState<ProjectMeta[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => { listProjects().then(setItems).catch(() => setItems([])); }, [props.refreshKey]);

  return (
    <div className="home">
      <nav className="home-nav" aria-label="Sections">
        <button type="button" className="nav-item on">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
          Projects
        </button>
        <button type="button" className="nav-item" disabled title="Arrives with style presets (Milestone 4)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><circle cx="8.5" cy="10" r="1.2" /><circle cx="12" cy="7.5" r="1.2" /><circle cx="15.5" cy="10" r="1.2" /></svg>
          Presets <span className="soon-tag">soon</span>
        </button>
        <button type="button" className="nav-item" disabled title="Arrives with export (Milestone 5)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
          Exports <span className="soon-tag">soon</span>
        </button>
        <div className="tip">Tip: drop a video and its MIDI file anywhere on this window to start a project.</div>
      </nav>

      <main className="home-main">
        <div className="title-row">
          <div>
            <h1>Projects</h1>
            <p className="sub">Turn a performance video into a visualizer in five steps.</p>
          </div>
          <div className="row-actions">
            <PickButton what="project" className="btn" onPick={props.onPick} onFiles={props.onFiles}>Open project file…</PickButton>
            <button type="button" className="btn primary big" onClick={props.onNew}><span aria-hidden="true">＋</span> New project</button>
          </div>
        </div>

        <span className="section-label">Recent</span>
        <div className="project-grid">
          {items?.map((m) => (
            <div key={m.id} className="project-card">
              <button type="button" className="thumb" onClick={() => props.onOpen(m.id)} style={{ aspectRatio: `${m.width} / ${m.height}` }}>
                {m.thumb ? <img src={m.thumb} alt="" /> : <span className="ph" />}
              </button>
              <div className="meta">
                <button type="button" className="name" onClick={() => props.onOpen(m.id)}>{m.name}</button>
                <small className="mono">{fmtDur(m.duration)} · {aspectLabel(m.width, m.height)} · edited {ago(m.updated)}</small>
              </div>
              {confirm === m.id ? (
                <div className="confirm">
                  <span>Remove from Pianoverse? Your video file stays.</span>
                  <button type="button" className="btn small" onClick={() => setConfirm(null)}>Keep</button>
                  <button type="button" className="btn small danger" onClick={async () => { await deleteFromStore(m.id); setConfirm(null); setItems((xs) => xs?.filter((x) => x.id !== m.id) ?? null); }}>Remove</button>
                </div>
              ) : (
                <button type="button" className="x corner" onClick={() => setConfirm(m.id)} aria-label={`Remove ${m.name}`} title="Remove project">×</button>
              )}
            </div>
          ))}
          <button type="button" className="project-card new" onClick={props.onNew}>
            <span className="plus">＋</span>
            <span>New project</span>
          </button>
        </div>
        {items && items.length === 0 && <p className="help">Your projects appear here and are saved automatically as you work.</p>}
      </main>
    </div>
  );
}
