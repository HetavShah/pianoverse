// Full-page screenshots of the site at desktop and phone widths, plus an overflow and console check.
import { createRequire } from 'module';
const { chromium } = createRequire(new URL('../../package.json', import.meta.url))('playwright');
const OUT = process.argv[2], URL = process.argv[3] ?? 'http://localhost:8090/';
const sizes = (process.env.SIZES ?? '1440x900,390x844').split(',').map((s) => s.split('x').map(Number));
const b = await chromium.launch();
for (const [w, h] of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  p.on('requestfailed', (r) => errs.push('failed ' + r.url()));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  // scroll through so lazy images load
  const H = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += h) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(60); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400);
  const over = await p.evaluate(() => {
    const W = document.documentElement.clientWidth, out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > W + 1 && !el.closest('.looks, .shots, .lane-label') && getComputedStyle(el).position !== 'fixed') out.push(el.tagName + '.' + el.className + ' ' + Math.round(r.right));
    }
    return { scrollW: document.documentElement.scrollWidth, W, out: out.slice(0, 12) };
  });
  console.log(`${w}x${h}`, JSON.stringify(over), errs.slice(0, 8));
  await p.screenshot({ path: `${OUT}/page-${w}.png`, fullPage: true });
  await ctx.close();
}
await b.close();
