// Audio → Sound: how the sound starts and ends (fade, open up, swell; cut, fade, muffle, ring out), its volume,
// bass and treble, a concert hall around it, and evening out the loudness for social media. Heard live as you change
// it (ui/app/useSound.ts) and rendered the same way into the export.
import { ReactNode, useEffect } from 'react';
import Dial from '../components/Dial';
import { DEFAULT_SOUND, evenGainDb, Sound, SOUND_ENDS, SOUND_STARTS, TARGET_LUFS, transitionLengths } from '../../engine/audio/sound';
import { trimRange } from '../../engine/project';
import type { WS } from '../app/workspace';
import SoundWave from './SoundWave';
import MiniTransport from '../components/MiniTransport';
import Icon from '../components/icons';
import ValueEdit from '../components/ValueEdit';

type Ctl = { key: 'volume' | 'bass' | 'treble' | 'hall'; label: string; min: number; max: number; step: number; fmt: (v: number) => string; hint?: string };
const db = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} dB`;
const TONE: Ctl[] = [
  { key: 'volume', label: 'Volume', min: -12, max: 12, step: 0.5, fmt: db },
  { key: 'bass', label: 'Bass', min: -12, max: 12, step: 0.5, fmt: db, hint: 'Warmth of the low notes' },
  { key: 'treble', label: 'Treble', min: -12, max: 12, step: 0.5, fmt: db, hint: 'Sparkle of the high notes' },
  { key: 'hall', label: 'Concert hall', min: 0, max: 1, step: 0.01, fmt: (v) => (v ? `${Math.round(v * 100)}%` : 'Off'), hint: 'Places the piano in a big room' },
];
const secs = (v: number) => `${v.toFixed(1)} s`;
const fmtT = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };

export default function SoundStep({ ws, head }: { ws: WS; head: ReactNode }) {
  const project = ws.project!;
  const live = ws.sound;
  const s = live.sound;
  const duration = ws.duration || project.video.frames / (project.video.fps || 30);
  const span = trimRange(project, duration);
  const lens = transitionLengths(s, span);
  useEffect(() => { ws.notes.prepareAudio(); }, [ws.notes.prepareAudio]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Sound>) => ws.setProject({ ...project, sound: { ...s, ...patch } });
  const listen = (t: number) => { ws.seek(t); if (!ws.playing) ws.togglePlay(); };
  const dial = (c: Ctl) => (
    <div className="ctl" key={c.key}>
      <div className="ctl-head">
        <span>{c.label}</span>
        {s[c.key] !== DEFAULT_SOUND[c.key] && <button type="button" className="reset" onClick={() => set({ [c.key]: DEFAULT_SOUND[c.key] })} aria-label={`Reset ${c.label}`} title="Reset"><Icon name="reset" size={13} /></button>}
        <ValueEdit value={s[c.key]} min={c.min} max={c.max} step={c.step} fmt={c.fmt} label={c.label} onChange={(v) => set({ [c.key]: v })} />
      </div>
      <Dial value={s[c.key]} min={c.min} max={c.max} step={c.step} label={c.label} fmt={c.fmt} base={DEFAULT_SOUND[c.key]} onChange={(v) => set({ [c.key]: v })} />
      {c.hint && <small className="help">{c.hint}</small>}
    </div>
  );
  const evenDb = evenGainDb(s, live.measuredLufs);
  // the two close-ups: a few seconds around each end
  const wave = { audio: ws.notes.audio, sound: s, span, tail: live.tail, measuredLufs: live.measuredLufs, time: ws.time, onSeek: ws.seek };
  const startView: [number, number] = s.start === 'swell'
    ? [span[0] - live.lead - 0.2, Math.min(span[1], span[0] + 3)]
    : [span[0], Math.min(span[1], span[0] + Math.max(6, lens.start + 2))];
  const endView: [number, number] = [Math.max(span[0], span[1] - Math.max(4, (s.end === 'ring' ? 0 : lens.end) + 2.5)), span[1] + live.tail + 0.4];
  const startInfo = SOUND_STARTS.find((o) => o.id === s.start)!;
  const endInfo = SOUND_ENDS.find((o) => o.id === s.end)!;

  return (
    <div className="page sound-page">
      <div className="page-main">
        {head}
        <p className="sub">Shape how the sound starts and ends, and how it sounds. Your video file isn't changed.</p>

        <div className="sound-card">
          <MiniTransport ws={ws}>
            <button type="button" className={'btn small' + (live.bypass ? ' on' : '')} disabled={!live.active}
              onPointerDown={() => live.setBypass(true)} onPointerUp={() => live.setBypass(false)} onPointerLeave={() => live.setBypass(false)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); live.setBypass(true); } }}
              onKeyUp={() => live.setBypass(false)}
              title="Hold to hear the sound as recorded, without your settings"><Icon name="compareSound" />Hold for original</button>
          </MiniTransport>
          <div className="sound-ends">
            <div className="sound-end">
              <div className="sound-end-head">
                <span><span className="dim">Start</span> <b>{startInfo.label}</b>{s.start !== 'none' && <span className="mono dim"> · {secs(lens.start)}</span>}</span>
                <button type="button" className="hear" disabled={s.start === 'swell' && !live.swellReady} onClick={() => (s.start === 'swell' ? live.hearSwell(() => { if (ws.playing) ws.togglePlay(); ws.seek(span[0]); }, () => { if (ws.videoEl.current?.paused) ws.togglePlay(); }) : listen(span[0]))}
                  aria-label="Hear the start" title={s.start === 'swell' && !live.swellReady ? 'Making the swell…' : 'Hear the start'}><Icon name="play" size={14} /></button>
              </div>
              <SoundWave {...wave} view={startView} className="zoom" />
            </div>
            <div className="sound-end">
              <div className="sound-end-head">
                <span><span className="dim">End</span> <b>{endInfo.label}</b>{s.end !== 'cut' && <span className="mono dim"> · {secs(lens.end)}</span>}</span>
                <button type="button" className="hear" onClick={() => listen(endView[0])} aria-label="Hear the end" title="Hear the end"><Icon name="play" size={14} /></button>
              </div>
              <SoundWave {...wave} view={endView} className="zoom" />
            </div>
          </div>
          <SoundWave {...wave} className="overview" />
          <div className="sound-legend small-text">
            <span><i className="sw-orig" /> As recorded</span>
            <span><i className="sw-shaped" /> With your settings</span>
            {s.start === 'swell' && <span><i className="sw-riser" /> Swell</span>}
          </div>
        </div>

        <div className="stat-cards">
          <div className="stat"><span>Loudness</span><b>{s.even ? (live.measuredLufs === null ? '…' : `${TARGET_LUFS} LUFS`) : 'As recorded'}</b></div>
          <div className="stat"><span>Volume</span><b>{db(s.volume)}</b></div>
          <div className="stat"><span>Concert hall</span><b>{s.hall ? `${Math.round(s.hall * 100)}%` : 'Off'}</b></div>
          <div className="stat"><span>Export length</span><b>{fmtT(span[1] - span[0] + live.lead + live.tail)}</b></div>
        </div>
        {live.error && <div className="banner bad"><b>{live.error}</b></div>}
      </div>

      <aside className="page-side">
        <h2>Sound</h2>
        <div className="ctl-section first">
          <span className="section-label">Start</span>
          <div className="light-presets">
            {SOUND_STARTS.map((o) => (
              <button key={o.id} type="button" className={'choice' + (s.start === o.id ? ' on' : '')} onClick={() => set({ start: o.id })} title={o.hint}>
                <span className="radio" /><b>{o.label}</b>
              </button>
            ))}
          </div>
          <small className="help">{startInfo.hint}.</small>
          {s.start !== 'none' && (
            <div className="ctl">
              <div className="ctl-head"><span>Length</span><ValueEdit value={s.startLen} min={0.5} max={8} step={0.1} fmt={secs} label="Start length" onChange={(v) => set({ startLen: v })} /></div>
              <Dial value={s.startLen} min={0.5} max={8} step={0.1} label="Start length" fmt={secs} base={DEFAULT_SOUND.startLen} onChange={(v) => set({ startLen: v })} />
              {s.start === 'swell' && <small className="help">{project.titles?.intro?.on ? 'It plays over your opening title.' : 'The picture fades in from black meanwhile.'}</small>}
            </div>
          )}
        </div>

        <div className="ctl-section">
          <span className="section-label">End</span>
          <div className="light-presets">
            {SOUND_ENDS.map((o) => (
              <button key={o.id} type="button" className={'choice' + (s.end === o.id ? ' on' : '')} onClick={() => set({ end: o.id })} title={o.hint}>
                <span className="radio" /><b>{o.label}</b>
              </button>
            ))}
          </div>
          <small className="help">{endInfo.hint}.</small>
          {s.end !== 'cut' && (
            <div className="ctl">
              <div className="ctl-head"><span>{s.end === 'ring' ? 'Rings for' : 'Length'}</span><ValueEdit value={s.endLen} min={0.5} max={8} step={0.1} fmt={secs} label="End length" onChange={(v) => set({ endLen: v })} /></div>
              <Dial value={s.endLen} min={0.5} max={8} step={0.1} label="End length" fmt={secs} base={DEFAULT_SOUND.endLen} onChange={(v) => set({ endLen: v })} />
            </div>
          )}
        </div>

        <div className="ctl-section">
          <span className="section-label">Tone</span>
          {TONE.map(dial)}
        </div>

        <div className="ctl-section">
          <label className="toggle-row">
            <span><b>Even out the loudness</b><small>Brings it to {TARGET_LUFS} LUFS, the level Instagram, TikTok and YouTube play at, so it isn't turned down or sounds quiet next to other videos.</small></span>
            <input type="checkbox" checked={s.even} onChange={(e) => set({ even: e.target.checked })} />
          </label>
          {s.even && (
            <small className="help mono">{live.measuring ? 'Measuring…' : live.measuredLufs !== null && Number.isFinite(live.measuredLufs)
              ? `Recorded at ${live.measuredLufs.toFixed(1)} LUFS → ${evenDb >= 0 ? '+' : '−'}${Math.abs(evenDb).toFixed(1)} dB` : ''}</small>
          )}
        </div>

        {live.active && <button type="button" className="btn small ghost" onClick={() => ws.setProject({ ...project, sound: undefined })}><Icon name="reset" />Back to the sound as recorded</button>}
      </aside>

      <footer className="page-foot">
        <button type="button" className="btn" onClick={() => ws.goStep('video')}><Icon name="back" />Back</button>
        <button type="button" className="btn primary" onClick={() => ws.goStep('calibrate')}>Continue to calibration <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h9M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg></button>
      </footer>
    </div>
  );
}
