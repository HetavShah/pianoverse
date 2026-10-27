// The grand piano's rules that need no audio: notes to voices with each pedal mode, a re-struck key stopping the
// sound it was still making, pedal lifts, velocities, and how the video and the piano are mixed.
import { firstVoiceFrom, loudnessToVelocity, pedalLifts, pianoVoices, readPackHeader } from '../../src/engine/audio/piano';
import { resolveSound, soundActive, sourceGains } from '../../src/engine/audio/sound';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const notes = [
  { s: 0, e: 0.5, h: 2, p: 60, v: 0.45 },
  { s: 1, e: 1.2, h: 2, p: 64, v: 0.6 },
  { s: 1.5, e: 1.8, p: 60, v: 0.3 },     // C again: stops the first C
  { s: 3, e: 3.4, p: 100, v: 0.45 },     // above the dampers
  { s: 4, e: 4.1, p: 10, v: 0.45 },      // below the keyboard
];
const off = pianoVoices(notes, 'off'), played = pianoVoices(notes, 'played'), held = pianoVoices(notes, 'held');
ok(off.length === 4, 'keys off the keyboard are left out');
ok(off[0].end === 0.5 && off[1].end === 1.2, 'pedal off: a note stops when its key is let go');
ok(played[1].end === 2, 'as played: a note held by the pedal rings until it comes up');
ok(played[0].end === 1.5, 'a key struck again stops the sound it was still making');
ok(held[1].end === Infinity && held[3].end === Infinity, 'always down: every note rings on');
ok(held[0].end === 1.5, 'always down: still stopped by its key struck again');
ok(loudnessToVelocity(0.3) === 30 && loudnessToVelocity(0.6) === 110 && loudnessToVelocity(2) === 127 && loudnessToVelocity(0) === 1, 'loudness back to MIDI velocity');
ok(JSON.stringify(pedalLifts(notes)) === '[2]', 'the pedal comes up once, at 2 s');
ok(firstVoiceFrom(off, 1.4) === 2 && firstVoiceFrom(off, 0) === 0 && firstVoiceFrom(off, 99) === 4, 'find the first voice from a time');

const g = sourceGains(resolveSound({ source: 'both', blend: 0.5 }));
ok(Math.abs(g.video - g.piano) < 1e-9 && Math.abs(g.video ** 2 + g.piano ** 2 - 2 * 0.85 ** 2) < 1e-9, 'both: equal power at the middle');
ok(sourceGains(resolveSound({ source: 'piano' })).video === 0 && sourceGains(resolveSound({})).piano === 0, 'only the source picked is heard');
ok(soundActive(resolveSound({ source: 'piano' })), 'the piano counts as a change (the soundtrack is rendered)');

// a pack header round trip
const header = JSON.stringify({ version: 1, credit: 'x', items: [{ kind: 'note', key: 60, vel: 68, tune: 0, off: 0, len: 3 }] });
const enc = new TextEncoder().encode(header);
const bytes = new Uint8Array(4 + enc.length + 3);
new DataView(bytes.buffer).setUint32(0, enc.length, true); bytes.set(enc, 4);
const r = readPackHeader(bytes.buffer);
ok(r.header.items[0].key === 60 && r.base === 4 + enc.length, 'reads a pack header');

if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
