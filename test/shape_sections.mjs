// Shape sections: add one from the Particles panel, edit it, and check it reaches the project.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'test/out/sections'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', process.env.CLIP ?? '/home/claude/sample15a.webm'); await page.waitForTimeout(1500);
await page.click('.stepper >> text=Style'); await page.waitForTimeout(800);
await page.click('.layer-row >> text=Particles'); await page.waitForTimeout(300);
await page.click('button:has-text("+ At the start")'); await page.waitForTimeout(400);
await page.click('.tex >> text=Star'); await page.click('button:has-text("Anticlockwise")'); await page.waitForTimeout(300);
const sc = await page.evaluate(() => window.pianoverseProject.particleScenes);
console.log('sections:', JSON.stringify(sc));
await page.screenshot({ path: `${OUT}/1-panel.png` });
// drag the section's right edge on the timeline
const cv = await page.$('.style-timeline canvas'); const bb = await cv.boundingBox();
const dur = await page.evaluate(() => document.querySelector('video').duration);
const y = bb.y + bb.height - 20, xA = bb.x + (sc[0].start / dur) * bb.width;
await page.mouse.move(xA + 1, y); await page.mouse.down(); await page.mouse.move(xA - 60, y, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(300);
console.log('after drag:', JSON.stringify(await page.evaluate(() => window.pianoverseProject.particleScenes.map((s) => [s.start.toFixed(1), s.end.toFixed(1)]))));
await page.screenshot({ path: `${OUT}/2-timeline.png`, clip: { x: 0, y: 1000 - 200, width: 1440, height: 200 } });
await b.close();
