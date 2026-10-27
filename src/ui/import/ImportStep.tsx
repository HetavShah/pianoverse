// Import step: the performance video and the project's basics (name, camera setup, keyboard).
import { useEffect, useState } from 'react';
import { noteName, PRESETS } from '../../engine/calibration';
import PickButton from '../components/PickButton';
import { makeThumb, fmtDur } from '../services/projectStore';
import type { WS } from '../app/workspace';
import Icon from '../components/icons';

export default function ImportStep({ ws }: { ws: WS }) {
  const { project, video, videoIssue } = ws;
  const [thumb, setThumb] = useState<string | undefined>();
  const v = ws.videoEl.current;
  useEffect(() => {
    if (!v || videoIssue) { setThumb(undefined); return; }
    const grab = () => setThumb(makeThumb(v, 160));
    if (v.readyState >= 2) grab();
    v.addEventListener('loadeddata', grab);
    return () => v.removeEventListener('loadeddata', grab);
  }, [v, video?.url, videoIssue]);
  const kb = project?.keyboard;
  const preset = kb && PRESETS.find((p) => p.keys === kb.keys && p.lowestNote === kb.lowestNote);
  const ready = !!project && !!video && !videoIssue;

  return (
    <div className="page">
      <div className="page-main">
        <h1>Import your performance</h1>
        <p className="sub">Add the video of your performance. Its MIDI file and the sound come next, on Audio.</p>

        {video ? (
          <div className={'file-card' + (videoIssue ? ' warn' : '')}>
            <div className="thumb">{thumb ? <img src={thumb} alt="" /> : (
              <span className="ph"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="13" height="14" /><path d="M16 10l5-3v10l-5-3" /></svg></span>
            )}</div>
            <div className="info">
              <span className="kind">Video</span>
              <b>{video.name}</b>
              {project && !videoIssue && (
                <small>{project.video.width}×{project.video.height}{project.video.codec ? ` · ${project.video.codec}` : ''} · {fmtDur(ws.duration || project.video.duration || 0)}</small>
              )}
              {videoIssue?.kind === 'unsupported' && <small className="warn-text">Recorded in a format the player can't read (phones usually use HEVC). Convert it once to edit.</small>}
              {videoIssue?.kind === 'missing' && <small className="warn-text">This project's video isn't where it was. Choose it again.</small>}
              {videoIssue?.kind === 'error' && <small className="bad">{videoIssue.message.split('\n')[0]}</small>}
              {videoIssue?.kind === 'converting' && (
                <div className="track-run">
                  <div className="bar"><div style={{ width: `${videoIssue.progress && videoIssue.progress.total ? Math.min(100, (videoIssue.progress.done / videoIssue.progress.total) * 100) : 0}%` }} /></div>
                  <small>{!videoIssue.progress ? 'Starting…' : videoIssue.progress.phase === 'download'
                    ? `${videoIssue.progress.detail} · ${(videoIssue.progress.done / 1048576).toFixed(0)} of ${(videoIssue.progress.total / 1048576).toFixed(0)} MB`
                    : `${videoIssue.progress.detail} · ${videoIssue.progress.total ? Math.round((videoIssue.progress.done / videoIssue.progress.total) * 100) : 0}%`}</small>
                </div>
              )}
            </div>
            <div className="actions">
              {(videoIssue?.kind === 'unsupported' || videoIssue?.kind === 'error') && video.path && (
                <button type="button" className="btn primary small" onClick={ws.convert}><Icon name="convert" />Convert video</button>
              )}
              {videoIssue?.kind === 'missing'
                ? <PickButton what="video" className="btn primary small" onPick={ws.pick} onFiles={ws.onFiles}>Choose the video again</PickButton>
                : <PickButton what="video" className="btn small" onPick={ws.pick} onFiles={ws.onFiles}><Icon name="replace" />Replace</PickButton>}
            </div>
          </div>
        ) : (
          <div className="file-card empty">
            <div className="icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2" /><path d="M16 10l5-3v10l-5-3" /></svg>
            </div>
            <div className="info">
              <span className="kind">Video</span>
              <b>Choose the performance video</b>
              <small>mp4, mov or webm · or drop it anywhere on this window (with its MIDI file too, if you have one)</small>
            </div>
            <div className="actions"><PickButton what="video" className="btn primary small" onPick={ws.pick} onFiles={ws.onFiles}><Icon name="folder" />Choose video</PickButton></div>
          </div>
        )}

      </div>

      <aside className="page-side">
        <h2>Project</h2>
        {project ? (
          <>
            <label className="side-field">
              <span>Name</span>
              <input type="text" value={project.name} onChange={(e) => ws.setProject({ ...project, name: e.target.value })} />
            </label>
            <div className="side-field">
              <span>Camera setup</span>
              <div className="choice-cards">
                {([['angled', 'Angled side', 'Keys in perspective'], ['topdown', 'Top-down', 'Keys straight across']] as const).map(([id, t, d]) => (
                  <button key={id} type="button" className={'choice' + ((project.camera ?? 'angled') === id ? ' on' : '')} onClick={() => ws.setProject({ ...project, camera: id })}>
                    <span className="radio" /><b>{t}</b><small>{d}</small>
                  </button>
                ))}
              </div>
            </div>
            <label className="side-field">
              <span>Keyboard</span>
              <select value={preset ? `${preset.keys}:${preset.lowestNote}` : ''} onChange={(e) => { const [k, l] = e.target.value.split(':').map(Number); ws.calib.setPreset(k, l); }}>
                {!preset && kb && <option value="">{kb.keys} keys from {noteName(kb.lowestNote)}</option>}
                {PRESETS.map((p) => <option key={p.keys} value={`${p.keys}:${p.lowestNote}`}>{p.label}</option>)}
              </select>
            </label>
          </>
        ) : (
          <p className="help">Choose a video to start. The project is saved automatically as you go.</p>
        )}
      </aside>

      <footer className="page-foot">
        <button type="button" className="btn" onClick={ws.goHome}>{project ? 'Back to projects' : 'Cancel'}</button>
        <button type="button" className="btn primary" disabled={!ready} onClick={() => ws.goStep('video')}>Continue to video <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h9M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg></button>
      </footer>
    </div>
  );
}
