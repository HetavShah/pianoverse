// Camera step: a virtual camera over your video. Shots (Wide, Follow your hands, Close-up) joined by transitions
// (Cut, Glide, Punch, Dip to black or white), in the frame shape you'll post. Auto camera builds a first edit
// from the music; everything can be changed on the timeline. Export follows the camera.
import { useEffect, useMemo, useRef, useState } from 'react';
import Dial from '../Dial';
import {
  ASPECTS, Aspect, AutoSettings, autoCamera, CameraTrack, DEFAULT_DUR, maxZoom, newCameraTrack, Shot, shotId, shotIndexAt, ShotKind, Transition,
} from '../../engine/camera';
import { estimateBeats, nearestBeat } from '../../engine/beats';
import { cameraFrameAt, cameraPath } from '../exportRun';
import CameraTimeline from '../CameraTimeline';
import Transport from '../Transport';
import { INK } from '../palette';
import type { WS } from '../workspace';

const fmtT = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };
const KIND_LABEL: Record<ShotKind, string> = { wide: 'Wide', follow: 'Follow', close: 'Close-up' };
const SNAP = 0.3; // seconds: joins this close to a beat land on it

function Seg3<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg full">
      {options.map(([v, l]) => <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export default function CameraStep({ ws, attachPreview }: { ws: WS; attachPreview: (c: HTMLCanvasElement | null) => void }) {
  const project = ws.project!;
  const duration = ws.duration || project.video.frames / (project.video.fps || 30);
  const grid = useMemo(() => estimateBeats(project.notes, duration), [project.notes, duration]);
  const [selShot, setSelShot] = useState<number | null>(null);
  const [selJoin, setSelJoin] = useState<number | null>(null);
  const [dragJoin, setDragJoin] = useState<{ i: number; t: number } | null>(null);
  const insetRef = useRef<HTMLCanvasElement>(null);
  const [boxDrag, setBoxDrag] = useState(false);

  // first visit: a camera with an automatic edit (filled in, not an undo step)
  useEffect(() => {
    if (project.cameraTrack) return;
    const tr = newCameraTrack(project);
    ws.setProject({ ...project, cameraTrack: { ...tr, shots: autoCamera(project, tr.auto, tr.aspect, duration, grid) } }, { silent: true });
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const track: CameraTrack | undefined = project.cameraTrack;
  const shotsRaw = track?.shots ?? [];
  // while a join is dragged the timeline and preview show it in its new place
  const shots = dragJoin ? shotsRaw.map((s, i) => (i === dragJoin.i ? { ...s, start: dragJoin.t } : s)) : shotsRaw;
  const setTrack = (patch: Partial<CameraTrack>) => track && ws.setProject({ ...project, cameraTrack: { ...track, ...patch } });
  const setShots = (list: Shot[]) => setTrack({ shots: [...list].sort((a, b) => a.start - b.start) });
  const curShot = shots.length ? shotIndexAt(shots, ws.time) : 0;
  const shotI = Math.min(selShot ?? curShot, Math.max(0, shots.length - 1));
  const shot = shots[shotI];
  const on = !!track?.on;
  const aspect = track?.aspect ?? 'vertical';
  const frameAspect = on ? ASPECTS.find((a) => a.id === aspect)!.size : [project.video.width, project.video.height];
  const zMax = maxZoom(project.video.width, project.video.height, aspect);

  // the inset: your whole video with the camera's window on it
  useEffect(() => {
    const cv = insetRef.current, v = ws.videoEl.current;
    if (!cv || !v || !v.videoWidth || !track) return;
    const k = 132 / Math.max(v.videoWidth, v.videoHeight);
    cv.width = Math.round(v.videoWidth * k); cv.height = Math.round(v.videoHeight * k);
    const g = cv.getContext('2d')!;
    g.drawImage(v, 0, 0, cv.width, cv.height);
    if (!on) return;
    const f = cameraFrameAt(project, ws.time, duration);
    const r = { x: f.view.x * k, y: f.view.y * k, w: f.view.w * k, h: f.view.h * k };
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, cv.width, r.y); g.fillRect(0, r.y + r.h, cv.width, cv.height - r.y - r.h);
    g.fillRect(0, r.y, r.x, r.h); g.fillRect(r.x + r.w, r.y, cv.width - r.x - r.w, r.h);
    g.strokeStyle = INK.live; g.lineWidth = 2; g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  }, [ws.time, ws.frameTick, project, on, duration, track, ws.videoEl]);

  // Delete removes the selected cut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' && (e.target as HTMLInputElement).type === 'text') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selJoin !== null) { e.preventDefault(); removeJoin(selJoin); }
      if (e.key === 'Escape') setSelJoin(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!track) return <div className="camera-page" />;

  const snap = (t: number) => { const b = nearestBeat(grid, t); return Math.abs(b - t) <= SNAP ? b : t; };
  const rebuild = (auto: AutoSettings, asp: Aspect = aspect) => {
    setSelShot(null); setSelJoin(null);
    setTrack({ auto, aspect: asp, shots: autoCamera(project, auto, asp, duration, grid) });
  };
  const setAuto = (patch: Partial<AutoSettings>) => rebuild({ ...track.auto, ...patch });
  const setShot = (i: number, patch: Partial<Shot>) => setShots(shots.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const setKind = (i: number, kind: ShotKind) => {
    const s = shots[i];
    if (kind === 'close') {
      // start the close-up where your hands are now
      const p = cameraPath(project);
      const f = Math.min(p.cx.length - 1, Math.round(Math.max(s.start, Math.min(ws.time, shots[i + 1]?.start ?? duration)) * p.fps));
      setShot(i, { kind, zoom: Math.min(2, zMax), cx: p.cx[f], cy: p.cy[f] });
    } else setShot(i, { kind, zoom: 1, cx: undefined, cy: undefined });
  };
  const addCut = () => {
    const t = snap(ws.time);
    if (t < 0.5 || duration - t < 0.5 || shots.some((s) => Math.abs(s.start - t) < 0.5)) return;
    const i = shotIndexAt(shots, t);
    const list = [...shots];
    list.splice(i + 1, 0, { ...shots[i], id: shotId(), start: t, in: 'cut', inDur: 0 });
    setShots(list); setSelJoin(i + 1); setSelShot(null);
  };
  function removeJoin(i: number) {
    if (i <= 0 || i >= shots.length) return;
    setShots(shots.filter((_, k) => k !== i)); setSelJoin(null); setSelShot(null);
  }
  const moveJoin = (i: number, t: number, final: boolean) => {
    const lo = shots[i - 1].start + 0.5, hi = (shots[i + 1]?.start ?? duration) - 0.5;
    const tt = Math.min(hi, Math.max(lo, snap(t)));
    if (!final) { setDragJoin({ i, t: tt }); return; }
    setDragJoin(null);
    setShots(shotsRaw.map((s, k) => (k === i ? { ...s, start: tt } : s)));
  };
  const setTransition = (i: number, tr: Transition, d: number) => setShot(i, { in: tr, inDur: tr === 'cut' ? 0 : d || DEFAULT_DUR[tr] });

  // drag the box in the inset to frame a close-up
  const boxTo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!shot || shot.kind !== 'close') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * project.video.width, y = ((e.clientY - r.top) / r.height) * project.video.height;
    setShot(shotI, { cx: x, cy: y });
  };

  const cam = on && shots.length ? cameraFrameAt(project, ws.time, duration) : null;
  const camShot = cam ? shots[cam.shot] : null;

  return (
    <div className="camera-page">
      <main className="style-center">
        <div className="preview-bar">
          <span className="section-label" style={{ margin: 0 }}>Frame</span>
          <div className="seg">
            {ASPECTS.map((a) => (
              <button key={a.id} type="button" className={on && aspect === a.id ? 'on' : ''} disabled={!on} onClick={() => setTrack({ aspect: a.id })}>{a.label}</button>
            ))}
          </div>
          <span className="spacer" />
          <label className="check-inline">Camera <input type="checkbox" checked={on} onChange={(e) => setTrack({ on: e.target.checked })} aria-label="Camera on" /></label>
        </div>
        <div className="preview-stage">
          <div className="preview-frame" style={{ aspectRatio: `${frameAspect[0]} / ${frameAspect[1]}` }} onClick={ws.togglePlay} title={ws.playing ? 'Click to pause' : 'Click to play'}>
            <canvas ref={attachPreview} className="preview-canvas" />
          </div>
          {cam && camShot && <span className="cam-tag mono">{fmtT(ws.time)} · {KIND_LABEL[camShot.kind]} · {cam.zoom.toFixed(2)}×</span>}
          <div className="cam-inset">
            <canvas ref={insetRef} className={shot?.kind === 'close' && on ? 'drag' : ''}
              onPointerDown={(e) => { if (shot?.kind === 'close') { e.currentTarget.setPointerCapture(e.pointerId); setBoxDrag(true); boxTo(e); } }}
              onPointerMove={(e) => { if (boxDrag) boxTo(e); }}
              onPointerUp={() => setBoxDrag(false)} />
            <small>{on ? 'Your video · what the camera sees' : 'Camera off: the whole video'}</small>
          </div>
        </div>
      </main>

      <aside className="style-side">
        <div className="insp-head"><h2>Camera</h2></div>
        <button type="button" className="btn primary wide" disabled={!on} onClick={() => rebuild(track.auto)}>Auto camera</button>
        <div className={'cam-auto' + (on ? '' : ' off')}>
          <div className="cam-opt"><span className="section-label">Cuts</span>
            <Seg3 value={track.auto.cuts} options={[['none', 'None'], ['bars', 'On bars'], ['often', 'Often']]} onChange={(v) => setAuto({ cuts: v })} /></div>
          <div className="cam-opt"><span className="section-label">Movement</span>
            <Seg3 value={track.auto.movement} options={[['calm', 'Calm'], ['normal', 'Normal'], ['lively', 'Lively']]} onChange={(v) => setAuto({ movement: v })} /></div>
          <div className="cam-opt"><span className="section-label">Punch on loud chords</span>
            <Seg3 value={track.auto.punch} options={[['off', 'Off'], ['some', 'Some'], ['lots', 'Lots']]} onChange={(v) => setAuto({ punch: v })} /></div>
          <p className="help">Changing these rebuilds the shots. <b>Ctrl+Z</b> brings your edit back.</p>
          <label className="toggle-row compact"><span>Fade in and out (black)</span>
            <input type="checkbox" checked={track.fadeEnds} onChange={(e) => setTrack({ fadeEnds: e.target.checked })} /></label>
        </div>

        {on && shot && (
          <div className="cam-shot-card">
            <div className="row"><h2>Shot {shotI + 1}</h2><span className="mono dim small-text">{fmtT(shot.start)} – {fmtT(shots[shotI + 1]?.start ?? duration)}</span></div>
            <Seg3 value={shot.kind} options={[['wide', 'Wide'], ['follow', 'Follow'], ['close', 'Close-up']]} onChange={(k) => setKind(shotI, k)} />
            {shot.kind === 'follow' && (
              <div className="ctl"><div className="ctl-head"><span>How close</span><span className="mono val">{shot.zoom.toFixed(2)}×</span></div>
                <Dial value={shot.zoom} min={0.7} max={1.8} step={0.05} label="How close" fmt={(v) => `${v.toFixed(2)}×`} base={1} onChange={(v) => setShot(shotI, { zoom: v })} /></div>
            )}
            {shot.kind === 'close' && (
              <div className="ctl"><div className="ctl-head"><span>Zoom</span><span className="mono val">{Math.min(shot.zoom, zMax).toFixed(2)}×</span></div>
                <Dial value={Math.min(shot.zoom, zMax)} min={1.1} max={Math.max(1.2, zMax)} step={0.05} label="Zoom" fmt={(v) => `${v.toFixed(1)}×`} base={2} onChange={(v) => setShot(shotI, { zoom: v })} /></div>
            )}
            <p className="help">
              {shot.kind === 'wide' ? 'The whole video.' : shot.kind === 'follow' ? 'Keeps your hands in frame, closer when they are together.' : 'A fixed close-up. Drag the box in the small picture to frame it.'}
            </p>
            <div className="row">
              <button type="button" className="btn small" onClick={addCut} title="Add a cut at the playhead (on the nearest beat)">Add a cut here</button>
              {shotI > 0 && <button type="button" className="link inline small-text" onClick={() => { setSelJoin(shotI); setSelShot(null); }}>Its transition: {shot.in === 'cut' ? 'Cut' : shot.in === 'dipBlack' ? 'Dip black' : shot.in === 'dipWhite' ? 'Dip white' : shot.in === 'glide' ? 'Glide' : 'Punch'}</button>}
            </div>
          </div>
        )}
        {!on && <p className="help">The camera is off: the video is exported as it is, in the size you pick on the Export step.</p>}
      </aside>

      <div className="score">
      <Transport ws={ws} loopHint="Loop" />
      {on ? (
        <CameraTimeline
          project={project} shots={shots} grid={grid} time={ws.time} duration={duration} zMax={zMax}
          selShot={shotI} selJoin={selJoin}
          onSeek={ws.seek}
          onSelectShot={(i) => { setSelShot(i); if (ws.time < shots[i].start || ws.time >= (shots[i + 1]?.start ?? duration)) ws.seek(shots[i].start + 0.05); }}
          onSelectJoin={(i) => { setSelJoin(i); if (i !== null) setSelShot(null); }}
          onMoveJoin={moveJoin}
          onTransition={setTransition}
          onRemoveJoin={removeJoin}
        />
      ) : <div className="style-timeline cam-timeline"><p className="help">Turn the camera on to edit shots and cuts on the beat.</p></div>}
      </div>
    </div>
  );
}
