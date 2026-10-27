// Unit tests for the parts that need no browser or GPU: each test/unit/*.test.ts is bundled with esbuild and run
// in Node. Modules that touch the desktop app or browser storage are swapped for in-memory fakes (FAKES).
//   node test/unit/run.mjs            every test
//   node test/unit/run.mjs projectFile one test
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const FAKES = { textureStore: 'fakeTextures.ts' };
const dir = path.resolve('test/unit');
const only = process.argv[2];
const tests = readdirSync(dir).filter((f) => f.endsWith('.test.ts') && (!only || f.startsWith(only)));
let failed = 0;
for (const t of tests) {
  const out = path.resolve('test/out/unit', t.replace(/\.ts$/, '.mjs'));
  await build({
    entryPoints: [path.join(dir, t)], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
    plugins: [{ name: 'fakes', setup(b) {
      b.onResolve({ filter: new RegExp(`/(${Object.keys(FAKES).join('|')})$`) }, (a) => ({ path: path.join(dir, FAKES[path.basename(a.path)]) }));
    } }],
  });
  console.log(`== ${t}`);
  try { execFileSync('node', [out], { stdio: 'inherit' }); } catch { failed++; }
}
console.log(failed ? `${failed} test file(s) failed` : `all ${tests.length} test file(s) passed`);
process.exit(failed ? 1 : 0);
