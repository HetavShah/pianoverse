import { useEffect, useState } from 'react';
import Icon from '../components/icons';
import PickButton from '../components/PickButton';
import HomeBackdrop from './HomeBackdrop';
import type { PickKind } from '../services/media';
import { ago, aspectLabel, deleteFromStore, fmtDur, listProjects, ProjectMeta } from '../services/projectStore';

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
      <main className="home-main">
        <section className="home-hero">
        <HomeBackdrop />
        <div className="title-row">
          <div>
            <h1>Projects</h1>
            <p className="sub">Your piano video and its MIDI in, a falling-notes video out. Projects save as you work.</p>
          </div>
          <div className="row-actions">
            <PickButton what="project" className="btn ghost" onPick={props.onPick} onFiles={props.onFiles}><Icon name="openFile" />Open project file…</PickButton>
            <button type="button" className="btn primary big" onClick={props.onNew}><Icon name="newProject" size={18} />New project</button>
          </div>
        </div>
        </section>

        <div className="shelf-head">
          <span className="section-label">Recent</span>
          {items && items.length > 0 && <span className="count">{items.length} {items.length === 1 ? 'take' : 'takes'}</span>}
        </div>
        <div className="project-grid">
          {items?.map((m) => (
            <div key={m.id} className="project-card">
              <button type="button" className="thumb" onClick={() => props.onOpen(m.id)} style={{ aspectRatio: `${m.width} / ${m.height}` }} aria-label={`Open ${m.name}`}>
                {m.thumb ? <img src={m.thumb} alt="" /> : <span className="ph"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="5" width="13" height="14" /><path d="M16 10l5-3v10l-5-3" /></svg></span>}
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
                <button type="button" className="x corner" onClick={() => setConfirm(m.id)} aria-label={`Remove ${m.name}`} title="Remove project">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {items && items.length === 0 && <p className="help">Start with New project, or drop a video and its MIDI file anywhere on this window.</p>}
        {items && items.length > 0 && <p className="help tip">Drop a video and its MIDI file anywhere on this window to start a project.</p>}
      </main>
    </div>
  );
}
