// The piano: your notes played on a recorded concert grand (Salamander Grand Piano V3 by Alexander Holm, CC-BY 3.0),
// for when the video's own sound isn't good enough (Audio step → Sound → Sound from).
//
// The samples: one recording every three keys (A0, C1, D#1 … C8), each at a few loudnesses, plus the soft thump
// of each key's damper landing. A note plays the recording nearest its key, sped up or slowed down by up to a
// semitone and a half, from the loudness layer nearest how hard it was played.
//
// The pack (one file, made by tools/piano-pack): 4 bytes of header length, a JSON header, then the samples, each an
// Ogg Opus file:
//   { version, credit, items: [{ kind: 'note' | 'rel' | 'pedalUp' | 'pedalDown', key, vel, tune, off, len }] }
//
// Voices: a note becomes a voice that starts at its start and lets go at its end (or, with the sustain pedal, when
// the pedal comes up). Above F6 a real piano has no dampers, so those notes always ring on.
import type { RawNote } from '../project';

export interface PackItem {
  kind: 'note' | 'rel' | 'pedalUp' | 'pedalDown';
  /** MIDI key the sample was recorded on */
  key: number;
  /** the middle of the velocity range the layer was recorded for, 1..127 (notes) */
  vel: number;
  /** cents to tune it by */
  tune: number;
  /** where it is in the file, bytes */
  off: number; len: number;
}
export interface PackHeader { version: number; credit: string; items: PackItem[] }

interface Layer { vel: number; tune: number; buf: AudioBuffer }
export interface PianoPack {
  /** keys that have recordings, each with its loudness layers, softest first */
  zones: Map<number, Layer[]>;
  /** the damper thump of each key */
  rel: Map<number, AudioBuffer>;
  pedalUp: AudioBuffer[];
  credit: string;
}

/** the gain the whole piano plays at: a moderately loud passage lands near −16 LUFS, with room left for the reverb */
export const PIANO_GAIN = 0.6;
/** the highest key with a damper (F6); above it notes ring on */
const LAST_DAMPED = 89;
/** damper thumps and the pedal coming up, as loud as in the original instrument (dB) */
const REL_DB = -31, PEDAL_DB = -24;
const dbToGain = (db: number) => Math.pow(10, db / 20);

/** read the header of a pack */
export function readPackHeader(bytes: ArrayBuffer): { header: PackHeader; base: number } {
  const len = new DataView(bytes).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 4, len))) as PackHeader;
  return { header, base: 4 + len };
}

/**
 * A pack, decoded as needed: a decoded grand is large (about 400 MB for everything), so only the recordings a piece
 * uses are decoded, and each only once.
 */
export class PianoSamples {
  private readonly header: PackHeader;
  private readonly base: number;
  private readonly noteKeys: number[];
  private readonly done = new Map<PackItem, Promise<AudioBuffer>>();
  readonly credit: string;

  constructor(private readonly bytes: ArrayBuffer, private readonly decode: (data: ArrayBuffer) => Promise<AudioBuffer>) {
    const { header, base } = readPackHeader(bytes);
    this.header = header; this.base = base;
    this.credit = header.credit;
    this.noteKeys = [...new Set(header.items.filter((i) => i.kind === 'note').map((i) => i.key))].sort((a, b) => a - b);
  }

  private get(i: PackItem) {
    let p = this.done.get(i);
    if (!p) {
      p = this.decode(this.bytes.slice(this.base + i.off, this.base + i.off + i.len));
      this.done.set(i, p);
      p.catch(() => this.done.delete(i));
    }
    return p;
  }

  /** the recordings these voices play, decoded */
  async prepare(voices: PianoVoice[]): Promise<PianoPack> {
    const want = new Set<PackItem>();
    const notes = this.header.items.filter((i) => i.kind === 'note');
    for (const v of voices) {
      const key = nearestKey(this.noteKeys, v.p);
      want.add(pickLayer(notes.filter((i) => i.key === key), v.vel));
      const rel = this.header.items.find((i) => i.kind === 'rel' && i.key === v.p);
      if (rel) want.add(rel);
    }
    for (const i of this.header.items) if (i.kind === 'pedalUp') want.add(i);
    const zones = new Map<number, Layer[]>(), rel = new Map<number, AudioBuffer>(), pedalUp: AudioBuffer[] = [];
    await Promise.all([...want].map(async (i) => {
      const buf = await this.get(i);
      if (i.kind === 'note') { const z = zones.get(i.key) ?? []; z.push({ vel: i.vel, tune: i.tune, buf }); zones.set(i.key, z); }
      else if (i.kind === 'rel') rel.set(i.key, buf);
      else if (i.kind === 'pedalUp') pedalUp.push(buf);
    }));
    for (const z of zones.values()) z.sort((a, b) => a.vel - b.vel);
    return { zones, rel, pedalUp, credit: this.credit };
  }
}

