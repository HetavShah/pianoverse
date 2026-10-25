// Camera step: automatic first edit, transitions, frame shape, shot editing, cuts, undo, export sizes.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = 'test/out/camera'; mkdirSync(OUT, { recursive: true });
const CLIP = process.env.CLIP ?? 'samples/interstellar-take1.mp4';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', CLIP); await page.waitForTimeout(1500);
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
const P = () => page.evaluate(() => window.pianoverseProject);
const track = async () => (await P()).cameraTrack;
// headless browsers don't present the GPU canvas: paint a real frame through the camera into the preview for screenshots
const fill = async () => page.evaluate(async () => {
  const r = window.pianoverse.renderer, v = document.querySelector('video');
  const t = v.currentTime, cam = window.pianoverseCamera(t);
  if (cam) r.setView(cam.view, cam.fade); else r.setView(null);
  const fc = document.createElement('canvas'); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
  const img = await r.capture(fc, t);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  const pv = document.querySelector('.preview-frame');
  let im = pv.querySelector('img.__fill'); if (!im) { im = document.createElement('img'); im.className = '__fill'; im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; pv.appendChild(im); }
  im.src = c.toDataURL('image/jpeg', 0.9);
});
const shot = async (name) => { await fill(); await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/${name}.png` }); };
const seek = (t) => page.evaluate((t) => new Promise((res) => { const v = document.querySelector('video'); v.addEventListener('seeked', () => setTimeout(res, 150), { once: true }); window.pianoverseSeek(t); }), t);

await page.click('.stepper >> text=Camera'); await page.waitForTimeout(1500);
let tr = await track();
check('first visit makes a camera with an automatic edit', !!tr && tr.on && tr.shots.length > 3, `${tr?.shots.length} shots, aspect ${tr?.aspect}`);
check('the automatic edit is not an undo step', await page.$eval('button[aria-label=Undo]', (b) => b.disabled));
await seek(12.3); await page.waitForTimeout(300);
await shot('1-camera');

// a join: pick Dip to white, change its length
const joins = page.locator('.cam-join');
check('joins drawn between shots', (await joins.count()) === tr.shots.length - 1, `${await joins.count()} joins`);
await joins.nth(1).click(); await page.waitForTimeout(250);
check('clicking a join opens the transition picker', !!(await page.$('.cam-pop')));
await page.click('.cam-pop button:has-text("Dip white")'); await page.waitForTimeout(250);
tr = await track();
check('transition set to Dip white', tr.shots[2].in === 'dipWhite', tr.shots[2].in);
const len = page.locator('.cam-pop input[type=range]');
await len.evaluate((r) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '1.2'); r.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(200);
check('length changed', Math.abs((await track()).shots[2].inDur - 1.2) < 1e-6);
await seek((await track()).shots[2].start - 0.25); await page.waitForTimeout(300);
await shot('2-dip-white');
const fadeNow = await page.evaluate(() => window.pianoverseCamera(document.querySelector('video').currentTime).fade);
check('the frame is dipping to white before the join', fadeNow[1] === 1 && fadeNow[0] > 0.2, JSON.stringify(fadeNow));
await page.keyboard.press('Escape'); await page.waitForTimeout(150);

// drag a join: it snaps to a beat
const j3 = joins.nth(2); const bb = await j3.boundingBox();
const before = (await track()).shots[3].start;
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
await page.mouse.move(bb.x + bb.width / 2 + 40, bb.y + bb.height / 2, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(300);
const after = (await track()).shots[3].start;
const beats = await page.evaluate(async () => null);
check('dragging a join moves the cut', Math.abs(after - before) > 0.2, `${before.toFixed(2)} → ${after.toFixed(2)}`);

// frame shape
await page.click('.preview-bar button:has-text("Landscape 16:9")'); await page.waitForTimeout(500);
check('frame shape is landscape', (await track()).aspect === 'landscape');
const fr = await page.$eval('.preview-frame', (e) => e.getBoundingClientRect().width / e.getBoundingClientRect().height);
check('preview is 16:9', Math.abs(fr - 16 / 9) < 0.02, fr.toFixed(3));
await seek(21); await page.waitForTimeout(300);
await shot('3-landscape');

// edit a shot: Close-up and zoom
await page.locator('.cam-shot').nth(4).click(); await page.waitForTimeout(300);
await page.click('.cam-shot-card button:has-text("Close-up")'); await page.waitForTimeout(250);
tr = await track();
check('shot became a close-up with a framing', tr.shots[4].kind === 'close' && tr.shots[4].cx > 0, `${tr.shots[4].kind} cx ${tr.shots[4].cx?.toFixed(0)}`);
const z = page.locator('.cam-shot-card input[aria-label=Zoom]');
await z.evaluate((r) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, r.max); r.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(200);
check('close-up zoom capped for sharp footage', (await track()).shots[4].zoom <= 1.36, (await track()).shots[4].zoom.toFixed(2));
// drag its framing in the inset
const inset = await page.locator('.cam-inset canvas').boundingBox();
await page.mouse.move(inset.x + inset.width * 0.3, inset.y + inset.height * 0.55); await page.mouse.down(); await page.mouse.move(inset.x + inset.width * 0.35, inset.y + inset.height * 0.6, { steps: 3 }); await page.mouse.up();
await page.waitForTimeout(200);
check('dragging in the small picture frames the close-up', Math.abs((await track()).shots[4].cx - 0.35 * 1080) < 20, (await track()).shots[4].cx.toFixed(0));
await seek((await track()).shots[4].start + 0.5); await page.waitForTimeout(300);
await shot('4-close-up');

// add a cut, then undo it
const n0 = (await track()).shots.length;
await page.click('.cam-shot-card button:has-text("Add a cut here")'); await page.waitForTimeout(300);
check('Add a cut here adds a shot', (await track()).shots.length === n0 + 1);
await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
check('Ctrl+Z removes it again', (await track()).shots.length === n0);
// delete a cut with the keyboard
await joins.nth(0).click(); await page.waitForTimeout(150); await page.keyboard.press('Delete'); await page.waitForTimeout(250);
check('Delete removes the selected cut', (await track()).shots.length === n0 - 1);

// auto settings rebuild
await page.click('.cam-opt button:has-text("Often")'); await page.waitForTimeout(500);
const nOften = (await track()).shots.length;
await page.click('.cam-opt button:has-text("None")'); await page.waitForTimeout(500);
const nNone = (await track()).shots.length;
check('Cuts: Often makes more shots than None', nOften > nNone, `${nOften} vs ${nNone}`);
await page.click('.cam-opt button:has-text("On bars")'); await page.waitForTimeout(500);
await seek(16.3); await page.waitForTimeout(300);
await shot('5-auto');

// camera off and on
await page.click('label:has-text("Camera") input[aria-label="Camera on"]'); await page.waitForTimeout(300);
check('camera off', (await track()).on === false);
await page.click('label:has-text("Camera") input[aria-label="Camera on"]'); await page.waitForTimeout(300);

// export follows the frame shape
await page.click('.stepper >> text=Export'); await page.waitForTimeout(1500);
const sizes = await page.$$eval('.ex-size b', (e) => e.map((x) => x.textContent));
check('export offers landscape sizes only', sizes.join() === 'Landscape,4K landscape', sizes.join());
check('a size is selected', !!(await page.$('.ex-size.on')));
await page.screenshot({ path: `${OUT}/6-export.png` });
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
