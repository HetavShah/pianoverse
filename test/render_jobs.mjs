// Render a list of frames through the real engine, each with its own time, look, shape sections and scale.
// usage: CLIP=video node test/render_jobs.mjs jobs.json   (jobs: [{out, t, look, scenes?, scale}])
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8')).filter((j) => !existsSync(j.out));
const CLIP = process.env.CLIP;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
const PROJ = 'samples/interstellar-take1.pvproj.json';
await page.setInputFiles('.row-actions input[type=file]', PROJ); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', CLIP); await page.waitForTimeout(1500);
const base = JSON.parse(readFileSync(PROJ, 'utf8'));
const t0 = Date.now(); let n = 0;
for (const j of jobs) {
  const proj = { ...base, look: j.look ?? {}, particleScenes: j.scenes ?? [] };
  const url = await page.evaluate(async ({ proj, t, scale }) => {
    const r = window.pianoverse.renderer;
    if (Math.abs(r.size.width / proj.video.width - scale) > 1e-6) r.setScale(scale);
    r.setProject(proj);
    await r.texturesReady?.();
    const v = document.querySelector('video');
    if (Math.abs(v.currentTime - t) > 1e-4) { v.currentTime = t; await new Promise((res) => v.addEventListener('seeked', res, { once: true })); }
    const fc = (window.__fc ??= document.createElement('canvas')); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
    const img = await r.capture(fc, t);
    const c = (window.__oc ??= document.createElement('canvas')); c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    return c.toDataURL('image/jpeg', 0.93);
  }, { proj, t: j.t, scale: j.scale });
  writeFileSync(j.out, Buffer.from(url.split(',')[1], 'base64'));
  if (++n % 30 === 0) console.log(n, 'of', jobs.length, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
console.log('done', n, ((Date.now() - t0) / 1000).toFixed(0) + 's');
await b.close();
