// .pianoverse files: pack a project with a texture of your own, unpack it into an empty library, compare.
import { readFileSync } from 'node:fs';
import { isPackage, packProject, unpackProject, userAssetIds } from '../../src/ui/services/projectFile';
import { library } from './fakeTextures';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const p = JSON.parse(readFileSync('samples/interstellar-take1.pvproj.json', 'utf8'));
p.look = { ...p.look, texOn: true, noteTexture: 'user:t123', partShape: 'user:s9' };
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>';
library.set('t123', { name: 'Red marble', files: { color: new Blob([png], { type: 'image/png' }), normal: new Blob([png], { type: 'image/png' }) } });
library.set('s9', { name: 'Star', files: { color: new Blob([svg], { type: 'image/svg+xml' }) } });

ok(JSON.stringify(userAssetIds(p)) === '["t123","s9"]', 'finds the textures and shapes the project uses');
const bytes = await packProject(p, 'take.mp4', 'data:image/jpeg;base64,' + btoa('jpegdata'));
ok(isPackage(bytes), 'packs into a ZIP container');

library.clear();
const back = await unpackProject(bytes);
ok(back.notes.length === p.notes.length && back.look?.noteTexture === 'user:t123', 'the project comes back');
const t = library.get('t123');
ok(!!t && t.name === 'Red marble' && !!t.files.color && !!t.files.normal, 'the texture comes back, with its normal map, under its id');
ok(new Uint8Array(await t!.files.color!.arrayBuffer()).join() === png.join(), 'the texture bytes are intact');
ok(library.get('s9')?.files.color?.type === 'image/svg+xml', 'the shape drawing comes back as SVG');

const legacy = await unpackProject(new TextEncoder().encode(readFileSync('samples/interstellar-take1.pvproj.json', 'utf8')));
ok(legacy.format === 'pianoverse-project', 'older JSON project files still open');
let threw = false;
try { await unpackProject(new TextEncoder().encode('{"hello":1}')); } catch { threw = true; }
ok(threw, 'a file that isn\'t a project is refused');

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
