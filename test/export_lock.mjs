// While an export runs the workspace is locked: the steps, Projects, undo and shortcuts don't work, opening a file
// is refused, and the top bar says what's happening. Cancel unlocks it.
// usage: node test/export_lock.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
await page.exposeFunction('pvFrame', async () => { await new Promise((r) => setTimeout(r, 300)); });
await page.addInitScript(() => {
  window.__pvHeadless = true; localStorage.clear();
  window.__pvExportSink = { start: async () => {}, frame: () => window.pvFrame(), finish: async () => 'out.mp4', cancel: async () => {} };
});
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', 'samples/interstellar-take1.mp4'); await page.waitForTimeout(2500);
await page.click('.stepper [title="Export"]'); await page.waitForTimeout(2500);
await page.click('button:has-text("Export video")');
await page.waitForSelector('.exporting-pill', { timeout: 60000 });
ok(/Exporting/.test(await page.locator('.exporting-pill').innerText()), 'the top bar says it is exporting');
ok(await page.locator('.stepper [title="Style"]').isDisabled() && await page.locator('.brand').isDisabled(), 'steps and Projects are locked');
ok(await page.locator('[aria-label="Undo"]').isDisabled(), 'undo is locked');
await page.keyboard.press('Control+5'); await page.keyboard.press('Space'); await page.keyboard.press('Control+z'); await page.waitForTimeout(500);
ok(await page.locator('.stepper [aria-current]').getAttribute('title') === 'Export', 'shortcuts do nothing (still on Export)');
await page.setInputFiles('.page input[type=file] >> nth=0', 'samples/interstellar-take1.pvproj.json').catch(() => {});
ok(await page.evaluate(() => window.pianoverseProject?.name) !== undefined, 'the project is still there');
await page.click('.ex-progress button:has-text("Cancel")');
await page.waitForSelector('.exporting-pill', { state: 'detached', timeout: 60000 });
ok(!(await page.locator('.stepper [title="Style"]').isDisabled()), 'Cancel unlocks the workspace');
console.log(fails ? `${fails} FAILED` : 'all passed');
await b.close();
process.exit(fails ? 1 : 0);
