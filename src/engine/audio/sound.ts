// The sound of the video (Audio step → Sound): where it comes from (the video, a grand piano playing your notes, or
// both), how it starts and ends, its volume and tone, a room around it, and evening out the loudness for social media. Nothing is changed in the video file: these are settings, and
// the preview and the export run them through the same chain of audio nodes (soundChain.ts).
//
// The start and end transitions are described by soundAt(): the level, the muffling filter and the reverb send at
// any moment. The preview reads it every frame; the export turns it into automation curves. One description, so
// what you hear in the preview is what you get in the file.

export type SoundStart = 'none' | 'fade' | 'open' | 'swell';
/** where the sound comes from: the video's own audio, a recorded grand piano playing your notes (piano.ts), or both */
export type SoundSource = 'video' | 'piano' | 'both';
/** the piano's sustain pedal: always down (every note rings on), as played (from the notes), or off */
export type PedalMode = 'held' | 'played' | 'off';
/** the room around the performance */
export type Room = 'studio' | 'hall' | 'church' | 'cathedral' | 'plate';
export type SoundEnd = 'cut' | 'fade' | 'muffle' | 'ring';

export interface Sound {
  /** how the sound begins at the start of the video (after the trim) */
  start: SoundStart;
  /** seconds the start transition takes; for 'swell', how long it rises before the video starts */
  startLen: number;
  /** how it ends */
  end: SoundEnd;
  /** seconds the end transition takes; for 'ring', how long the last moment rings on after the end */
  endLen: number;
  /** dB */
  volume: number;
  /** dB, low shelf at 150 Hz */
  bass: number;
  /** dB, high shelf at 5 kHz */
  treble: number;
  /** where the sound comes from */
  source: SoundSource;
  /** with both: how much of it is the piano, 0..1 (the rest is the video's sound) */
  blend: number;
  /** the piano's sustain pedal */
  pedal: PedalMode;
  /** the room around the performance */
  room: Room;
  /** 0..1, how much of the room you hear (0: none) */
  hall: number;
  /** bring the loudness to what Instagram, TikTok and YouTube play at (−14 LUFS) */
  even: boolean;
}

export const DEFAULT_SOUND: Sound = {
  start: 'none', startLen: 2, end: 'cut', endLen: 3,
  volume: 0, bass: 0, treble: 0, hall: 0, even: false,
  source: 'video', blend: 0.5, pedal: 'held', room: 'hall',
};

export const PEDAL_MODES: { id: PedalMode; label: string; hint: string }[] = [
  { id: 'held', label: 'Always down', hint: 'Every note rings on until it fades or is played again' },
  { id: 'played', label: 'As played', hint: 'Follows the pedal recorded in your notes' },
  { id: 'off', label: 'Off', hint: 'Each note stops when its key is let go' },
];

export const SOUND_SOURCES: { id: SoundSource; label: string; hint: string }[] = [
  { id: 'video', label: 'Your video', hint: 'The sound recorded with your video.' },
  { id: 'piano', label: 'Grand piano', hint: 'A recorded concert grand plays your notes. Sounds best with notes from a MIDI file.' },
  { id: 'both', label: 'Both', hint: 'The grand piano blended under your video\'s sound. Fuller, and it hides small note mistakes.' },
];

/** reverb length (s, to −60 dB), the brightness it starts with (Hz), how slowly it builds (s), and the gap before it (s) */
export const ROOMS: { id: Room; label: string; hint: string; seconds: number; bright: number; bloom: number; predelay: number }[] = [
  { id: 'studio', label: 'Studio', hint: 'A small, close room: clear, just less dry.', seconds: 0.9, bright: 11000, bloom: 0.003, predelay: 0.004 },
  { id: 'hall', label: 'Concert hall', hint: 'A grand piano on a concert stage.', seconds: 2.6, bright: 9000, bloom: 0.004, predelay: 0.022 },
  { id: 'church', label: 'Church', hint: 'Stone walls and a long, warm tail.', seconds: 4.2, bright: 6500, bloom: 0.02, predelay: 0.035 },
  { id: 'cathedral', label: 'Cathedral', hint: 'Huge and dreamy: every note blooms into the next.', seconds: 7, bright: 4800, bloom: 0.05, predelay: 0.06 },
  { id: 'plate', label: 'Plate', hint: 'The smooth, bright reverb of classic records.', seconds: 2, bright: 15000, bloom: 0.001, predelay: 0.008 },
];
export const roomOf = (id: Room) => ROOMS.find((r) => r.id === id) ?? ROOMS[1];

export const SOUND_STARTS: { id: SoundStart; label: string; hint: string }[] = [
  { id: 'none', label: 'Straight in', hint: 'Starts right away, as recorded.' },
  { id: 'fade', label: 'Fade in', hint: 'Rises gently from silence.' },
  { id: 'open', label: 'Open up', hint: 'Starts muffled, as if behind a door, then opens up.' },
  { id: 'swell', label: 'Swell', hint: 'Your first notes swell up out of silence, like an echo played backwards, just before the video starts.' },
];
export const SOUND_ENDS: { id: SoundEnd; label: string; hint: string }[] = [
  { id: 'cut', label: 'Cut', hint: 'Stops right at the end.' },
  { id: 'fade', label: 'Fade out', hint: 'Fades gently to silence.' },
  { id: 'muffle', label: 'Muffle out', hint: 'Sinks away, as if a door closes.' },
  { id: 'ring', label: 'Ring out', hint: 'The last moment blooms into a big hall and rings on over the final frame.' },
];

