// The share card (1200x630) and the touch icon, drawn with the site's own fonts.
import { createRequire } from 'module';
const { chromium } = createRequire(new URL('../../package.json', import.meta.url))('playwright');
const S = process.argv[2];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto('http://localhost:8090/assets/');
await p.setContent(`<html><head><base href="http://localhost:8090/"><style>
@font-face{font-family:Syncopate;font-weight:700;src:url(assets/fonts/syncopate-700.woff2)}
@font-face{font-family:Archivo;font-weight:100 900;src:url(assets/fonts/archivo.woff2)}
body{margin:0;width:1200px;height:630px;background:#161615;color:#f2efe8;font-family:Archivo;display:grid;grid-template-columns:560px 640px;overflow:hidden}
.t{padding:56px 48px;display:flex;flex-direction:column;gap:26px;border-right:1px solid #2b2a27}
.w{font-weight:800;font-size:16px;letter-spacing:.12em}
h1{margin:0;font:700 44px/1.02 Syncopate;letter-spacing:.02em;text-transform:uppercase}
p{margin:0;font-size:22px;line-height:1.45;color:#d8d4cb}
.m{margin-top:auto;font-size:17px;color:#a29f98;display:flex;align-items:center;gap:14px}.m i{width:36px;height:3px;background:#e9542d}
img{width:640px;height:630px;object-fit:cover;object-position:60% 50%}
</style></head><body><div class="t"><div class="w">PIANOVERSE</div><h1>You played it. Now let them see it.</h1><p>The video editor made for pianists.</p><div class="m"><i></i>Free for Windows · No sign-up</div></div><img src="assets/hero-after.jpg"></body></html>`);
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
await p.screenshot({ path: S + '/og.jpg', type: 'jpeg', quality: 88 });
await p.setViewportSize({ width: 180, height: 180 });
await p.setContent(`<html><body style="margin:0"><img src="http://localhost:8090/favicon.svg" style="width:180px;height:180px;display:block"></body></html>`);
await p.waitForTimeout(200);
await p.screenshot({ path: S + '/apple-touch-icon.png' });
await b.close();
