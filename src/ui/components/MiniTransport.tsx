// The small transport under a waveform, a trim bar or a frame (Video, Audio, Calibrate): skip to the start or end,
// five-second jumps and play / pause in the middle, the time on the left, a page's own extras on the right.
// Transport.tsx puts it under the timeline of Style, Light and Camera, with looping.
import type { ReactNode } from 'react';
import type { WS } from '../app/workspace';
import Icon from './icons';
import PlayPause from './PlayPause';
import { trimRange } from '../../engine/project';

const fmtT = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };

export default function MiniTransport({ ws, loop = false, loopHint = 'Loop', children }: { ws: WS; loop?: boolean; loopHint?: string; children?: ReactNode }) {
  // the start and end of the part kept on the Video step
  const [a, b] = ws.project && ws.duration ? trimRange(ws.project, ws.duration) : [0, ws.duration];
  const jump5 = (back: boolean) => (
    <button type="button" className="btn icon ghost" onClick={() => ws.seek(back ? Math.max(a, ws.time - 5) : Math.min(b, ws.time + 5))}
      aria-label={back ? 'Back 5 seconds' : 'Forward 5 seconds'} title={back ? 'Back 5 s' : 'Forward 5 s'}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        {back ? <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 3v4h4" /></> : <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3v4h-4" /></>}
        <text x="12" y="15.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor" stroke="none">5</text>
      </svg>
    </button>
  );
  // the time on the left, the controls centred under what they play, the page's own extras and looping on the right
  return (
    <div className="mini-transport">
      <span className="mt-time mono" aria-label="Playhead time" title={b < ws.duration - 0.05 || a > 0.05 ? `The part kept on Video: ${fmtT(a)} to ${fmtT(b)}` : undefined}><b>{fmtT(ws.time)}</b> / {fmtT(b)}</span>
      <div className="mt-center">
        <button type="button" className="btn icon ghost" onClick={() => ws.seek(a)} aria-label="Skip to the start" title="Skip to the start (Home)"><Icon name="toStart" /></button>
        {jump5(true)}
        <button type="button" className="play-round" onClick={ws.togglePlay} aria-label={ws.playing ? 'Pause' : 'Play'} title={ws.playing ? 'Pause (Space)' : 'Play (Space)'}>
          <PlayPause playing={ws.playing} />
        </button>
        {jump5(false)}
        <button type="button" className="btn icon ghost" onClick={() => ws.seek(Math.max(a, b - 0.05))} aria-label="Skip to the end" title="Skip to the end (End)"><Icon name="toEnd" /></button>
      </div>
      <div className="mt-right">
        {children}
        {loop && (
          <button type="button" className={'btn icon' + (ws.loop.on ? ' on' : ' ghost')} onClick={() => ws.setLoop({ ...ws.loop, on: !ws.loop.on })} aria-label="Loop" aria-pressed={ws.loop.on} title={loopHint}>
            <Icon name="loop" />
          </button>
        )}
      </div>
    </div>
  );
}
