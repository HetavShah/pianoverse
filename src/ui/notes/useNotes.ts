// Notes for the project: MIDI import, detection from audio, and lining them up with the video.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalibratedProject } from '../../engine/calibration';
import { NoteSource, parseMidi, placeNotes } from '../../engine/notes';
import { findOffset } from '../../engine/audio/sync';
import { createNoteFinder, DEFAULT_SENSITIVITY, NoteFinderId } from '../../engine/ml/noteFinder';
import { forgetAudio, loadAudio, loadMonoAudio, VideoAudio } from '../services/audio';
import type { PickedMidi } from '../services/media';

export type NotesBusy =
  | { kind: 'audio' }
  | { kind: 'detect'; pct: number }
  | { kind: 'align' };

export const withSource = (p: CalibratedProject, src: NoteSource | undefined): CalibratedProject =>
  src ? { ...p, noteSource: src, notes: placeNotes(src) } : { ...p, noteSource: undefined, notes: [] };

/** The project's notes as a source (projects saved before Milestone 3 only have placed notes). */
export const sourceOf = (p: CalibratedProject): NoteSource | null =>
  p.noteSource ?? (p.notes.length ? { kind: 'audio', name: 'Notes from the project file', notes: p.notes, offset: 0 } : null);

export function useNotes(opts: { project: CalibratedProject | null; setProject: (p: CalibratedProject, opts?: { merge?: boolean }) => void; videoUrl: string | null }) {
  const { project, setProject, videoUrl } = opts;
  const [busy, setBusy] = useState<NotesBusy | null>(null);
  const [error, setError] = useState<string | null>(null);
  // the soundtrack of the video that is open now. Kept with its URL: when you switch projects while one is still
  // loading, its late result must not land on the next project's video
  const [loaded, setLoaded] = useState<{ url: string; audio: VideoAudio | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // read only once a step asks for it (Audio): a long video's sound takes memory and time
  const [wanted, setWanted] = useState<string | null>(null);
  const latest = useRef(project);
  latest.current = project;
  const urlNow = useRef(videoUrl);
  urlNow.current = videoUrl;

  const getAudio = useCallback(async () => {
    if (!videoUrl) throw new Error('Open a video first.');
    if (loaded?.url === videoUrl && loaded.audio) return loaded.audio;
    setBusy({ kind: 'audio' });
    const a = await loadAudio(videoUrl);
    if (urlNow.current === videoUrl) setLoaded({ url: videoUrl, audio: a, error: null });
    return a;
  }, [videoUrl, loaded]);

  // read it once a step asks (the waveforms on Audio), once more after a moment if it fails (a video found again
  // can take a moment to become readable), and give up after two minutes with a message
  useEffect(() => {
    if (!videoUrl || wanted !== videoUrl) return;
    let gone = false;
    const url = videoUrl;
    const fail = (e: unknown) => { if (!gone && urlNow.current === url) setLoaded({ url, audio: null, error: String((e as Error)?.message ?? e) }); };
    const read = () => Promise.race([
      loadAudio(url),
      new Promise<never>((_, reject) => setTimeout(() => { forgetAudio(url); reject(new Error("Reading the video's sound took too long.")); }, 120_000)),
    ]);
    read()
      .catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => (gone ? Promise.reject(new Error('gone')) : read())))
      .then((a) => { if (!gone && urlNow.current === url) setLoaded({ url, audio: a, error: null }); })
      .catch(fail);
    return () => { gone = true; };
  }, [videoUrl, wanted, attempt]);

  const run = useCallback(async (job: () => Promise<void>) => {
    setError(null);
    try { await job(); } catch (e) { setError(String((e as Error)?.message ?? e)); } finally { setBusy(null); }
  }, []);

  const importMidi = useCallback((m: PickedMidi) => run(async () => {
    const info = parseMidi(m.data, m.name);
    if (!info.notes.length) throw new Error(`${m.name} has no notes${info.skippedDrums ? ' (only drums)' : ''}.`);
    let src: NoteSource = { kind: 'midi', name: m.name, notes: info.notes, offset: 0, sustain: info.sustain, bars: info.bars, tracks: info.tracks, channels: info.channels };
    const p0 = latest.current;
    if (p0) setProject(withSource(p0, src));
    const a = await getAudio();
    setBusy({ kind: 'align' });
    const r = findOffset(a.envelope, info.notes);
    src = { ...src, offset: r.offset, confidence: r.confidence };
    const p1 = latest.current;
    if (p1) setProject(withSource(p1, src), { merge: true }); // the sync is part of the import
  }), [run, getAudio, setProject]);

  /** find the notes in the soundtrack: 'piano' (Transkun, for piano) or 'any' (Basic Pitch, any instrument) */
  const detect = useCallback((sensitivity = DEFAULT_SENSITIVITY, finder: NoteFinderId = 'piano') => run(async () => {
    const a = await getAudio();
    setBusy({ kind: 'detect', pct: 0 });
    const model = await createNoteFinder(finder, { sensitivity });
    // each finder listens at its own sample rate
    const x = model.sampleRate === a.rate ? a.mono : await loadMonoAudio(videoUrl!, model.sampleRate);
    const notes = await model.find(x, (pct) => setBusy({ kind: 'detect', pct }));
    if (!notes.length) throw new Error(finder === 'piano' ? 'No piano notes were found in the audio.' : 'No notes were found in the audio. Try more sensitivity.');
    const p = latest.current;
    const name = finder === 'piano' ? "Piano notes from the video's audio" : "Detected from the video's audio";
    if (p) setProject(withSource(p, { kind: 'audio', name, notes, offset: 0, sustain: finder === 'piano' && notes.some((x) => (x.h ?? x.e) > x.e) }));
  }), [run, getAudio, setProject, videoUrl]);

  const autoAlign = useCallback(() => run(async () => {
    const p0 = latest.current;
    const src = p0 && sourceOf(p0);
    if (!src) return;
    const a = await getAudio();
    setBusy({ kind: 'align' });
    const r = findOffset(a.envelope, src.notes);
    const p1 = latest.current;
    if (p1) setProject(withSource(p1, { ...src, offset: r.offset, confidence: r.confidence }));
  }), [run, getAudio, setProject]);

  const setOffset = useCallback((offset: number) => {
    const p = latest.current;
    const src = p && sourceOf(p);
    if (p && src) setProject(withSource(p, { ...src, offset: Math.round(offset * 1000) / 1000 }));
  }, [setProject]);

  const setTranspose = useCallback((octaves: number) => {
    const p = latest.current;
    const src = p && sourceOf(p);
    if (p && src) setProject(withSource(p, { ...src, transpose: octaves }));
  }, [setProject]);

  const clear = useCallback(() => {
    const p = latest.current;
    if (p) setProject(withSource(p, undefined));
  }, [setProject]);

  /** read the soundtrack in the background (the Audio step's waveforms); after a failure, try again */
  const prepareAudio = useCallback(() => {
    if (!videoUrl) return;
    if (wanted !== videoUrl) setWanted(videoUrl);
    else if (loaded?.url === videoUrl && loaded.error) setAttempt((n) => n + 1);
  }, [videoUrl, wanted, loaded]);

  const mine = loaded?.url === videoUrl ? loaded : null;
  return {
    busy, error, audio: mine?.audio ?? null,
    /** why the soundtrack couldn't be read (null while reading or once read) */
    audioError: mine?.error ?? null,
    importMidi, detect, autoAlign, setOffset, setTranspose, clear, prepareAudio,
  };
}
