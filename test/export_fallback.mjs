// A graphics-card encoder that gets stuck part way (as Intel Quick Sync did on a laptop): the export starts again
// on the processor and finishes, says so, and the next export tries that encoder again. The encoder is pretended: the page
// is told the computer has h264_qsv, and the sink stops taking frames from it after three.
// A slow moment in the encoder shows what the frame is waiting for.
// usage: node test/export_fallback.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
let fails = 0;
page.on('console', (m) => { if (m.text().startsWith('[export log]')) console.log(m.text()); });
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const starts = [];
let framesIn = 0, finished = 0;
await page.exposeFunction('pvStart', (o) => { starts.push(JSON.parse(o).encoder); framesIn = 0; });
await page.exposeFunction('pvFrame', async () => {
  framesIn++;
  const enc = starts[starts.length - 1];
  if (enc === 'h264_qsv' && framesIn > 3) throw new Error('stalled');
  if (enc === 'libx264' && framesIn === 5) await new Promise((r) => setTimeout(r, 15000));   // a slow moment
});
await page.exposeFunction('pvFinish', () => { finished++; return 'C:\\\\out.mp4'; });
await page.addInitScript(() => {
  window.__pvHeadless = true; localStorage.clear();
  window.__pvEncoders = { h264: ['h264_qsv', 'libx264'], hevc: ['libx265'], prores: false };
  window.__pvExportSink = {
    start: (o) => window.pvStart(JSON.stringify(o)),
    frame: () => window.pvFrame(),
    finish: () => window.pvFinish(),
    cancel: async () => {},
    note: async (l) => console.log('[export log] ' + l),
  };
});
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', 'samples/interstellar-take1.mp4'); await page.waitForTimeout(2500);
await page.click('.stepper [title="Export"]'); await page.waitForTimeout(2500);
// a short part, so the processor pass is quick
await page.evaluate(() => window.pianoverseSetLoop({ on: false, range: [10, 10.4] })); await page.waitForTimeout(300);
await page.click('label:has-text("Only the selected part") input'); await page.waitForTimeout(300);
ok(/Intel Quick Sync/.test(await page.locator('.ex-stats').innerText()), 'the pretend Quick Sync is picked');
await page.click('button:has-text("Export video")');
// (the test machine draws in software, so "the graphics card" may show first)
const waitText = await page.waitForFunction(() => /encoder/.test(document.querySelector('.ex-wait')?.textContent ?? ''), null, { timeout: 10 * 60 * 1000 })
  .then(() => page.locator('.ex-wait').innerText()).catch(() => '');
ok(/Waiting for the encoder/.test(waitText), 'a slow step says what it waits for  ' + JSON.stringify(waitText));
await page.waitForSelector('.ex-done, .ex-error', { timeout: 15 * 60 * 1000 });
const done = await page.locator('.ex-done, .ex-error').innerText();
ok(starts[0] === 'h264_qsv' && starts[1] === 'libx264' && finished === 1, 'stuck on the graphics card: started again on the processor  ' + JSON.stringify(starts));
ok(/Saved/.test(done) && /stopped responding/.test(done) && /processor/.test(done) && /tries Intel Quick Sync again/.test(done), 'it finishes and says why  ' + JSON.stringify(done));
await page.click('.stepper [title="Camera"]'); await page.waitForTimeout(500);
await page.click('.stepper [title="Export"]'); await page.waitForTimeout(2500);
ok(/Intel Quick Sync/.test(await page.locator('.ex-stats').innerText()), 'and the next export tries Quick Sync again');
console.log(fails ? `${fails} FAILED` : 'all passed');
await b.close();
process.exit(fails ? 1 : 0);
