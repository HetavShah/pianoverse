// Screenshots of the Colours, Saber, Particles and Background panels.
import { chromium } from 'playwright';
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1366, height: 1700 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => { window.__pvHeadless = true; });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', '/home/claude/sample15a.webm'); await page.waitForTimeout(1500);
await page.click('.stepper [title="Style"]'); await page.waitForTimeout(1000);
const shot = async (name) => {
  const box = await page.$eval('aside .ctl-section', (e) => { const r = e.parentElement.getBoundingClientRect(); return { x: r.x, w: r.width }; });
  await page.screenshot({ path: `${OUT}-${name}.png`, clip: { x: box.x, y: 56, width: box.w, height: 1500 } });
};
await page.click('.layer-row >> text=Colours'); await page.waitForTimeout(300);
await page.click('.by >> text=12 colours'); await page.waitForTimeout(300);
await shot('colours');
await page.click('.layer-row >> text=Saber'); await page.waitForTimeout(300);
await page.click('.by >> text=Electric'); await page.waitForTimeout(300);
await shot('saber');
await page.click('.layer-row >> text=Particles'); await page.waitForTimeout(300);
await page.click('button.fold >> text=Particle turbulence'); await page.waitForTimeout(300);
await shot('particles');
await page.click('.layer-row >> text=Background'); await page.waitForTimeout(300);
await page.click('label:has-text("Background colour") input[type=checkbox]'); await page.waitForTimeout(300);
await shot('background');
console.log(JSON.stringify(await page.evaluate(() => window.pianoverseProject.look)));
await b.close();
