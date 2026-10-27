// The live sound: while you watch, the video's own audio (and the grand piano playing your notes, when picked) runs
// through the same chain of audio nodes the export uses (engine/audio/soundChain.ts), so the Sound settings are heard
// as you change them. The piano is played just ahead of the video by a PianoFollower (engine/audio/piano.ts).
//
// The audio graph is only made once the sound is changed: until then the video plays its sound directly, as a
// browser would. (Once a video element is routed into Web Audio it can't be taken back out, so this is a one-way
// switch for the session; with the settings back at neutral the chain is simply bypassed.)
import { MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import type { CalibratedProject } from '../../engine/calibration';
import { trimRange } from '../../engine/project';
import { resolveSound, soundActive, soundLead, soundTail } from '../../engine/audio/sound';
import { Stereo } from '../../engine/audio/synth';
import { EXPORT_RATE, PianoPart, PREVIEW_RATE, renderSource, swellFor } from '../../engine/audio/mixdown';
import { integratedLoudness } from '../../engine/audio/loudness';
import { SoundChain } from '../../engine/audio/soundChain';
import { PianoFollower, PianoPlayer } from '../../engine/audio/piano';
import { loadSoundtrack, measureLoudness, PEAK_RATE, VideoAudio } from '../services/audio';
import { PianoLoadProgress, pianoPartFor } from '../services/piano';

interface Graph { ctx: AudioContext; src: MediaElementAudioSourceNode; chain: SoundChain | null; piano: PianoFollower | null }

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
  const [error, setError] = useState<string | null>(null);

  // the grand piano: its recordings for these notes, loaded (and the first time downloaded) when it's picked
  const notes = project?.notes;
  const usesPiano = sound.source !== 'video';
  const pianoKey = usesPiano && notes?.length ? `${sound.pedal}|${notes.length}|${notes[0]?.s}|${notes[notes.length - 1]?.e}|${project?.noteSource?.offset}` : null;
  const [piano, setPiano] = useState<{ key: string; part: PianoPart } | null>(null);
  const [pianoLoad, setPianoLoad] = useState<PianoLoadProgress | null>(null);
  useEffect(() => {
    if (!pianoKey || !notes) return;
    let gone = false;
    // a quick change (another pedal: the recordings are already decoded) shouldn't flash a loading line
    const slow = window.setTimeout(() => { if (!gone) setPianoLoad((p) => p ?? { done: 0, total: 0, detail: 'Getting the piano ready' }); }, 400);
    pianoPartFor(notes, sound, (p) => { if (!gone) setPianoLoad(p); })
      .then((part) => { if (!gone && part) { setPiano({ key: pianoKey, part }); setPianoLoad(null); } })
      .catch((e) => { if (!gone) { setError(String((e as Error).message ?? e)); setPianoLoad(null); } })
      .finally(() => window.clearTimeout(slow));
    return () => { gone = true; window.clearTimeout(slow); setPianoLoad(null); };
  }, [pianoKey, notes]); // eslint-disable-line react-hooks/exhaustive-deps
  const pianoPart = piano?.key === pianoKey ? piano.part : null;
  /** the sound isn't ready to hear yet (the piano is loading) */
  const pianoWaiting = usesPiano && !!pianoKey && !pianoPart;

  // the loudness, measured when evening it out
  // with the piano, the sound before the chain is rendered once (offline): its waveform is what the Sound tab draws,
  // and its loudness is what evening out measures
  const srcKey = usesPiano && pianoPart && videoUrl && duration ? `${videoUrl}|${sound.source}|${sound.blend}|${pianoKey}` : null;
  // renders are kept (the last few), so going back to a pedal or mix you've already heard is instant; while a new
  // one renders, the last one stays on screen
  const renders = useRef(new Map<string, { buf: AudioBuffer; audio: VideoAudio }>());
  const [srcRender, setSrcRender] = useState<{ key: string; buf: AudioBuffer; audio: VideoAudio } | null>(null);
  const [srcProgress, setSrcProgress] = useState(0);
  useEffect(() => {
    if (!srcKey || !videoUrl || !pianoPart) return;
    const kept = renders.current.get(srcKey);
    if (kept) { setSrcRender({ key: srcKey, ...kept }); return; }
    let gone = false;
    setSrcProgress(0);
    (sound.source === 'both' ? loadSoundtrack(videoUrl) : Promise.resolve(null))
      .then((src) => renderSource(src, sound, pianoPart, 0, duration, PREVIEW_RATE, (d) => { if (!gone) setSrcProgress(d); }))
      .then((buf) => {
        const r = { buf, audio: peaksOf(buf) };
        renders.current.set(srcKey, r);
        while (renders.current.size > 4) renders.current.delete(renders.current.keys().next().value!);
        if (!gone) setSrcRender({ key: srcKey, ...r });
      })
      .catch((e) => { if (!gone) setError(String((e as Error).message ?? e)); });
    return () => { gone = true; };
  }, [srcKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const rendered = srcRender?.key === srcKey ? srcRender : null;
  /** the last render of this video with the piano, shown while the current one is made */
  const shown = rendered ?? (usesPiano && srcRender?.key.startsWith(`${videoUrl}|`) ? srcRender : null);

  const key = `${videoUrl}|${a}|${b}|${usesPiano ? srcKey : ''}`;
  const [lufs, setLufs] = useState<{ key: string; value: number } | null>(null);
  useEffect(() => {
    if (!sound.even || !videoUrl || !span) return;
    if (usesPiano) {
      if (rendered) setLufs({ key, value: integratedLoudness([rendered.buf.getChannelData(0), rendered.buf.getChannelData(1)], rendered.buf.sampleRate, a, b) });
      return;
    }
    let gone = false;
    setError(null);
    measureLoudness(videoUrl, [a, b]).then((value) => { if (!gone) setLufs({ key, value }); }).catch((e) => { if (!gone) setError(String((e as Error).message ?? e)); });
    return () => { gone = true; };
  }, [sound.even, key, rendered]); // eslint-disable-line react-hooks/exhaustive-deps
  // while the piano is re-rendered the last measurement stands (it changes little), rather than none
  const measuredLufs = lufs?.key === key ? lufs.value : usesPiano && shown && !rendered && lufs ? lufs.value : null;

  // the swell is made from the opening notes: from the decoded soundtrack, once per start and length
  const swellKey = sound.start === 'swell' && videoUrl && span && !pianoWaiting ? `${key}|${sound.startLen}` : null;
  const [swell, setSwell] = useState<{ key: string; data: Stereo } | null>(null);
  useEffect(() => {
    if (!swellKey || !videoUrl) return;
    let gone = false;
    (sound.source === 'piano' ? Promise.resolve(null) : loadSoundtrack(videoUrl))
      .then((buf) => swellFor(buf, sound, pianoPart, a, sound.startLen))
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
        graph.current = { ctx, src: ctx.createMediaElementSource(v), chain: null, piano: null };
      } catch (e) { setError(`The sound can't be changed here: ${(e as Error).message}`); return; }
    }
    const g = graph.current;
    g.src.disconnect();
    g.piano?.stop();
    g.piano = null;
    g.chain?.dispose();
    g.chain = null;
    if (active && !bypass) {
      g.chain = new SoundChain(g.ctx, { sound, span: [a, b], measuredLufs, swell: swellData && { data: swellData, rate: EXPORT_RATE } }, g.ctx.destination);
      g.src.connect(g.chain.input);
      if (pianoPart) g.piano = new PianoFollower(g.ctx, new PianoPlayer(g.ctx, pianoPart.pack, g.chain.pianoIn), pianoPart.voices, pianoPart.lifts);
      g.chain.follow(v.currentTime, !v.paused);
    } else {
      g.src.connect(g.ctx.destination);
    }
    setBuilt((n) => n + 1);
  }, [sound, active, bypass, a, b, measuredLufs, videoUrl, swellData, pianoPart]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the playhead while playing
  useEffect(() => {
    const g = graph.current, v = videoRef.current;
    if (!g || !v) return;
    if (playing && g.ctx.state === 'suspended') g.ctx.resume().catch(() => {});
    if (!g.chain) return;
    if (!playing) { g.chain.follow(v.currentTime, false); g.piano?.update(v.currentTime, false); return; }
    let raf = 0;
    const tick = () => {
      g.chain?.follow(v.currentTime, true);
      // the piano only plays within the part in use, like the video's sound
      g.piano?.update(v.currentTime, !v.paused && v.currentTime < b + 0.05, v.playbackRate || 1);
      raf = requestAnimationFrame(tick);
    };
    tick();
    // a timer as well: a hidden window's frames stop, and the piano would fall silent
    const t = window.setInterval(() => g.piano?.update(v.currentTime, !v.paused && v.currentTime < b + 0.05, v.playbackRate || 1), 100);
    return () => { cancelAnimationFrame(raf); window.clearInterval(t); g.piano?.update(v.currentTime, false); };
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
    /** what to draw on the Sound tab when it isn't the video's own audio (the piano, or the mix): null until rendered */
    sourceAudio: usesPiano ? shown?.audio ?? null : undefined,
    /** the waveform shown is the last one: the current one is being made */
    sourceUpdating: usesPiano && !!shown && !rendered,
    /** how far that render has got, 0..1 */
    sourceProgress: srcProgress,
    /** the piano's download or decoding, while it's being got ready */
    pianoLoad,
    pianoWaiting,
  };
}

/** a waveform overview of a rendered sound, in the shape the Sound tab draws (min/max per bin) */
function peaksOf(buf: AudioBuffer): VideoAudio {
  const l = buf.getChannelData(0), r = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0);
  const per = buf.sampleRate / PEAK_RATE, n = Math.ceil(buf.length / per);
  const peaks = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = 0;
    for (let j = Math.floor(i * per), e = Math.min(buf.length, Math.floor((i + 1) * per)); j < e; j++) { const x = (l[j] + r[j]) / 2; if (x < lo) lo = x; if (x > hi) hi = x; }
    peaks[i * 2] = lo; peaks[i * 2 + 1] = hi;
  }
  return { mono: new Float32Array(0), rate: buf.sampleRate, envelope: new Float32Array(0), peaks, duration: buf.duration };
}
