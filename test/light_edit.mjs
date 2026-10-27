// Video step trim and crop, and the Light step.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const S = process.env.SHOTS ?? '/tmp';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });
page.on('console', (m) => { if (/favicon/.test(JSON.stringify(m.location()))) return; if (m.type() === 'error' || /\[gpu\]/.test(m.text())) errors.push(m.text() + ' @ ' + JSON.stringify(m.location())); });
await page.addInitScript(() => { window.__pvHeadless = true; localStorage.clear(); });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', process.env.PROJ ?? 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', 'samples/interstellar-take1.mp4'); await page.waitForTimeout(2500);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// ---- Video: crop ----
await page.click('.stepper >> text=Video'); await page.waitForTimeout(600);
ok(await page.locator('.video-edit').count() === 1, 'trim and crop panel on Video');
await page.click('.ve-side .seg >> text=1:1'); await page.waitForTimeout(400);
const size = await page.locator('.ve-side .mono').innerText();
ok(/^1080×1080 of 1080×1920$/.test(size), 'square crop  ' + size);
// drag the crop down by a quarter of the frame
const box = await page.locator('.ve-frame canvas').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
await page.screenshot({ path: `${S}/import_crop.png` });

// ---- Video: trim ----
const dur = await page.evaluate(() => document.querySelector('video').duration);
await page.locator('.ve-trim').scrollIntoViewIfNeeded();
const bar = await page.locator('.ve-bar').boundingBox();
const seekBar = async (t) => { await page.mouse.click(bar.x + (t / dur) * bar.width + 0.5, bar.y + bar.height / 2); await page.waitForTimeout(500); };
await seekBar(20.02);
await page.click('text=Start here'); await page.waitForTimeout(300);
await seekBar(30.02);
await page.click('text=End here'); await page.waitForTimeout(300);
const th = await page.locator('.video-edit .mini-transport').innerText();
ok(/Start\s*0:(19\.9|20\.[01])/.test(th) && /End\s*0:(29\.9|30\.[01])/.test(th), 'trim 20–30 s  ' + th.replace(/\s+/g, ' '));

// ---- Style keeps the crop ----
await page.click('.stepper >> text=Style'); await page.waitForTimeout(1500);
const st = await page.evaluate(() => { const r = window.pianoverse.renderer; return { size: r.size, edit: r.project.edit }; });
ok(st.size.width === st.size.height, 'preview is square  ' + JSON.stringify(st.size));
ok(st.edit?.crop?.y > 0, 'crop moved down  ' + JSON.stringify(st.edit));

// ---- Light ----
await page.click('.stepper >> text=Light'); await page.waitForTimeout(1200);
ok(await page.locator('.light-page').count() === 1, 'Light step opens');
const frame = async () => page.evaluate(async () => {
  const r = window.pianoverse.renderer, v = document.querySelector('video');
  v.currentTime = 24.2; await new Promise((res) => v.addEventListener('seeked', res, { once: true }));
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
  r.setScale(0.5);
  // the video alone: the effects are drawn on top of the lighting and aren't darkened by it
  const keep = r.layers;
  r.layers = { ...keep, notes: false, impact: false, saber: false, particles: false, bloom: false };
  const img = await r.capture(c, 24.2);
  r.layers = keep;
  // mean brightness of the top-left corner (the room) and of the frame
  const at = (x0, y0, x1, y1) => { let s = 0, n = 0; for (let y = Math.floor(y0 * img.height); y < y1 * img.height; y += 2) for (let x = Math.floor(x0 * img.width); x < x1 * img.width; x += 2) { const i = (y * img.width + x) * 4; s += img.data[i] + img.data[i + 1] + img.data[i + 2]; n++; } return s / n / 765; };
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return { room: at(0, 0, 0.35, 0.3), all: at(0, 0, 1, 1), w: img.width, h: img.height, png: cv.toDataURL() };
});
const before = await frame();
await page.click('.light-presets >> text=Night'); await page.waitForTimeout(600);
const after = await frame();
if (process.env.SHOTS) for (const [n, f] of [['before', before], ['after', after]]) writeFileSync(`${S}/night_${n}.png`, Buffer.from(f.png.split(',')[1], 'base64'));
ok(after.room < before.room * 0.6, `Night darkens the room  ${before.room.toFixed(3)} → ${after.room.toFixed(3)}`);
await page.screenshot({ path: `${S}/light_step.png` });
const kind = await page.locator('.light-page .insp-kind').innerText();
ok(kind === 'Night', 'preset shown  ' + kind);
await page.click('.light-presets >> text=As filmed'); await page.waitForTimeout(400);
const reset = await frame();
ok(Math.abs(reset.room - before.room) < 0.01, 'As filmed puts it back');
// undo returns Night
await page.keyboard.press('Control+z'); await page.waitForTimeout(500);
ok((await page.locator('.light-page .insp-kind').innerText()) === 'Night', 'undo brings the lighting back');

// ---- export follows the trim ----
await page.click('.stepper >> text=Export'); await page.waitForTimeout(1200);
const len = await page.locator('.ex-stats').innerText();
ok(/Length\s*0?:?10/.test(len.replace(/\n/g, ' ')) || /0:10/.test(len), 'export length is the trim  ' + len.split('\n').slice(0, 2).join(' '));
ok(errors.length === 0, 'no errors  ' + errors.slice(0, 3).join(' | '));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
