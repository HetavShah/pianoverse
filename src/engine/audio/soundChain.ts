// The chain of Web Audio nodes the sound runs through, built the same way for the live preview (an AudioContext
// fed by the video element) and the export (an OfflineAudioContext fed by the decoded soundtrack):
//
//   in → bass → treble → muffle (low-pass) → level ─┬──────────────────────┬→ mix → master → limiter → out
//                            │                      └→ hall send → hall reverb ┘ ↑
//                            └→ ring send → ring-out reverb ────────────────────┤
//                                             swell (made in synth.ts) ─────────┘
//
// Only the parts the settings use are built. What changes over time (level, muffle, ring send) comes from
// soundAt(): the preview follows the playhead with follow(), the export schedules it all at once with schedule().
import { dbToGain, masterGain, Sound, soundAt } from './sound';
import { hallImpulse, ringImpulse, Stereo } from './synth';

/** reverb levels (the convolver normalises its impulse response; these set the wet level against the dry sound) */
const HALL_WET = 0.55;
const RING_WET = 1.1;
/** the limiter's ceiling, dBFS */
const CEILING_DB = -1.5;
/** the soft clipper: straight up to KNEE, rounding off towards the ceiling; covers input up to CLIP_RANGE */
const KNEE = 0.708, TOP = 0.966, CLIP_RANGE = 4;
let clipCurve: Float32Array | null = null;
function softClipCurve(): Float32Array {
  if (clipCurve) return clipCurve;
  const n = 8193, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = ((i / (n - 1)) * 2 - 1) * CLIP_RANGE, a = Math.abs(u);
    const y = a <= KNEE ? a : KNEE + (TOP - KNEE) * Math.tanh((a - KNEE) / (TOP - KNEE));
    c[i] = (Math.sign(u) * y) / CLIP_RANGE;
  }
  return (clipCurve = c);
}
/** points per second of the export's automation curves */
const CURVE_RATE = 200;
/** how quickly the preview's settings follow the playhead, seconds */
const FOLLOW = 0.012;

export interface SoundChainOpts {
  sound: Sound;
  /** the part of the video in use (seconds of the video) */
  span: [number, number];
  /** the soundtrack's loudness, for evening it out (null: not measured) */
  measuredLufs: number | null;
  /** the swell before the start (synth.ts reverseSwell), when the start is 'swell' and it has been made */
  swell?: { data: Stereo; rate: number } | null;
}

const toBuffer = (ctx: BaseAudioContext, data: Stereo, rate = ctx.sampleRate) => {
  const b = ctx.createBuffer(2, data[0].length, rate);
  b.copyToChannel(data[0], 0);
  b.copyToChannel(data[1], 1);
  return b;
};

// the made-up sounds are the same every time for a rate and length: made once
const made = new Map<string, Stereo>();
const once = (key: string, make: () => Stereo) => { let v = made.get(key); if (!v) { v = make(); made.set(key, v); } return v; };

export class SoundChain {
  /** connect the performance here */
  readonly input: GainNode;
  private readonly level: GainNode;
  private readonly muffle: BiquadFilterNode;
  private readonly ringSend: GainNode | null = null;
  private readonly swellBuf: AudioBuffer | null = null;
  private readonly mix: GainNode;
  private swellSrc: AudioBufferSourceNode | null = null;
  private readonly nodes: AudioNode[] = [];
  private readonly s: Sound;
  private readonly span: [number, number];

