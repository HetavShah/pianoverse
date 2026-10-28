// Screenshots of each step of the app, on the sample take, for the README.
// usage: node website/tools/screens.mjs <outDir>   (needs the vite preview on :4173)
import { createRequire } from 'module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = createRequire(new URL('../../package.json', import.meta.url))('playwright');
const OUT = resolve(process.argv[2] ?? 'website/.work/screens'); mkdirSync(OUT, { recursive: true });
process.chdir(new URL('../..', import.meta.url).pathname);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => { window.__pvHeadless = true; localStorage.clear(); });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', 'samples/interstellar-take1.mp4'); await page.waitForTimeout(2000);
const seek = (t) => page.evaluate((t) => new Promise((res) => { const v = document.querySelector('video'); if (!v) return res(); v.addEventListener('seeked', () => setTimeout(res, 400), { once: true }); v.currentTime = t; }), t);
// headless WebGPU can't keep a live preview going, so draw this frame with the renderer and lay it over the preview canvas
const fill = () => page.evaluate(async () => {
  document.querySelectorAll('.pv-shot').forEach((e) => e.remove());
  const cv = document.querySelector('canvas.preview-canvas'), v = document.querySelector('video'), r = window.pianoverse?.renderer;
  if (!cv || !v || !r || !cv.offsetParent) return;
  const fc = document.createElement('canvas'); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
  r.setOutput([cv.width, cv.height]); r.setScale(1);
  await r.texturesReady();
  const img = await r.capture(fc, v.currentTime);
  r.setOutput(null); r.setScale(0.5);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  const rect = cv.getBoundingClientRect(), el = document.createElement('img');
  el.className = 'pv-shot'; el.src = c.toDataURL('image/png');
  Object.assign(el.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px', zIndex: 5, pointerEvents: 'none' });
  document.body.appendChild(el); await el.decode();
});
const shot = async (file) => { await fill().catch((e) => console.log('fill', e.message)); await page.screenshot({ path: `${OUT}/${file}.png` }); console.log('shot', file); };
const step = async (name, wait = 2000) => { await page.click(`.stepper [title="${name}"]`); await page.waitForTimeout(wait); await seek(24.1); await page.waitForTimeout(2500); };
await step('Import'); await shot('screen-import');
await step('Audio', 4000); await shot('screen-sync');
await page.click('button:has-text("Sound")').catch(() => {}); await page.waitForTimeout(6000); await shot('screen-sound');
await step('Calibrate', 3000); await shot('screen-calibrate');
await step('Style', 3000); await shot('screen-style');
await page.click('.layer-row >> text=Particles').catch(() => {}); await page.waitForTimeout(2500); await shot('screen-style-particles');
await step('Light', 3000); await shot('screen-light');
await step('Camera', 3000); await shot('screen-camera');
await page.click('.stepper [title="Export"]'); await page.waitForTimeout(8000); await shot('screen-export');
await b.close();
