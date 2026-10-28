import { createRequire } from 'module';
const { chromium } = createRequire(new URL('../../package.json', import.meta.url))('playwright');
const [OUT, SEL, W] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(W ?? 390), height: 844 } });
await p.goto('http://localhost:8090/', { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready);
const el = p.locator(SEL).first(); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
await el.screenshot({ path: OUT }); await b.close();
