// Export end to end: drive the Export screen in the browser and pipe its frames into a real FFmpeg, using the
// exact arguments the desktop app builds (printed by the Rust unit test in src-tauri/src/export.rs).
// usage: node test/export_e2e.mjs <outDir>   env: SIZE (shorts|landscape|square|k4), FIT, CODEC, TRANSPARENT=1, FPS, PROJ, CLIP, RANGE=a,b,
//        SOUND='{"end":"ring",...}' (Sound settings: the soundtrack is rendered in the page and handed over as a WAV)
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'test/out/export'; mkdirSync(OUT, { recursive: true });
const CLIP = process.env.CLIP ?? '/home/claude/sample15a.webm';
let PROJ = process.env.PROJ ?? 'samples/interstellar-take1.pvproj.json';
if (process.env.SOUND) {
  const p = JSON.parse(readFileSync(PROJ, 'utf8'));
  p.sound = JSON.parse(process.env.SOUND);
  PROJ = `${OUT}/project-with-sound.pvproj.json`;
  writeFileSync(PROJ, JSON.stringify(p));
}
const RANGE = (process.env.RANGE ?? '2,4').split(',').map(Number);

function argsFor(o) {
  const env = { ...process.env, W: String(o.outWidth), H: String(o.outHeight), FIT: o.fit, CODEC: o.codec, ENC: o.encoder, PART: o.part, ...(o.audio ? { AUDIO: o.audio } : {}) };
  const out = execFileSync('cargo', ['test', '--quiet', '--bin', 'pianoverse', 'print_args', '--', '--nocapture'], { cwd: 'src-tauri', env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const line = out.split('\n').find((l) => l.startsWith('ARGS\t'));
  const a = line.split('\t').slice(1);
  // the test fixes some values; patch in the real ones
  const set = (flag, v) => { const i = a.indexOf(flag); if (i >= 0) a[i + 1] = v; };
  set('-s', `${o.width}x${o.height}`); set('-framerate', String(o.fps));
  const ti = a.indexOf('-t'); if (ti >= 0) { a[ti + 1] = o.duration.toFixed(3); a[ti - 1] = o.start.toFixed(3); }
  return a;
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) console.log('[console]', m.text()); });
await page.route('**/piano-test.pvpiano', (r) => r.fulfill({ path: 'test/out/salamander-v1.pvpiano' }));
await page.addInitScript(() => { window.__pvPianoUrl = '/piano-test.pvpiano'; });
await page.addInitScript(() => { window.__pvHeadless = true; });

let ff = null, part = '', out = '', frames = 0, errLog = '';
await page.exposeFunction('pvSinkStart', (json) => {
  const o = JSON.parse(json);
  out = `${OUT}/${o.codec === 'prores' ? 'effects.mov' : 'export.mp4'}`;
  part = out.replace(/\.(\w+)$/, '.part.$1');
  const a = argsFor({ ...o, part, audio: o.codec === 'prores' ? null : (o.audio?.endsWith('sound.wav') ? o.audio : CLIP) });
  console.log('ffmpeg', a.join(' ').slice(0, 400));
  ff = spawn('ffmpeg', a, { stdio: ['pipe', 'ignore', 'pipe'] });
  errLog = '';
  ff.stderr.on('data', (d) => { errLog += d; });
  frames = 0;
});
await page.exposeFunction('pvSinkFrame', (b64) => new Promise((res) => {
  frames++;
  if (!ff.stdin.write(Buffer.from(b64, 'base64'))) ff.stdin.once('drain', res); else res();
}));
await page.exposeFunction('pvSinkFinish', () => new Promise((res, rej) => {
  ff.on('close', (code) => { if (code === 0) { renameSync(part, out); res(out); } else rej(new Error('ffmpeg ' + code + ' ' + errLog)); });
  ff.stdin.end();
}));
await page.exposeFunction('pvSinkCancel', () => { ff?.kill(); });
await page.exposeFunction('pvSinkAudio', (b64) => { const f = `${OUT}/sound.wav`; writeFileSync(f, Buffer.from(b64, 'base64')); return f; });

await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', PROJ); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', CLIP); await page.waitForTimeout(1500);
// pick 0:02 - 0:04 (as if dragged on the Style timeline)
await page.evaluate((r) => window.pianoverseSetLoop({ on: false, range: r }), RANGE);
await page.click('.stepper [title="Export"]'); await page.waitForTimeout(1500);
await page.evaluate(() => {
  const b64 = (u8) => { let s = ''; const C = 0x8000; for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return btoa(s); };
  window.__pvExportSink = {
    start: (o) => window.pvSinkStart(JSON.stringify(o)),
    frame: (rgba) => window.pvSinkFrame(b64(rgba)),
    finish: () => window.pvSinkFinish(),
    cancel: () => window.pvSinkCancel(),
    audio: (wav) => window.pvSinkAudio(b64(wav)),
  };
});
if (process.env.SIZE) await page.click(`.ex-size >> text=${{ shorts: 'Shorts', landscape: 'Landscape', square: 'Square', k4: '4K' }[process.env.SIZE]}`);
if (process.env.FIT === 'fit') await page.click('button:has-text("Fit inside")');
if (process.env.CODEC === 'hevc') await page.selectOption('.ex-row3 select >> nth=0', 'hevc');
if (process.env.FPS) await page.selectOption('.ex-row3 select >> nth=1', process.env.FPS);
if (process.env.TRANSPARENT) await page.click('label:has-text("transparent background") input');
await page.click('label:has-text("Only the selected part") input');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/screen-before.png` });
const t0 = Date.now();
await page.click('button:has-text("Export video")');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/screen-running.png` });
await page.waitForSelector('.ex-done, .ex-error', { timeout: 30 * 60 * 1000 });
console.log('export took', ((Date.now() - t0) / 1000).toFixed(1), 's; frames', frames, '|', await page.$eval('.ex-done, .ex-error', (e) => e.textContent));
await page.screenshot({ path: `${OUT}/screen-done.png` });
await b.close();
