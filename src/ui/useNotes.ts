// Notes for the project: MIDI import, detection from audio, and lining them up with the video.
import { useCallback, useRef, useState } from 'react';
import type { CalibratedProject } from '../engine/calibration';
import { NoteSource, parseMidi, placeNotes } from '../engine/notes';
import { findOffset } from '../engine/sync';
import { DEFAULT_DETECT } from '../engine/detectConfig';
import { loadAudio, VideoAudio } from './audio';
import type { PickedMidi } from './media';

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
  const [audio, setAudio] = useState<VideoAudio | null>(null);
  const [audioFor, setAudioFor] = useState<string | null>(null);
  const latest = useRef(project);
  latest.current = project;

  const getAudio = useCallback(async () => {
    if (!videoUrl) throw new Error('Open a video first.');
    if (audio && audioFor === videoUrl) return audio;
    setBusy({ kind: 'audio' });
    const a = await loadAudio(videoUrl);
    setAudio(a);
    setAudioFor(videoUrl);
    return a;
  }, [videoUrl, audio, audioFor]);

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

  const detect = useCallback((onset = DEFAULT_DETECT.onset) => run(async () => {
    const a = await getAudio();
    setBusy({ kind: 'detect', pct: 0 });
    const { detectNotes } = await import('../engine/detect'); // keeps the model code out of start-up
    const notes = await detectNotes(a.mono, '/models/basic-pitch/model.json', (pct) => setBusy({ kind: 'detect', pct }), { ...DEFAULT_DETECT, onset });
    if (!notes.length) throw new Error('No notes were found in the audio. Try more sensitivity.');
    const p = latest.current;
    if (p) setProject(withSource(p, { kind: 'audio', name: "Detected from the video's audio", notes, offset: 0 }));
  }), [run, getAudio, setProject]);

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

  /** load the audio in the background so the sync strip can show it */
  const prepareAudio = useCallback(() => { if (videoUrl && audioFor !== videoUrl) run(async () => { await getAudio(); }); }, [videoUrl, audioFor, run, getAudio]);

  return { busy, error, audio: audioFor === videoUrl ? audio : null, importMidi, detect, autoAlign, setOffset, setTranspose, clear, prepareAudio };
}
