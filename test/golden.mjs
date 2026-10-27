// Golden frames: renders a fixed set of frames (every built-in look, several moments, lighting, crop, the camera,
// titles and the transparent effects pass) and compares them with a recorded set, so a refactor can prove the
// picture did not change.
//   node test/golden.mjs record   write the reference frames to test/out/golden
//   node test/golden.mjs          render again and compare (fails on any visible difference)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const MODE = process.argv[2] === 'record' ? 'record' : 'check';
const DIR = 'test/out/golden';
mkdirSync(DIR, { recursive: true });

const LOOKS = ['Lagoon', 'Concert', 'Ember', 'Neon Night', 'Aurora', 'Swan', 'Gold Leaf', 'Ink', 'Synthwave', 'Ocean Gem', 'Crystal'];
const FIT = { x0: -0.26, k: 0.055, sh: 0.86 };
const MOODY = { exposure: 0.1, contrast: 1.1, highlights: 0.1, shadows: -0.2, warmth: 0.2, saturation: 0.9, room: 0.25, reach: 1, softness: 0.8, vignette: 0.4 };
// [name, look, time, project changes, renderer setup]
const CASES = [
  ...LOOKS.map((l) => [`look-${l}`, l, 24.2, {}, null]),
  ['lagoon-26.8', 'Lagoon', 26.8, {}, null],
  ['lagoon-22.6', 'Lagoon', 22.6, {}, null],
  ['lagoon-moody', 'Lagoon', 24.2, { lighting: MOODY }, null],
  ['lagoon-crop', 'Lagoon', 24.2, { edit: { crop: { x: 0, y: 420, w: 1080, h: 1080 } } }, null],
  ['concert-camera', 'Concert', 24.2, {}, { output: [1080, 1920], view: { x: 200, y: 700, w: 500, h: 888.9 }, fade: [0.3, 0] }],
  ['concert-titles', 'Concert', 1.0, { titles: { intro: { on: true, title: 'Interstellar', subtitle: 'Hans Zimmer', credit: '', dur: 4.5 } } }, null],
  ['lagoon-alpha', 'Lagoon', 24.2, {}, { alpha: true }],
  ['lagoon-labels-bars', 'Lagoon', 24.2, { look: { labels: true, barLines: true, barOpacity: 0.6 }, noteSource: { bars: [22, 23.5, 25, 26.5, 28], offset: 0.1 } }, null],
  ['plume', 'Lagoon', 24.4, { look: { partMode: 'plume', partRays: true } }, null],
  ['spray', 'Lagoon', 24.4, { look: { partMode: 'spray' } }, null],
  ['vortex', 'Lagoon', 24.4, { look: { partMode: 'vortex' } }, null],
  ['shape', 'Lagoon', 25.0, { look: { partMode: 'shape', partShape: 'heart' } }, null],
  ['shape-section', 'Concert', 25.0, { particleScenes: [{ id: 's1', start: 23, end: 27, shape: 'star', size: 1, dir: 'cw' }] }, null],
  ['texture-ice', 'Concert', 24.2, { look: { noteDim: '3d', note3d: 'glass', texOn: true, noteTexture: 'ice' } }, null],
  ['background', 'Concert', 24.2, { look: { bgColorOn: true, bgColor: '#203040', footScale: 0.8, footRot: 5, footX: 0.05 } }, null],
];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (/favicon/.test(JSON.stringify(m.location()))) return; if (m.type() === 'error' || /\[gpu\]/.test(m.text())) errors.push(m.text()); });
await page.addInitScript(() => { window.__pvHeadless = true; localStorage.clear(); });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
const proj = JSON.parse(readFileSync('samples/interstellar-take1.pvproj.json', 'utf8'));
proj.keyboard.fit = FIT;
writeFileSync('test/out/golden-project.pvproj.json', JSON.stringify(proj));
await page.setInputFiles('.row-actions input[type=file]', 'test/out/golden-project.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', 'samples/interstellar-take1.mp4'); await page.waitForTimeout(1500);
await page.click('.stepper [title="Style"]'); await page.waitForTimeout(1000);
await page.keyboard.press('0'); await page.waitForTimeout(500);

let fails = 0;
let lastLook = '';
for (const [name, look, t, change, setup] of CASES) {
  if (look !== lastLook) { await page.locator('.look-card', { hasText: look }).first().click(); await page.waitForTimeout(600); lastLook = look; }
  const png = await page.evaluate(async ({ t, change, setup }) => {
    const r = window.pianoverse.renderer, v = document.querySelector('video');
    const base = window.__goldenBase ??= r.project;
    if (Math.abs(v.currentTime - t) > 1e-3) { v.currentTime = t; await new Promise((res) => v.addEventListener('seeked', res, { once: true })); }
    r.setProject({ ...base, presetId: r.project.presetId, ...change, look: { ...r.project.look, ...(change.look ?? {}) } });
    r.setOutput(setup?.output ?? null);
    r.setView(setup?.view ?? null, setup?.fade ?? null);
    r.alphaOut = !!setup?.alpha;
    r.setScale(setup?.output ? 0.5 : 0.5);
    await r.texturesReady();
    const fc = (window.__fc ??= document.createElement('canvas')); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
    const img = await r.capture(fc, t);
    r.alphaOut = false; r.setView(null); r.setOutput(null);
    r.setProject({ ...base, look: r.project.look, presetId: r.project.presetId });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    return c.toDataURL('image/png');
  }, { t, change, setup });
  const file = `${DIR}/${name}.png`;
  const buf = Buffer.from(png.split(',')[1], 'base64');
  if (MODE === 'record') { writeFileSync(file, buf); console.log('recorded', name); continue; }
  if (!existsSync(file)) { console.log('MISSING', name); fails++; continue; }
  writeFileSync(`${DIR}/${name}.new.png`, buf);
  // compare in the page: decode both PNGs and measure the difference
  const ref = readFileSync(file).toString('base64');
  const d = await page.evaluate(async ({ a, bb }) => {
    const load = (s) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + s; });
    const [A, B] = await Promise.all([load(a), load(bb)]);
    if (A.width !== B.width || A.height !== B.height) return { size: `${A.width}×${A.height} vs ${B.width}×${B.height}` };
    const px = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    const p = px(A), q = px(B);
    let max = 0, sum = 0, over = 0;
    for (let i = 0; i < p.length; i++) { const e = Math.abs(p[i] - q[i]); sum += e; if (e > max) max = e; if (e > 8) over++; }
    return { max, mean: sum / p.length, over };
  }, { a: ref, bb: buf.toString('base64') });
  const ok = !d.size && d.mean < 0.05 && d.over < 50;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}  ${d.size ?? `max ${d.max} mean ${d.mean.toFixed(4)} pixels>8: ${d.over}`}`);
}
if (errors.length) { fails++; console.log('ERRORS', errors.slice(0, 5).join(' | ')); }
console.log(MODE === 'record' ? 'recorded' : fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
process.exit(fails && MODE === 'check' ? 1 : 0);
