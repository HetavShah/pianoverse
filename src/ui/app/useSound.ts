// The live sound: while you watch, the video's own audio runs through the same chain of audio nodes the export uses
// (engine/audio/soundChain.ts), so the Sound settings are heard as you change them.
//
// The audio graph is only made once the sound is changed: until then the video plays its sound directly, as a
// browser would. (Once a video element is routed into Web Audio it can't be taken back out, so this is a one-way
// switch for the session; with the settings back at neutral the chain is simply bypassed.)
import { MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import type { CalibratedProject } from '../../engine/calibration';
import { trimRange } from '../../engine/project';
import { resolveSound, soundActive, soundLead, soundTail } from '../../engine/audio/sound';
import { reverseSwell, Stereo } from '../../engine/audio/synth';
import { EXPORT_RATE } from '../../engine/audio/mixdown';
import { SoundChain } from '../../engine/audio/soundChain';
import { loadSoundtrack, measureLoudness } from '../services/audio';

interface Graph { ctx: AudioContext; src: MediaElementAudioSourceNode; chain: SoundChain | null }

export function useSound(videoRef: MutableRefObject<HTMLVideoElement | null>, opts: {
  project: CalibratedProject | null; videoUrl: string | null; playing: boolean; duration: number;
}) {
  const { project, videoUrl, playing, duration } = opts;
  const sound = useMemo(() => resolveSound(project?.sound), [project?.sound]);
  const active = !!project && soundActive(sound);
  const span = project && duration ? trimRange(project, duration) : null;
  const [a, b] = span ?? [0, 0];
  /** held "hear as recorded" */
  const [bypass, setBypass] = useState(false);

  // the loudness, measured when evening it out
  const key = `${videoUrl}|${a}|${b}`;
  const [lufs, setLufs] = useState<{ key: string; value: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sound.even || !videoUrl || !span) return;
    let gone = false;
    setError(null);
    measureLoudness(videoUrl, [a, b]).then((value) => { if (!gone) setLufs({ key, value }); }).catch((e) => { if (!gone) setError(String((e as Error).message ?? e)); });
    return () => { gone = true; };
  }, [sound.even, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const measuredLufs = lufs?.key === key ? lufs.value : null;

  // the swell is made from the opening notes: from the decoded soundtrack, once per start and length
  const swellKey = sound.start === 'swell' && videoUrl && span ? `${key}|${sound.startLen}` : null;
  const [swell, setSwell] = useState<{ key: string; data: Stereo } | null>(null);
  useEffect(() => {
    if (!swellKey || !videoUrl) return;
    let gone = false;
    loadSoundtrack(videoUrl).then((buf) => reverseSwell(buf, a, sound.startLen, EXPORT_RATE))
      .then((data) => { if (!gone) setSwell({ key: swellKey, data }); })
      .catch((e) => { if (!gone) setError(String((e as Error).message ?? e)); });
    return () => { gone = true; };
  }, [swellKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const swellData = swell?.key === swellKey ? swell.data : null;

  // the audio graph, rebuilt whenever the settings change
  const graph = useRef<Graph | null>(null);
  const [built, setBuilt] = useState(0);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !span) return;
    if (!graph.current) {
      if (!active) return;
      try {
        const ctx = new AudioContext();
        graph.current = { ctx, src: ctx.createMediaElementSource(v), chain: null };
      } catch (e) { setError(`The sound can't be changed here: ${(e as Error).message}`); return; }
    }
    const g = graph.current;
    g.src.disconnect();
    g.chain?.dispose();
    g.chain = null;
    if (active && !bypass) {
      g.chain = new SoundChain(g.ctx, { sound, span: [a, b], measuredLufs, swell: swellData && { data: swellData, rate: EXPORT_RATE } }, g.ctx.destination);
      g.src.connect(g.chain.input);
      g.chain.follow(v.currentTime, !v.paused);
    } else {
      g.src.connect(g.ctx.destination);
    }
    setBuilt((n) => n + 1);
  }, [sound, active, bypass, a, b, measuredLufs, videoUrl, swellData]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the playhead while playing
  useEffect(() => {
    const g = graph.current, v = videoRef.current;
    if (!g || !v) return;
    if (playing && g.ctx.state === 'suspended') g.ctx.resume().catch(() => {});
    if (!g.chain) return;
    if (!playing) { g.chain.follow(v.currentTime, false); return; }
    let raf = 0;
    const tick = () => { g.chain?.follow(v.currentTime, true); raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [playing, built]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { graph.current?.ctx.close().catch(() => {}); }, []);

  /** hear the swell: stop at the start, play the swell, and start the video as it lands */
  const swellTimer = useRef(0);
  const hearSwell = (stopAtStart: () => void, play: () => void) => {
    const g = graph.current;
    window.clearTimeout(swellTimer.current);
    stopAtStart();
    if (!g?.chain) { play(); return; }
    g.ctx.resume().catch(() => {});
    const wait = g.chain.playSwell();
    swellTimer.current = window.setTimeout(play, wait * 1000);
  };

  return {
    sound, active, bypass, setBypass, measuredLufs, error,
    /** measuring the loudness right now */
    measuring: sound.even && measuredLufs === null && !error,
    /** seconds the export runs on after the end (ring-out) */
    tail: soundTail(sound),
    /** seconds the export starts before the video (swell) */
    lead: soundLead(sound),
    swellReady: !!swellData,
    hearSwell,
  };
}
