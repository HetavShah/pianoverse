// Render fixed frames of the sample through the real engine (offscreen) for look comparisons.
// usage: node test/look_frames.mjs <outDir> [lookJSON]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'test/out/look'; mkdirSync(OUT, { recursive: true });
const LOOK = process.argv[3] ? JSON.parse(process.argv[3].startsWith('{') ? process.argv[3] : readFileSync(process.argv[3], 'utf8')) : null;
const CLIP = process.env.CLIP ?? '/home/claude/sample15a.webm';
const TIMES = (process.env.TIMES ?? '3.5,6.0,9.2,12.4').split(',').map(Number);
const SCALE = Number(process.env.SCALE ?? 0.5);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) console.log('[console]', m.text()); });
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
const PROJ = process.env.PROJ ?? 'samples/interstellar-take1.pvproj.json';
await page.setInputFiles('.row-actions input[type=file]', PROJ);
await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', CLIP);
await page.waitForTimeout(1500);
const proj = JSON.parse(readFileSync(PROJ, 'utf8'));
if (LOOK) proj.look = { ...(proj.look ?? {}), ...LOOK };
if (process.env.SCENES) proj.particleScenes = JSON.parse(process.env.SCENES);
// optional background / texture image for 'user:test'
const EXTRA = process.env.USERIMG ? readFileSync(process.env.USERIMG).toString('base64') : null;
const EXTRA_TYPE = process.env.USERIMG?.endsWith('.webm') ? 'video/webm' : process.env.USERIMG?.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
if (EXTRA) await page.evaluate(({ b64, type }) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bin], { type });
  window.pianoverse.renderer.userFiles = async (id) => (id === 'test' ? (type.startsWith('video') ? { video: blob } : { color: blob }) : null);
}, { b64: EXTRA, type: EXTRA_TYPE });
for (const t of TIMES) {
  const url = await page.evaluate(async ({ proj, t, scale, layers }) => {
    const r = window.pianoverse.renderer;
    r.setScale(scale);
    if (layers) r.layers = { ...r.layers, ...layers };
    r.setProject(proj);
    await r.texturesReady?.();
    const v = document.querySelector('video');
    v.currentTime = t; await new Promise((res) => v.addEventListener('seeked', res, { once: true }));
    const fc = document.createElement('canvas'); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
    const img = await r.capture(fc, t);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    return c.toDataURL('image/png');
  }, { proj, t, scale: SCALE, layers: process.env.LAYERS ? JSON.parse(process.env.LAYERS) : null });
  writeFileSync(`${OUT}/t${Number.isInteger(Math.round(t * 1000) / 100) ? t.toFixed(1) : t.toFixed(3)}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
console.log('wrote', TIMES.length, 'frames to', OUT);
await b.close();
