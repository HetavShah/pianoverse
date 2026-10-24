// Track the sample video from one marked frame and compare with the precomputed (Python) tracking.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { KeyboardTracker, GrayImage } from '../src/engine/tracker';
import { cornersOf, Quad } from '../src/engine/geometry';
declare const gt: any;
import { resampleTracking, smooth } from '../src/engine/calibration';

const proj = JSON.parse(readFileSync('samples/interstellar-take1.pvproj.json', 'utf8'));
const W = 540, H = 960, SCALE = 0.5;
const REF = Number(process.env.REF ?? 300);
const truth = (f: number): Quad => cornersOf([...proj.tracking.frames[f], 1], proj.keyboard.whiteKeys);

async function frames(): Promise<GrayImage[]> {
  const ff = spawn('ffmpeg', ['-v', 'error', '-i', 'samples/interstellar-take1.mp4', '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const chunks: Buffer[] = [];
  for await (const c of ff.stdout) chunks.push(c as Buffer);
  const buf = Buffer.concat(chunks);
  const n = Math.floor(buf.length / (W * H));
  const out: GrayImage[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Float32Array(W * H);
    for (let j = 0; j < W * H; j++) d[j] = buf[i * W * H + j] / 255;
    out.push({ w: W, h: H, data: d });
  }
  return out;
}

const fr = await frames();
console.log('frames', fr.length, 'ref', REF);
const t0 = performance.now();
const tr = new KeyboardTracker({ ref: fr[REF], scale: SCALE, corners: truth(REF), whiteKeys: proj.keyboard.whiteKeys });
console.log('features', tr.featureCount, 'setup ms', (performance.now() - t0).toFixed(0));
const samples: { t: number; corners: Quad | null; quality: number }[] = [];
const methods: Record<string, number> = {};
const t1 = performance.now();
for (let f = 0; f < fr.length; f++) {
  const r = tr.step(fr[f]);
  methods[r.method] = (methods[r.method] ?? 0) + 1;
  samples.push({ t: f / 30, corners: r.corners, quality: r.tracked ? r.inliers / r.tracked : 0 });
}
const ms = (performance.now() - t1) / fr.length;
console.log('ms/frame', ms.toFixed(1), methods);
const { raw } = resampleTracking(samples, 30, fr.length);
const SIGMAS = [0.6, 0.9, 1.2, 1.6];
const sm = smooth(raw as number[][]);
const err = (rows: number[][]) => {
  const e: number[] = [];
  rows.forEach((r, f) => {
    const t = truth(f).flat();
    let m = 0;
    for (let c = 0; c < 4; c++) m = Math.max(m, Math.hypot(r[2 * c] - t[2 * c], r[2 * c + 1] - t[2 * c + 1]));
    e.push(m);
  });
  const s = [...e].sort((a, b) => a - b);
  return { mean: (e.reduce((a, b) => a + b, 0) / e.length).toFixed(2), p95: s[Math.floor(s.length * 0.95)].toFixed(2), max: s[s.length - 1].toFixed(2), worstFrame: e.indexOf(s[s.length - 1]), e };
};
const er = err(raw as number[][]), es = err(sm);
console.log('raw   corner error px (full res): mean', er.mean, 'p95', er.p95, 'max', er.max, '@', er.worstFrame);
console.log('smooth corner error px (full res): mean', es.mean, 'p95', es.p95, 'max', es.max, '@', es.worstFrame);
// how much does the truth itself move?
const mv = truth(0).map((p, i) => Math.max(...proj.tracking.frames.map((_: number[], f: number) => Math.hypot(truth(f)[i][0] - p[0], truth(f)[i][1] - p[1]))));
console.log('truth corner travel over clip px:', mv.map((v: number) => v.toFixed(1)).join(' '));
writeFileSync('test/out/track_err.json', JSON.stringify({ raw: er.e, smooth: es.e }));

for (const sg of SIGMAS) {
  const rows = smooth(raw as number[][], sg);
  const T = (f: number) => (typeof gt === 'function' ? gt(f) : truth(f));
  const e = rows.map((r, f) => Math.max(...T(f).map((p: number[], c: number) => Math.hypot(r[2 * c] - p[0], r[2 * c + 1] - p[1]))));
  const s2 = [...e].sort((a, b) => a - b);
  console.log(`sigma ${sg}: mean ${(e.reduce((a, b) => a + b) / e.length).toFixed(2)} p95 ${s2[Math.floor(s2.length * 0.95)].toFixed(2)} max ${s2[s2.length - 1].toFixed(2)}`);
}
