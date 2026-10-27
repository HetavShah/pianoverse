// The export's soundtrack: the part of the video's audio in use (and the piano playing your notes), run through the
// sound chain offline (faster than real time) and written as a WAV file for the encoder. The swell comes before the
// video and the ring-out after it.
import { mulberry32 } from '../random';
import { Sound, soundLead, soundTail, sourceGains } from './sound';
import { reverseSwell } from './synth';
import { SoundChain } from './soundChain';
import { PianoPack, PianoPlayer, PianoVoice } from './piano';
import { integratedLoudness } from './loudness';

/** the piano's part: its recordings (PianoSamples.prepare) and what it plays */
export interface PianoPart { pack: PianoPack; voices: PianoVoice[]; lifts: number[] }

/** play the voices that sound in [from, to) of the video onto ctx, the video's `from` falling at context time `at` */
function playPiano(ctx: BaseAudioContext, piano: PianoPart, out: AudioNode, from: number, to: number, at: number) {
  const player = new PianoPlayer(ctx, piano.pack, out);
  for (const v of piano.voices) {
    if (v.t >= to) break;
    if (v.t < from - 8 || (v.t < from && v.end <= from && v.p <= 89)) continue;
    player.play(v, at + (v.t - from));
  }
  piano.lifts.forEach((l, i) => { if (l >= from && l < to) player.pedalUp(at + (l - from), i); });
}

/**
 * The sound before the chain, for [from, to] seconds of the video: the video's audio and the piano in their mix.
 * Used to measure its loudness and to make the swell when the piano plays.
 */
export async function renderSource(src: AudioBuffer | null, sound: Sound, piano: PianoPart | null, from: number, to: number,
  rate = EXPORT_RATE, onProgress?: (done: number) => void): Promise<AudioBuffer> {
  const dur = Math.max(0.05, to - from);
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * rate), rate);
  const g = sourceGains(sound);
  if (src && g.video > 0) {
    const node = ctx.createBufferSource(); node.buffer = src;
    const k = ctx.createGain(); k.gain.value = g.video;
    node.connect(k).connect(ctx.destination);
    node.start(0, from, dur);
  }
  if (piano && g.piano > 0) {
    const k = ctx.createGain(); k.gain.value = g.piano;
    k.connect(ctx.destination);
    playPiano(ctx, piano, k, from, to, 0);
  }
  if (onProgress) {
    // the render pauses every twentieth of the way to say how far it has got
    for (let i = 1; i < 20; i++) {
      const t = (dur * i) / 20;
      ctx.suspend(Math.floor((t * rate) / 128) * 128 / rate).then(() => { onProgress(i / 20); ctx.resume(); }).catch(() => {});
    }
  }
  return ctx.startRendering();
}

/** the rate the Sound tab's preview of the piano is rendered at (its waveform and loudness): half the export's */
export const PREVIEW_RATE = 24000;

export const EXPORT_RATE = 48000;

/**
 * Render the sound for span = [start, end] seconds of the video. The result begins with the swell (if any) and runs
 * on with the ring-out (if any): soundLead + the span + soundTail seconds.
 */
export async function renderSound(src: AudioBuffer | null, sound: Sound, span: [number, number], measuredLufs: number | null, piano: PianoPart | null = null): Promise<AudioBuffer> {
  const dur = Math.max(0.05, span[1] - span[0]);
  const lead = soundLead(sound);
  const usePiano = !!piano && sound.source !== 'video';
  if (!src && !usePiano) throw new Error('There is no sound to export.');
  const swell = lead > 0 ? { data: await swellFor(src, sound, usePiano ? piano : null, span[0], lead), rate: EXPORT_RATE } : null;
  const ctx = new OfflineAudioContext(2, Math.ceil((lead + dur + soundTail(sound)) * EXPORT_RATE), EXPORT_RATE);
  const chain = new SoundChain(ctx, { sound, span, measuredLufs, swell }, ctx.destination);
  if (src && sound.source !== 'piano') {
    const node = ctx.createBufferSource();
    node.buffer = src;
    node.connect(chain.input);
    node.start(lead, span[0], dur);
  }
  if (usePiano) playPiano(ctx, piano!, chain.pianoIn, span[0], span[1] + 0.05, lead);
  chain.schedule(lead);
  return ctx.startRendering();
}

/** the loudness of the sound before the chain (for evening it out when the piano plays), LUFS */
export async function sourceLoudness(src: AudioBuffer | null, sound: Sound, piano: PianoPart | null, span: [number, number]): Promise<number> {
  const b = await renderSource(src, sound, piano, span[0], span[1]);
  return integratedLoudness([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
}

/** the swell is made of the opening notes as they sound: the video's, the piano's, or both */
export async function swellFor(src: AudioBuffer | null, sound: Sound, piano: PianoPart | null, at: number, len: number) {
  if (!piano || sound.source === 'video') return reverseSwell(src!, at, len, EXPORT_RATE);
  const open = await renderSource(src, sound, piano, at, at + 3);
  return reverseSwell(open, 0, len, EXPORT_RATE);
}

/** 16-bit stereo WAV, dithered (a touch of noise below hearing so quiet fades don't turn grainy) */
export function wavBytes(buf: AudioBuffer): Uint8Array {
  const ch = Math.min(2, buf.numberOfChannels), n = buf.length, rate = buf.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const text = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  text(36, 'data'); data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  const rnd = mulberry32(7);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = chans[c][i] * 32767 + (rnd() - rnd());
      data.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(v))), true);
      o += 2;
    }
  }
  return new Uint8Array(data.buffer);
}
