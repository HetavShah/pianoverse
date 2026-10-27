// The grand piano's samples: in the desktop app the pack is downloaded once (src-tauri/src/piano.rs) and read from
// the app's data folder; elsewhere (tests) from window.__pvPianoUrl. Loaded once per session; each recording is
// decoded only when a piece needs it (engine/audio/piano.ts).
import { pedalLifts, PianoSamples, pianoVoices } from '../../engine/audio/piano';
import { EXPORT_RATE, PianoPart } from '../../engine/audio/mixdown';
import type { Sound } from '../../engine/audio/sound';
import type { RawNote } from '../../engine/project';
import { inTauri } from './media';

export interface PianoLoadProgress { done: number; total: number; detail: string }

let loading: Promise<PianoSamples> | null = null;

export function loadPianoSamples(onProgress?: (p: PianoLoadProgress) => void): Promise<PianoSamples> {
  if (!loading) {
    loading = (async () => {
      let bytes: ArrayBuffer;
      if (inTauri()) {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');
        const un = await listen<PianoLoadProgress>('media-progress', (e) => onProgress?.(e.payload));
        try {
          const path = await invoke<string>('piano_pack');
          bytes = await invoke<ArrayBuffer>('read_file_bytes', { path });
        } finally { un(); }
      } else {
        const url = (window as unknown as { __pvPianoUrl?: string }).__pvPianoUrl;
        if (!url) throw new Error('The grand piano needs the Pianoverse desktop app.');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not load the piano (${res.status})`);
        bytes = await res.arrayBuffer();
      }
      // decoded at the export's rate: the preview plays the same recordings (a context resamples as it plays)
      const dec = new OfflineAudioContext(2, 1, EXPORT_RATE);
      return new PianoSamples(bytes, (d) => dec.decodeAudioData(d));
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

/** the piano's part for these notes: the voices and the recordings they need (null when the sound doesn't use it) */
export async function pianoPartFor(notes: RawNote[], sound: Sound, onProgress?: (p: PianoLoadProgress) => void): Promise<PianoPart | null> {
  if (sound.source === 'video' || !notes.length) return null;
  const samples = await loadPianoSamples(onProgress);
  const voices = pianoVoices(notes, sound.pedal);
  return { pack: await samples.prepare(voices), voices, lifts: sound.pedal === 'played' ? pedalLifts(notes) : [] };
}
