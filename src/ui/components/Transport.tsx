// Left end of the score band on Style and Camera: the timecode, play, five-second jumps and loop.
import type { WS } from '../app/workspace';
import { trimRange } from '../../engine/project';
import Icon from './icons';

const fmtT = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };

export default function Transport({ ws, loopHint }: { ws: WS; loopHint?: string }) {
  const fps = ws.project?.video.fps;
  // the start and end of the part kept on the Video step
  const [a, b] = ws.project && ws.duration ? trimRange(ws.project, ws.duration) : [0, ws.duration];
  return (
    <div className="transport">
      <div className="timecode" aria-label="Playhead time">{fmtT(ws.time)}</div>
      <div className="timecode-of">of {fmtT(ws.duration)}{fps ? ` · ${Math.round(fps)} fps` : ''}</div>
      <div className="transport-row">
        <button type="button" className="btn icon ghost" onClick={() => ws.seek(a)} aria-label="Skip to the start" title="Skip to the start (Home)"><Icon name="toStart" /></button>
        <button type="button" className="play" onClick={ws.togglePlay} aria-label={ws.playing ? 'Pause' : 'Play'}>
          {ws.playing
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>}
          {ws.playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn icon ghost" onClick={() => ws.seek(Math.max(0, ws.time - 5))} aria-label="Back 5 seconds" title="Back 5 s">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 3v4h4" /><text x="12" y="15.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor" stroke="none">5</text></svg>
        </button>
        <button type="button" className="btn icon ghost" onClick={() => ws.seek(Math.min(ws.duration, ws.time + 5))} aria-label="Forward 5 seconds" title="Forward 5 s">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3v4h-4" /><text x="12" y="15.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor" stroke="none">5</text></svg>
        </button>
        <button type="button" className="btn icon ghost" onClick={() => ws.seek(Math.max(a, b - 0.05))} aria-label="Skip to the end" title="Skip to the end (End)"><Icon name="toEnd" /></button>
        <button type="button" className={'btn icon' + (ws.loop.on ? ' on' : ' ghost')} onClick={() => ws.setLoop({ ...ws.loop, on: !ws.loop.on })} aria-label="Loop" aria-pressed={ws.loop.on}
          title={loopHint ?? (ws.loop.range ? 'Loop the selected section' : 'Loop the whole video (drag on the timeline to loop a section)')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" /></svg>
        </button>
      </div>
      {ws.loop.on && <div className="loop-tag">{ws.loop.range ? `Looping ${fmtT(ws.loop.range[0])}–${fmtT(ws.loop.range[1])}` : 'Looping the whole video'}</div>}
    </div>
  );
}
