// When the video's sound can't be read, the Audio step says so and offers Try again (instead of "Reading the
// soundtrack…" for ever), and Try again works. Reading is made to fail by failing every read of the video file
// until the test lets it through.
// usage: node test/audio_retry.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
await page.addInitScript(() => {
  window.__pvHeadless = true; localStorage.clear();
  window.__failReads = true;
  const real = window.fetch.bind(window);
  window.fetch = (u, o) => (window.__failReads && String(u).startsWith('blob:') ? Promise.reject(new TypeError('Failed to fetch')) : real(u, o));
});
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', 'samples/interstellar-take1.mp4'); await page.waitForTimeout(2500);
await page.click('.stepper [title="Audio"]'); await page.waitForTimeout(800);
await page.click('[role=tab] >> text=Sound');
await page.waitForSelector('.sound-wave-error', { timeout: 30000 }).catch(() => {});
const msg = await page.locator('.sound-wave-error').first().innerText().catch(() => '');
ok(/open the video file/i.test(msg) && /Try again/.test(msg), 'a failed read says so, with Try again  ' + JSON.stringify(msg));
await page.evaluate(() => { window.__failReads = false; });
await page.click('.sound-wave-error >> text=Try again');
await page.waitForFunction(() => !document.querySelector('.sound-wave-wait'), null, { timeout: 30000 }).catch(() => {});
ok(await page.locator('.sound-wave-wait').count() === 0, 'Try again reads it');
console.log(fails ? `${fails} FAILED` : 'all passed');
await b.close();
process.exit(fails ? 1 : 0);