  constructor(private readonly ctx: BaseAudioContext, o: SoundChainOpts, out: AudioNode) {
    const s = (this.s = o.sound);
    this.span = o.span;
    const keep = <T extends AudioNode>(n: T) => { this.nodes.push(n); return n; };
    const gain = (v: number) => { const g = keep(ctx.createGain()); g.gain.value = v; return g; };
    const filter = (type: BiquadFilterType, hz: number, db = 0, q = Math.SQRT1_2) => {
      const f = keep(ctx.createBiquadFilter()); f.type = type; f.frequency.value = hz; f.gain.value = db; f.Q.value = q; return f;
    };
    const reverb = (ir: Stereo) => { const c = keep(ctx.createConvolver()); c.buffer = toBuffer(ctx, ir); return c; };
    const rate = ctx.sampleRate;

    this.input = gain(1);
    const bass = filter('lowshelf', 150, s.bass);
    const treble = filter('highshelf', 5000, s.treble);
    this.muffle = filter('lowpass', 20000);
    this.level = gain(1);
    const mix = (this.mix = gain(1));
    this.input.connect(bass).connect(treble).connect(this.muffle).connect(this.level).connect(mix);

    if (s.hall > 0.001) {
      this.level.connect(gain(s.hall * HALL_WET)).connect(reverb(once(`hall${rate}`, () => hallImpulse(rate)))).connect(mix);
    }
    if (s.end === 'ring') {
      this.ringSend = gain(0);
      const ir = once(`ring${rate}|${s.endLen}`, () => ringImpulse(rate, s.endLen));
      this.muffle.connect(this.ringSend).connect(reverb(ir)).connect(gain(RING_WET)).connect(mix);
    }
    if (s.start === 'swell' && o.swell) this.swellBuf = toBuffer(ctx, o.swell.data, o.swell.rate);

    // master level, then a limiter so a louder setting can't clip. The compressor adds make-up gain of its own
    // ((1 / its gain at full scale) ^ 0.6, as the Web Audio spec has it); the gain in front of it takes that back
    const ratio = 20;
    const fullScaleDb = CEILING_DB - CEILING_DB / ratio;
    const makeUp = Math.pow(1 / dbToGain(fullScaleDb), 0.6);
    const master = gain(masterGain(s, o.measuredLufs) / makeUp);
    const lim = keep(ctx.createDynamicsCompressor());
    lim.threshold.value = CEILING_DB; lim.knee.value = 0; lim.ratio.value = ratio; lim.attack.value = 0.002; lim.release.value = 0.12;
    // the compressor can't stop every peak (it reacts in a few milliseconds): a soft clipper rounds off whatever
    // still goes over, and leaves everything below −3 dBFS exactly as it is
    const range = gain(1 / CLIP_RANGE);
    const clip = keep(ctx.createWaveShaper());
    clip.curve = softClipCurve();
    mix.connect(master).connect(lim).connect(range).connect(clip).connect(gain(CLIP_RANGE)).connect(out);
  }

  /** the preview: set everything for the playhead at t (call every frame while playing, and on a pause) */
  follow(t: number, _playing: boolean) {
    const st = soundAt(this.s, this.span, t);
    const now = this.ctx.currentTime;
    this.level.gain.setTargetAtTime(st.gain, now, FOLLOW);
    this.muffle.frequency.setTargetAtTime(st.cutoff, now, FOLLOW);
    this.ringSend?.gain.setTargetAtTime(st.ring, now, FOLLOW);
  }

  /** the preview: play the swell now; returns how many seconds until the video should start (0: no swell) */
  playSwell(): number {
    if (!this.swellBuf) return 0;
    this.stopSwell();
    const node = (this.swellSrc = this.ctx.createBufferSource());
    node.buffer = this.swellBuf;
    node.connect(this.mix);
    node.start(this.ctx.currentTime);
    return this.swellBuf.duration;
  }

  stopSwell() {
    if (!this.swellSrc) return;
    try { this.swellSrc.stop(); } catch { /* ended */ }
    this.swellSrc.disconnect();
    this.swellSrc = null;
  }

  /** the export: everything over time; the video's start is `lead` seconds in (after the swell) */
  schedule(lead = 0) {
    const [a, b] = this.span;
    const dur = b - a;
    const n = Math.max(2, Math.ceil(dur * CURVE_RATE) + 1);
    const g = new Float32Array(n), f = new Float32Array(n), r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const st = soundAt(this.s, this.span, Math.min(b, a + (i / (n - 1)) * dur));
      g[i] = st.gain; f[i] = st.cutoff; r[i] = st.ring;
    }
    this.level.gain.setValueAtTime(0, 0);
    this.level.gain.setValueCurveAtTime(g, lead, dur);
    this.muffle.frequency.setValueCurveAtTime(f, lead, dur);
    this.ringSend?.gain.setValueAtTime(0, 0);
    this.ringSend?.gain.setValueCurveAtTime(r, lead, dur);
    if (this.swellBuf) {
      const node = this.ctx.createBufferSource();
      node.buffer = this.swellBuf;
      node.connect(this.mix);
      node.start(Math.max(0, lead - this.swellBuf.duration));
    }
  }

  dispose() {
    this.stopSwell();
    for (const n of this.nodes) n.disconnect();
  }
}
