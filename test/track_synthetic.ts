// Stress test: warp the sample frames with a known moving camera (pan, zoom, roll, shake) and track it.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { KeyboardTracker, GrayImage } from '../src/engine/tracker';
import { apply, cornersOf, inv, mul, Pt, Quad } from '../src/engine/geometry';
import { resampleTracking, smooth } from '../src/engine/calibration';

const proj = JSON.parse(readFileSync('samples/interstellar-take1.pvproj.json', 'utf8'));
const W = 540, H = 960, SCALE = 0.5, N = Number(process.env.N ?? 900), STEP = Number(process.env.STEP ?? 1);
const REF = 300;
const truth = (f: number): Quad => cornersOf([...proj.tracking.frames[f], 1], proj.keyboard.whiteKeys);

// camera motion in full-res pixels about the frame centre
function motion(f: number) {
  const t = f / 30;
  const tx = 80 * Math.sin(t * 0.45) + 6 * Math.sin(t * 7.1) + 3 * Math.sin(t * 13.7);
  const ty = 50 * Math.sin(t * 0.31 + 1) + 5 * Math.cos(t * 6.3);
  const s = 1 + 0.07 * Math.sin(t * 0.22);
  const a = (2.5 * Math.sin(t * 0.37) + 0.4 * Math.sin(t * 5.3)) * Math.PI / 180;
  const cx = 540, cy = 960;
  const c = Math.cos(a) * s, sn = Math.sin(a) * s;
  // p' = R*S*(p - c) + c + t
  return [c, -sn, cx - c * cx + sn * cy + tx, sn, c, cy - sn * cx - c * cy + ty, 0, 0, 1];
}
const toTrack = [SCALE, 0, 0, 0, SCALE, 0, 0, 0, 1];
function warp(img: GrayImage, M: number[]): GrayImage {
  const Mt = mul(mul(toTrack, M), inv(toTrack));
  const Mi = inv(Mt);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [sx, sy] = apply(Mi, x, y);
    if (sx < 0 || sy < 0 || sx > W - 1.001 || sy > H - 1.001) { out[y * W + x] = 0; continue; }
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i = y0 * W + x0, d = img.data;
    out[y * W + x] = d[i] * (1 - fx) * (1 - fy) + d[i + 1] * fx * (1 - fy) + d[i + W] * (1 - fx) * fy + d[i + W + 1] * fx * fy;
  }
  return { w: W, h: H, data: out };
}
async function frames(): Promise<GrayImage[]> {
  const ff = spawn('ffmpeg', ['-v', 'error', '-i', 'samples/interstellar-take1.mp4', '-frames:v', String(N), '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const chunks: Buffer[] = [];
  for await (const c of ff.stdout) chunks.push(c as Buffer);
  const buf = Buffer.concat(chunks);
  const out: GrayImage[] = [];
  for (let i = 0; i < Math.floor(buf.length / (W * H)); i++) {
    const d = new Float32Array(W * H);
    for (let j = 0; j < W * H; j++) d[j] = buf[i * W * H + j] / 255;
    out.push(warp({ w: W, h: H, data: d }, motion(i)));
  }
  return out;
}
const gt = (f: number) => truth(f).map(([x, y]) => apply(motion(f), x, y)) as Quad;
const fr = await frames();
const tr = new KeyboardTracker({ ref: fr[REF], scale: SCALE, corners: gt(REF), whiteKeys: proj.keyboard.whiteKeys });
const samples: { t: number; corners: Quad | null; quality: number }[] = [];
const methods: Record<string, number> = {};
const t1 = performance.now();
let n = 0;
for (let f = 0; f < fr.length; f += STEP) {
  const r = tr.step(fr[f]); n++;
  methods[r.method] = (methods[r.method] ?? 0) + 1;
  samples.push({ t: f / 30, corners: r.corners, quality: r.tracked ? r.inliers / r.tracked : 0 });
}
console.log(`frames ${fr.length} (every ${STEP}) ms/frame ${((performance.now() - t1) / n).toFixed(1)}`, methods);
const { raw } = resampleTracking(samples, 30, fr.length);
const SIGMAS = [0.6, 0.9, 1.2, 1.6];
const sm = smooth(raw as number[][]);
const travel = Math.max(...fr.map((_, f) => Math.hypot(gt(f)[0][0] - gt(0)[0][0], gt(f)[0][1] - gt(0)[0][1])));
for (const [name, rows] of [['raw', raw], ['smooth', sm]] as const) {
  const e = (rows as number[][]).map((r, f) => Math.max(...gt(f).map((p: Pt, c) => Math.hypot(r[2 * c] - p[0], r[2 * c + 1] - p[1]))));
  const s = [...e].sort((a, b) => a - b);
  console.log(`${name.padEnd(6)} error px: mean ${(e.reduce((a, b) => a + b) / e.length).toFixed(2)} p95 ${s[Math.floor(s.length * 0.95)].toFixed(2)} max ${s[s.length - 1].toFixed(2)} @ ${e.indexOf(s[s.length - 1])}`);
}
console.log('camera travel of back-left corner px:', travel.toFixed(0));

for (const sg of SIGMAS) {
  const rows = smooth(raw as number[][], sg);
  const T = (f: number) => (typeof gt === 'function' ? gt(f) : truth(f));
  const e = rows.map((r, f) => Math.max(...T(f).map((p: number[], c: number) => Math.hypot(r[2 * c] - p[0], r[2 * c + 1] - p[1]))));
  const s2 = [...e].sort((a, b) => a - b);
  console.log(`sigma ${sg}: mean ${(e.reduce((a, b) => a + b) / e.length).toFixed(2)} p95 ${s2[Math.floor(s2.length * 0.95)].toFixed(2)} max ${s2[s2.length - 1].toFixed(2)}`);
}
