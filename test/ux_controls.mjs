// The small controls: typing a value over a dial (Enter sets it, Esc doesn't), dragging the playhead on the Notes
// waveform, nudging the notes by dragging their ticks, skip to start and end, and no page wider than the window.
// usage: node test/ux_controls.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
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
const type = async (label, text, key = 'Enter') => {
  await page.click(`button.val-edit[aria-label^="${label}:"]`);
  await page.fill('input.val-input', text);
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
};

// ---- Audio → Notes: typed offset, playhead drag, tick nudge, skip buttons ----
await page.click('.stepper [title="Audio"]'); await page.waitForTimeout(2500);
await type('Offset', '250');
ok(Math.abs((await proj()).noteSource.offset - 0.25) < 1e-6, 'typed offset 250 → +250 ms');
await type('Offset', '0');
ok(Math.abs((await proj()).noteSource.offset) < 1e-6, 'typed offset 0');
await type('Offset', '900', 'Escape');
ok(Math.abs((await proj()).noteSource.offset) < 1e-6, 'Esc leaves the offset as it was');
const cv = await page.locator('.wave-sync canvas').boundingBox();
await page.mouse.move(cv.x + cv.width * 0.2, cv.y + cv.height * 0.7); await page.mouse.down();
await page.mouse.move(cv.x + cv.width * 0.6, cv.y + cv.height * 0.7, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
const t1 = await page.evaluate(() => document.querySelector('video').currentTime);
ok(t1 > 0.5 && Math.abs((await proj()).noteSource.offset) < 1e-6, `dragging the waveform moves the playhead (t=${t1.toFixed(2)}), not the notes`);
await page.mouse.move(cv.x + cv.width * 0.5, cv.y + 24 + 14); await page.mouse.down();
await page.mouse.move(cv.x + cv.width * 0.5 + 40, cv.y + 24 + 14, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
const off = (await proj()).noteSource.offset;
ok(off > 0.05, `dragging the ticks nudges the notes (+${(off * 1000).toFixed(0)} ms)`);
await page.click('.wave-card [aria-label="Skip to the end"]'); await page.waitForTimeout(400);
const tEnd = await page.evaluate(() => [document.querySelector('video').currentTime, document.querySelector('video').duration]);
ok(tEnd[1] - tEnd[0] < 0.2, `skip to the end (${tEnd[0].toFixed(2)} of ${tEnd[1].toFixed(2)})`);
await page.click('.wave-card [aria-label="Skip to the start"]'); await page.waitForTimeout(400);
ok(await page.evaluate(() => document.querySelector('video').currentTime) < 0.05, 'skip to the start');
ok(await page.locator('text=Play from the playhead').count() === 0, 'no text-only play button');

// ---- Audio → Sound: typed volume ----
await page.click('[role=tab] >> text=Sound'); await page.waitForTimeout(800);
await type('Volume', '-3');
ok((await proj()).sound?.volume === -3, 'typed volume −3 dB  ' + JSON.stringify((await proj()).sound?.volume));

// ---- Light: typed exposure and a percentage ----
await page.click('.stepper [title="Light"]'); await page.waitForTimeout(1500);
await type('Exposure', '0.5');
await type('Contrast', '120');
const L = (await proj()).lighting;
ok(L?.exposure === 0.5 && Math.abs(L?.contrast - 1.2) < 1e-6, 'typed exposure +0.5 EV and contrast 120%  ' + JSON.stringify({ e: L?.exposure, c: L?.contrast }));

// ---- Style: a look setting ----
await page.click('.stepper [title="Style"]'); await page.waitForTimeout(1500);
await page.click('.layer-row >> text=Particles'); await page.waitForTimeout(800);
const first = page.locator('.style-side button.val-edit').first();
const label = (await first.getAttribute('aria-label')).split(':')[0];
await type(label, '2');
const look = (await proj()).look;
ok(Object.values(look).includes(2), `typed ${label} 2`);

// ---- every dial has a value you can type, and typing keeps the value's look ----
const untyped = async () => page.evaluate(() => [...document.querySelectorAll('.dial')].filter((d) => {
  let p = d.parentElement;
  for (let i = 0; i < 3 && p; i++, p = p.parentElement) if (p.querySelector('.val-edit, .val-input')) return false;
  return true;
}).map((d) => d.querySelector('input')?.getAttribute('aria-label') ?? '?'));
const missing = [];
for (const step of ['Audio', 'Calibrate', 'Light']) { await page.click(`.stepper [title="${step}"]`); await page.waitForTimeout(1200); missing.push(...await untyped()); }
await page.click('.stepper [title="Audio"]'); await page.waitForTimeout(800); await page.click('[role=tab] >> text=Sound'); await page.waitForTimeout(800); missing.push(...await untyped());
await page.click('.stepper [title="Style"]'); await page.waitForTimeout(1500);
for (const row of await page.locator('.layer-row').all()) { await row.click(); await page.waitForTimeout(400); missing.push(...await untyped()); }
ok(missing.length === 0, 'every dial has a typeable value  ' + [...new Set(missing)].join(', '));
await page.click('.layer-row >> text=Particles'); await page.waitForTimeout(500);
const editLook = await page.evaluate(async () => {
  const b = document.querySelector('.style-side button.val-edit');
  const st = (el) => { const c = getComputedStyle(el); return [c.fontFamily, c.fontSize, c.color].join(' | '); };
  const before = st(b); b.click(); await new Promise((r) => setTimeout(r, 100));
  const after = st(document.querySelector('.style-side input.val-input'));
  const input = document.querySelector('.style-side input.val-input');
  const cs = getComputedStyle(input);
  const line = cs.borderBottomStyle + (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? ' +outline' : '') + (cs.borderTopStyle !== 'none' ? ' +box' : '');
  input.blur(); await new Promise((r) => setTimeout(r, 100));
  return { before, after, line, gone: !document.querySelector('.style-side input.val-input') };
});
ok(editLook.before === editLook.after, 'typing keeps the same font, size and colour  ' + JSON.stringify(editLook));
ok(editLook.line === 'solid' && editLook.gone, 'a line shows while typing and goes when you click away');

// ---- the settings menu opens and its items can be used ----
await page.click('[aria-label="Settings"]'); await page.waitForTimeout(300);
const menu = await page.locator('.menu').boundingBox();
const hit = menu && await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.menu'), [menu.x + menu.width / 2, menu.y + menu.height / 2]);
ok(!!menu && menu.height > 60 && hit, 'settings menu opens and is visible  ' + JSON.stringify(menu));
await page.click('.menu >> text=Keyboard shortcuts'); await page.waitForTimeout(300);
ok(await page.locator('text=Go to a step').count() > 0, 'a menu item works (keyboard shortcuts)');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// ---- nothing wider than the window ----
for (const w of [1366, 1100]) {
  await page.setViewportSize({ width: w, height: 800 });
  for (const step of ['Video', 'Audio', 'Style', 'Export']) {
    await page.click(`.stepper [title="${step}"]`); await page.waitForTimeout(700);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (wide > 1) ok(false, `${step} at ${w}px is ${wide}px wider than the window`);
  }
}
ok(true, 'pages fit the window at 1366 and 1100 px');
ok(errors.length === 0, 'no errors  ' + errors.join(' | '));
console.log(fails ? `${fails} FAILED` : 'all passed');
await b.close();
process.exit(fails ? 1 : 0);
