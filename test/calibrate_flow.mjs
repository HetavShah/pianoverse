// End-to-end: open a bare video, mark corners by dragging, track, add a fix, check against the known tracking.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const proj = JSON.parse(readFileSync('samples/interstellar-take1.pvproj.json', 'utf8'));
const WK = proj.keyboard.whiteKeys;
const P = (h, x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
const truth = (f) => { const h = proj.tracking.frames[f]; return [P(h, 0, 0), P(h, WK, 0), P(h, WK, 1), P(h, 0, 1)]; };
const OUT = 'test/out/calib';
import { mkdirSync } from 'node:fs'; mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/');
await page.waitForTimeout(1200);
await page.click('.row-actions >> text=New project');
await page.setInputFiles('.file-card .actions input[type=file]', process.env.CLIP ?? '/home/claude/sample15.webm'); // a WebM copy of the sample (headless Chromium has no H.264)
await page.waitForFunction(() => !!window.pianoverseProject, null, { timeout: 20000 });
await page.screenshot({ path: `${OUT}/0-video-picked.png` });
await page.click('.stepper [title="Calibrate"]');
await page.waitForSelector('.calib-wrap canvas');
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/1-calibrate-start.png` });

// screen mapping (same as the editor at zoom 1)
const box = await page.$eval('.calib-wrap canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const W = 1080, H = 1920;
const fit = Math.min(box.w / W, box.h / H) * 0.94;
const S = ([x, y]) => [box.x + (x - W / 2) * fit + box.w / 2, box.y + (y - H / 2) * fit + box.h / 2];
const getProj = () => page.evaluate(() => window.pianoverseProject);

// drag every corner from where it is now to the true corner
const target = truth(0);
for (let i = 0; i < 4; i++) {
  const cur = (await getProj()).calibration.corners[i];
  const [sx, sy] = S(cur), [tx, ty] = S(target[i]);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 4 });
  if (i === 3) await page.screenshot({ path: `${OUT}/2-dragging-with-magnifier.png` });
  await page.mouse.up();
}
await page.waitForTimeout(300);
const marked = (await getProj()).calibration.corners;
const errMark = Math.max(...marked.map((p, i) => Math.hypot(p[0] - target[i][0], p[1] - target[i][1])));
console.log('corner marking error px (screen-precision drag):', errMark.toFixed(2), ' (1 screen px =', (1 / fit).toFixed(2), 'video px)');
await page.screenshot({ path: `${OUT}/3-corners-marked.png` });

// track
await page.click('.toggle-row >> text=Camera is fixed');
await page.click('text=Track keyboard');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/4-tracking.png` });
const t0 = Date.now();
await page.waitForFunction(() => !!window.pianoverseProject?.calibration?.raw, null, { timeout: 240000 });
console.log('tracking wall time s', ((Date.now() - t0) / 1000 + 3).toFixed(1));
const p2 = await getProj();
console.log('fps', p2.video.fps, 'frames', p2.video.frames, 'tracking frames', p2.tracking.frames.length);
// compare to the known tracking (allowing the marking offset)
const errs = p2.tracking.frames.map((h, f) => {
  const t = truth(Math.min(f, proj.tracking.frames.length - 1));
  const q = [P(h, 0, 0), P(h, WK, 0), P(h, WK, 1), P(h, 0, 1)];
  return Math.max(...q.map((p, i) => Math.hypot(p[0] - t[i][0], p[1] - t[i][1])));
});
const s = [...errs].sort((a, b) => a - b);
console.log('tracked vs known: mean', (errs.reduce((a, b) => a + b) / errs.length).toFixed(2), 'p95', s[Math.floor(s.length * 0.95)].toFixed(2), 'max', s[s.length - 1].toFixed(2));

// seek to 8 s and add a fix by nudging a corner 12 px
await page.$eval('.scrub', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '8'); el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(800);
const c8 = (await getProj()).tracking.frames[240];
const bl = P(c8, 0, 1);
const [fx, fy] = S(bl);
await page.mouse.move(fx, fy); await page.mouse.down(); await page.mouse.move(fx + 12 * fit, fy, { steps: 3 }); await page.mouse.up();
await page.waitForTimeout(400);
const p3 = await getProj();
console.log('fixes:', JSON.stringify(p3.calibration.fixes.map((f) => +f.t.toFixed(2))));
await page.screenshot({ path: `${OUT}/5-fix-added.png` });

// zoomed in view
await page.mouse.move(S(target[0])[0], S(target[0])[1]);
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -240);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/6-zoomed.png` });

// preview mode, captured offscreen
await page.click('text=Continue to style');
await page.waitForTimeout(800);
const dataUrl = await page.evaluate(async () => {
  const v = document.querySelector('video');
  v.currentTime = 6.0; await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  const fc = document.createElement('canvas'); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
  const r = window.pianoverse.renderer;
  const img = await r.capture(fc, v.currentTime);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c.toDataURL('image/png');
});
const { writeFileSync } = await import('node:fs');
writeFileSync(`${OUT}/7-preview-sweep.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
await page.screenshot({ path: `${OUT}/8-preview-ui.png` });
await b.close();
