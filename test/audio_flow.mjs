// The Video and Audio steps: the steps in order, trim and crop on Video, Notes and sync and Sound on Audio, the Sound
// settings saved on the project and heard live (the video plays through the sound chain without errors).
// usage: node test/audio_flow.mjs [shotsDir]
import { chromium } from 'playwright';
const S = process.argv[2] ?? '/tmp';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (/favicon/.test(JSON.stringify(m.location()))) return; if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { window.__pvHeadless = true; localStorage.clear(); });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', 'samples/interstellar-take1.mp4'); await page.waitForTimeout(2500);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const proj = () => page.evaluate(() => window.pianoverseProject);

const labels = await page.$$eval('.stepper .step-btn', (els) => els.map((e) => e.textContent.replace(/\d|\s+/g, ' ').trim()));
ok(labels.join(',') === 'Import,Video,Audio,Calibrate,Style,Light,Camera,Export', 'steps: ' + labels.join(', '));

// Import: no MIDI card or trim any more
await page.click('.stepper >> text=Import'); await page.waitForTimeout(500);
ok(await page.locator('.video-edit').count() === 0 && (await page.locator('.file-card').count()) === 1, 'Import has only the video');
await page.screenshot({ path: `${S}/step_import.png` });

// Video
await page.click('text=Continue to video'); await page.waitForTimeout(800);
ok(await page.locator('.video-edit').count() === 1, 'Video has trim and crop');
await page.screenshot({ path: `${S}/step_video.png` });

// Audio → Notes and sync
await page.click('text=Continue to audio'); await page.waitForTimeout(1500);
ok(await page.locator('.wave-card').count() === 1, 'Audio opens on Notes and sync');
await page.waitForFunction(() => !document.querySelector('.banner .spinner'), null, { timeout: 30000 });
const banner = await page.locator('.banner').first().innerText();
ok(/Aligned|Placed|Not sure|notes/.test(banner), 'notes banner  ' + banner.replace(/\s+/g, ' '));
await page.screenshot({ path: `${S}/step_audio_notes.png` });

// Audio → Sound
await page.click('[role=tab] >> text=Sound'); await page.waitForTimeout(800);
ok(await page.locator('.sound-wave canvas').count() === 3, 'Sound tab opens: start, end and the whole video');
await page.waitForFunction(() => !document.querySelector('.sound-wave-wait'), null, { timeout: 30000 });
await page.click('.page-side .choice >> text=Swell');
await page.click('.page-side .choice >> text=Ring out');
await page.locator('label:has-text("Even out the loudness") input').check();
await page.waitForTimeout(300);
let p = await proj();
ok(p.sound?.start === 'swell' && p.sound?.end === 'ring' && p.sound?.even === true, 'settings saved  ' + JSON.stringify(p.sound));
await page.waitForFunction(() => /LUFS →/.test(document.querySelector('.page-side')?.textContent ?? ''), null, { timeout: 30000 });
const meas = await page.locator('.page-side .help.mono').innerText();
ok(/Recorded at -?\d+\.\d LUFS/.test(meas), 'loudness measured  ' + meas);
// the waveform shows the shaped sound (bright pixels) and the swell
const px = await page.$eval('.sound-wave canvas', (c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let live = 0, riser = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i] > 200 && d[i + 1] < 120 && d[i + 2] < 80) live++; if (d[i + 2] > 200 && d[i] < 180 && d[i] > 120) riser++; }
  return { live, riser };
});
ok(px.live > 1000 && px.riser > 200, 'waveform drawn  ' + JSON.stringify(px));
ok(/1:05\.4/.test(await page.locator('.stat-cards').innerText()), 'export length includes the swell and the ring-out  ' + (await page.locator('.stat-cards').innerText()).replace(/\s+/g, ' '));
// play through the chain for a moment
await page.waitForSelector('[aria-label="Hear the start"]:not([disabled])', { timeout: 60000 });
await page.click('[aria-label="Hear the start"]'); await page.waitForTimeout(4500);
const t = await page.evaluate(() => document.querySelector('video').currentTime);
ok(t > 0.5, 'plays through the sound chain  t=' + t.toFixed(2));
await page.screenshot({ path: `${S}/step_audio_sound.png` });
await page.click('.sound-card .play-round'); await page.waitForTimeout(300);
// undo goes back
await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
p = await proj();
ok(p.sound?.even !== true, 'undo  ' + JSON.stringify(p.sound));
// the tab dot shows the sound is changed; Back to as recorded clears it
await page.click('text=Back to the sound as recorded'); await page.waitForTimeout(300);
ok(!(await proj()).sound, 'reset');
ok(errors.length === 0, 'no errors  ' + errors.join(' | '));
console.log(fails ? `${fails} FAILED` : 'all passed');
await b.close();
process.exit(fails ? 1 : 0);
