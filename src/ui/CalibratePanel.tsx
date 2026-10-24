import { useEffect, useRef } from 'react';
import { CalibratedProject, isBlack, noteName, PRESETS } from '../engine/calibration';
import type { useCalibration } from './useCalibration';

type Calib = ReturnType<typeof useCalibration>;

const fmtT = (t: number) => {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
};

function KeysDiagram() {
  // small picture of which corners to mark
  const keys = Array.from({ length: 9 });
  return (
    <svg viewBox="0 0 200 74" className="diagram" aria-hidden="true">
      <rect x="18" y="8" width="164" height="16" rx="3" fill="#1b2027" />
      {keys.map((_, i) => <rect key={i} x={20 + i * 18} y="24" width="17" height="38" fill="#e8eaed" opacity="0.9" />)}
      {[1, 2, 4, 5, 6, 8].map((i) => <rect key={i} x={20 + i * 18 - 5} y="24" width="10" height="22" fill="#0b0d10" />)}
      <path d="M20 24 H182 V62 H20 Z" fill="none" stroke="#2FD3B5" strokeWidth="1.4" />
      <line x1="16" y1="22" x2="184" y2="22" stroke="#9ff5e4" strokeWidth="2" />
      {[[20, 24], [182, 24], [182, 62], [20, 62]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4.5" fill="#0b0d10" stroke="#2FD3B5" strokeWidth="1.8" />
      ))}
      <text x="4" y="72" fill="#a3acb7" fontSize="8">low key</text>
      <text x="160" y="72" fill="#a3acb7" fontSize="8">high key</text>
    </svg>
  );
}

