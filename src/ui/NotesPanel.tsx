import { useState } from 'react';
import type { CalibratedProject } from '../engine/calibration';
import { noteName } from '../engine/calibration';
import { outOfRange } from '../engine/notes';
import { sourceOf, useNotes } from './useNotes';
import PickButton from './PickButton';
import type { PickKind } from './media';

type NotesApi = ReturnType<typeof useNotes>;

const fmtOffset = (o: number) => `${o >= 0 ? '+' : '−'}${Math.abs(o).toFixed(3)} s`;

export default function NotesPanel(props: {
  project: CalibratedProject;
  n: NotesApi;
  onPick: (what: PickKind) => void;
  onFiles: (f: FileList | null) => void;
  goCalibrate: () => void;
}) {
  const { project, n, onPick, onFiles, goCalibrate } = props;
  const src = sourceOf(project);
  const fps = project.video.fps || 30;
  const [sens, setSens] = useState(0.5); // 0 = fewer notes, 1 = more
  const busy = n.busy;
  const range = outOfRange(project.notes, project.keyboard.lowestNote, project.keyboard.keys);
  const outside = range.below + range.above;
  const conf = src?.confidence;

  return (
    <nav className="layers calib-panel" aria-label="Notes">
      <section>
        <span className="section-label">Notes from</span>
        {src ? (
          <div className="source">
            <span className={'pill ' + src.kind}>{src.kind === 'midi' ? 'MIDI' : 'Audio'}</span>
            <span className="what"><b>{src.name}</b><small>{src.notes.length} notes</small></span>
          </div>
        ) : (
          <p className="help">No notes yet, so Preview shows a sweep across every key.</p>
        )}
        <PickButton what="midi" className={'btn small' + (src ? '' : ' primary')} onPick={onPick} onFiles={onFiles} disabled={!!busy}>Import MIDI file…</PickButton>
        <p className="help">Best: the MIDI recorded from your keyboard while filming. It's lined up with the video automatically.</p>
      </section>

      <section>
        <span className="section-label">No MIDI? Listen to the video</span>
        <label className="field">
          <span>Fewer notes</span>
          <input type="range" min={0} max={1} step={0.05} value={sens} onChange={(e) => setSens(Number(e.target.value))} aria-label="Detection sensitivity" />
          <span>More</span>
        </label>
        <button type="button" className="btn small" onClick={() => n.detect(0.7 - 0.4 * sens)} disabled={!!busy}>Detect notes from audio</button>
      </section>

      {busy && (
        <div className="track-run">
          <div className="bar"><div style={{ width: busy.kind === 'detect' ? `${Math.round(busy.pct * 100)}%` : '100%' }} className={busy.kind === 'detect' ? '' : 'indeterminate'} /></div>
          <small>{busy.kind === 'audio' ? 'Reading the soundtrack…' : busy.kind === 'align' ? 'Lining up with the audio…' : `Listening for notes… ${Math.round(busy.pct * 100)}%`}</small>
        </div>
      )}
      {n.error && <small className="bad">{n.error}</small>}

      {src && (
        <section>
          <span className="section-label">Sync</span>
          <div className="offset">
            <span className="big">{fmtOffset(src.offset)}</span>
            {conf !== undefined && (
              <span className={conf >= 0.5 ? 'ok' : 'warn'}>{conf >= 0.5 ? 'Lined up with the audio' : 'Not sure: check by ear'}</span>
            )}
          </div>
          <div className="nudge">
            <button type="button" className="btn small" onClick={() => n.setOffset(src.offset - 1 / fps)} title="One frame earlier">−1 fr</button>
            <button type="button" className="btn small" onClick={() => n.setOffset(src.offset - 0.01)} title="10 ms earlier">−10 ms</button>
            <button type="button" className="btn small" onClick={() => n.setOffset(src.offset + 0.01)} title="10 ms later">+10 ms</button>
            <button type="button" className="btn small" onClick={() => n.setOffset(src.offset + 1 / fps)} title="One frame later">+1 fr</button>
          </div>
          <button type="button" className="btn small ghost" onClick={n.autoAlign} disabled={!!busy}>Line up automatically</button>
          <p className="help">Watch a note land: if the flash comes before you hear it, move later (+). Or drag the notes in the Sync timeline under the video until most start lines turn green.</p>
        </section>
      )}

      {src && outside > 0 && (
        <section>
          <span className="section-label">Range</span>
          <p className="help warn-text">
            {outside} note{outside > 1 ? 's are' : ' is'} outside your {project.keyboard.keys}-key keyboard ({noteName(project.keyboard.lowestNote)}–{noteName(project.keyboard.lowestNote + project.keyboard.keys - 1)}) and won't show.
          </p>
          <button type="button" className="btn small ghost" onClick={goCalibrate}>Change keyboard size</button>
        </section>
      )}

      {src && (
        <div className="calib-foot">
          <button type="button" className="btn small ghost" onClick={n.clear} disabled={!!busy}>Remove notes</button>
        </div>
      )}
    </nav>
  );
}
