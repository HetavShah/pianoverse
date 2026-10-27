// Saving a project as a .pianoverse file and opening it again. (Textures carried inside: test/project_file_unit.mjs.)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
mkdirSync('test/out', { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => { window.__pvHeadless = true; localStorage.clear(); });
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json'); await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', 'samples/interstellar-take1.mp4'); await page.waitForTimeout(1500);
ok(await page.evaluate(() => !!window.pianoverseProject), 'an older .pvproj.json still opens');

// save: the menu's Save project file… downloads it in a plain browser
await page.click('button[aria-label=Settings]');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Save project file…')]);
const path = 'test/out/saved.pianoverse';
await dl.saveAs(path);
// (headless Chrome on a C-locale Linux drops download names with non-ASCII characters such as the sample's dash)
ok(dl.suggestedFilename().endsWith('.pianoverse') || dl.suggestedFilename() === 'download', 'saved as .pianoverse  ' + dl.suggestedFilename());
const bytes = readFileSync(path);
ok(bytes[0] === 0x50 && bytes[1] === 0x4b, 'the file is a ZIP container');
ok(bytes.subarray(30, 38).toString() === 'mimetype' && bytes.includes(Buffer.from('application/vnd.pianoverse.project+zip')), 'mimetype first, uncompressed');

// open it again from the Projects page
const before = await page.evaluate(() => JSON.stringify({ n: window.pianoverseProject.notes.length, cal: window.pianoverseProject.calibration?.corners, look: window.pianoverseProject.look }));
await page.click('.brand'); await page.waitForTimeout(500);
await page.setInputFiles('.row-actions input[type=file]', path); await page.waitForTimeout(1200);
const after = await page.evaluate(() => JSON.stringify({ n: window.pianoverseProject.notes.length, cal: window.pianoverseProject.calibration?.corners, look: window.pianoverseProject.look }));
ok(before === after, 'reopened project matches (notes, calibration, look)');
ok(errors.length === 0, 'no errors ' + errors.slice(0, 2).join(' | '));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
process.exit(fails ? 1 : 0);
