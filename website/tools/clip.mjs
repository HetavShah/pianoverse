// Render a run of frames of the sample take straight from the app's renderer (for the website).
// usage: node clip.mjs <outDir> <from> <to> <fps> [view x,y,w,h] ; env SETUP=heart|light:<preset>, LOOK=<index>, OUTW,OUTH
import { createRequire } from 'module';
const { chromium } = createRequire(new URL('../../package.json', import.meta.url))('playwright');
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const [OUT0, FROM, TO, FPS, VIEW] = process.argv.slice(2); const OUT = resolve(OUT0); mkdirSync(OUT, { recursive: true });
const view = VIEW ? VIEW.split(',').map(Number) : [0, 560, 1080, 607.5];
const outW = Number(process.env.OUTW ?? 1920), outH = Number(process.env.OUTH ?? 1080);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => { window.__pvHeadless = true; localStorage.clear(); });
process.chdir(new URL('../..', import.meta.url).pathname);
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', 'samples/interstellar-take1.mp4'); await page.waitForTimeout(1500);
await page.click('.stepper [title="Style"]'); await page.waitForTimeout(1000);
if (process.env.LOOK) { await page.locator('.look-card').nth(Number(process.env.LOOK)).click(); await page.waitForTimeout(600); }
const setup = process.env.SETUP ?? '';
if (setup === 'heart') {
  await page.click('.layer-row >> text=Particles'); await page.waitForTimeout(300);
  await page.click('button:has-text("+ At the start")'); await page.waitForTimeout(400);
  console.log('sections', JSON.stringify(await page.evaluate(() => window.pianoverseProject.particleScenes)));
}
if (setup.startsWith('light:')) {
  await page.click('.layer-row >> text=Lighting'); await page.waitForTimeout(300);
  await page.click(`text=${setup.slice(6)}`); await page.waitForTimeout(400);
}
const from = Number(FROM), to = Number(TO), fps = Number(FPS);
const n = Math.max(1, Math.round((to - from) * fps));
for (let i = 0; i < n; i++) {
  const t = from + i / fps;
  const jpg = await page.evaluate(async ([t, view, outW, outH]) => {
    const r = window.pianoverse.renderer, v = document.querySelector('video');
    if (Math.abs(v.currentTime - t) > 1e-3) { v.currentTime = t; await new Promise((res) => v.addEventListener('seeked', res, { once: true })); }
    r.setOutput([outW, outH]); r.setScale(1); r.setView({ x: view[0], y: view[1], w: view[2], h: view[3] });
    await r.texturesReady();
    const fc = document.createElement('canvas'); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
    const img = await r.capture(fc, t);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    return c.toDataURL('image/jpeg', 0.92);
  }, [t, view, outW, outH]);
  writeFileSync(`${OUT}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(jpg.split(',')[1], 'base64'));
  if (i % 30 === 0) console.log('frame', i, '/', n);
}
await b.close();
