// Browser-side harness for test/sound_engine.mjs: decode, render with settings, measure.
import { renderSound, wavBytes, EXPORT_RATE } from '../../src/engine/audio/mixdown';
import { integratedLoudness } from '../../src/engine/audio/loudness';
import { resolveSound, Sound } from '../../src/engine/audio/sound';

let src: AudioBuffer | null = null;
async function load(url: string) {
  const bytes = await (await fetch(url)).arrayBuffer();
  src = await new OfflineAudioContext(2, 1, EXPORT_RATE).decodeAudioData(bytes);
  return { duration: src.duration, channels: src.numberOfChannels };
}
const chans = (b: AudioBuffer) => Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
async function render(s: Partial<Sound>, span: [number, number], measured: boolean, keep = false) {
  const sound = resolveSound(s);
  const lufsIn = integratedLoudness(chans(src!), EXPORT_RATE, span[0], span[1]);
  const out = await renderSound(src!, sound, span, measured ? lufsIn : null);
  const c = chans(out);
  // level every 100 ms, dBFS rms
  const win = EXPORT_RATE / 10, levels: number[] = [];
  let peak = 0;
  for (let i = 0; i + win <= out.length; i += win) {
    let e = 0;
    for (const ch of c) for (let j = i; j < i + win; j++) { e += ch[j] * ch[j]; peak = Math.max(peak, Math.abs(ch[j])); }
    levels.push(Math.round(10 * Math.log10(e / (win * c.length) + 1e-12) * 10) / 10);
  }
  const res: Record<string, unknown> = { lufsIn, lufsOut: integratedLoudness(c, EXPORT_RATE), peakDb: 20 * Math.log10(peak), seconds: out.length / EXPORT_RATE, levels };
  if (keep) { const w = wavBytes(out); let s2 = ''; for (let i = 0; i < w.length; i += 0x8000) s2 += String.fromCharCode.apply(null, Array.from(w.subarray(i, i + 0x8000))); res.wav = btoa(s2); }
  return res;
}
// a sine through the chain with every setting neutral: the level must not change
async function neutralSine() {
  const ctx = new OfflineAudioContext(1, EXPORT_RATE * 2, EXPORT_RATE);
  const b = ctx.createBuffer(1, EXPORT_RATE * 2, EXPORT_RATE); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / EXPORT_RATE);
  const out = await renderSound(b, resolveSound({ hall: 0 }), [0, 2], null);
  const o = out.getChannelData(0); let e = 0, n = 0;
  for (let i = EXPORT_RATE / 2; i < EXPORT_RATE * 1.5; i++) { e += o[i] * o[i]; n++; }
  return 20 * Math.log10(Math.sqrt(e / n) / (0.25 / Math.SQRT2));
}
(window as any).pv = { load, render, neutralSine };
