// Undo and redo: one slider drag = one step, presets, calibration, redo, text fields keep their own undo.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = 'test/out/undo'; mkdirSync(OUT, { recursive: true });
const CLIP = process.env.CLIP ?? 'samples/interstellar-take1.mp4';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', CLIP); await page.waitForTimeout(1500);
const P = () => page.evaluate(() => window.pianoverseProject);
const look = async () => (await P()).look ?? {};
const toast = () => page.$$eval('.toast', (t) => t.map((x) => x.textContent).join(' | '));
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
const drag = async (label, fracs) => {
  // the inspector's sliders are dials: drag the tape (the range input underneath is for keyboards)
  const input = page.locator(`input[aria-label="${label}"]`);
  const dial = await input.evaluate((el) => !!el.closest('.dial'));
  const loc = dial ? input.locator('xpath=ancestor::div[contains(@class,"dial")][1]').locator('.dial-ruler') : input;
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * fracs[0], y); await page.mouse.down();
  for (const f of fracs.slice(1)) { await page.mouse.move(box.x + box.width * f, y, { steps: 4 }); await page.waitForTimeout(120); }
  await page.mouse.up(); await page.waitForTimeout(150);
};
const key = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(250); };

// a text field: Ctrl+Z belongs to the field, not to the project history
const name0 = (await P()).name;
await page.fill('input[type=text]', name0 + ' X'); await page.waitForTimeout(700);
check('undo button on after renaming', await page.$eval('button[aria-label=Undo]', (b) => !b.disabled));
await page.evaluate(() => document.activeElement?.blur()); await key('Control+z');
check('Ctrl+Z undoes the rename', (await P()).name === name0, (await P()).name);
await page.waitForTimeout(2000);
await page.focus('input[type=text]'); await page.keyboard.type('Q'); await key('Control+z');
check('Ctrl+Z inside the name field stays the field\'s own', !(await toast()).includes('Undone'), JSON.stringify(await toast()));
await page.fill('input[type=text]', name0); await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(700);
await key('Control+4'); await page.waitForTimeout(800);
check('Ctrl+4 goes to Style', await page.$eval('.step-btn.on', (e) => e.textContent.includes('Style')));
const g0 = (await look()).noteGlow, w0 = (await look()).noteWidth;
await drag('Glow', [0.3, 0.45, 0.6, 0.8, 0.9]);
const g1 = (await look()).noteGlow;
await drag('Width', [0.5, 0.7]);
const w1 = (await look()).noteWidth;
check('drags changed values', g1 !== g0 && w1 !== w0, `glow ${g0}→${g1} width ${w0}→${w1}`);
await key('Control+z');
check('first undo reverts only the width drag', (await look()).noteWidth === w0 && (await look()).noteGlow === g1);
check('message says what was undone', (await toast()).includes('Undone: style'), await toast());
await key('Control+z');
check('second undo reverts the whole glow drag in one step', (await look()).noteGlow === g0, `${(await look()).noteGlow}`);
await key('Control+y');
check('redo brings the glow back', (await look()).noteGlow === g1);
await key('Control+Shift+z');
check('Ctrl+Shift+Z redoes too', (await look()).noteWidth === w1);
await key('Control+z'); // undo width again, then make a new edit: redo is gone
await drag('Glow', [0.5, 0.2]);
check('new edit clears redo', await page.$eval('button[aria-label=Redo]', (b) => b.disabled));
await page.screenshot({ path: `${OUT}/1-style.png` });

// a colour mode switch is one step
const before = JSON.stringify(await look());
await page.click('.layer-row >> text=Colours'); await page.waitForTimeout(200);
await page.click('.by >> text=Divide'); await page.waitForTimeout(300);
check('colour mode changed', JSON.stringify(await look()) !== before, (await look()).colorBy);
await page.evaluate(() => document.activeElement?.blur());
await key('Control+z');
check('undo restores the colour mode', JSON.stringify(await look()) === before, JSON.stringify(await look()).slice(0, 80));
// calibration screen
await key('Control+3'); await page.waitForTimeout(800);
const cam0 = (await P()).camera ?? 'angled';
await page.click(`.seg >> text=${cam0 === 'angled' ? 'Top-down' : 'Angled'}`).catch(async () => { await page.click(`text=${cam0 === 'angled' ? 'Top-down' : 'Angled'}`); });
await page.waitForTimeout(300);
const cam1 = (await P()).camera;
await page.evaluate(() => document.activeElement?.blur());
await key('Control+z');
check('camera switch undone', cam1 !== cam0 && ((await P()).camera ?? 'angled') === cam0, `${cam0}→${cam1}→${(await P()).camera}`);

// shortcut sheet
await key('Shift+Slash');
check('? opens the shortcuts sheet', !!(await page.$('.modal.shortcuts')));
await page.screenshot({ path: `${OUT}/2-shortcuts.png` });
await key('Escape');
check('Escape closes it', !(await page.$('.modal.shortcuts')));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
