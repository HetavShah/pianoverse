import { useState } from 'react';
import Dial from '../Dial';
import { isBlack, noteName, PRESETS } from '../../engine/calibration';
import { apply, planeToImage } from '../../engine/geometry';
import CalibrateCanvas from '../CalibrateCanvas';
import { QualityStrip } from '../QualityStrip';
import type { WS } from '../workspace';

const fmtT = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };
const DEFAULT_EDGE = { a: -0.03, b: 0 };

function Item(props: { n: number; done: boolean; active?: boolean; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className={'check-item' + (props.active ? ' active' : '')}>
      <span className={'num' + (props.done ? ' done' : '')}>{props.n}</span>
      <div className="body">
        <b>{props.title}</b>
        {props.sub && <small>{props.sub}</small>}
        {props.children}
      </div>
    </div>
  );
}

export default function CalibrateStep({ ws }: { ws: WS }) {
  const { project, calib: c } = ws;
  const [zoomCmd, setZoomCmd] = useState<{ n: number; k: number | 'fit' }>({ n: 0, k: 1 });
  const [z, setZ] = useState(1);
  if (!project) return null;
  const kb = project.keyboard;
  const W = kb.whiteKeys;
  const preset = PRESETS.find((p) => p.keys === kb.keys && p.lowestNote === kb.lowestNote);
  const lowOptions: number[] = [];
  for (let m = 21; m <= 60; m++) if (!isBlack(m)) lowOptions.push(m);
  const cal = c.cal;
  const running = c.track.kind === 'running';
  const tp = c.track.kind === 'running' ? c.track.progress : null;

  // saber offset / tilt in screen terms at the current frame
  const H = c.corners ? planeToImage(c.corners, W) : null;
  const len = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const depthPx = H ? len(apply(H, W / 2, 0), apply(H, W / 2, 1)) : 100;
  const lengthPx = H ? len(apply(H, 0, 0), apply(H, W, 0)) : 1000;
  const e = c.edge;
  const yMid = e.a + e.b * (W / 2);
  const offsetPx = Math.round(-(yMid - DEFAULT_EDGE.a) * depthPx); // + = further behind the keys
  const tiltDeg = (Math.atan((e.b * W * depthPx) / lengthPx) * 180) / Math.PI;
  const setSaber = (px: number, deg: number) => {
    const b = (Math.tan((deg * Math.PI) / 180) * lengthPx) / (W * depthPx);
    const mid = DEFAULT_EDGE.a - px / depthPx;
    c.onEdge({ a: Math.round((mid - b * (W / 2)) * 1e4) / 1e4, b: Math.round(b * 1e6) / 1e6 }, true);
  };
  const saberMoved = Math.abs(e.a - DEFAULT_EDGE.a) > 1e-4 || Math.abs(e.b) > 1e-6;

  const cornersDone = !!cal?.cornersSet;
  const trackDone = !!cal && (!cal.cameraMoves || c.tracked);

  return (
    <div className="page">
      <div className="page-main tight">
        <div className="title-row">
          <div className="inline-title">
            <h1>Calibrate keyboard</h1>
            <span className="dim">Frame {fmtT(ws.time)} · {c.tracked ? (c.fixHere ? 'this frame has a fix' : 'drag a corner to fix this frame') : 'drag a corner handle to adjust'}</span>
          </div>
          <div className="zoom-ctl">
            <button type="button" className="btn icon" onClick={() => setZoomCmd({ n: zoomCmd.n + 1, k: 1 / 1.4 })} aria-label="Zoom out"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h10" stroke="currentColor" strokeWidth="1.6" /></svg></button>
            <button type="button" className="btn zoom-val" onClick={() => setZoomCmd({ n: zoomCmd.n + 1, k: 'fit' })} title="Fit">{Math.round(z * 100)}%</button>
            <button type="button" className="btn icon" onClick={() => setZoomCmd({ n: zoomCmd.n + 1, k: 1.4 })} aria-label="Zoom in"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h10M7 2v10" stroke="currentColor" strokeWidth="1.6" /></svg></button>
          </div>
        </div>
        <div className="canvas-card">
          {c.corners && !ws.videoIssue && (
            <CalibrateCanvas
              video={ws.videoEl.current}
              videoW={project.video.width}
              videoH={project.video.height}
              frameKey={ws.frameTick + ws.time}
              corners={c.corners}
              edge={c.edge}
              whiteKeys={W}
              lowestNote={kb.lowestNote}
              keys={kb.keys}
              fixed={!!c.fixHere}
              fixMode={c.tracked}
              onCorners={c.onCorners}
              onEdge={c.onEdge}
              zoomCmd={zoomCmd}
              onZoom={setZ}
            />
          )}
        </div>
        <div className="mini-transport">
          <button type="button" className="play small" onClick={ws.togglePlay} aria-label={ws.playing ? 'Pause' : 'Play'}>
            {ws.playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z" /></svg>}
          </button>
          <div className="scrub-col">
            <div className="row"><span className="dim">Tracking quality across the clip</span><span className="mono dim">{fmtT(ws.time)} / {fmtT(ws.duration)}</span></div>
            <QualityStrip project={project} duration={ws.duration} onSeek={ws.seek} />
            <input className="scrub" type="range" min={0} max={ws.duration || 1} step={0.001} value={ws.time} onChange={(ev) => ws.seek(Number(ev.target.value))} aria-label="Timeline" />
            <div className="legend-row">
              <span><i className="sw locked" />Locked</span><span><i className="sw unsure" />Unsure</span><span><i className="sw lost" />Lost</span>
              <span><i className="sw ref" />Marked frame</span><span><i className="sw fix" />Fix</span>
              <span className="dim">· click the bar to check a spot · scroll the frame to zoom, drag to pan</span>
            </div>
          </div>
        </div>
      </div>

      <aside className="page-side checklist">
        <Item n={1} done title="Keyboard" sub={`${kb.keys} keys · lowest note ${noteName(kb.lowestNote)}`}>
          <div className="two">
            <select value={preset ? `${preset.keys}:${preset.lowestNote}` : 'custom'} onChange={(ev) => { const [k, l] = ev.target.value.split(':').map(Number); if (k) c.setPreset(k, l); }} aria-label="Keyboard size">
              {PRESETS.map((p) => <option key={p.keys} value={`${p.keys}:${p.lowestNote}`}>{p.keys} keys</option>)}
              {!preset && <option value="custom">{kb.keys} keys</option>}
            </select>
            <select value={kb.lowestNote} onChange={(ev) => c.setPreset(kb.keys, Number(ev.target.value))} aria-label="Lowest key">
              {lowOptions.map((m) => <option key={m} value={m}>from {noteName(m)}</option>)}
            </select>
          </div>
        </Item>
        <Item n={2} done title="Camera setup">
          <div className="seg full">
            {([['angled', 'Angled side'], ['topdown', 'Top-down']] as const).map(([id, l]) => (
              <button key={id} type="button" className={(project.camera ?? 'angled') === id ? 'on' : ''} onClick={() => ws.setProject({ ...project, camera: id })}>{l}</button>
            ))}
          </div>
        </Item>
        <Item n={3} done={cornersDone} active={!cornersDone} title={cornersDone ? 'Corners placed' : 'Place the corners'}
          sub={cornersDone ? 'Key outlines match the keys in the frame' : 'Drag the four round handles onto the corners of the keys: back is where keys go under the case, front is nearest you.'} />
        <Item n={4} done={cornersDone && saberMoved} active={cornersDone && !c.tracked} title="Saber line" sub="Where the notes land: just behind the keys (the glowing line)">
          <label className="slider-row"><span>Offset</span><span className="mono">{offsetPx} px</span></label>
          <Dial value={offsetPx} min={-Math.round(depthPx * 0.6)} max={Math.round(depthPx * 0.6)} step={1} label="Saber offset" fmt={(v) => `${v} px`} base={0} stops={false} onChange={(v) => setSaber(v, tiltDeg)} />
          <label className="slider-row"><span>Tilt</span><span className="mono">{tiltDeg.toFixed(1)}°</span></label>
          <Dial value={Number(tiltDeg.toFixed(1))} min={-8} max={8} step={0.1} label="Saber tilt" fmt={(v) => `${v.toFixed(1)}°`} base={0} stops={false} onChange={(v) => setSaber(offsetPx, v)} />
          <button type="button" className="btn small" onClick={() => c.onEdge(DEFAULT_EDGE, true)} disabled={!saberMoved}>Snap to key edge again</button>
        </Item>
        <Item n={5} done={trackDone} active={cornersDone && !trackDone} title="Track through the clip"
          sub={c.tracked ? `${project.tracking.frames.length.toLocaleString()} frames${c.track.kind === 'done' ? ` · done in ${c.track.seconds.toFixed(0)} s` : ''}` : cal?.cameraMoves ? 'The video plays through once in the background' : 'Skipped: the camera is fixed'}>
          {running ? (
            <div className="track-run">
              <div className="bar"><div style={{ width: `${tp ? Math.min(100, (tp.done / Math.max(0.01, tp.total)) * 100) : 0}%` }} /></div>
              <small>{tp ? `Tracking ${fmtT(tp.done)} of ${fmtT(tp.total)}${tp.lost ? ` · ${tp.lost} unsure frames` : ''}` : 'Preparing…'}</small>
              <button type="button" className="btn small ghost" onClick={c.cancelTracking}>Cancel</button>
            </div>
          ) : cal?.cameraMoves ? (
            <>
              {c.tracked && <div className="bar done"><div style={{ width: '100%' }} /></div>}
              <button type="button" className={'btn small' + (c.tracked ? '' : ' primary')} onClick={c.runTracking}>{c.tracked ? 'Track again from this frame' : 'Track keyboard'}</button>
              {c.track.kind === 'error' && <small className="bad">{c.track.message}</small>}
            </>
          ) : null}
          <label className="toggle-row compact">
            <span>Camera is fixed (skip tracking)</span>
            <input type="checkbox" checked={!cal?.cameraMoves} disabled={running} onChange={(ev) => c.setCameraMoves(!ev.target.checked)} />
          </label>
          {c.tracked && cal && cal.fixes.length > 0 && (
            <ul className="fixes">
              {cal.fixes.map((f) => (
                <li key={f.t}>
                  <button type="button" className="link" onClick={() => ws.seek(f.t)}>Fix at {fmtT(f.t)}</button>
                  <button type="button" className="x" onClick={() => c.removeFix(f.t)} aria-label={`Remove fix at ${fmtT(f.t)}`}><svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.7" /></svg></button>
                </li>
              ))}
            </ul>
          )}
          {c.tracked && <button type="button" className="link inline small-text" onClick={c.clearTracking}>Discard tracking</button>}
        </Item>
      </aside>

      <footer className="page-foot">
        <button type="button" className="btn" onClick={() => ws.goStep('notes')}>Back</button>
        <button type="button" className="btn primary" disabled={running} onClick={() => { ws.setProject({ ...project, progress: { ...project.progress, calibrated: true } }); ws.goStep('style'); }}>Continue to style <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h9M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg></button>
      </footer>
    </div>
  );
}
