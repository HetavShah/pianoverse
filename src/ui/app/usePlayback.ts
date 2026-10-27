// Playing the video: play and pause, seeking, the playhead, looping (the whole video or a selected part) and
// staying inside the part kept on the Video step (the trim). Every decoded frame is handed to onFrame, which
// draws the preview.
import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { trimRange } from '../../engine/project';
import type { CalibratedProject } from '../../engine/calibration';

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

export interface Loop { on: boolean; range: [number, number] | null }

export function usePlayback(videoRef: MutableRefObject<HTMLVideoElement | null>, opts: {
  project: CalibratedProject | null;
  /** the video can play (a video is open and readable) */
  canPlay: boolean;
  /** called with every frame shown while playing */
  onFrame: MutableRefObject<(t?: number) => void>;
}) {
  const { project, canPlay, onFrame } = opts;
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState<Loop>({ on: false, range: null });
  const loopRef = useRef(loop);
  loopRef.current = loop;
  /** the part of the video kept on the Video step (null: all of it) */
  const trimRef = useRef<[number, number] | null>(null);
  trimRef.current = project?.edit?.trim && duration ? trimRange(project, duration) : null;

  // draw every decoded video frame while playing
  useEffect(() => {
    const v = videoRef.current as RVFCVideo | null;
    if (!v || !playing) return;
    let stop = false;
    if (v.requestVideoFrameCallback) {
      const tick = (_now: number, meta: { mediaTime: number }) => {
        if (stop) return;
        // the part kept on the Video step: play inside it (loop round it, or stop at its end)
        const tr = trimRef.current;
        const lp = loopRef.current;
        if (tr && !(lp.on && lp.range)) {
          if (meta.mediaTime >= tr[1] - 0.01) {
            if (lp.on) { v.currentTime = tr[0]; v.requestVideoFrameCallback!(tick); return; }
            v.pause(); v.currentTime = tr[1]; setPlaying(false); setTime(tr[1]); return;
          }
          if (meta.mediaTime < tr[0] - 0.25) { v.currentTime = tr[0]; v.requestVideoFrameCallback!(tick); return; }
        }
        // looping a selected section: jump back to its start at its end
        if (lp.on && lp.range && (meta.mediaTime >= lp.range[1] || meta.mediaTime < lp.range[0] - 0.25)) {
          v.currentTime = lp.range[0];
          v.requestVideoFrameCallback!(tick);
          return;
        }
        onFrame.current(meta.mediaTime);
        setTime(meta.mediaTime);
        v.requestVideoFrameCallback!(tick);
      };
      v.requestVideoFrameCallback(tick);
    } else {
      const step = () => { if (stop) return; onFrame.current(); setTime(v.currentTime); requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    return () => { stop = true; };
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !canPlay) return;
    if (v.paused) {
      const lp = loopRef.current;
      const tr = trimRef.current;
      if (lp.on && lp.range && (v.currentTime < lp.range[0] || v.currentTime >= lp.range[1] - 0.05)) v.currentTime = lp.range[0];
      else if (tr && (v.currentTime < tr[0] - 0.01 || v.currentTime >= tr[1] - 0.05)) v.currentTime = tr[0];
      v.play(); setPlaying(true);
    } else { v.pause(); setPlaying(false); }
  }, [canPlay]); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = useCallback(() => { videoRef.current?.pause(); setPlaying(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration || t));
    setTime(v.currentTime);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // whole-video looping when no section is selected (the trim is looped by hand above)
  useEffect(() => { const v = videoRef.current; if (v) v.loop = loop.on && !loop.range && !trimRef.current; }, [loop, project?.edit?.trim]); // eslint-disable-line react-hooks/exhaustive-deps
  // looping belongs to one project
  useEffect(() => { setLoop({ on: false, range: null }); }, [project?.id]);

  /** a new video or project: back to the start, stopped */
  const reset = useCallback(() => { setPlaying(false); setDuration(0); setTime(0); }, []);

  return { playing, setPlaying, time, duration, setDuration, loop, setLoop, loopRef, togglePlay, pause, seek, reset };
}
