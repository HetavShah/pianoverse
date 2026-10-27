// The export's soundtrack: the part of the video's audio in use, run through the sound chain offline (faster than
// real time) and written as a WAV file for the encoder. The swell comes before the video and the ring-out after it.
import { mulberry32 } from '../random';
import { Sound, soundLead, soundTail } from './sound';
import { reverseSwell } from './synth';
import { SoundChain } from './soundChain';

export const EXPORT_RATE = 48000;

/**
 * Render the sound for span = [start, end] seconds of the video. The result begins with the swell (if any) and runs
 * on with the ring-out (if any): soundLead + the span + soundTail seconds.
 */
export async function renderSound(src: AudioBuffer, sound: Sound, span: [number, number], measuredLufs: number | null): Promise<AudioBuffer> {
  const dur = Math.max(0.05, span[1] - span[0]);
  const lead = soundLead(sound);
  const swell = lead > 0 ? { data: await reverseSwell(src, span[0], lead, EXPORT_RATE), rate: EXPORT_RATE } : null;
  const ctx = new OfflineAudioContext(2, Math.ceil((lead + dur + soundTail(sound)) * EXPORT_RATE), EXPORT_RATE);
  const chain = new SoundChain(ctx, { sound, span, measuredLufs, swell }, ctx.destination);
  const node = ctx.createBufferSource();
  node.buffer = src;
  node.connect(chain.input);
  node.start(lead, span[0], dur);
  chain.schedule(lead);
  return ctx.startRendering();
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
