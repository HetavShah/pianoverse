// Texture material in the Notes panel: pick Texture, switch textures and modes, upload an image.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'test/out/texture'; mkdirSync(OUT, { recursive: true });
const CLIP = process.env.CLIP ?? '/home/claude/sample15a.webm';
const UPLOAD = process.env.UPLOAD;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text()); });
await page.addInitScript(() => { window.__pvHeadless = true; }); // live canvases lose the software GPU here; frames are captured offscreen
await page.goto('http://localhost:4173/'); await page.waitForTimeout(800);
await page.setInputFiles('.row-actions input[type=file]', 'samples/interstellar-take1.pvproj.json');
await page.waitForTimeout(600);
await page.setInputFiles('.file-card .actions input[type=file]', CLIP);
await page.waitForTimeout(1500);
await page.click('.stepper >> text=Style');
await page.waitForTimeout(800);
await page.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 6.0; });
await page.waitForTimeout(1500);
// render the current project's look offscreen at t = 6.0
const frame = async (name) => {
  const url = await page.evaluate(async () => {
    const r = window.pianoverse.renderer; const proj = window.pianoverseProject;
    r.setScale(1); r.setProject(proj); await r.texturesReady();
    const v = document.querySelector('video');
    const fc = document.createElement('canvas'); fc.width = v.videoWidth; fc.height = v.videoHeight; fc.getContext('2d').drawImage(v, 0, 0);
    const img = await r.capture(fc, v.currentTime);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    return c.toDataURL('image/png');
  });
  writeFileSync(`${OUT}/${name}`, Buffer.from(url.split(',')[1], 'base64'));
};
const look = () => page.evaluate(() => window.pianoverseProject.look ?? {});
const setRange = (label, v) => page.$eval(`input[aria-label="${label}"]`, (el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
await page.click('.seg button:text-is("Texture")');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/1-texture-ice.png` }); await frame('1-frame.png');
await page.click('.tex >> text=Gold foil'); await page.click('.seg button:text-is("Natural")');
await setRange('Texture size', 1.5); await setRange('Bumps', 1.6);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/2-foil-natural.png` }); await frame('2-frame.png');
const l = await look();
console.log('look:', l.noteStyle, l.noteTexture, l.texMode, l.texScale, l.texRelief);
if (UPLOAD) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.tex.add')]);
  await fc.setFiles(UPLOAD);
  await page.waitForTimeout(3000);
  console.log('after upload:', (await look()).noteTexture, '| my textures:', await page.$$eval('.tex.mine', (e) => e.map((x) => x.textContent)));
  await page.screenshot({ path: `${OUT}/3-uploaded.png` }); await frame('3-frame.png');
}
await b.close();
