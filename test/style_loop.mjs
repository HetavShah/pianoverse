// Style screen: click the preview to play/pause, drag a section on the timeline and check playback loops it.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = 'test/out/design'; mkdirSync(OUT, { recursive: true });
const CLIP = process.env.CLIP ?? '/home/claude/sample15a.webm';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json');
await page.waitForTimeout(800);
await page.setInputFiles('.file-card .actions input[type=file]', CLIP);
await page.waitForTimeout(1500);
await page.click('.stepper [title="Style"]');
await page.waitForTimeout(1200);
const vtime = () => page.evaluate(() => document.querySelector('video').currentTime);
const paused = () => page.evaluate(() => document.querySelector('video').paused);
await page.click('.preview-frame');
await page.waitForTimeout(1200);
console.log('after clicking preview: paused =', await paused(), 't =', (await vtime()).toFixed(2));
await page.click('.preview-frame');
await page.waitForTimeout(300);
console.log('after clicking again: paused =', await paused());
// drag a section from 4 s to 6 s on the timeline
const c = await page.$eval('.tl-body canvas', (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const dur = await page.evaluate(() => document.querySelector('video').duration);
const X = (t) => c.x + (t / dur) * c.w;
await page.mouse.move(X(4), c.y + 45); await page.mouse.down(); await page.mouse.move(X(6), c.y + 45, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(300);
console.log('head:', await page.$eval('.tl-head', (e) => e.textContent.replace(/\s+/g, ' ').trim()));
await page.click('.preview-frame'); // play: should start at 4 s
const seen = [];
for (let i = 0; i < 16; i++) { await page.waitForTimeout(250); seen.push(+(await vtime()).toFixed(2)); }
console.log('playback times while looping 4-6 s:', seen.join(' '));
console.log('stayed inside the section:', seen.every((t) => t >= 3.9 && t <= 6.2), '| wrapped:', seen.some((t, i) => i > 0 && t < seen[i - 1]));
await page.click('.preview-frame');
await page.screenshot({ path: `${OUT}/9-style-loop.png` });
await page.locator('.style-timeline').screenshot({ path: `${OUT}/9b-timeline.png` });
// click on the timeline jumps
await page.mouse.click(X(10), c.y + 45); await page.waitForTimeout(300);
console.log('after clicking the timeline at 10 s: t =', (await vtime()).toFixed(2));
await b.close();
