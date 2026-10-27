// The small transport over a waveform or a trim bar (Video, Audio): play / pause, where the playhead is, five-second
// jumps and, optionally, loop. The big one in the score band of Style, Light and Camera is Transport.tsx.
import type { ReactNode } from 'react';
import type { WS } from '../app/workspace';
import Icon from './icons';
import { trimRange } from '../../engine/project';

const fmtT = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };

export default function MiniTransport({ ws, loop = false, children }: { ws: WS; loop?: boolean; children?: ReactNode }) {
  // the start and end of the part kept on the Video step
  const [a, b] = ws.project && ws.duration ? trimRange(ws.project, ws.duration) : [0, ws.duration];
  return (
    <div className="mini-transport">
      <button type="button" className="btn icon ghost" onClick={() => ws.seek(a)} aria-label="Skip to the start" title="Skip to the start (Home)"><Icon name="toStart" /></button>
      <button type="button" className="play-round" onClick={ws.togglePlay} aria-label={ws.playing ? 'Pause' : 'Play'} title={ws.playing ? 'Pause (Space)' : 'Play (Space)'}>
        <Icon name={ws.playing ? 'pause' : 'play'} size={16} />
      </button>
      <button type="button" className="btn icon ghost" onClick={() => ws.seek(Math.max(0, ws.time - 5))} aria-label="Back 5 seconds" title="Back 5 s">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 3v4h4" /><text x="12" y="15.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor" stroke="none">5</text></svg>
      </button>
      <button type="button" className="btn icon ghost" onClick={() => ws.seek(Math.min(ws.duration, ws.time + 5))} aria-label="Forward 5 seconds" title="Forward 5 s">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3v4h-4" /><text x="12" y="15.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor" stroke="none">5</text></svg>
      </button>
      <button type="button" className="btn icon ghost" onClick={() => ws.seek(Math.max(a, b - 0.05))} aria-label="Skip to the end" title="Skip to the end (End)"><Icon name="toEnd" /></button>
      {loop && (
        <button type="button" className={'btn icon' + (ws.loop.on ? ' on' : ' ghost')} onClick={() => ws.setLoop({ ...ws.loop, on: !ws.loop.on })} aria-label="Loop" aria-pressed={ws.loop.on} title="Loop">
          <Icon name="loop" />
        </button>
      )}
      <span className="mt-time mono" title={b < ws.duration - 0.05 || a > 0.05 ? `The part kept on Video: ${fmtT(a)} to ${fmtT(b)}` : undefined}><b>{fmtT(ws.time)}</b> / {fmtT(b)}</span>
      {children && <span className="spacer" />}
      {children}
    </div>
  );
}
