// End-to-end: open the sample, import a MIDI recorded 2.345 s before the video, check the automatic sync,
// nudge it, then detect notes from the audio instead.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = 'test/out/notes'; mkdirSync(OUT, { recursive: true });
const CLIP = process.env.CLIP ?? '/home/claude/sample15a.webm'; // WebM with sound (headless Chromium has no H.264/AAC)
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.start label.btn.primary input[type=file]', [CLIP, 'samples/interstellar-take1.pvproj.json']);
await page.waitForTimeout(1200);
await page.click('.modes >> text=Notes');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/1-notes-tab.png` });
const proj = () => page.evaluate(() => window.pianoverseProject);
// import the MIDI through the panel's file input
await page.setInputFiles('.calib-panel input[type=file]', 'test/fixtures/interstellar-shifted.mid');
const t0 = Date.now();
await page.waitForFunction(() => window.pianoverseProject?.noteSource?.kind === 'midi' && window.pianoverseProject.noteSource.confidence !== undefined, null, { timeout: 120000 });
const p1 = await proj();
console.log(`MIDI import + auto sync in ${((Date.now() - t0) / 1000).toFixed(1)} s: offset ${p1.noteSource.offset.toFixed(3)} s (true -2.345 s), confidence ${p1.noteSource.confidence.toFixed(2)}, notes ${p1.notes.length}`);
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/2-midi-synced.png` });
// nudge: +1 frame then -10 ms
await page.click('text=+1 fr'); await page.click('text=−10 ms');
const p2 = await proj();
console.log(`after +1 frame and -10 ms: ${p2.noteSource.offset.toFixed(3)} s (expected ${(p1.noteSource.offset + 1 / 30 - 0.01).toFixed(3)})`);
// drag the sync strip 40 px right
const box = await page.$eval('.syncstrip', (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
await page.mouse.move(box.x + box.w / 2, box.y + box.h * 0.7); await page.mouse.down();
await page.mouse.move(box.x + box.w / 2 + 40, box.y + box.h * 0.7, { steps: 5 });
await page.screenshot({ path: `${OUT}/3-dragging-strip.png` });
await page.mouse.up();
const p3 = await proj();
console.log(`after dragging the strip 40 px: ${p3.noteSource.offset.toFixed(3)} s (expected about +${((40 / box.w) * 6).toFixed(3)} s more)`);
await page.click('text=Line up automatically');
await page.waitForTimeout(1500);
console.log(`line up again: ${(await proj()).noteSource.offset.toFixed(3)} s`);
// detection from audio
const t1 = Date.now();
await page.click('text=Detect notes from audio');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/4-detecting.png` });
await page.waitForFunction(() => window.pianoverseProject?.noteSource?.kind === 'audio', null, { timeout: 600000 });
const p4 = await proj();
console.log(`detected ${p4.notes.length} notes from 15 s of audio in ${((Date.now() - t1) / 1000).toFixed(1)} s (tfjs backend: ${await page.evaluate(async () => (await import('/node_modules/@tensorflow/tfjs/dist/index.js').catch(() => null))?.getBackend?.() ?? 'n/a')})`);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/5-detected.png` });
await b.close();
