// Camera timeline: the notes for orientation, then the shots. Click a shot to edit it, click a join (the marker
// between two shots) to choose its transition, drag a join to move the cut (it snaps to beats).
import { useEffect, useRef, useState, type PointerEvent as PE } from 'react';
import { INK } from '../components/palette';
import Dial from '../components/Dial';
import type { CalibratedProject } from '../../engine/calibration';
import { pal } from '../../engine/project';
import type { BeatGrid } from '../../engine/audio/beats';
import { DEFAULT_DUR, Shot, Transition, TRANSITION_LABEL } from '../../engine/camera';
import Icon from '../components/icons';
import ValueEdit from '../components/ValueEdit';

const KIND_LABEL = { wide: 'Wide', follow: 'Follow', close: 'Close-up' } as const;
const fmt = (t: number, fine = false) => {
  const s = Math.max(0, t), m = Math.floor(s / 60);
  return fine ? `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}` : `${m}:${Math.floor(s - m * 60).toString().padStart(2, '0')}`;
};
const DUR_RANGE: Record<Transition, [number, number]> = { cut: [0, 0], glide: [0.3, 3], punch: [0.4, 2], dipBlack: [0.2, 2], dipWhite: [0.2, 2] };

export default function CameraTimeline(props: {
  project: CalibratedProject;
  shots: Shot[];
  grid: BeatGrid;
  time: number;
  duration: number;
  selShot: number;
  selJoin: number | null;
  onSeek: (t: number) => void;
  onSelectShot: (i: number) => void;
  onSelectJoin: (i: number | null) => void;
  onMoveJoin: (i: number, t: number, final: boolean) => void;
  onTransition: (i: number, tr: Transition, dur: number) => void;
  onRemoveJoin: (i: number) => void;
  /** the most a shot can zoom in this frame shape */
  zMax: number;
}) {
  const { project, shots, grid, time, duration, selShot, selJoin, onSeek, onSelectShot, onSelectJoin, onMoveJoin, onTransition, onRemoveJoin, zMax } = props;
  const dur = duration || 1;
  const lane = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(1000);
  const [drag, setDrag] = useState<{ i: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = lane.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the notes as a thin piano roll
  useEffect(() => {
    const cv = notesRef.current;
    if (!cv) return;
    const h = 34, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = INK.stage; g.fillRect(0, 0, w, h);
    let lo = 127, hi = 0;
    for (const n of project.notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
    const rows = Math.max(1, hi - lo + 1);
    for (const n of project.notes) {
      const c = pal(n.p);
      g.fillStyle = `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
      g.fillRect((n.s / dur) * w, h - 3 - ((n.p - lo + 0.5) / rows) * (h - 6), Math.max(1.5, ((n.e - n.s) / dur) * w), 1.6);
    }
  }, [project.notes, w, dur]);

  const X = (t: number) => (t / dur) * w;
  const tAt = (clientX: number) => {
    const r = lane.current!.getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur));
  };
  // press and drag on the ruler, the notes or the playhead to scrub through the take
  const scrub = {
    onPointerDown: (e: PE<HTMLElement>) => { e.currentTarget.setPointerCapture(e.pointerId); onSeek(tAt(e.clientX)); },
    onPointerMove: (e: PE<HTMLElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) onSeek(tAt(e.clientX)); },
  };
  const join = selJoin !== null ? shots[selJoin] : null;
  const onBeat = join ? grid.beats.some((b) => Math.abs(b - join.start) < 0.03) : false;
  const ticks: number[] = [];
  const step = dur <= 20 ? 2 : dur <= 60 ? 5 : dur <= 180 ? 15 : dur <= 600 ? 30 : 60;
  for (let s = 0; s <= dur + 1e-6; s += step) ticks.push(s);

  return (
    <section className="style-timeline cam-timeline">
      <div className="tl-head">
        <b>Camera</b>
        <span className="dim">Click a shot to change it · click a join to pick its transition · drag a join to move the cut (it snaps to beats)</span>
        <span className="spacer" />
        <span className="mono dim">{grid.bpm} BPM</span>
      </div>
      <div className="tl-body">
        <div className="tl-labels">
          <span style={{ height: 18 }} />
          <span style={{ height: 44 }} title="Every note in the clip, for finding your place"><b>Notes</b><small>higher = higher pitch</small></span>
          <span style={{ height: 62 }} title="The shots of your video and the transitions between them"><b>Shots</b><small>{shots.length} shot{shots.length === 1 ? '' : 's'}</small></span>
        </div>
        <div className="cam-lanes" ref={lane}>
          <div className="cam-ruler" {...scrub}>{ticks.map((s) => <span key={s} className={X(s) > w - 40 ? 'end' : ''} style={{ left: X(s) }}>{fmt(s)}</span>)}</div>
          <canvas ref={notesRef} className="cam-notes" {...scrub} />
          <div
            className="cam-shots"
            onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelectJoin(null); onSeek(tAt(e.clientX)); } }}
          >
            {shots.map((s, i) => {
              const a = X(s.start), b = X(shots[i + 1]?.start ?? dur);
              return (
                <button key={s.id} type="button" className={`cam-shot ${s.kind}` + (i === selShot && selJoin === null ? ' sel' : '')} style={{ left: a, width: Math.max(4, b - a) }}
                  onClick={() => { onSelectJoin(null); onSelectShot(i); }} title={`${KIND_LABEL[s.kind]} · ${fmt(s.start, true)} – ${fmt(shots[i + 1]?.start ?? dur, true)}`}>
                  <span>{KIND_LABEL[s.kind]}{s.kind === 'close' ? ` · ${Math.min(s.zoom, zMax).toFixed(1)}×` : s.kind === 'follow' && Math.abs(s.zoom - 1) > 0.01 ? ` · ${s.zoom.toFixed(1)}×` : ''}</span>
                </button>
              );
            })}
            {shots.map((s, i) => i > 0 && (
              <div key={'j' + s.id} className={`cam-join ${s.in}` + (selJoin === i ? ' on' : '')} style={{ left: X(s.start) }}
                title={`${TRANSITION_LABEL[s.in]} at ${fmt(s.start, true)}`}
                onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag({ i, moved: false }); onSelectJoin(i); }}
                onPointerMove={(e) => { if (drag?.i === i) { setDrag({ i, moved: true }); onMoveJoin(i, tAt(e.clientX), false); } }}
                onPointerUp={(e) => { if (drag?.i === i && drag.moved) onMoveJoin(i, tAt(e.clientX), true); setDrag(null); }}>
                <b />
              </div>
            ))}
            {grid.beats.map((b, k) => <i key={k} className={'cam-beat' + (grid.bars.some((x) => Math.abs(x - b) < 1e-3) ? ' bar' : '')} style={{ left: X(b) }} />)}
            {join && selJoin !== null && (
              <div className="cam-pop" style={{ left: Math.min(Math.max(0, X(join.start) - 210), Math.max(0, w - 440)) }} onPointerDown={(e) => e.stopPropagation()}>
                <small>Transition at {fmt(join.start, true)}{onBeat ? ' · on the beat' : ''}</small>
                <div className="seg full">
                  {(Object.keys(TRANSITION_LABEL) as Transition[]).map((tr) => (
                    <button key={tr} type="button" className={join.in === tr ? 'on' : ''} onClick={() => onTransition(selJoin, tr, join.in === tr ? join.inDur : DEFAULT_DUR[tr])}>{TRANSITION_LABEL[tr]}</button>
                  ))}
                </div>
                {join.in !== 'cut' && (
                  <div className="ctl">
                    <div className="ctl-head"><span>Length</span><ValueEdit value={join.inDur} min={DUR_RANGE[join.in][0]} max={DUR_RANGE[join.in][1]} step={0.05} fmt={(v) => `${v.toFixed(2)} s`} label="Transition length" onChange={(v) => onTransition(selJoin, join.in, v)} /></div>
                    <Dial value={join.inDur} min={DUR_RANGE[join.in][0]} max={DUR_RANGE[join.in][1]} step={0.05} label="Transition length" fmt={(v) => `${v.toFixed(2)} s`} base={DEFAULT_DUR[join.in]}
                      onChange={(v) => onTransition(selJoin, join.in, v)} />
                  </div>
                )}
                <div className="row">
                  <small>{join.in === 'cut' ? 'Jumps straight to the next shot.' : join.in === 'glide' ? 'Moves smoothly into the next framing.' : join.in === 'punch' ? 'A quick push in, then settles back.' : `Fades to ${join.in === 'dipWhite' ? 'white' : 'black'}, then into the next shot.`}</small>
                  <button type="button" className="link inline small-text danger-text" onClick={() => onRemoveJoin(selJoin)}><Icon name="remove" size={13} />Remove this cut</button>
                </div>
              </div>
            )}
          </div>
          <div className="cam-playhead" style={{ left: X(time) }} {...scrub} title="Drag to scrub" />
        </div>
      </div>
    </section>
  );
}
