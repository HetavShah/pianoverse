// The bar across the top: Pianoverse (back to Projects), the project's name, the steps, undo and redo, the save
// state and the settings menu.
import { useState } from 'react';
import type { CalibratedProject } from '../../engine/calibration';
import { UpdatePill, updateStatusText, useUpdater } from '../../updater';
import { inTauri } from '../services/media';
import Icon from '../components/icons';
import { FLOW_STEPS, STEPS, Step } from './workspace';

const Tick = () => <svg className="tick" width="11" height="11" viewBox="0 0 12 12" aria-label="done"><path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;

export default function TopBar(props: {
  inProject: boolean;
  project: CalibratedProject | null;
  step: Step;
  /** a video is open and readable: the later steps can be visited */
  ready: boolean;
  goStep: (s: Step) => void;
  goHome: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  saveText: string;
  gpuName: string;
  gpuError: string | null;
  onShortcuts: () => void;
  onSaveFile: () => void;
}) {
  const { inProject, project, step, ready } = props;
  const [menu, setMenu] = useState(false);
  const updater = useUpdater();
  // the first steps are done in order; the rest are rooms visited in any order
  const done = (s: Step) =>
    s === 'import' || s === 'video' ? ready : s === 'audio' ? !!project?.notes.length : s === 'calibrate' ? !!project?.progress?.calibrated : s === 'camera' ? !!project?.cameraTrack : false;

  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={props.goHome} title="Projects">Pianoverse</button>
      {inProject && <span className="project-name" title={project?.name}>{project?.name ?? 'New project'}</span>}
      {inProject && (
        <nav className="stepper" aria-label="Steps">
          <span className="trail">
            {STEPS.slice(0, FLOW_STEPS).map((s, i) => (
              <button key={s.id} type="button" className={'step-btn' + (step === s.id ? ' on' : '') + (done(s.id) ? ' done' : '')} disabled={s.id !== 'import' && !ready}
                onClick={() => props.goStep(s.id)} aria-current={step === s.id ? 'step' : undefined}>
                <Icon name={s.id} size={15} />{s.label}{done(s.id) && step !== s.id && <Tick />}
              </button>
            ))}
          </span>
          <span className="rooms">
            {STEPS.slice(FLOW_STEPS).map((s) => (
              <button key={s.id} type="button" className={'step-btn room' + (step === s.id ? ' on' : '')} disabled={!ready}
                onClick={() => props.goStep(s.id)} aria-current={step === s.id ? 'page' : undefined}><Icon name={s.id} size={15} />{s.label}</button>
            ))}
          </span>
        </nav>
      )}
      <div className="top-right">
        <UpdatePill phase={updater.phase} />
        {inProject && project && (
          <div className="undo-redo">
            <button type="button" className="btn icon ghost" onClick={props.undo} disabled={!props.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
            </button>
            <button type="button" className="btn icon ghost" onClick={props.redo} disabled={!props.canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
            </button>
          </div>
        )}
        {inProject ? <span className="saved dim">{props.saveText}</span> : <span className="gpu">{props.gpuError ? 'WebGPU unavailable' : props.gpuName}</span>}
        <div className="menu-wrap">
          <button type="button" className="btn icon" onClick={() => setMenu(!menu)} aria-label="Settings" title="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <div className="menu-head"><b>Pianoverse {updater.version && `v${updater.version}`}</b><small>{updateStatusText(updater.phase) || (inTauri() ? '' : 'Browser preview')}</small></div>
              {inTauri() && <button type="button" onClick={() => updater.check()}><Icon name="update" />Check for updates</button>}
              <button type="button" onClick={() => { setMenu(false); props.onShortcuts(); }}><Icon name="shortcuts" />Keyboard shortcuts <kbd>?</kbd></button>
              {project && <button type="button" onClick={() => { setMenu(false); props.onSaveFile(); }}><Icon name="save" />Save project file…</button>}
              <div className="menu-foot dim">{props.gpuError ? `Graphics: ${props.gpuError}` : `Graphics: ${props.gpuName || '…'}`}</div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
