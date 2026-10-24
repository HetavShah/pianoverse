import { useEffect, useRef, useState } from 'react';
import type { CalibratedProject } from '../engine/calibration';
import { noteName } from '../engine/calibration';
import { outOfRange } from '../engine/notes';
import { pal, RawNote } from '../engine/project';
import { RATE } from '../engine/sync';
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
          <p className="help">Watch a note land: if the flash comes before you hear it, move later (+). You can also drag the notes in the strip under the video.</p>
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

/**
 * Under the video: the soundtrack's attacks (top) against the notes (bottom) around the playhead.
 * Drag sideways to slide the notes; scroll to zoom.
 */
export function SyncStrip(props: {
  envelope: Float32Array | null;
  notes: RawNote[];
  time: number;
  lowest: number;
  keys: number;
  onSlide: (deltaSeconds: number, final: boolean) => void;
  onSeek: (t: number) => void;
}) {
  const { envelope, notes, time, lowest, keys, onSlide } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const [span, setSpan] = useState(6); // seconds shown
  const [drag, setDrag] = useState<{ x: number; d: number } | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0e12'; ctx.fillRect(0, 0, w, h);
    const t0 = time - span / 2, pxs = w / span;
    const X = (t: number) => (t - t0) * pxs;
    const split = Math.round(h * 0.42);
    // second ticks
    ctx.fillStyle = '#1b2027';
    for (let s = Math.ceil(t0); s < t0 + span; s++) ctx.fillRect(Math.round(X(s)), 0, 1, h);
    // audio attacks
    if (envelope) {
      let mx = 1e-6;
      const f0 = Math.max(0, Math.floor(t0 * RATE)), f1 = Math.min(envelope.length, Math.ceil((t0 + span) * RATE));
      for (let f = f0; f < f1; f++) mx = Math.max(mx, envelope[f]);
      ctx.fillStyle = '#9aa6b5';
      for (let f = f0; f < f1; f++) {
        const v = Math.sqrt(envelope[f] / mx);
        if (v < 0.04) continue;
        const bh = v * (split - 6);
        ctx.fillRect(X(f / RATE), split - 3 - bh, Math.max(1, pxs / RATE), bh);
      }
    } else {
      ctx.fillStyle = '#5f6b7a'; ctx.font = '11px Inter, "Segoe UI", sans-serif';
      ctx.fillText('Reading the soundtrack…', 8, split / 2 + 4);
    }
    ctx.fillStyle = '#1f252d'; ctx.fillRect(0, split, w, 1);
    // notes (piano roll), shifted while dragging
    const d = drag?.d ?? 0;
    const rollTop = split + 4, rollH = h - rollTop - 4;
    // scale the roll to the pitches actually played (stable for the whole piece)
    let pLo = lowest + keys, pHi = lowest;
    for (const n of notes) { if (n.p < pLo) pLo = n.p; if (n.p > pHi) pHi = n.p; }
    if (pLo > pHi) { pLo = lowest; pHi = lowest + keys - 1; }
    const rows = pHi - pLo + 1;
    const Y = (p: number) => rollTop + rollH - ((p - pLo + 0.5) / rows) * rollH;
    const nh = Math.max(3, Math.min(8, rollH / rows));
    for (const n of notes) {
      const s = n.s + d, e = n.e + d;
      if (e < t0 || s > t0 + span) continue;
      const c = pal(n.p);
      const col = `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
      ctx.fillStyle = col; ctx.globalAlpha = 0.55;
      ctx.fillRect(X(s), Y(n.p) - nh / 2, Math.max(2, (e - s) * pxs), nh);
      ctx.globalAlpha = 1;
      ctx.fillRect(X(s), Y(n.p) - nh / 2 - 1, 2, nh + 2);
      // onset guide up into the audio lane
      ctx.fillStyle = 'rgba(47,211,181,0.5)';
      ctx.fillRect(X(s), 0, 1, split);
    }
    // playhead
    ctx.fillStyle = '#e8eaed'; ctx.fillRect(Math.round(w / 2), 0, 1, h);
    if (drag) {
      ctx.fillStyle = 'rgba(11,14,18,0.85)'; ctx.fillRect(w / 2 + 6, 4, 92, 18);
      ctx.fillStyle = '#2FD3B5'; ctx.font = '600 11px Inter, "Segoe UI", sans-serif';
      ctx.fillText(`${d >= 0 ? '+' : '−'}${Math.abs(d * 1000).toFixed(0)} ms`, w / 2 + 12, 17);
    }
  });

  return (
    <canvas
      ref={ref}
      className="syncstrip"
      title="Top: attacks heard in the video. Bottom: the notes. Drag sideways to slide the notes; scroll to zoom."
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag({ x: e.clientX, d: 0 }); }}
      onPointerMove={(e) => {
        if (!drag) return;
        const w = (e.target as HTMLElement).clientWidth;
        const d = ((e.clientX - drag.x) / w) * span;
        setDrag({ ...drag, d });
        onSlide(d, false);
      }}
      onPointerUp={() => { if (drag) { if (Math.abs(drag.d) > 0.0005) onSlide(drag.d, true); } setDrag(null); }}
      onWheel={(e) => setSpan((s) => Math.min(30, Math.max(1.5, s * Math.exp(e.deltaY * 0.0015))))}
    />
  );
}
