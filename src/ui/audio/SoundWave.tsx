// The sound drawn over time: the recording as filmed (faint), the same shaped by the Sound settings (bright: fades,
// muffling, volume), the swell rising before the start and the ring-out decaying after the end. Click or drag to move
// the playhead. Shows the whole video, or a closer look at a part of it (view).
import { useEffect, useRef } from 'react';
import { masterGain, OPEN_HZ, Sound, soundAt, soundLead } from '../../engine/audio/sound';
import { PEAK_RATE, VideoAudio } from '../services/audio';

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const SWELL = '#9b8cff';

export default function SoundWave({ audio, sound, span, tail, measuredLufs, time, onSeek, view, className }: {
  audio: VideoAudio | null; sound: Sound; span: [number, number]; tail: number; measuredLufs: number | null;
  time: number; onSeek: (t: number) => void;
  /** the part shown, seconds (default: all of it, with the ring-out) */
  view?: [number, number];
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);
  const [a, b] = span;
  const lead = soundLead(sound);
  const [t0, t1] = view ?? [a - lead, b + Math.max(tail, (b - a) * 0.02)];

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    const mid = H / 2, half = H * 0.44;
    const xOf = (t: number) => ((t - t0) / (t1 - t0)) * W;
    g.fillStyle = css('--rule');
    g.fillRect(0, mid - dpr / 2, W, dpr);

    // loudest point of the recording in the span: the waveform is drawn against it
    const peakAt = (ta: number, tb: number) => {
      if (!audio) return 0;
      const p = audio.peaks, i0 = Math.max(0, Math.floor(ta * PEAK_RATE)), i1 = Math.min(p.length / 2, Math.max(i0 + 1, Math.ceil(tb * PEAK_RATE)));
      let m = 0;
      for (let i = i0; i < i1; i++) m = Math.max(m, Math.abs(p[2 * i]), Math.abs(p[2 * i + 1]));
      return m;
    };
    const top = Math.max(1e-4, peakAt(a, b));
    const master = Math.min(4, masterGain(sound, measuredLufs));
    const dt = (t1 - t0) / W;
    const live = css('--live'), dim = css('--stone');
    let endAmp: number;
    // the loudest moment near the end (for drawing the ring-out)
    endAmp = (peakAt(b - 0.6, b) / top) * master * 0.6;
    for (let x = 0; x < W; x++) {
      const t = t0 + x * dt;
      if (t > b) break;
      if (t < a) continue;
      const amp = peakAt(t, t + dt) / top;
      g.fillStyle = dim; g.globalAlpha = 0.28;
      g.fillRect(x, mid - amp * half, 1, Math.max(dpr, 2 * amp * half));
      const st = soundAt(sound, span, t + dt / 2);
      // muffling shown as a smaller, thinner wave
      const open = Math.max(0, Math.min(1, Math.log(st.cutoff / 150) / Math.log(OPEN_HZ / 150)));
      const shaped = Math.min(1, amp * st.gain * master * (0.3 + 0.7 * Math.pow(open, 0.7)));
      g.fillStyle = live; g.globalAlpha = 0.95;
      g.fillRect(x, mid - shaped * half, 1, Math.max(dpr, 2 * shaped * half));
    }
    g.globalAlpha = 1;

    // the ring-out after the end
    if (sound.end === 'ring' && tail > 0) {
      for (let x = Math.max(0, Math.ceil(xOf(b))); x < W; x++) {
        const u = (t0 + x * dt - b) / tail;
        if (u > 1) break;
        const amp = Math.min(1, endAmp) * Math.exp(-6.91 * u * 0.75);
        g.fillStyle = live; g.globalAlpha = 0.45;
        g.fillRect(x, mid - amp * half, 1, Math.max(dpr, 2 * amp * half));
      }
      g.globalAlpha = 1;
    }

    // the swell before the start: rising into the first note
    if (lead > 0) {
      const startAmp = Math.min(1, (peakAt(a, a + 0.5) / top) * master * 0.8);
      g.fillStyle = SWELL; g.globalAlpha = 0.8;
      for (let x = Math.max(0, Math.floor(xOf(a - lead))); x < xOf(a) && x < W; x++) {
        const u = (t0 + x * dt - (a - lead)) / lead;
        const amp = startAmp * Math.pow(Math.max(0, u), 2.2);
        g.fillRect(x, mid - amp * half, 1, Math.max(dpr, 2 * amp * half));
      }
      g.globalAlpha = 1;
    }

    // the end of the video, and the playhead
    g.fillStyle = css('--paper'); g.globalAlpha = 0.5;
    if (tail > 0 && b > t0 && b < t1) g.fillRect(Math.round(xOf(b)), 0, dpr, H);
    if (lead > 0 && a > t0 && a < t1) g.fillRect(Math.round(xOf(a)), 0, dpr, H);
    g.globalAlpha = 1;
    if (time >= t0 && time <= t1) { g.fillStyle = css('--paper'); g.fillRect(Math.round(xOf(time)) - dpr / 2, 0, Math.max(1, dpr * 1.5), H); }
  }, [audio, sound, a, b, tail, lead, measuredLufs, time, t0, t1]); // eslint-disable-line react-hooks/exhaustive-deps

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(a, Math.min(b, t0 + ((e.clientX - r.left) / r.width) * (t1 - t0))));
  };
  return (
    <div className={'sound-wave' + (className ? ' ' + className : '')}>
      <canvas ref={ref} aria-label="The sound over time. Click to move the playhead"
        onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); at(e); }}
        onPointerMove={(e) => { if (drag.current) at(e); }} onPointerUp={() => { drag.current = false; }} />
      {!audio && <div className="sound-wave-wait dim small-text"><span className="spinner" /> Reading the soundtrack…</div>}
      {lead > 0 && a > t0 + (t1 - t0) * 0.25 && <span className="sound-wave-tag end" style={{ right: `${(1 - (a - t0) / (t1 - t0)) * 100}%` }}>Swell · video starts</span>}
      {tail > 0 && b > t0 && b < t1 - (t1 - t0) * 0.25 && <span className="sound-wave-tag" style={{ left: `${((b - t0) / (t1 - t0)) * 100}%` }}>Video ends · rings on</span>}
    </div>
  );
}
