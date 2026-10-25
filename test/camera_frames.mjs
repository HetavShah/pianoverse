// Render frames of the sample take as PNG (exact pixels), optionally through a camera.
// usage: node test/camera_frames.mjs jobs.json   (jobs: [{out, t, look?, scale?, output?:[w,h], view?:{x,y,w,h}, fade?:[amount, white]}])
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const CLIP = process.env.CLIP ?? 'samples/interstellar-take1.mp4';
const PROJ = process.env.PROJ ?? 'samples/interstellar-take1.pvproj.json';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', PROJ); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', CLIP); await page.waitForTimeout(1500);
const base = JSON.parse(readFileSync(PROJ, 'utf8'));
for (const j of jobs) {
  const proj = { ...base, look: j.look ?? {}, particleScenes: [] };
  const png = await page.evaluate(async ({ proj, j }) => {
    const r = window.pianoverse.renderer;
    if (r.setOutput) r.setOutput(j.output ?? null);
    r.setScale(j.scale ?? 0.5);
    r.setProject(proj);
    if (r.setView) r.setView(j.view ?? null, j.fade ?? null);
    await r.texturesReady?.();
    const v = document.querySelector('video');
    if (Math.abs(v.currentTime - j.t) > 1e-4) { v.currentTime = j.t; await new Promise((res) => v.addEventListener('seeked', res, { once: true })); }
    const fc = (window.__fc ??= document.createElement('canvas')); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
    const img = await r.capture(fc, j.t);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    return c.toDataURL('image/png');
  }, { proj, j });
  writeFileSync(j.out, Buffer.from(png.split(',')[1], 'base64'));
}
console.log('done', jobs.length);
await b.close();
