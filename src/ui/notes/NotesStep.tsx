// Audio → Notes and sync: where the notes come from (the MIDI file, or detected from the audio) and lining them up
// with the video's sound.
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { noteName } from '../../engine/calibration';
import { outOfRange, pitchRange } from '../../engine/notes';
import { useClickTrack } from './clicks';
import PickButton from '../components/PickButton';
import Dial from '../components/Dial';
import { sourceOf } from './useNotes';
import type { NoteFinderId as NoteFinder } from '../../engine/ml/noteFinder';
import WaveSync, { attackTimes, matchScore } from './WaveSync';
import Icon from '../components/icons';
import { trimRange } from '../../engine/project';
import MiniTransport from '../components/MiniTransport';
import type { WS } from '../app/workspace';
import ValueEdit from '../components/ValueEdit';

const fmtOffset = (o: number) => (Math.abs(o) < 1 ? `${o >= 0 ? '+' : '−'}${Math.abs(o * 1000).toFixed(0)} ms` : `${o >= 0 ? '+' : '−'}${Math.abs(o).toFixed(3)} s`);

export default function NotesStep({ ws, head }: { ws: WS; head: ReactNode }) {
  const { project, notes: n } = ws;
  const [clickOn, setClickOn] = useState(true);
  const [sens, setSens] = useState(0.5);
  const [showDetect, setShowDetect] = useState(false);
  // which note finder: piano (most accurate on piano) or any instrument; remembered on this computer
  const [finder, setFinderState] = useState<NoteFinder>(() => { try { return localStorage.getItem('pv.finder') === 'any' ? 'any' : 'piano'; } catch { return 'piano'; } });
  const setFinder = (f: NoteFinder) => { setFinderState(f); try { localStorage.setItem('pv.finder', f); } catch { /* per-computer convenience */ } };
  const runDetect = () => n.detect(0.7 - 0.4 * sens, finder);
  useEffect(() => { n.prepareAudio(); }, [n.prepareAudio]);
  const placed = project?.notes ?? [];
  useClickTrack(clickOn, ws.playing, ws.videoEl.current, placed);
  const attacks = useMemo(() => (n.audio ? attackTimes(n.audio.envelope) : []), [n.audio]);
  const src = project ? sourceOf(project) : null;
  // slider: ±1 s around the automatic result (or the current offset)
  const [center, setCenter] = useState<number | null>(null);
  useEffect(() => { if (src) setCenter((c) => (c === null || Math.abs(src.offset - c) > 1 ? src.offset : c)); }, [src?.offset]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!project) return null;
  // only the part kept on the Video step counts
  const kept = trimRange(project, ws.duration || n.audio?.duration || project.video.frames / (project.video.fps || 30));
  const inKept = placed.filter((x) => x.s >= kept[0] && x.s <= kept[1]);
  const score = n.audio && src ? matchScore(attacks, placed, kept) : null;
  const range = pitchRange(placed);
  const out = outOfRange(placed, project.keyboard.lowestNote, project.keyboard.keys);
  const outside = out.below + out.above;
  const busy = n.busy;
  const c = center ?? src?.offset ?? 0;
  // sync check: do note starts land on attacks heard in the audio? Correct notes on a pedalled piece land on clear
  // attacks about 70% of the time; notes shifted against the video fall to chance (about 25%)
  const inSync = score === null ? null : score >= 0.45;
  const syncLabel = inSync === null ? null : (
    <span className={'sync-state' + (inSync ? '' : ' off')} title="Whether the notes start where you hear attacks in the audio">{inSync ? 'Sync looks good' : 'Out of sync'}</span>
  );

  return (
    <div className="page">
      <div className="page-main">
        {head}
        <div className="title-row">
          <p className="sub">Each white tick is a note. It should sit on an attack in your audio.</p>
          <div className="seg big" role="radiogroup" aria-label="Where the notes come from">
            <PickButton what="midi" className={'seg-btn' + (src?.kind === 'midi' ? ' on' : '')} onPick={ws.pick} onFiles={ws.onFiles} disabled={!!busy}><Icon name="midiFile" />From MIDI file</PickButton>
            <button type="button" className={'seg-btn' + (src && src.kind === 'audio' ? ' on' : '')} disabled={!!busy} onClick={runDetect}><Icon name="detect" />Detect from audio</button>
          </div>
        </div>

        {busy ? (
          <div className="banner">
            <span className="spinner" />
            <b>{busy.kind === 'audio' ? 'Reading the soundtrack…' : busy.kind === 'align' ? 'Lining up with the audio…' : `Listening for notes… ${Math.round(busy.pct * 100)}%`}</b>
            {busy.kind === 'detect' && <div className="bar inline"><div style={{ width: `${Math.round(busy.pct * 100)}%` }} /></div>}
          </div>
        ) : n.error ? (
          <div className="banner bad"><b>{n.error}</b></div>
        ) : !src ? (
          <div className="banner neutral">
            <b>No notes yet</b><span className="dim">Import the MIDI file recorded with this take, or detect the notes from the audio.</span>
          </div>
        ) : src.kind === 'midi' ? (
          <div className={'banner' + (src.confidence !== undefined && src.confidence < 0.5 ? ' warn' : '')}>
            <span className={'check' + (src.confidence !== undefined && src.confidence < 0.5 ? ' warn' : '')} aria-hidden="true" />
            <b>{src.confidence === undefined ? 'Placed by hand' : src.confidence >= 0.5 ? 'Aligned automatically' : 'Not sure about the alignment: check by ear'}</b>
            <span className="dim" title="The MIDI file">{src.name}</span>
            <span className="mono dim">offset {fmtOffset(src.offset)}</span>
            {syncLabel}
            <button type="button" className="btn small" onClick={n.autoAlign} title="Line the notes up with the audio again"><Icon name="update" />Align again</button>
          </div>
        ) : (
          <div className="banner">
            <span className="check" aria-hidden="true" />
            <b>{src.name}</b>
            <span className="mono dim">{src.notes.length} notes</span>
            {syncLabel}
            <button type="button" className="btn small" onClick={() => setShowDetect(true)}><Icon name="settings" />Detection settings</button>
          </div>
        )}

        <div className="wave-card">
          <WaveSync
            range={kept}
            transport={
          <MiniTransport ws={ws}>
            <label className="toggle-inline" title="A click on every note, to hear whether the notes and the audio line up">
              <input type="checkbox" checked={clickOn} onChange={(e) => setClickOn(e.target.checked)} /> Click on each note
            </label>
          </MiniTransport>
            }
            audio={n.audio}
            notes={placed}
            attacks={attacks}
            time={ws.time}
            duration={ws.duration}
            playing={ws.playing}
            onSeek={ws.seek}
            onNudge={(d) => src && n.setOffset(src.offset + d)}
          />
        </div>

        <div className="stat-cards">
          <div className="stat"><span>Notes</span><b>{inKept.length || '—'}</b></div>
          <div className="stat"><span>Range</span><b>{range ? `${noteName(range[0])}–${noteName(range[1])}` : '—'}</b></div>
          <div className="stat"><span>Sustain pedal</span><b>{src?.kind === 'midi' ? (src.sustain ? 'Used' : 'Not used') : '—'}</b></div>
          <div className={'stat' + (outside ? ' warn' : '')}>
            <span>Outside keyboard</span><b>{src ? outside : '—'}</b>
            {outside > 0 && <button type="button" className="link inline" onClick={() => ws.goStep('calibrate')}>Change keyboard size</button>}
          </div>
        </div>
      </div>

      <aside className="page-side">
        <h2>Fine-tune</h2>
        <div className="side-field">
          <span className="ctl-head"><span>Offset</span>{src ? <ValueEdit value={src.offset} min={c - 1} max={c + 1} step={0.001} fmt={fmtOffset} label="Offset" onChange={(v) => n.setOffset(v)}
            parse={(t) => { const x = Number(t.replace(/[−–]/g, '-').replace(/[^\d.+-]/g, '')); return Number.isFinite(x) ? (/\bs\b/.test(t) && !/ms/.test(t) ? x : x / 1000) : null; }} /> : <span className="mono val">—</span>}</span>
          <Dial value={src?.offset ?? 0} min={c - 1} max={c + 1} step={0.001} label="Offset" fmt={fmtOffset} stops={false} disabled={!src}
            onChange={(v) => n.setOffset(v)} />
          <div className="nudge">
            {[-0.1, -0.01, 0.01, 0.1].map((d) => (
              <button key={d} type="button" className="btn small" disabled={!src} onClick={() => src && n.setOffset(src.offset + d)}>{d > 0 ? '+' : '−'}{Math.abs(d * 1000)}</button>
            ))}
          </div>
        </div>
        <label className="side-field">
          <span>Transpose</span>
          <select value={src?.transpose ?? 0} disabled={!src} onChange={(e) => n.setTranspose(Number(e.target.value))}>
            <option value={-2}>−2 octaves</option>
            <option value={-1}>−1 octave</option>
            <option value={0}>0 · as recorded</option>
            <option value={1}>+1 octave</option>
            <option value={2}>+2 octaves</option>
          </select>
        </label>
        <details className="side-details" open={showDetect} onToggle={(e) => setShowDetect((e.target as HTMLDetailsElement).open)}>
          <summary>Audio detection settings</summary>
          <div className="seg" role="radiogroup" aria-label="Note finder">
            <button type="button" className={finder === 'piano' ? 'on' : ''} onClick={() => setFinder('piano')} aria-pressed={finder === 'piano'}>Piano</button>
            <button type="button" className={finder === 'any' ? 'on' : ''} onClick={() => setFinder('any')} aria-pressed={finder === 'any'}>Any instrument</button>
          </div>
          <p className="help">{finder === 'piano'
            ? 'Made for piano: finds the most notes, with their loudness and the sustain pedal. Slower on the first run while it loads.'
            : 'Works on any instrument or a mix, but adds more stray notes on piano.'}</p>
          {finder === 'any' && (
            <label className="field">
              <span>Fewer notes</span>
              <input type="range" min={0} max={1} step={0.05} value={sens} onChange={(e) => setSens(Number(e.target.value))} aria-label="Detection sensitivity" />
              <span>More</span>
            </label>
          )}
          <button type="button" className="btn small" disabled={!!busy} onClick={runDetect}><Icon name="detect" />Detect notes again</button>
          {src && <button type="button" className="btn small ghost" disabled={!!busy} onClick={n.clear}><Icon name="remove" />Remove notes</button>}
        </details>
      </aside>

      <footer className="page-foot">
        <button type="button" className="btn" onClick={() => ws.goStep('video')}><Icon name="back" />Back</button>
        <button type="button" className="btn primary" onClick={() => ws.goStep('calibrate')}>Continue to calibration <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h9M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg></button>
      </footer>
    </div>
  );
}
