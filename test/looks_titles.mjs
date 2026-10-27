// Style: the Looks gallery (pictures, hover preview, choosing, undo) and Titles (opening title, end card, brand kit).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = 'test/out/looks'; mkdirSync(OUT, { recursive: true });
const CLIP = process.env.CLIP ?? 'samples/interstellar-take1.mp4';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) console.log('[console]', m.text()); });
await page.addInitScript(() => { window.__pvHeadless = true; localStorage.clear(); });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', CLIP); await page.waitForTimeout(1500);
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
const P = () => page.evaluate(() => window.pianoverseProject);
const fill = async () => page.evaluate(async () => {
  const r = window.pianoverse.renderer, v = document.querySelector('video');
  const fc = document.createElement('canvas'); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
  const img = await r.capture(fc, v.currentTime);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  const pv = document.querySelector('.preview-frame');
  let im = pv.querySelector('img.__fill'); if (!im) { im = document.createElement('img'); im.className = '__fill'; im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'; pv.appendChild(im); }
  im.src = c.toDataURL('image/jpeg', 0.9);
});
const shot = async (name) => { await fill(); await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/${name}.png` }); };
const seek = (t) => page.evaluate((t) => new Promise((res) => { const v = document.querySelector('video'); v.addEventListener('seeked', () => setTimeout(res, 150), { once: true }); window.pianoverseSeek(t); }), t);
/** a full-size frame as the export would draw it */
const still = async (name, t) => {
  await seek(t);
  const png = await page.evaluate(async (t) => {
    const r = window.pianoverse.renderer, v = document.querySelector('video');
    r.setScale(1);
    const fc = document.createElement('canvas'); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
    const img = await r.capture(fc, t);
    r.setScale(0.5);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    return c.toDataURL('image/jpeg', 0.9);
  }, t);
  writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(png.split(',')[1], 'base64'));
};

await page.click('.stepper >> text=Style'); await page.waitForTimeout(1200);
await seek(23.5);
await page.keyboard.press('0'); await page.waitForTimeout(300);
check('0 opens Looks', (await page.textContent('.insp-head h2')) === 'Looks');
const cards = page.locator('.look-card');
const n = await cards.count();
check('eleven built-in looks', n === 11, `${n}`);
await page.waitForFunction((n) => document.querySelectorAll('.look-card .pic img').length >= n, n, { timeout: 120000 }).catch(() => {});
check('every look has a picture of this video', (await page.locator('.look-card .pic img').count()) === n);
const before = await P();
const mainLook = () => page.evaluate(() => JSON.stringify(window.pianoverse.renderer.project.look ?? {}));
const look0 = await mainLook();
await cards.nth(1).hover();
await page.waitForFunction(() => true);
const srcs = new Set();
for (let i = 0; i < 240 && srcs.size < 3; i++) { srcs.add(await cards.nth(1).locator('img').getAttribute('src')); await page.waitForTimeout(250); }
check('resting on a card plays a short loop inside it', srcs.size >= 3, `${srcs.size} different pictures`);
check('…and leaves the main preview alone', (await mainLook()) === look0);
check('…and the project', (await P()).presetId === before.presetId);
await page.mouse.move(700, 450); await page.waitForTimeout(300);
check('moving away changes nothing', (await mainLook()) === look0 && (await P()).presetId === before.presetId);
// a frame of another size (a phone clip, the editing copy) must not leave the preview blank
const lit = await page.evaluate(async () => {
  const r = window.pianoverse.renderer, v = document.querySelector('video');
  const small = document.createElement('canvas'); small.width = 540; small.height = 960; small.getContext('2d').drawImage(v, 0, 0, 540, 960);
  await r.capture(small, v.currentTime);
  const fc = document.createElement('canvas'); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
  const a = await r.capture(fc, v.currentTime);
  let s = 0; for (let i = 0; i < a.data.length; i += 4 * 101) s += a.data[i] + a.data[i + 1] + a.data[i + 2];
  return s / (a.data.length / (4 * 101));
});
check('the picture survives a change of frame size', lit > 8, lit.toFixed(1));
await shot('1-looks');
await page.locator('.look-card', { hasText: 'Ink' }).click(); await page.waitForTimeout(400);
check('click uses the look', (await P()).presetId === 'ink');
await shot('2-ink');
await page.click('button[aria-label=Undo]'); await page.waitForTimeout(400);
check('undo goes back to the previous look', (await P()).presetId === before.presetId);
await page.keyboard.press('3'); await page.waitForTimeout(200);
check('the look bar opens the gallery', !!(await page.$('.preset-bar .look-open')));

// Titles
await page.keyboard.press('9'); await page.waitForTimeout(300);
check('9 opens Titles', (await page.textContent('.insp-head h2')) === 'Titles');
await page.click('input[aria-label="Opening title on"]'); await page.waitForTimeout(300);
await page.fill('.titles-panel input[placeholder^="Composer"]', 'Hans Zimmer');
await page.fill('.titles-panel input[placeholder="Your name"]', 'Hetav Shah');
await page.fill('.titles-panel input[placeholder="@yourchannel"]', '@hetav.piano');
await page.fill('.titles-panel input[placeholder="YouTube · Instagram"]', 'YouTube · Instagram');
await page.click('input[aria-label="End card on"]'); await page.waitForTimeout(300);
const pr = await P();
check('titles saved in the project', pr.titles?.intro?.on && pr.titles?.outro?.on && pr.titles.intro.subtitle === 'Hans Zimmer');
await page.waitForTimeout(600);
check('brand kit saved for every project', JSON.parse((await page.evaluate(() => localStorage.getItem('pv.presets'))) || '{}').brand?.name === 'Hetav Shah');
await seek(1.8); await shot('3-titles-intro');
for (const s of ['modern', 'classic', 'clean']) {
  await page.click(`.titles-panel .seg button:has-text("${s[0].toUpperCase() + s.slice(1)}")`); await page.waitForTimeout(250);
  for (const t of [0.6, 1.2, 2.2, 4.0]) await still(`intro-${s}-${t}`, t);
}
await page.click('.titles-panel .seg button:has-text("Modern")');
const dur = await page.evaluate(() => document.querySelector('video').duration);
for (const t of [1.0, 2.6, 4.7]) await still(`outro-${t}`, dur - 5 + t);
await seek(dur - 2.5); await shot('4-titles-outro');
await seek(10); await page.waitForTimeout(200);
const clear = await page.evaluate(async () => {
  const r = window.pianoverse.renderer, v = document.querySelector('video');
  const fc = document.createElement('canvas'); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
  const a = await r.capture(fc, 10);
  let s = 0; for (let i = 0; i < a.data.length; i += 4 * 97) s += a.data[i] + a.data[i + 1] + a.data[i + 2];
  return s;
});
check('the middle of the video has no card on it', clear > 0);
// zoom and pan on the preview, drag the playhead
await page.keyboard.press('2'); await seek(26);
const fr = await page.locator('.preview-frame').boundingBox();
await page.mouse.move(fr.x + fr.width * 0.5, fr.y + fr.height * 0.55);
for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(80); }
const zoomTxt = await page.locator('.zoom-chip .mono').textContent().catch(() => '');
check('scrolling on the preview zooms in', parseInt(zoomTxt) > 150, zoomTxt);
const playing0 = await page.evaluate(() => !document.querySelector('video').paused);
await page.mouse.down(); await page.mouse.move(fr.x + fr.width * 0.3, fr.y + fr.height * 0.4, { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(200);
check('dragging pans without starting playback', (await page.evaluate(() => !document.querySelector('video').paused)) === playing0 && !!(await page.$('.zoom-chip')));
await shot('5-zoomed');
await page.click('.zoom-chip button'); await page.waitForTimeout(200);
check('Fit goes back to the whole frame', !(await page.$('.zoom-chip')));
const tl = await page.locator('.style-timeline canvas').boundingBox();
const tBefore = await page.evaluate(() => document.querySelector('video').currentTime);
const dur2 = await page.evaluate(() => document.querySelector('video').duration);
const phx = tl.x + (tBefore / dur2) * tl.width;
await page.mouse.move(phx, tl.y + 60); await page.mouse.down();
await page.mouse.move(phx + tl.width * 0.2, tl.y + 60, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(400);
const tAfter = await page.evaluate(() => document.querySelector('video').currentTime);
check('dragging the playhead scrubs', tAfter - tBefore > dur2 * 0.15, `${tBefore.toFixed(1)} → ${tAfter.toFixed(1)}`);
check('…without making a loop section', !(await P()).loop && !(await page.textContent('.tl-head')).includes('Section'));
console.log(fails ? `${fails} FAILED` : 'all passed');
await b.close();
process.exit(fails ? 1 : 0);