export default function CalibratePanel(props: {
  project: CalibratedProject;
  c: Calib;
  sweep: boolean;
  setSweep: (v: boolean) => void;
  seek: (t: number) => void;
  onDone: () => void;
}) {
  const { project, c, sweep, setSweep, seek, onDone } = props;
  const kb = project.keyboard;
  const preset = PRESETS.find((p) => p.keys === kb.keys && p.lowestNote === kb.lowestNote);
  const lowOptions: number[] = [];
  for (let n = 21; n <= 60; n++) if (!isBlack(n)) lowOptions.push(n);
  const running = c.track.kind === 'running';
  const tp = c.track.kind === 'running' ? c.track.progress : null;

  return (
    <nav className="layers calib-panel" aria-label="Calibration">
      <section>
        <span className="section-label">Keyboard</span>
        <select
          value={preset ? `${preset.keys}:${preset.lowestNote}` : 'custom'}
          onChange={(e) => { const [k, l] = e.target.value.split(':').map(Number); if (k) c.setPreset(k, l); }}
          aria-label="Keyboard size"
        >
          {PRESETS.map((p) => <option key={p.keys} value={`${p.keys}:${p.lowestNote}`}>{p.label}</option>)}
          {!preset && <option value="custom">{kb.keys} keys from {noteName(kb.lowestNote)}</option>}
        </select>
        <label className="field">
          <span>Lowest key</span>
          <select value={kb.lowestNote} onChange={(e) => c.setPreset(kb.keys, Number(e.target.value))} aria-label="Lowest key">
            {lowOptions.map((n) => <option key={n} value={n}>{noteName(n)}</option>)}
          </select>
        </label>
      </section>

      <section>
        <span className="section-label">1 · Mark the keys</span>
        <KeysDiagram />
        <p className="help">
          Drag the four round handles onto the corners of the keys. <b>Back</b> is where the keys go under the case, <b>front</b> is the edge nearest you.
          Select a handle and use the arrow keys for single-pixel moves.
        </p>
      </section>

      <section>
        <span className="section-label">2 · Saber line</span>
        <p className="help">Drag the ◆ handles at either end of the glowing line to where notes should land, usually just behind the keys.</p>
        {(Math.abs(kb.edge.a + 0.03) > 1e-4 || Math.abs(kb.edge.b) > 1e-6) && (
          <button type="button" className="btn small ghost" onClick={() => c.onEdge({ a: -0.03, b: 0 }, true)}>Reset saber line</button>
        )}
      </section>

      <section>
        <span className="section-label">3 · Camera</span>
        <div className="seg" role="radiogroup" aria-label="Camera">
          <button type="button" role="radio" aria-checked={!c.cal?.cameraMoves} className={!c.cal?.cameraMoves ? 'on' : ''} onClick={() => c.setCameraMoves(false)} disabled={running}>Stayed still</button>
          <button type="button" role="radio" aria-checked={!!c.cal?.cameraMoves} className={c.cal?.cameraMoves ? 'on' : ''} onClick={() => c.setCameraMoves(true)} disabled={running}>Moved</button>
        </div>
        {c.cal?.cameraMoves && (
          <>
            {running ? (
              <div className="track-run">
                <div className="bar"><div style={{ width: `${tp ? Math.min(100, (tp.done / Math.max(0.01, tp.total)) * 100) : 0}%` }} /></div>
                <small>{tp ? `Tracking ${fmtT(tp.done)} of ${fmtT(tp.total)}${tp.lost ? ` · ${tp.lost} unsure frames` : ''}` : 'Preparing…'}</small>
                <button type="button" className="btn small ghost" onClick={c.cancelTracking}>Cancel</button>
              </div>
            ) : (
              <>
                <p className="help">
                  {c.tracked
                    ? 'Tracked. The outline follows the keyboard through the clip; scrub to check it.'
                    : 'Mark the corners on a clear frame, then track. The video plays through once in the background.'}
                </p>
                <button type="button" className={'btn small' + (c.tracked ? '' : ' primary')} onClick={c.runTracking}>
                  {c.tracked ? 'Track again from this frame' : 'Track keyboard'}
                </button>
                {c.track.kind === 'done' && (
                  <small className="ok">Done in {c.track.seconds.toFixed(0)} s{c.track.lost ? ` · ${c.track.lost} unsure frames filled in` : ' · every frame locked'}</small>
                )}
                {c.track.kind === 'error' && <small className="bad">{c.track.message}</small>}
              </>
            )}
          </>
        )}
      </section>

      {c.tracked && (
        <section>
          <span className="section-label">4 · Fixes</span>
          <p className="help">If the outline slips somewhere, go to that frame and drag it back. Each fix blends into the frames around it.</p>
          {c.cal!.fixes.length > 0 && (
            <ul className="fixes">
              {c.cal!.fixes.map((f) => (
                <li key={f.t}>
                  <button type="button" className="link" onClick={() => seek(f.t)}>Fix at {fmtT(f.t)}</button>
                  <button type="button" className="x" onClick={() => c.removeFix(f.t)} aria-label={`Remove fix at ${fmtT(f.t)}`}>×</button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn small ghost" onClick={c.clearTracking}>Discard tracking</button>
        </section>
      )}

      <div className="calib-foot">
        <label className="layer">
          <input type="checkbox" checked={sweep} onChange={(e) => setSweep(e.target.checked)} />
          Key sweep in preview
        </label>
        <button type="button" className="btn primary" onClick={onDone} disabled={running}>Preview with effects</button>
      </div>
    </nav>
  );
}

/** Thin strip above the timeline: tracking confidence per frame, fixes and the reference frame. */
export function QualityStrip({ project, duration, onSeek }: { project: CalibratedProject; duration: number; onSeek: (t: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cal = project.calibration;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!cal || !duration) return;
    const q = cal.cameraMoves ? cal.quality : undefined;
    const fps = project.video.fps;
    if (q?.length) {
      for (let x = 0; x < w; x++) {
        const f0 = Math.floor((x / w) * duration * fps), f1 = Math.max(f0 + 1, Math.floor(((x + 1) / w) * duration * fps));
        let m = 1;
        for (let f = f0; f < f1 && f < q.length; f++) m = Math.min(m, q[f]);
        ctx.fillStyle = m >= 0.45 ? '#1f6f60' : m >= 0.25 ? '#b8892f' : '#b4483a';
        ctx.fillRect(x, 3, 1, h - 6);
      }
    } else {
      ctx.fillStyle = '#22272e';
      ctx.fillRect(0, 3, w, h - 6);
    }
    ctx.fillStyle = '#2FD3B5';
    const rx = (cal.refTime / duration) * w;
    ctx.beginPath(); ctx.moveTo(rx - 4, 0); ctx.lineTo(rx + 4, 0); ctx.lineTo(rx, 6); ctx.fill();
    ctx.fillStyle = '#f6c453';
    for (const f of cal.fixes) ctx.fillRect((f.t / duration) * w - 1, 0, 2, h);
  });
  return (
    <canvas
      ref={ref}
      className="quality"
      title="Tracking confidence: green locked, amber unsure, red lost · ▼ marked frame · yellow ticks: fixes"
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * duration); }}
    />
  );
}