/** the loudness layer nearest how hard a note was played */
function pickLayer<T extends { vel: number }>(layers: T[], vel: number): T {
  let best = layers[0];
  for (const l of layers) if (Math.abs(l.vel - vel) < Math.abs(best.vel - vel)) best = l;
  return best;
}

function nearestKey(keys: number[], p: number) {
  let best = keys[0];
  for (const k of keys) if (Math.abs(k - p) < Math.abs(best - p)) best = k;
  return best;
}

/** a note to play: from t to end (seconds, video time; Infinity: it rings until it dies away), MIDI key p, velocity 1..127 */
export interface PianoVoice { t: number; end: number; p: number; vel: number }

/** the loudness scale the notes use (0..1, MIDI 30..110 → 0.3..0.6) back to MIDI velocity */
export const loudnessToVelocity = (v: number) => Math.max(1, Math.min(127, Math.round(30 + ((v - 0.3) / 0.3) * 80)));

/**
 * The notes as voices, in time order. Pedal 'held': every note rings on until it dies away (its end is Infinity);
 * 'played': a note held by the pedal rings until the pedal comes up; 'off': a note stops when its key is let go.
 * Either way a key struck again stops the sound it was still making.
 */
export function pianoVoices(notes: RawNote[], pedal: 'held' | 'played' | 'off'): PianoVoice[] {
  const endOf = (n: RawNote) => (pedal === 'held' ? Infinity : pedal === 'played' ? Math.max(n.e, n.h ?? n.e) : n.e);
  const vs = notes
    .map((n) => ({ t: n.s, end: Math.max(n.s + 0.04, endOf(n)), p: Math.round(n.p), vel: loudnessToVelocity(n.v ?? 0.45) }))
    .filter((v) => v.p >= 21 && v.p <= 108)
    .sort((a, b) => a.t - b.t);
  const last = new Map<number, PianoVoice>();
  for (const v of vs) {
    const prev = last.get(v.p);
    if (prev && prev.end > v.t) prev.end = Math.max(prev.t + 0.02, v.t);
    last.set(v.p, v);
  }
  return vs;
}

/** when the pedal comes up: the ends of pedal-held notes, one per lift */
export function pedalLifts(notes: RawNote[]): number[] {
  const hs = notes.filter((n) => n.h !== undefined && n.h > n.e + 0.02).map((n) => n.h!).sort((a, b) => a - b);
  const out: number[] = [];
  for (const h of hs) if (!out.length || h - out[out.length - 1] > 0.15) out.push(h);
  return out;
}

/** the first voice starting at or after t */
export function firstVoiceFrom(vs: PianoVoice[], t: number) {
  let lo = 0, hi = vs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (vs[m].t < t) lo = m + 1; else hi = m; }
  return lo;
}

interface Playing { src: AudioBufferSourceNode; g: GainNode; end: number }

/** plays voices on a context; the same code for the preview (a few at a time, just ahead) and the export (all at once) */
export class PianoPlayer {
  private readonly playing = new Set<Playing>();
  constructor(private readonly ctx: BaseAudioContext, private readonly pack: PianoPack, private readonly out: AudioNode) {}

  /**
   * Play a voice. when: the context time its start falls on (it may be in the past: then it starts `when` late,
   * part way into the recording). rate: video seconds per context second.
   */
  play(v: PianoVoice, when: number, rate = 1) {
    const ctx = this.ctx;
    const keys = [...this.pack.zones.keys()];
    if (!keys.length) return;
    const key = nearestKey(keys, v.p);
    // the layer nearest how hard it was played (prepare() decoded it), a little louder or softer within it
    const layer = pickLayer(this.pack.zones.get(key)!, v.vel);
    const level = PIANO_GAIN * Math.pow(Math.max(0.5, Math.min(1.6, v.vel / layer.vel)), 0.9);
    const speed = Math.pow(2, (v.p - key) / 12 + layer.tune / 1200);
    const late = Math.max(0, ctx.currentTime - when);
    const at = when + late;
    const into = late * speed;   // seconds into the recording
    if (into >= layer.buf.duration - 0.05) return;

    const src = ctx.createBufferSource();
    src.buffer = layer.buf;
    src.playbackRate.value = speed;
    const g = ctx.createGain();
    g.gain.setValueAtTime(late > 0 ? 0 : level, at);
    if (late > 0) g.gain.linearRampToValueAtTime(level, at + 0.012);   // joining a note part way: no click
    src.connect(g).connect(this.out);
    src.start(at, into);

    const len = (v.end - v.t) / rate;
    const off = when + len;
    const p: Playing = { src, g, end: at + (layer.buf.duration - into) / speed };
    if (v.p <= LAST_DAMPED && off > at && Number.isFinite(off)) {
      // the damper: a quick fall, slower in the bass where the strings are heavy
      const tau = 0.045 + 0.11 * Math.max(0, (LAST_DAMPED - v.p) / (LAST_DAMPED - 21));
      g.gain.setTargetAtTime(0, off, tau);
      p.end = Math.min(p.end, off + tau * 9);
      const thump = this.pack.rel.get(v.p);
      if (thump) this.extra(thump, off, dbToGain(REL_DB) * (0.25 + 0.75 * (v.vel / 127)) * PIANO_GAIN * 4);
    }
    src.stop(p.end);
    this.playing.add(p);
    const tally = globalThis as { __pvPianoVoices?: number };   // read by the tests
    tally.__pvPianoVoices = (tally.__pvPianoVoices ?? 0) + 1;
    src.onended = () => { src.disconnect(); g.disconnect(); this.playing.delete(p); };
  }

