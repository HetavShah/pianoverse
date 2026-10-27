// Audio → Sound: how the sound starts and ends (fade, open up, swell; cut, fade, muffle, ring out), its volume,
// bass and treble, a concert hall around it, and evening out the loudness for social media. Heard live as you change
// it (ui/app/useSound.ts) and rendered the same way into the export.
import { ReactNode, useEffect } from 'react';
import Dial from '../components/Dial';
import { DEFAULT_SOUND, evenGainDb, PEDAL_MODES, roomOf, ROOMS, Sound, SOUND_ENDS, SOUND_SOURCES, SOUND_STARTS, TARGET_LUFS, transitionLengths } from '../../engine/audio/sound';
import { trimRange } from '../../engine/project';
import type { WS } from '../app/workspace';
import SoundWave from './SoundWave';
import MiniTransport from '../components/MiniTransport';
import Icon from '../components/icons';
import ValueEdit from '../components/ValueEdit';
import FoldSection from '../components/FoldSection';

type Ctl = { key: 'volume' | 'bass' | 'treble' | 'hall' | 'blend'; label: string; min: number; max: number; step: number; fmt: (v: number) => string; hint?: string };
const db = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} dB`;
const VOLUME: Ctl = { key: 'volume', label: 'Volume', min: -12, max: 12, step: 0.5, fmt: db };
const EQ: Ctl[] = [
  { key: 'bass', label: 'Bass', min: -12, max: 12, step: 0.5, fmt: db, hint: 'Warmth and weight of the low notes' },
  { key: 'treble', label: 'Treble', min: -12, max: 12, step: 0.5, fmt: db, hint: 'Brightness and sparkle of the high notes' },
];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const ROOM_AMOUNT: Ctl = { key: 'hall', label: 'Amount', min: 0, max: 1, step: 0.01, fmt: (v) => (v ? `${Math.round(v * 100)}%` : 'Off') };
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
  const wave = { audio: live.sourceAudio === undefined ? ws.notes.audio : live.sourceAudio, waitText: s.source === 'video' ? undefined : 'Playing your notes on the piano…',
    error: s.source === 'video' ? ws.notes.audioError : live.error, onRetry: s.source === 'video' ? ws.notes.prepareAudio : undefined, sound: s, span, tail: live.tail, measuredLufs: live.measuredLufs, time: ws.time, onSeek: ws.seek };
  const startView: [number, number] = s.start === 'swell'
    ? [span[0] - live.lead - 0.2, Math.min(span[1], span[0] + 3)]
    : [span[0], Math.min(span[1], span[0] + Math.max(6, lens.start + 2))];
  const endView: [number, number] = [Math.max(span[0], span[1] - Math.max(4, (s.end === 'ring' ? 0 : lens.end) + 2.5)), span[1] + live.tail + 0.4];
  const startInfo = SOUND_STARTS.find((o) => o.id === s.start)!;
  const sourceInfo = SOUND_SOURCES.find((o) => o.id === s.source)!;
  const room = roomOf(s.room);
  const notes = project.notes ?? [];
  const hasPedal = notes.some((n) => n.h !== undefined && n.h > n.e + 0.02);
  // a recorded piano is close and dry: picking it (or a room) with no room on puts it in one
  const pickSource = (source: Sound['source']) => set({ source, ...(source !== 'video' && s.hall < 0.01 ? { hall: 0.35, room: s.room } : {}) });
  const pickRoom = (r: Sound['room']) => set({ room: r, ...(s.hall < 0.01 ? { hall: 0.35 } : {}) });
  const load = live.pianoLoad;
  const endInfo = SOUND_ENDS.find((o) => o.id === s.end)!;

  return (
    <div className="page sound-page">
      <div className="page-main">
        {head}
        <p className="sub">Choose what plays, how it comes in and out, and the space around it. Your original file stays untouched.</p>

        <div className="sound-card">
          <div className="sound-ends">
            <div className="sound-end">
              <div className="sound-end-head">
                <span><span className="dim">Intro</span> <b>{startInfo.label}</b>{s.start !== 'none' && <span className="mono dim"> · {secs(lens.start)}</span>}</span>
                <button type="button" className="hear" disabled={s.start === 'swell' && !live.swellReady} onClick={() => (s.start === 'swell' ? live.hearSwell(() => { if (ws.playing) ws.togglePlay(); ws.seek(span[0]); }, () => { if (ws.videoEl.current?.paused) ws.togglePlay(); }) : listen(span[0]))}
                  aria-label="Hear the start" title={s.start === 'swell' && !live.swellReady ? 'Making the swell…' : 'Hear the start'}><Icon name="play" size={14} /></button>
              </div>
              <SoundWave {...wave} view={startView} className="zoom" />
            </div>
            <div className="sound-end">
              <div className="sound-end-head">
                <span><span className="dim">Outro</span> <b>{endInfo.label}</b>{s.end !== 'cut' && <span className="mono dim"> · {secs(lens.end)}</span>}</span>
                <button type="button" className="hear" onClick={() => listen(endView[0])} aria-label="Hear the end" title="Hear the end"><Icon name="play" size={14} /></button>
              </div>
              <SoundWave {...wave} view={endView} className="zoom" />
            </div>
          </div>
          <SoundWave {...wave} className="overview" />
          <MiniTransport ws={ws}>
            <button type="button" className={'btn small' + (live.bypass ? ' on' : '')} disabled={!live.active}
              onPointerDown={() => live.setBypass(true)} onPointerUp={() => live.setBypass(false)} onPointerLeave={() => live.setBypass(false)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); live.setBypass(true); } }}
              onKeyUp={() => live.setBypass(false)}
              title="Hold to hear the sound as recorded, without your settings"><Icon name="compareSound" />Hold for original</button>
          </MiniTransport>
          <div className="sound-legend small-text">
            <span><i className="sw-orig" /> {s.source === 'video' ? 'As recorded' : s.source === 'piano' ? 'The piano' : 'The piano and the video'}</span>
            <span><i className="sw-shaped" /> With your settings</span>
            {s.start === 'swell' && <span><i className="sw-riser" /> Swell</span>}
          </div>
        </div>

        <div className="stat-cards">
          <div className="stat"><span>Source</span><b>{sourceInfo.label}</b></div>
          <div className="stat"><span>Loudness</span><b>{s.even ? (live.measuredLufs === null ? '…' : `${TARGET_LUFS} LUFS`) : 'As recorded'}</b></div>
          <div className="stat"><span>Reverb</span><b>{s.hall ? room.label : 'Off'}</b></div>
          <div className="stat"><span>Export length</span><b>{fmtT(span[1] - span[0] + live.lead + live.tail)}</b></div>
        </div>
        {live.error && <div className="banner bad"><b>{live.error}</b></div>}
      </div>

      <aside className="page-side sound-side">
        <h2>Sound</h2>

        <FoldSection first title="Source" note="What plays under your video." changed={s.source !== 'video'}>
          <div className="light-presets">
            {SOUND_SOURCES.map((o) => (
              <button key={o.id} type="button" className={'choice' + (s.source === o.id ? ' on' : '')} onClick={() => pickSource(o.id)} title={o.hint}>
                <span className="radio" /><b>{o.label}</b>
              </button>
            ))}
          </div>
          <small className="help">{sourceInfo.hint}</small>
          {s.source !== 'video' && (<>
            {!notes.length && <small className="help warn-text">There are no notes yet. Add them on the Notes and sync tab.</small>}
            {load && (
              <div className="piano-load" role="status">
                <span>{load.detail || 'Getting the piano ready'}{load.total > 0 ? ` · ${Math.round((100 * load.done) / load.total)}%` : '…'}</span>
                {load.total > 0 && <div className="bar"><div style={{ width: `${(100 * load.done) / load.total}%` }} /></div>}
              </div>
            )}
            {s.source === 'both' && (
              <div className="ctl">
                <div className="ctl-head"><span>Piano level</span>
                  <ValueEdit value={s.blend} min={0} max={1} step={0.01} fmt={pct} label="Piano level" onChange={(v) => set({ blend: v })} /></div>
                <Dial value={s.blend} min={0} max={1} step={0.01} label="Piano level" fmt={pct} base={DEFAULT_SOUND.blend} onChange={(v) => set({ blend: v })} />
                <small className="help">How much of the mix is piano. The rest is your video's sound.</small>
              </div>
            )}
            <div className="ctl">
              <span className="sub-label">Sustain pedal</span>
              <div className="seg full">
                {PEDAL_MODES.map((m) => <button key={m.id} type="button" className={s.pedal === m.id ? 'on' : ''} onClick={() => set({ pedal: m.id })} title={m.hint}>{m.label}</button>)}
              </div>
              <small className="help">{PEDAL_MODES.find((m) => m.id === s.pedal)!.hint}{s.pedal === 'played' && !hasPedal ? ' (your notes have no pedal, so notes stop when released)' : ''}.</small>
            </div>
            <small className="help credit">Piano: Salamander Grand by Alexander Holm, CC-BY 3.0</small>
          </>)}
        </FoldSection>

        <FoldSection title="Intro & outro" note="How the sound comes in at the start and leaves at the end." changed={s.start !== 'none' || s.end !== 'cut'}>
          <span className="sub-label">Intro</span>
          <div className="light-presets">
            {SOUND_STARTS.map((o) => (
              <button key={o.id} type="button" className={'choice' + (s.start === o.id ? ' on' : '')} onClick={() => set({ start: o.id })} title={o.hint}>
                <span className="radio" /><b>{o.label}</b>
              </button>
            ))}
          </div>
          <small className="help">{startInfo.hint}</small>
          {s.start !== 'none' && (
            <div className="ctl">
              <div className="ctl-head"><span>Length</span><ValueEdit value={s.startLen} min={0.5} max={8} step={0.1} fmt={secs} label="Intro length" onChange={(v) => set({ startLen: v })} /></div>
              <Dial value={s.startLen} min={0.5} max={8} step={0.1} label="Intro length" fmt={secs} base={DEFAULT_SOUND.startLen} onChange={(v) => set({ startLen: v })} />
              {s.start === 'swell' && <small className="help">{project.titles?.intro?.on ? 'It plays over your opening title.' : 'The picture fades in from black while it plays.'}</small>}
            </div>
          )}
          <span className="sub-label">Outro</span>
          <div className="light-presets">
            {SOUND_ENDS.map((o) => (
              <button key={o.id} type="button" className={'choice' + (s.end === o.id ? ' on' : '')} onClick={() => set({ end: o.id })} title={o.hint}>
                <span className="radio" /><b>{o.label}</b>
              </button>
            ))}
          </div>
          <small className="help">{endInfo.hint}</small>
          {s.end !== 'cut' && (
            <div className="ctl">
              <div className="ctl-head"><span>{s.end === 'ring' ? 'Rings for' : 'Length'}</span><ValueEdit value={s.endLen} min={0.5} max={8} step={0.1} fmt={secs} label="Outro length" onChange={(v) => set({ endLen: v })} /></div>
              <Dial value={s.endLen} min={0.5} max={8} step={0.1} label="Outro length" fmt={secs} base={DEFAULT_SOUND.endLen} onChange={(v) => set({ endLen: v })} />
            </div>
          )}
        </FoldSection>

        <FoldSection title="Reverb" note="The space the piano plays in." changed={s.hall > 0.001}>
          <div className="light-presets">
            {ROOMS.map((r) => (
              <button key={r.id} type="button" className={'choice' + (s.hall > 0.001 && s.room === r.id ? ' on' : '')} onClick={() => pickRoom(r.id)} title={r.hint}>
                <span className="radio" /><b>{r.label}</b>
              </button>
            ))}
          </div>
          <small className="help">{s.hall > 0.001 ? room.hint : 'Off: the sound as it is, with no added space.'}</small>
          {dial(ROOM_AMOUNT)}
        </FoldSection>

        <FoldSection title="EQ" note="Shape the low and high end." changed={!!s.bass || !!s.treble} open={!!s.bass || !!s.treble}>
          {EQ.map(dial)}
        </FoldSection>

        <FoldSection title="Loudness" note="How loud the finished video plays." changed={!!s.volume || s.even}>
          {dial(VOLUME)}
          <label className="toggle-row">
            <span><b>Match social media</b><small>Sets it to {TARGET_LUFS} LUFS, the level Instagram, TikTok and YouTube play at, so it's never turned down or too quiet.</small></span>
            <input type="checkbox" checked={s.even} onChange={(e) => set({ even: e.target.checked })} aria-label="Match social media loudness" />
          </label>
          {s.even && (
            <small className="help mono">{live.measuring ? 'Measuring…' : live.measuredLufs !== null && Number.isFinite(live.measuredLufs)
              ? `Measured ${live.measuredLufs.toFixed(1)} LUFS → ${evenDb >= 0 ? '+' : '−'}${Math.abs(evenDb).toFixed(1)} dB` : ''}</small>
          )}
        </FoldSection>

        {live.active && <button type="button" className="btn small ghost" onClick={() => ws.setProject({ ...project, sound: undefined })}><Icon name="reset" />Reset all sound settings</button>}
      </aside>

      <footer className="page-foot">
        <button type="button" className="btn" onClick={() => ws.goStep('video')}><Icon name="back" />Back</button>
        <button type="button" className="btn primary" onClick={() => ws.goStep('calibrate')}>Continue to calibration <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h9M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg></button>
      </footer>
    </div>
  );
}
