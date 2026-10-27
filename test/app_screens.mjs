// Screenshots of every step of the real app for the README and the website.
// usage: node test/app_screens.mjs <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'test/out/screens'; mkdirSync(OUT, { recursive: true });
const CLIP = process.env.CLIP ?? '/home/claude/sample15a.webm';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', CLIP); await page.waitForTimeout(1500);
const seek = (t) => page.evaluate((t) => new Promise((res) => { const v = document.querySelector('video'); v.addEventListener('seeked', () => setTimeout(res, 400), { once: true }); v.currentTime = t; }), t);
const step = async (name, file, wait = 1500) => { await page.click(`.stepper >> text=${name}`); await page.waitForTimeout(wait); await seek(9.2); await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/${file}.png` }); console.log('shot', file); };
await step('Import', 'screen-import');
await step('Video', 'screen-video');
await step('Audio', 'screen-sync', 2500);
await step('Calibrate', 'screen-calibrate', 2500);
await page.evaluate(() => { window.__pvHeadless = false; });
await step('Style', 'screen-style', 2500);
for (const [tab, file] of [['Colours', 'screen-style-colours'], ['Particles', 'screen-style-particles'], ['Notes', 'screen-style-notes']]) {
  await page.click(`.layer-row >> text=${tab}`); await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/${file}.png` }); console.log('shot', file);
}
await page.evaluate(() => { window.__pvHeadless = true; });
await page.click('.stepper >> text=Export'); await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/screen-export.png` }); console.log('shot screen-export');
await b.close();
