// The player under the timeline on Style, Light and Camera: the same centred controls as under the waveforms
// (MiniTransport), with looping on the right and what it loops.
import type { WS } from '../app/workspace';
import MiniTransport from './MiniTransport';

const fmtT = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };

export default function Transport({ ws, loopHint }: { ws: WS; loopHint?: string }) {
  return (
    <div className="transport">
      <MiniTransport ws={ws} loop loopHint={loopHint ?? (ws.loop.range ? 'Loop the selected section (L)' : 'Loop the whole video (L) · drag on the timeline to loop a section')}>
        {ws.loop.on && <span className="loop-tag">{ws.loop.range ? `Looping ${fmtT(ws.loop.range[0])}–${fmtT(ws.loop.range[1])}` : 'Looping the whole video'}</span>}
      </MiniTransport>
    </div>
  );
}