  /** the pedal coming up (a soft felt-and-wood sound) */
  pedalUp(when: number, i: number) {
    const b = this.pack.pedalUp[i % Math.max(1, this.pack.pedalUp.length)];
    if (b) this.extra(b, Math.max(when, this.ctx.currentTime), dbToGain(PEDAL_DB) * PIANO_GAIN * 4);
  }

  /** a short sound of the instrument itself (a damper's thump, the pedal), stopped like the notes on a pause */
  private extra(buf: AudioBuffer, at: number, level: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(level, 0);
    src.connect(g).connect(this.out);
    src.start(at);
    const p: Playing = { src, g, end: at + buf.duration };
    this.playing.add(p);
    src.onended = () => { src.disconnect(); g.disconnect(); this.playing.delete(p); };
  }

  /** stop everything quickly (a pause or a jump) */
  stopAll(fade = 0.04) {
    const now = this.ctx.currentTime;
    for (const p of this.playing) {
      // silent from now on, whatever was scheduled (a note or thump still to come included)
      p.g.gain.cancelScheduledValues(now);
      p.g.gain.setValueAtTime(p.g.gain.value, now);
      p.g.gain.linearRampToValueAtTime(0, now + fade);
      try { p.src.stop(now + fade); } catch { /* already given a stop time: the gain has it silent */ }
    }
    this.playing.clear();
  }
}

/**
 * The preview: plays the voices in step with the video. Call update() every frame with the video's time; it
 * schedules what's coming in the next moment, starts the notes still ringing when you press play or jump, and
 * stops when the video pauses.
 */
export class PianoFollower {
  private on = false;
  private vAnchor = 0;
  private cAnchor = 0;
  private until = 0;
  private lift = 0;
  /** how far ahead notes are scheduled, seconds */
  private static AHEAD = 0.3;

  constructor(private readonly ctx: BaseAudioContext, private readonly player: PianoPlayer, private readonly voices: PianoVoice[],
    private readonly lifts: number[] = []) {}

  update(t: number, playing: boolean, rate = 1) {
    if (!playing) { if (this.on) { this.player.stopAll(); this.on = false; } return; }
    const now = this.ctx.currentTime;
    const expected = this.vAnchor + (now - this.cAnchor) * rate;
    if (!this.on || Math.abs(expected - t) > 0.12) {
      // play pressed, or a jump: start over from here, with the notes still ringing at t
      if (this.on) this.player.stopAll();
      this.on = true;
      this.vAnchor = t; this.cAnchor = now + 0.02;
      for (const v of this.voices) {
        if (v.t >= t) break;
        if (v.end > t || v.p > LAST_DAMPED) if (t - v.t < 8) this.player.play(v, this.cAnchor - (t - v.t) / rate, rate);
      }
      this.until = t;
      this.lift = firstVoiceFrom(this.lifts.map((x) => ({ t: x, end: x, p: 0, vel: 0 })), t);
    } else if (Math.abs(expected - t) > 0.03) {
      // the clocks drift a little: line up again without stopping anything
      this.vAnchor = t; this.cAnchor = now;
    }
    const horizon = t + PianoFollower.AHEAD * rate;
    for (let i = firstVoiceFrom(this.voices, this.until); i < this.voices.length && this.voices[i].t < horizon; i++) {
      const v = this.voices[i];
      this.player.play(v, this.cAnchor + (v.t - this.vAnchor) / rate, rate);
    }
    while (this.lift < this.lifts.length && this.lifts[this.lift] < horizon) {
      if (this.lifts[this.lift] >= this.until) this.player.pedalUp(this.cAnchor + (this.lifts[this.lift] - this.vAnchor) / rate, this.lift);
      this.lift++;
    }
    this.until = horizon;
  }

  stop() { this.player.stopAll(); this.on = false; }
}
