// Shape sections: parts of the video where the notes' particles trace a shape instead of the normal
// particle style. Listed below the particle controls; the selected one can be edited here and
// resized on the timeline.
import type { ParticleScene } from '../../engine/project';
import ShapePicker, { BUILT_IN_SHAPES } from './ShapePicker';
import Dial from '../components/Dial';
import Icon from '../components/icons';
import ValueEdit from '../components/ValueEdit';

const fmt = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };
const newId = () => 's' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
export const sceneName = (sc: ParticleScene) => BUILT_IN_SHAPES.find((s) => s.id === sc.shape)?.label ?? 'Your shape';

/** a new section, kept inside the video */
export function makeScene(start: number, end: number, duration: number): ParticleScene {
  const s = Math.max(0, Math.min(start, Math.max(0, duration - 1)));
  return { id: newId(), start: s, end: Math.max(s + 1, Math.min(end, duration || end)), shape: 'heart', size: 1, dir: 'cw' };
}

export default function ShapeSections(props: {
  scenes: ParticleScene[];
  setScenes: (s: ParticleScene[]) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
  duration: number;
  time: number;
  range: [number, number] | null;
  seek: (t: number) => void;
}) {
  const { scenes, setScenes, selected, setSelected, duration, time, range, seek } = props;
  const sel = scenes.find((s) => s.id === selected) ?? null;
  const add = (a: number, b: number) => {
    const sc = makeScene(a, b, duration);
    setScenes([...scenes, sc].sort((x, y) => x.start - y.start));
    setSelected(sc.id);
    seek(sc.start);
  };
  const edit = (patch: Partial<ParticleScene>) => sel && setScenes(scenes.map((s) => (s.id === sel.id ? { ...s, ...patch } : s)));
  const num = (label: string, v: number, set: (n: number) => void) => (
    <label className="sec-time"><span>{label}</span>
      <input type="number" step={0.5} min={0} max={duration || undefined} value={Number(v.toFixed(1))} onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))} /> s
    </label>
  );
  return (
    <div className="ctl-section">
      <span className="section-label">Shape sections</span>
      <p className="help">Notes played inside a section also send sparks that trace a shape. The particle style below plays everywhere.</p>
      {scenes.length > 0 && (
        <div className="sec-list">
          {scenes.map((s) => (
            <button key={s.id} type="button" className={'sec-item' + (s.id === selected ? ' on' : '')} onClick={() => { setSelected(s.id === selected ? null : s.id); seek(s.start); }}>
              <span className="sec-dot" /> {sceneName(s)} <span className="mono dim">{fmt(s.start)} – {fmt(s.end)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="sec-add">
        <button type="button" className="btn small ghost" onClick={() => add(5, 25)} disabled={duration < 8}>+ At the start</button>
        <button type="button" className="btn small ghost" onClick={() => add(Math.max(0, duration - 22), duration - 1)} disabled={duration < 8}>+ At the end</button>
        {range
          ? <button type="button" className="btn small ghost" onClick={() => add(range[0], range[1])}>+ Over the selected part</button>
          : <button type="button" className="btn small ghost" onClick={() => add(time, time + 20)}>+ From here</button>}
      </div>
      {sel && (
        <div className="sec-edit">
          <div className="row sec-times">
            {num('From', sel.start, (n) => edit({ start: Math.min(n, sel.end - 1) }))}
            {num('To', sel.end, (n) => edit({ end: Math.max(n, sel.start + 1) }))}
          </div>
          {range && <button type="button" className="link" onClick={() => edit({ start: range[0], end: range[1] })}>Use the selected part of the timeline</button>}
          <ShapePicker value={sel.shape} onPick={(shape) => edit({ shape })} />
          <div className="ctl">
            <div className="ctl-head"><span>Size</span><ValueEdit value={sel.size} min={0.3} max={1.6} step={0.01} fmt={(v) => `${v.toFixed(2)}×`} label="Shape size" onChange={(v) => edit({ size: v })} /></div>
            <Dial value={sel.size} min={0.3} max={1.6} step={0.01} label="Shape size" fmt={(v) => `${v.toFixed(2)}×`} base={1} onChange={(v) => edit({ size: v })} />
          </div>
          <div className="ctl">
            <div className="ctl-head"><span>Direction</span></div>
            <div className="seg full">
              <button type="button" className={sel.dir === 'cw' ? 'on' : ''} onClick={() => edit({ dir: 'cw' })}><Icon name="clockwise" />Clockwise</button>
              <button type="button" className={sel.dir === 'ccw' ? 'on' : ''} onClick={() => edit({ dir: 'ccw' })}><Icon name="anticlockwise" />Anticlockwise</button>
            </div>
          </div>
          <label className="toggle-row compact ctl">
            <span>Keep the normal particles too</span>
            <input type="checkbox" checked={sel.keep !== false} onChange={(e) => edit({ keep: e.target.checked })} />
          </label>
          <button type="button" className="btn small ghost danger-text" onClick={() => { setScenes(scenes.filter((s) => s.id !== sel.id)); setSelected(null); }}><Icon name="remove" />Remove this section</button>
        </div>
      )}
    </div>
  );
}
