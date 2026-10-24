import { readFileSync } from 'node:fs';
import { findOffset, onsetEnvelope } from '../src/engine/sync';
import { mulberry32 } from '../src/engine/project';
const buf = readFileSync(process.argv[2] ?? 'test/out/inter.f32');
const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const proj = JSON.parse(readFileSync('samples/interstellar-take1.pvproj.json', 'utf8'));
let t = performance.now();
const env = onsetEnvelope(audio, 22050);
console.log(`audio ${(audio.length / 22050).toFixed(1)} s -> envelope ${env.length} frames in ${(performance.now() - t).toFixed(0)} ms`);
const r = mulberry32(9);
const cases: [string, number, boolean][] = [['MIDI started 3.217 s before the video', 3.217, false], ['MIDI started 5.5 s after the video', -5.5, false], ['+12.04 s, messy (jitter ±20 ms, 20% dropped, 10% extra)', 12.04, true], ['-0.73 s, messy', -0.73, true]];
for (const [label, off, messy] of cases) {
  let notes = proj.notes.map((n: any) => ({ ...n, s: n.s - off, e: n.e - off }));
  if (messy) {
    notes = notes.filter(() => r() > 0.2).map((n: any) => ({ ...n, s: n.s + (r() - 0.5) * 0.04 }));
    const extra = Math.round(notes.length * 0.1);
    for (let i = 0; i < extra; i++) { const s = r() * 60 - off; notes.push({ s, e: s + 0.3, p: 40 + Math.floor(r() * 40), v: 0.45 }); }
    notes.sort((a: any, b: any) => a.s - b.s);
  }
  t = performance.now();
  const res = findOffset(env, notes);
  console.log(`${label.padEnd(58)} found ${res.offset.toFixed(3)} s (error ${((res.offset - off) * 1000).toFixed(1)} ms, confidence ${res.confidence.toFixed(2)} z ${res.z!.toFixed(1)}/${res.zSecond!.toFixed(1)}, ${(performance.now() - t).toFixed(0)} ms)`);
}
// a wrong-song control: notes from a shuffled timeline should give low confidence
const shuffled = proj.notes.map((n: any) => { const s = r() * 60; return { ...n, s, e: s + 0.3 }; }).sort((a: any, b: any) => a.s - b.s);
const ctl = findOffset(env, shuffled);
console.log(`control: unrelated notes -> confidence ${ctl.confidence.toFixed(2)} z ${ctl.z!.toFixed(1)}/${ctl.zSecond!.toFixed(1)}`);
for (let k = 0; k < 4; k++) {
  const sh = proj.notes.map((n: any) => { const s = r() * 60; return { ...n, s, e: s + 0.3 }; }).sort((a: any, b: any) => a.s - b.s);
  const c = findOffset(env, sh); console.log(`control ${k}: z ${c.z!.toFixed(1)}/${c.zSecond!.toFixed(1)}`);
}
// half the song only (notes from 30-60 s), to check partial overlaps
const half = proj.notes.filter((n: any) => n.s > 30).map((n: any) => ({ ...n, s: n.s - 7, e: n.e - 7 }));
const h = findOffset(env, half); console.log(`second half only, true 7: found ${h.offset.toFixed(3)} z ${h.z!.toFixed(1)}/${h.zSecond!.toFixed(1)}`);
