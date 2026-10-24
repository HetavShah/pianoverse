// CI pre-flight: prove the signing secrets can sign, and that they belong to the
// public key the app trusts (src-tauri/tauri.conf.json). Problems surface as ::error:: annotations.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fail = (msg) => { console.log(`::error::${msg}`); process.exit(1); };
const key = (process.env.TAURI_SIGNING_PRIVATE_KEY || '').trim();
const pw = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || '';
if (!key) fail('Secret TAURI_SIGNING_PRIVATE_KEY is missing (Settings > Secrets and variables > Actions).');
if (!pw) fail('Secret TAURI_SIGNING_PRIVATE_KEY_PASSWORD is missing (Settings > Secrets and variables > Actions).');

let keyText = '';
try { keyText = Buffer.from(key, 'base64').toString('utf8'); } catch {}
if (!keyText.includes('secret key')) fail('TAURI_SIGNING_PRIVATE_KEY is not a Tauri key. Paste the whole contents of pianoverse-updater.key (one long line).');

const dir = mkdtempSync(join(tmpdir(), 'pvsign-'));
const file = join(dir, 'probe.txt');
writeFileSync(file, 'pianoverse signing probe');
try {
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tauri', 'signer', 'sign', '-k', key, '-p', pw, file], { stdio: 'pipe', shell: process.platform === 'win32', env: { ...process.env, CI: 'true' } });
} catch (e) {
  const out = `${e.stdout || ''}${e.stderr || ''}`.replace(/\s+/g, ' ').trim();
  fail(`Signing with the secrets failed: ${out.slice(-300)}. The password secret probably does not match the key secret.`);
}

// minisign: bytes 2..10 of the decoded signature / public key are the key id
const lastLineBytes = (b64) => Buffer.from(Buffer.from(b64, 'base64').toString('utf8').trim().split('\n')[1], 'base64');
const sigId = lastLineBytes(readFileSync(file + '.sig', 'utf8').trim()).subarray(2, 10).toString('hex');
const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const pubId = lastLineBytes(conf.plugins.updater.pubkey).subarray(2, 10).toString('hex');
if (sigId !== pubId) fail(`TAURI_SIGNING_PRIVATE_KEY is an older key (id ${sigId}); the app expects key ${pubId}. Replace the secret with the newest pianoverse-updater.key.`);
console.log(`Signing secrets OK (key ${pubId}).`);
