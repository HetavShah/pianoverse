import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-unsafe-webgpu','--use-webgpu-adapter=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader','--disable-vulkan-surface'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://localhost:4173/'); await p.waitForTimeout(1500);
const ins = await p.$$('.start input[type=file]'); await ins[0].setInputFiles('/home/claude/test-clip.webm'); await p.waitForTimeout(800);
await p.screenshot({ path: '/home/claude/start2.png' });
await b.close();
