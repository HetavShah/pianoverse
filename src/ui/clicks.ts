// "Play click on each note": while the video plays, a short click sounds at every note start, so you can hear
// whether the notes and the recording line up.
import { useEffect, useRef } from 'react';
import type { RawNote } from '../engine/project';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function click(at: number, loud: number) {
  if (!ctx) return;
  if (!noise) {
    noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 2500;
  const g = ctx.createGain();
  g.gain.value = 0.35 + 0.5 * loud;
  src.connect(hp).connect(g).connect(ctx.destination);
  src.start(at);
}

export function useClickTrack(enabled: boolean, playing: boolean, video: HTMLVideoElement | null, notes: RawNote[]) {
  const notesRef = useRef(notes);
  notesRef.current = notes;
  useEffect(() => {
    if (!enabled || !playing || !video) return;
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    let scheduledTo = video.currentTime;
    const sorted = [...notesRef.current].sort((a, b) => a.s - b.s);
    const LOOKAHEAD = 0.15;
    const timer = window.setInterval(() => {
      if (!ctx) return;
      const vt = video.currentTime;
      if (vt < scheduledTo - 0.5 || vt > scheduledTo + 1) scheduledTo = vt; // seek happened
      const until = vt + LOOKAHEAD;
      const now = ctx.currentTime;
      // binary search for the first note after scheduledTo
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m].s <= scheduledTo) lo = m + 1; else hi = m; }
      let lastT = -1;
      for (let i = lo; i < sorted.length && sorted[i].s <= until; i++) {
        const s = sorted[i].s;
        if (s - lastT < 0.03) continue; // one click per chord
        lastT = s;
        click(now + Math.max(0, (s - vt) / (video.playbackRate || 1)), Math.min(1, Math.max(0, (sorted[i].v - 0.3) / 0.3)));
      }
      scheduledTo = Math.max(scheduledTo, until);
    }, 40);
    return () => window.clearInterval(timer);
  }, [enabled, playing, video]);
}