/** loudness that social media plays at */
export const TARGET_LUFS = -14;
/** the most the loudness evening may raise or lower the sound */
export const MAX_EVEN_DB = 12;
/** the muffling filter fully open */
export const OPEN_HZ = 20000;

export function resolveSound(s?: Partial<Sound> | null): Sound {
  return { ...DEFAULT_SOUND, ...(s ?? {}) };
}

/** true when the sound is changed at all (otherwise the export keeps the video's own audio untouched) */
export function soundActive(s: Sound): boolean {
  return s.source !== 'video' || s.start !== 'none' || s.end !== 'cut' || s.even || s.hall > 0.001
    || Math.abs(s.volume) > 0.01 || Math.abs(s.bass) > 0.01 || Math.abs(s.treble) > 0.01;
}

/** seconds the export runs on after the end of the video (the ring-out) */
export const soundTail = (s: Sound) => (s.end === 'ring' ? s.endLen : 0);
/** seconds the export starts before the video (the swell) */
export const soundLead = (s: Sound) => (s.start === 'swell' ? s.startLen : 0);

/** the gain the loudness evening applies, dB (0 when off or not measured yet) */
export function evenGainDb(s: Sound, measuredLufs: number | null): number {
  if (!s.even || measuredLufs === null || !Number.isFinite(measuredLufs)) return 0;
  return Math.max(-MAX_EVEN_DB, Math.min(MAX_EVEN_DB, TARGET_LUFS - measuredLufs));
}

/** the overall gain after the transitions, linear */
export const masterGain = (s: Sound, measuredLufs: number | null) => dbToGain(s.volume + evenGainDb(s, measuredLufs));

export const dbToGain = (db: number) => Math.pow(10, db / 20);

/** how loud the video's sound and the piano are in the mix (equal power, so 'both' at the middle isn't louder) */
export function sourceGains(s: Sound): { video: number; piano: number } {
  if (s.source === 'video') return { video: 1, piano: 0 };
  if (s.source === 'piano') return { video: 0, piano: 1 };
  const b = Math.max(0, Math.min(1, s.blend));
  return { video: Math.cos((b * Math.PI) / 2) * Math.SQRT2 * 0.85, piano: Math.sin((b * Math.PI) / 2) * Math.SQRT2 * 0.85 };
}

/** what the transitions do at one moment */
export interface SoundState {
  /** level of the performance, linear 0..1 */
  gain: number;
  /** the muffling low-pass filter's cutoff, Hz */
  cutoff: number;
  /** how much goes into the ring-out reverb, 0..1 */
  ring: number;
}

/** the transitions' lengths for this span: each may take at most half of it (a swell goes before the start and a
 * ring-out after the end, so those can be any length) */
export function transitionLengths(s: Sound, span: [number, number]) {
  const half = Math.max(0.1, (span[1] - span[0]) / 2);
  return { start: s.start === 'swell' ? s.startLen : Math.min(s.startLen, half), end: s.end === 'ring' ? s.endLen : Math.min(s.endLen, half) };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
/** the ring-out: how long the reverb builds before the end, and how long the piano takes to let go, seconds */
const RING_BLOOM = 1, RING_RELEASE = 0.25;
/** a short ramp at hard edges so a cut doesn't click, seconds */
const DECLICK = 0.02;

/**
 * The transitions at time t (seconds of the video), for the part of the video in use, span = [start, end].
 * Before the start and after the end the performance is silent (the swell before it and the ring-out after it are
 * sounds of their own).
 */
export function soundAt(s: Sound, span: [number, number], t: number): SoundState {
  const [a, b] = span;
  if (t < a || t > b) return { gain: 0, cutoff: OPEN_HZ, ring: 0 };
  let gain = 1, cutoff = OPEN_HZ, ring = 0;
  const { start: sl, end: el } = transitionLengths(s, span);

  // the start
  const x = clamp01((t - a) / Math.max(1e-3, sl));
  switch (s.start) {
    case 'none': gain *= clamp01((t - a) / DECLICK); break;
    case 'fade': gain *= Math.sin((x * Math.PI) / 2); break;
    case 'open':
      // 250 Hz to fully open, and from −9 dB to full level
      cutoff = Math.min(cutoff, 250 * Math.pow(OPEN_HZ / 250, x * x));
      gain *= dbToGain(-9 * (1 - x)) * clamp01((t - a) / DECLICK);
      break;
    case 'swell': gain *= clamp01((t - a) / DECLICK); break;   // the swell comes before the start
  }

  // the end
  const y = clamp01((t - (b - el)) / Math.max(1e-3, el));
  switch (s.end) {
    case 'cut': gain *= clamp01((b - t) / DECLICK); break;
    case 'fade': gain *= Math.cos((y * Math.PI) / 2); break;
    case 'muffle':
      cutoff = Math.min(cutoff, OPEN_HZ * Math.pow(300 / OPEN_HZ, Math.sqrt(y)));
      gain *= 1 - smooth(clamp01((y - 0.5) / 0.5));
      break;
    case 'ring': {
      // the last second blooms into a long reverb, the piano lets go over the last quarter second, and the reverb
      // rings on after the end
      ring = smooth(clamp01((t - (b - RING_BLOOM)) / RING_BLOOM));
      gain *= Math.sin((clamp01((b - t) / RING_RELEASE) * Math.PI) / 2);
      break;
    }
  }
  return { gain, cutoff, ring };
}
