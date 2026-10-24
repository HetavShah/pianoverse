// Headless check: loads the built app in Chromium with WebGPU (software), opens the sample, renders given times.
import { chromium } from 'playwright';
import fs from 'node:fs';
const [,, video, project, outDir, ...times] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.pianoverse?.renderer, null, { timeout: 60000 });
const inputs = await page.$$('input[type=file]');
await inputs[0].setInputFiles(video);
await inputs[1].setInputFiles(project);
await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.readyState >= 2; }, null, { timeout: 60000 });
await page.selectOption('select', process.env.SCALE || '1');
if (process.env.OFF) await page.evaluate((off) => { const r = window.pianoverse.renderer; for (const k of off.split(',')) r.layers[k] = false; }, process.env.OFF);
for (const t of times) {
  const t0 = Date.now();
  try {
  await page.evaluate(async (tt) => {
    const v = document.querySelector('video');
    await new Promise((res) => { v.addEventListener('seeked', res, { once: true }); v.currentTime = tt; });
    const r = window.pianoverse.renderer;
    await r.done();
  }, Number(t));
  const dataUrl = await page.evaluate(async () => {
    const r = window.pianoverse.renderer;
    const v = document.querySelector('video');
    const fc = document.createElement('canvas');
    fc.width = v.videoWidth; fc.height = v.videoHeight;
    fc.getContext('2d').drawImage(v, 0, 0);
    const img = await r.capture(fc, v.currentTime);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer), img.width, img.height), 0, 0);
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(`${outDir}/t${t}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const stats = await page.evaluate(() => JSON.stringify(window.pianoverse.renderer.stats));
  console.log(`t=${t} rendered in ${Date.now() - t0} ms`, stats);
  } catch (e) { console.log('render failed:', e.message.split('\n')[0]); break; }
}
console.log('errors:', errors.length ? errors.slice(0, 20).join('\n') : 'none');
await browser.close();
