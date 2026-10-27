// The Sound settings' maths: the transitions over time, when the sound counts as changed, the loudness meter against
// the BS.1770 reference, and the ring-out reverb dying away.
import { DEFAULT_SOUND, evenGainDb, resolveSound, soundActive, soundAt, soundLead, soundTail, transitionLengths } from '../../src/engine/audio/sound';
import { integratedLoudness } from '../../src/engine/audio/loudness';
import { ringImpulse } from '../../src/engine/audio/synth';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const near = (a: number, b: number, e = 1e-3) => Math.abs(a - b) <= e;
const span: [number, number] = [10, 30];

ok(!soundActive(DEFAULT_SOUND), 'the default sound is the recording as it is');
ok(soundActive(resolveSound({ hall: 0.2 })) && soundActive(resolveSound({ end: 'fade' })) && soundActive(resolveSound({ even: true })), 'any change counts');

const plain = resolveSound({});
ok(near(soundAt(plain, span, 20).gain, 1) && soundAt(plain, span, 9).gain === 0 && soundAt(plain, span, 31).gain === 0, 'full level inside the video, silent outside');
ok(soundAt(plain, span, 10).gain === 0 && near(soundAt(plain, span, 10.02).gain, 1), 'no click at the start (20 ms ramp)');

const fade = resolveSound({ start: 'fade', startLen: 2, end: 'fade', endLen: 4 });
ok(near(soundAt(fade, span, 11).gain, Math.sin(Math.PI / 4)), 'fade in: halfway is −3 dB (equal power)');
ok(near(soundAt(fade, span, 28).gain, Math.cos(Math.PI / 4)) && near(soundAt(fade, span, 30).gain, 0), 'fade out: halfway −3 dB, silent at the end');

const muffle = resolveSound({ end: 'muffle', endLen: 3, start: 'open', startLen: 2 });
ok(soundAt(muffle, span, 10.001).cutoff < 300 && near(soundAt(muffle, span, 12).cutoff, 20000, 1), 'open up: from muffled to fully open');
ok(near(soundAt(muffle, span, 30).cutoff, 300, 1) && soundAt(muffle, span, 20).cutoff === 20000, 'muffle out: closes to 300 Hz at the end');

const ring = resolveSound({ end: 'ring', endLen: 5 });
ok(soundAt(ring, span, 20).ring === 0 && near(soundAt(ring, span, 30).ring, 1) && soundAt(ring, span, 29.5).ring > 0.3, 'ring-out: the last second blooms into the reverb');
ok(near(soundAt(ring, span, 29.7).gain, 1) && near(soundAt(ring, span, 29.875).gain, Math.SQRT1_2) && near(soundAt(ring, span, 30).gain, 0), 'ring-out: the piano lets go over the last quarter second');
ok(soundTail(ring) === 5 && soundTail(fade) === 0, 'the export runs on for the ring-out only');

ok(transitionLengths(resolveSound({ startLen: 8 }), [0, 6]).start === 3, 'a transition takes at most half the video');
const swell = resolveSound({ start: 'swell', startLen: 3 });
ok(soundLead(swell) === 3 && soundLead(plain) === 0 && near(soundAt(swell, span, 10.5).gain, 1) && soundAt(swell, span, 10.5).cutoff === 20000, 'swell: comes before the start, the performance itself untouched');

ok(evenGainDb(resolveSound({ even: true }), -20) === 6 && evenGainDb(resolveSound({ even: true }), -40) === 12 && evenGainDb(resolveSound({}), -20) === 0, 'loudness evening: towards −14 LUFS, at most 12 dB');

// BS.1770: a 997 Hz sine at −20 dBFS in both channels reads −20 LUFS
const rate = 48000, n = rate * 5;
const sine = new Float32Array(n);
for (let i = 0; i < n; i++) sine[i] = 0.1 * Math.sin((2 * Math.PI * 997 * i) / rate);
const L = integratedLoudness([sine, sine], rate);
ok(near(L, -20, 0.1), `loudness meter: reference sine reads ${L.toFixed(2)} LUFS`);
ok(integratedLoudness([new Float32Array(n)], rate) === -Infinity, 'silence has no loudness');
const half = new Float32Array(n); half.set(sine.subarray(0, n / 2));
ok(near(integratedLoudness([half, half], rate, 0, 2.5), -20, 0.1), 'measures only the span asked for');

const ir = ringImpulse(48000, 3);
const tailEnergy = (a: number, b: number) => { let e = 0; for (let i = Math.floor(a * 48000); i < b * 48000; i++) e += ir[0][i] ** 2; return e; };
ok(tailEnergy(2.5, 3) < tailEnergy(0, 0.5) * 1e-4, 'the ring-out has died away by its length');

if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
