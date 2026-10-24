// WebGPU renderer: video frame + glass notes + saber + key glow + impact sprites + particle plumes + bloom.
import commonSrc from './shaders/common.wgsl?raw';
import { fallUp } from './direction';
import { DEFAULT_LOOK, Look, NOTE_2D, NOTE_3D, resolveLook, saberBase } from './look';
import glassSrc from './shaders/glass.wgsl?raw';
import labelsSrc from './shaders/labels.wgsl?raw';
import { MAX_SHAPE_POINTS, svgToPoints } from './shapePoints';
import { loadTexSet, placeholder, refreshVideo, seekVideo, TexSet, UserFiles } from './noteTextures';
import keysSrc from './shaders/keys.wgsl?raw';
import spritesSrc from './shaders/sprites.wgsl?raw';
import saberSrc from './shaders/saber.wgsl?raw';
import simSrc from './shaders/particles_sim.wgsl?raw';
import partsSrc from './shaders/particles_draw.wgsl?raw';
import postSrc from './shaders/post.wgsl?raw';
import {
  Keyboard, Note, ProjectFile, RGB, gauss, lighten, mulberry32, prepareNotes, trackingMatrix,
} from './project';

export interface Layers {
  notes: boolean;
  keys: boolean;
  impact: boolean;
  saber: boolean;
  particles: boolean;
  bloom: boolean;
}

export const DEFAULT_LAYERS: Layers = { notes: true, keys: true, impact: true, saber: true, particles: true, bloom: true };

const PER_EMIT = 1024;     // particle slots per emitter
const MAX_EMIT = 512;
const MAX_GLASS = 512;
const MAX_KEYS = 256;
const MAX_SPRITES = 512;
const MAX_LIGHTS = 128;
const LIGHT_FMT: GPUTextureFormat = 'rgba16float';

export type FrameSource = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement;

export interface FrameStats { notes: number; emitters: number; particles: number; cpuMs: number }

const additive: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};

const hexRGB = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
/** note names, sharp spellings in cells 0-11 and flat spellings in 12-23 (64 px cells, 6 x 4) */
function makeAtlas(d: GPUDevice): GPUTexture {
  const C = 64, W = C * 6, H = C * 4;
  const tex = d.createTexture({ size: [W, H], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  try {
    const cv = new OffscreenCanvas(W, H);
    const g = cv.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...SHARP_NAMES, ...FLAT_NAMES].forEach((name, i) => {
      g.font = `600 ${name.length > 1 ? 34 : 40}px "Segoe UI", "Segoe UI Symbol", "DejaVu Sans", sans-serif`;
      g.fillText(name, (i % 6) * C + C / 2, Math.floor(i / 6) * C + C / 2 + 2);
    });
    d.queue.copyExternalImageToTexture({ source: cv }, { texture: tex }, [W, H]);
  } catch (e) { console.warn('[labels]', e); }
  return tex;
}
const FLAT_KEYS = { major: [5, 10, 3, 8, 1, 6], minor: [2, 7, 0, 5, 10, 3] };

/** notes drawn by the original approved glass code (anything else goes through the style shader) */
const originalNotes = (lk: Look) => lk.noteDim === '3d' && lk.note3d === 'glass' && !lk.texOn && lk.noteEdge === 1 && lk.noteOpacity === 1
  && lk.lightDir === DEFAULT_LOOK.lightDir && lk.lightPower === 1 && lk.lightShine === 1 && lk.noteDistort === 0;

export class Renderer {
  layers: Layers = { ...DEFAULT_LAYERS };
  stats: FrameStats = { notes: 0, emitters: 0, particles: 0, cpuMs: 0 };

  private context: GPUCanvasContext;
  private format: GPUTextureFormat;
  private proj: ProjectFile | null = null;
  private notes: Note[] = [];
  private kb = new Keyboard(36, 0, 0);
  private whiteKeys = 36;
  /** unit vector from a landing point back toward where notes come from (screen space) */
  private up: [number, number] = [0, -1];
  private look: Look = { ...DEFAULT_LOOK };
  private srcW = 1080;
  private srcH = 1920;
  private scale = 0.5;
  private rtW = 540;
  private rtH = 960;

  // emitters precomputed per project (16 floats each) + their active windows
  private emit = new Float32Array(0);
  private emitStart: number[] = [];
  private emitEnd: number[] = [];
  private emitSpan = 5;

  private sampler: GPUSampler;
  private frameBuf: GPUBuffer;
  private glassBuf: GPUBuffer;
  private keysBuf: GPUBuffer;
  private spriteBuf: GPUBuffer;
  private saberUni: GPUBuffer;
  private saberMap: GPUBuffer;
  private heatBuf: GPUBuffer;
  private simUni: GPUBuffer;
  private partDrawUni: GPUBuffer;
  private shapeBuf: GPUBuffer;
  private nShape = 0;
  private shapeKey = '';
  private shapeWant = '';
  private shapeLoad: Promise<void> = Promise.resolve();
  private emitBuf: GPUBuffer;
  private flowBuf: GPUBuffer;
  private partBuf: GPUBuffer;
  private lightsBuf: GPUBuffer;
  private postUni: GPUBuffer[] = [];

  private glassPipe: GPURenderPipeline;
  private keysPipe: GPURenderPipeline;
  private labelPipe: GPURenderPipeline;
  private labelBuf: GPUBuffer;
  private atlas: GPUTexture;
  private bars: number[] = [];
  private spritePipe: GPURenderPipeline;
  private saberPipe: GPURenderPipeline;
  private partPipe: GPURenderPipeline;
  private simPipe: GPUComputePipeline;
  private downPipe: GPURenderPipeline;
  private blurPipe: GPURenderPipeline;
  private compPipe: GPURenderPipeline;
  private compPipeOff: GPURenderPipeline;
  private offTex: GPUTexture | null = null;

  // note texture (the Texture note style)
  private texSampler: GPUSampler;
  private texUni: GPUBuffer;
  private noteUni: GPUBuffer;
  private bgUni: GPUBuffer;
  private bgTex: GPUTexture;
  private bgKey = '';
  private bgAspect = 1;
  private bgVideo: HTMLVideoElement | null = null;
  private bgCanvas: OffscreenCanvas | null = null;
  private tex: TexSet;
  private texWant = '';
  private texLoad: Promise<void> = Promise.resolve();
  /** reads the user's own textures (set by the app) */
  userFiles: UserFiles | null = null;

  private videoTex: GPUTexture | null = null;
  private lightTex!: GPUTexture;
  private b1a!: GPUTexture;
  private b1b!: GPUTexture;
  private b2a!: GPUTexture;
  private b2b!: GPUTexture;
  private groups: Record<string, GPUBindGroup> = {};

  static async create(canvas: HTMLCanvasElement): Promise<Renderer> {
    if (!navigator.gpu) throw new Error('WebGPU is not available in this window.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No graphics adapter found for WebGPU.');
    const device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, 64 * 1024 * 1024),
        maxBufferSize: Math.min(adapter.limits.maxBufferSize, 64 * 1024 * 1024),
      },
    });
    return new Renderer(canvas, device, adapter.info?.description || adapter.info?.vendor || 'GPU');
  }

  private constructor(private canvas: HTMLCanvasElement, private device: GPUDevice, public adapterName: string) {
    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('Could not create a WebGPU canvas.');
    this.context = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    device.lost.then((info) => console.error('[gpu] device lost:', info.reason, info.message));
    device.addEventListener('uncapturederror', (e) => console.error('[gpu]', (e as GPUUncapturedErrorEvent).error.message));
    ctx.configure({ device, format: this.format, alphaMode: 'opaque' });
    const d = device;
    const buf = (size: number, usage: number) => d.createBuffer({ size, usage });
    const U = GPUBufferUsage;
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.frameBuf = buf(192, U.UNIFORM | U.COPY_DST);
    this.texSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 8 });
    this.texUni = buf(48, U.UNIFORM | U.COPY_DST);
    this.noteUni = buf(144, U.UNIFORM | U.COPY_DST);
    this.bgUni = buf(112, U.UNIFORM | U.COPY_DST);
    this.bgTex = d.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    this.tex = placeholder(d);
    this.glassBuf = buf(MAX_GLASS * 64, U.VERTEX | U.COPY_DST);
    this.keysBuf = buf(MAX_KEYS * 6 * 28, U.VERTEX | U.COPY_DST);
    this.spriteBuf = buf(MAX_SPRITES * 48, U.VERTEX | U.COPY_DST);
    this.labelBuf = buf(MAX_GLASS * 48, U.VERTEX | U.COPY_DST);
    this.atlas = makeAtlas(d);
    this.saberUni = buf(64, U.UNIFORM | U.COPY_DST);
    this.saberMap = buf(64 * 8, U.STORAGE | U.COPY_DST);
    this.heatBuf = buf(40 * 16, U.STORAGE | U.COPY_DST);
    this.simUni = buf(112, U.UNIFORM | U.COPY_DST);
    this.partDrawUni = buf(32, U.UNIFORM | U.COPY_DST);
    this.shapeBuf = buf(MAX_SHAPE_POINTS * 16, U.STORAGE | U.COPY_DST);
    this.emitBuf = buf(MAX_EMIT * 64, U.STORAGE | U.COPY_DST);
    this.flowBuf = buf(20 * 16, U.STORAGE | U.COPY_DST);
    this.partBuf = buf(MAX_EMIT * PER_EMIT * 48, U.STORAGE);
    this.lightsBuf = buf(MAX_LIGHTS * 32, U.STORAGE | U.COPY_DST);
    for (let i = 0; i < 7; i++) this.postUni.push(buf(32, U.UNIFORM | U.COPY_DST));
    this.writeFlow();

    const mod = (code: string, withCommon = true) => {
      const m = d.createShaderModule({ code: withCommon ? commonSrc + '\n' + code : code });
      m.getCompilationInfo().then((info) => {
        for (const msg of info.messages) if (msg.type === 'error') console.error('[wgsl]', msg.lineNum, msg.message);
      });
      return m;
    };
    const lightTarget: GPUColorTargetState[] = [{ format: LIGHT_FMT, blend: additive }];
    const v4 = (loc: number, off: number): GPUVertexAttribute => ({ shaderLocation: loc, offset: off, format: 'float32x4' });
    const inst3: GPUVertexBufferLayout = { arrayStride: 48, stepMode: 'instance', attributes: [v4(0, 0), v4(1, 16), v4(2, 32)] };
    const inst4: GPUVertexBufferLayout = { arrayStride: 64, stepMode: 'instance', attributes: [v4(0, 0), v4(1, 16), v4(2, 32), v4(3, 48)] };

    const glassM = mod(glassSrc);
    this.glassPipe = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: glassM, entryPoint: 'vs', buffers: [inst4] },
      fragment: { module: glassM, entryPoint: 'fs', targets: lightTarget },
      primitive: { topology: 'triangle-strip' },
    });
    const keysM = mod(keysSrc);
    this.keysPipe = d.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: keysM, entryPoint: 'vs',
        buffers: [{ arrayStride: 28, attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x2' },
          { shaderLocation: 1, offset: 8, format: 'float32x2' },
          { shaderLocation: 2, offset: 16, format: 'float32x3' },
        ] }],
      },
      fragment: { module: keysM, entryPoint: 'fs', targets: lightTarget },
      primitive: { topology: 'triangle-list' },
    });
    const labelsM = mod(labelsSrc);
    this.labelPipe = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: labelsM, entryPoint: 'vs', buffers: [inst3] },
      fragment: { module: labelsM, entryPoint: 'fs', targets: lightTarget },
      primitive: { topology: 'triangle-strip' },
    });
    const spritesM = mod(spritesSrc);
    this.spritePipe = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: spritesM, entryPoint: 'vs', buffers: [inst3] },
      fragment: { module: spritesM, entryPoint: 'fs', targets: lightTarget },
      primitive: { topology: 'triangle-strip' },
    });
    const saberM = mod(saberSrc);
    this.saberPipe = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: saberM, entryPoint: 'vs' },
      fragment: { module: saberM, entryPoint: 'fs', targets: lightTarget },
      primitive: { topology: 'triangle-strip' },
    });
    const partM = mod(partsSrc);
    this.partPipe = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: partM, entryPoint: 'vs' },
      fragment: { module: partM, entryPoint: 'fs', targets: lightTarget },
      primitive: { topology: 'triangle-strip' },
    });
    this.simPipe = d.createComputePipeline({ layout: 'auto', compute: { module: mod(simSrc, false), entryPoint: 'main' } });
    const postM = mod(postSrc);
    const hdr: GPUColorTargetState[] = [{ format: LIGHT_FMT }];
    this.downPipe = d.createRenderPipeline({ layout: 'auto', vertex: { module: postM, entryPoint: 'vsFull' }, fragment: { module: postM, entryPoint: 'fsDown', targets: hdr } });
    this.blurPipe = d.createRenderPipeline({ layout: 'auto', vertex: { module: postM, entryPoint: 'vsFull' }, fragment: { module: postM, entryPoint: 'fsBlur', targets: hdr } });
    this.compPipe = d.createRenderPipeline({ layout: 'auto', vertex: { module: postM, entryPoint: 'vsFull' }, fragment: { module: postM, entryPoint: 'fsComposite', targets: [{ format: this.format }] } });
    this.compPipeOff = d.createRenderPipeline({ layout: 'auto', vertex: { module: postM, entryPoint: 'vsFull' }, fragment: { module: postM, entryPoint: 'fsComposite', targets: [{ format: 'rgba8unorm' }] } });
    this.resize();
  }

  // ---------- setup ----------

  setProject(proj: ProjectFile) {
    this.proj = proj;
    this.srcW = proj.video.width;
    this.srcH = proj.video.height;
    this.whiteKeys = proj.keyboard.whiteKeys;
    this.kb = new Keyboard(proj.keyboard.lowestNote, proj.keyboard.edge.a, proj.keyboard.edge.b);
    this.look = resolveLook(proj.look);
    const ns = proj.noteSource;
    this.bars = ns?.bars ? ns.bars.map((b) => b + ns.offset) : [];
    this.notes = prepareNotes(proj.notes, proj.keyboard.lowestNote, proj.keyboard.keys, this.look);
    this.up = fallUp(proj);
    this.buildEmitters();
    if (Math.round(this.srcW * this.scale) !== this.rtW || Math.round(this.srcH * this.scale) !== this.rtH) this.resize();
    else this.writePost();
  }

  /** Draw into a different canvas (the preview canvas belongs to whichever screen is showing). */
  attach(canvas: HTMLCanvasElement) {
    if (canvas === this.canvas) return;
    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('Could not create a WebGPU canvas.');
    ctx.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    this.canvas = canvas;
    this.context = ctx;
    canvas.width = this.rtW;
    canvas.height = this.rtH;
  }

  private writePost() {
    if (!this.b1a) return;
    const w1 = this.b1a.width, h1 = this.b1a.height, w2 = this.b2a.width, h2 = this.b2a.height;
    const q = this.device.queue;
    const post = (i: number, v: number[]) => q.writeBuffer(this.postUni[i], 0, new Float32Array(v));
    // texel(2) dir(2) sigma factor clampIn nLights
    post(0, [1 / this.rtW, 1 / this.rtH, 0, 0, 1, 2, 1, 0]);                  // light -> b1
    const bw = this.look.bloomWide;
    post(1, [1 / w1, 1 / h1, 1, 0, 5 * this.scale * bw, 1, 0, 0]);            // b1 blur H
    post(2, [1 / w1, 1 / h1, 0, 1, 5 * this.scale * bw, 1, 0, 0]);            // b1 blur V
    post(3, [1 / w1, 1 / h1, 0, 0, 1, 3, 0, 0]);                              // b1 -> b2
    post(4, [1 / w2, 1 / h2, 1, 0, 7 * this.scale * bw, 1, 0, 0]);            // b2 blur H
    post(5, [1 / w2, 1 / h2, 0, 1, 7 * this.scale * bw, 1, 0, 0]);            // b2 blur V
  }

  setScale(scale: number) {
    this.scale = scale;
    this.resize();
  }

  get size() { return { width: this.rtW, height: this.rtH }; }
  get noteCount() { return this.notes.length; }

  private resize() {
    this.rtW = Math.max(2, Math.round(this.srcW * this.scale));
    this.rtH = Math.max(2, Math.round(this.srcH * this.scale));
    this.canvas.width = this.rtW;
    this.canvas.height = this.rtH;
    const tex = (w: number, h: number) => this.device.createTexture({
      size: [Math.max(1, w), Math.max(1, h)], format: LIGHT_FMT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    for (const t of [this.lightTex, this.b1a, this.b1b, this.b2a, this.b2b]) t?.destroy();
    this.lightTex = tex(this.rtW, this.rtH);
    const w1 = Math.ceil(this.rtW / 2), h1 = Math.ceil(this.rtH / 2);
    const w2 = Math.ceil(w1 / 3), h2 = Math.ceil(h1 / 3);
    this.b1a = tex(w1, h1); this.b1b = tex(w1, h1);
    this.b2a = tex(w2, h2); this.b2b = tex(w2, h2);
    this.writePost();
    this.groups = {};
  }

  private writeFlow() {
    const rnd = mulberry32(3);
    const a = new Float32Array(20 * 4);
    for (let i = 0; i < 10; i++) {
      const lam = Math.exp(Math.log(70) + rnd() * (Math.log(300) - Math.log(70)));
      const ang = rnd() * Math.PI * 2;
      const k = (2 * Math.PI) / lam;
      const speed = 35 + rnd() * 35;
      const w = (0.25 + rnd() * 0.65) * (rnd() < 0.5 ? -1 : 1);
      a.set([k * Math.cos(ang), k * Math.sin(ang), speed / k, w], i * 4);
      a[(10 + i) * 4] = rnd() * Math.PI * 2;
    }
    this.device.queue.writeBuffer(this.flowBuf, 0, a);
  }

  private buildEmitters() {
    if (!this.proj) return;
    const kb = new Keyboard(this.kb.lowest, this.kb.edgeA, this.kb.edgeB);
    const lk = this.look;
    const rows: { start: number; end: number; data: number[] }[] = [];
    const mode = lk.partMode;
    for (const n of this.notes) {
      kb.H = trackingMatrix(this.proj, Math.round(n.s * this.proj.video.fps));
      const tg = kb.target(n.p);
      const rnd = mulberry32(n.idx * 7919 + 101);
      const vv = lk.partVelocity ? n.vn : 0.5; // "louder notes, bigger plumes" off: every note average
      if (mode !== 'plume') {
        const held = Math.min(4, Math.max(0.2, n.e - n.s));
        const slope = Math.abs(tg.along[0]) > 1e-3 ? tg.along[1] / tg.along[0] : 0;
        if (mode === 'fountain') {
          const sp = tg.unit * 13 * lk.partSpeed * (0.85 + 0.3 * vv);
          const G = (sp * sp) / (2 * tg.unit * 7 * Math.max(0.2, lk.partRise));
          const life = Math.min(Math.max(held, 0.35), 2.5);
          const rate = Math.min(1000 / life, 420 * (0.6 + 0.8 * vv) * lk.partAmount);
          if (rate > 0) rows.push({ start: n.s, end: n.s + life + 2.5 * lk.partLife, data: [n.s, life, rate, 0, tg.x, tg.y, 0, -sp, ...n.col, vv, n.idx * 16, 2, slope, G] });
        } else if (mode === 'spray') {
          const sp = tg.unit * 12 * lk.partSpeed * (0.85 + 0.3 * vv);
          const burst = Math.floor(110 * (0.6 + 0.8 * vv) * lk.partAmount);
          const rate = Math.min((1000 - burst) / held, 620 * (0.6 + 0.8 * vv) * lk.partAmount);
          if (rate > 0) rows.push({ start: n.s, end: n.s + held + 1.5 * lk.partLife, data: [n.s, held, rate, burst, tg.x, tg.y, 0, -sp, ...n.col, vv, n.idx * 16, 3, 0, 0] });
        } else if (mode === 'shape') {
          const mid = this.whiteKeys / 2;
          const c0 = kb.P(mid, kb.edgeY(mid));
          const ends = [kb.P(0, kb.edgeY(0)), kb.P(this.whiteKeys, kb.edgeY(this.whiteKeys))];
          const size = Math.min(this.srcW * 0.8, Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]) * 0.75) * lk.partShapeSize;
          const cy = Math.max(size * 0.55, Math.min(...ends.map((e) => e[1]), c0[1]) - tg.unit * 2.5 - size * 0.5);
          const cx = Math.min(this.srcW - size * 0.55, Math.max(size * 0.55, c0[0]));
          const rate = 450 * (0.6 + 0.8 * vv) * lk.partAmount;
          if (rate > 0) rows.push({ start: n.s, end: n.s + 0.15 + (1.6 + 7.5 * lk.partShapeHold) / Math.max(0.1, lk.partSpeed) + 2.1 * lk.partLife, data: [n.s, 0.15, rate, lk.partShapeDir === 'ccw' ? -1 : 1, tg.x, tg.y, cx, cy, ...n.col, vv, n.idx * 16, 5, size, lk.partShapeHold] });
        } else {
          const mid = this.whiteKeys / 2;
          const c0 = kb.P(mid, kb.edgeY(mid));
          const up = this.up, u = kb.unit(mid, kb.edgeY(mid));
          const C: [number, number] = [c0[0] + up[0] * u * 4, c0[1] + up[1] * u * 4];
          const ang = Math.atan2(tg.along[1], tg.along[0]);
          const ends = [kb.P(0, kb.edgeY(0)), kb.P(this.whiteKeys, kb.edgeY(this.whiteKeys))];
          const half = Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]) / 2;
          const rate = 320 * (0.6 + 0.8 * vv) * lk.partAmount;
          if (rate > 0) rows.push({ start: n.s, end: n.s + 0.6 + 4.9 * lk.partLife, data: [n.s, 0.6, rate, 0, tg.x, tg.y, C[0], C[1], ...n.col, vv, n.idx * 16, 4, ang, half * (1 + lk.partSpread)] });
        }
        continue;
      }
      const streams = 1 + (rnd() < 0.35 + 0.4 * vv ? 1 : 0);
      for (let j = 0; j < streams; j++) {
        const a = gauss(rnd, -Math.PI / 2, 0.32);
        const sp = (170 + 100 * rnd()) * (0.8 + 0.5 * vv) * lk.partRise * lk.partSpeed;
        const life = (0.9 + 0.7 * rnd()) * (0.8 + 0.5 * vv) * lk.partLife;
        const rate = (330 + 190 * rnd()) * (0.6 + 0.8 * vv) * lk.partAmount;
        if (rate <= 0) continue;
        let ex = tg.x, ey = tg.y;
        if (lk.partSpread > 0) { ex += gauss(rnd, 0, tg.unit * 0.8 * lk.partSpread); ey += gauss(rnd, 0, tg.unit * 0.3 * lk.partSpread); }
        rows.push({ start: n.s, end: n.s + life + 2.6 * lk.partLife, data: [n.s, life, rate, 0, ex, ey, Math.cos(a) * sp, Math.sin(a) * sp, ...n.col, vv, n.idx * 16 + j, 0, 0, 0] });
      }
      const burst = Math.floor((24 + 30 * vv) * lk.partAmount);
      if (burst > 0) rows.push({ start: n.s, end: n.s + 1.4 * lk.partLife, data: [n.s, 0, 0, burst, tg.x, tg.y, 0, 0, ...n.col, vv, n.idx * 16 + 8, 1, 0, 0] });
    }
    rows.sort((a, b) => a.start - b.start);
    this.emit = new Float32Array(rows.length * 16);
    rows.forEach((r, i) => this.emit.set(r.data, i * 16));
    this.emitStart = rows.map((r) => r.start);
    this.emitEnd = rows.map((r) => r.end);
    // how far back an emitter can still be alive (long-lived modes like Shape need more than plumes)
    this.emitSpan = Math.max(5, ...rows.map((r) => r.end - r.start));
  }

  // ---------- per frame ----------

  render(source: FrameSource | null, t: number, offscreen = false) {
    if (!this.proj) return;
    const cpu0 = performance.now();
    const d = this.device;
    const q = d.queue;
    const fps = this.proj.video.fps;
    this.kb.H = trackingMatrix(this.proj, Math.round(t * fps));
    this.uploadSource(source);

    const glass: number[] = [];
    const labels: number[] = [];
    const keys: number[] = [];
    const sprites: number[] = [];
    const lights: number[] = [];
    const heat = new Float32Array(40 * 4);
    let bass = 0;
    const L = this.layers;
    const kb = this.kb;
    const U = this.up;
    const lk = this.look;
    const FALL = lk.noteSpeed;

    const keyQuad = (p: number, c: RGB) => {
      if (keys.length / 42 >= MAX_KEYS) return;
      const qd = kb.footprint(p).quad.map(([x, y]) => kb.P(x, y));
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const i of [0, 1, 2, 0, 2, 3]) keys.push(qd[i][0], qd[i][1], uv[i][0], uv[i][1], c[0], c[1], c[2]);
    };
    const dot = (x: number, y: number, r: number, c: RGB) => {
      if (sprites.length / 12 < MAX_SPRITES) sprites.push(x, y, r, 0, 0, 0, 0, 0, c[0], c[1], c[2], 0);
    };
    const streak = (x: number, y: number, dir: [number, number], len: number, thick: number, c: RGB) => {
      if (sprites.length / 12 < MAX_SPRITES) sprites.push(x, y, 0, 1, dir[0], dir[1], len, thick, c[0], c[1], c[2], 0);
    };
    const light = (x: number, y: number, R: number, c: RGB, k: number) => {
      if (lights.length / 8 < MAX_LIGHTS && k > 0.005) lights.push(x, y, R, k, c[0], c[1], c[2], 0);
    };
    const scaleC = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

    const flatNames = lk.labelAccidental === 'flat' || (lk.labelAccidental === 'auto' && FLAT_KEYS[lk.labelQuality].includes(lk.labelKey));
    const midX = this.whiteKeys / 2;
    const distC = kb.P(midX, kb.edgeY(midX));
    // notes in a window around t (sorted by start)
    const lo = this.lowerBound(this.notes, t - 12);
    let visible = 0;
    for (let i = lo; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.s > t + 4) break;
      const tg = kb.target(n.p);
      const col = n.col;
      const vn = n.vn;
      const dd = n.s - t;
      let w = Math.max(24, tg.unit * 1.05) * (lk.noteVelocity === 1 ? 0.9 + 0.2 * vn : 1 + (0.2 * vn - 0.1) * lk.noteVelocity) * lk.noteWidth;
      if (lk.noteBWRatio !== 1 && kb.footprint(n.p).black) w /= lk.noteBWRatio;
      const end = lk.noteSustain ? n.h : n.e;
      const len0 = Math.min(300 * (FALL / 680) * (lk.noteSustain ? 4 : 1), Math.max(w * lk.noteMinLen, (end - n.s) * FALL * 0.8 - 8));
      const len = lk.noteLength === 1 ? len0 : Math.max(w * 0.6, len0 * lk.noteLength);
      // distances measured from the landing point back along the fall direction
      const sB = dd * FALL;
      const sT = sB + len;
      const sMax = exitDist(tg.x, tg.y, U, this.srcW, this.srcH);
      const at = (d: number): [number, number] => [tg.x + U[0] * d, tg.y + U[1] * d];
      if (L.notes && sT > 0 && sB < sMax + 40 && glass.length / 16 < MAX_GLASS) {
        const fade = lk.noteFade > 0 ? Math.min(1, Math.max(0, (sMax - sB + 60) / (220 * lk.noteFade))) : 1;
        const c2 = n.col2;
        glass.push(tg.x, tg.y, sB, sT, w, fade * (0.85 + 0.3 * vn * lk.noteVelocity), fade, U[0], col[0], col[1], col[2], U[1],
          c2 ? c2[0] : 0, c2 ? c2[1] : 0, c2 ? c2[2] : 0, c2 ? 1 : 0);
        if (lk.labels && sT - Math.max(sB, 0) > w * 0.75 && labels.length / 12 < MAX_GLASS) {
          const sl = Math.max(sB, 0) + w * 0.7;
          let lx = tg.x + U[0] * sl, ly = tg.y + U[1] * sl, half = w * 0.48 * lk.labelSize;
          if (lk.noteDistort !== 0) {
            const k = Math.min(4, Math.max(0.05, 1 + (lk.noteDistort * sl) / this.srcH));
            const Nx = -U[1], Ny = U[0];
            const lat = (tg.x - distC[0]) * Nx + (tg.y - distC[1]) * Ny;
            lx += Nx * lat * (k - 1); ly += Ny * lat * (k - 1); half *= k;
          }
          const pc = ((n.p % 12) + 12) % 12;
          const lc = lighten(col, 0.85);
          labels.push(lx, ly, half, pc + (flatNames ? 12 : 0), U[0], U[1], 0, 0, lc[0], lc[1], lc[2], lk.labelOpacity * fade);
        }
        visible++;
        if (sB <= 0 && L.impact) dot(tg.x, tg.y, tg.unit * 0.3 * lk.flashSize, scaleC(lighten(col, 0.6), 0.5 * lk.flashBright));
      }
      if (dd > 0) {
        const near = lk.keyAnticipate > 0 ? 1 - Math.min(1, dd / lk.keyAnticipate) : 0;
        if (near > 0) {
          if (L.keys) keyQuad(n.p, scaleC(col, 0.45 * near * near * lk.keyBright));
          const [lx, ly] = at(sB);
          if (L.impact) light(lx, ly, tg.unit * 3 * lk.relightRadius, col, 0.35 * near);
        }
      } else if (t <= n.e || dd >= -lk.impactTime) {
        const tt = -dd;
        const held = t <= n.e;
        const glow = Math.max(Math.exp(-tt * 6), held ? (0.3 + 0.05 * Math.sin(t * 7 + n.p)) * lk.keyHeld : 0);
        if (L.keys) keyQuad(n.p, scaleC(lighten(col, 0.45), glow * lk.keyBright));
        if (L.impact) {
          const [lx, ly] = at(tg.unit * 0.6);
          light(lx, ly, tg.unit * (4 + 2 * vn) * lk.relightRadius, col, (0.55 + 0.5 * vn) * Math.exp(-tt * 3.5) + (held ? 0.12 : 0));
          if (tt < 0.35 * (lk.impactTime / 1.3)) {
            const e = Math.exp(-tt * 11 * (1.3 / lk.impactTime)) * (0.75 + 0.45 * vn);
            dot(tg.x, tg.y, tg.unit * 0.45 * lk.flashSize, scaleC(lighten(col, 0.5), 0.8 * e * lk.flashBright));
            if (lk.streakLen > 0) streak(tg.x, tg.y, tg.along, tg.unit * 1.8 * lk.streakLen, 1.2, scaleC(lighten(col, 0.4), 0.4 * e * lk.streakBright));
          }
        }
      }
      const since = t - n.s;
      if (since >= 0 && since < 0.9) {
        const c = kb.keyCenterX(n.p);
        for (let k = 0; k < 40; k++) {
          const wgt = Math.exp(-since * 3.5) * Math.exp(-(((k + 0.5 - c) / 2.2) ** 2));
          heat[k * 4] += wgt * col[0];
          heat[k * 4 + 1] += wgt * col[1];
          heat[k * 4 + 2] += wgt * col[2];
          heat[k * 4 + 3] += wgt;
        }
        if (n.p < 50) bass += Math.exp(-since * 4) * (0.6 + 0.6 * vn);
      }
    }
    bass = Math.min(1, bass);

    // bar lines: one across the keyboard at the start of every bar
    if (lk.barLines && L.notes && this.bars.length) {
      const nK = this.whiteKeys;
      const A = kb.P(-0.2, kb.edgeY(-0.2)), B = kb.P(nK + 0.2, kb.edgeY(nK + 0.2));
      const th = 3, c = 1.1 * lk.barOpacity;
      const sMaxBar = Math.hypot(this.srcW, this.srcH);
      for (const b of this.bars) {
        const s0 = (b - t) * FALL;
        if (s0 < 0 || s0 > sMaxBar) continue;
        if (keys.length / 42 >= MAX_KEYS) break;
        const q = [[A[0] + U[0] * s0, A[1] + U[1] * s0], [B[0] + U[0] * s0, B[1] + U[1] * s0], [B[0] + U[0] * (s0 + th), B[1] + U[1] * (s0 + th)], [A[0] + U[0] * (s0 + th), A[1] + U[1] * (s0 + th)]];
        const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
        for (const i of [0, 1, 2, 0, 2, 3]) keys.push(q[i][0], q[i][1], uv[i][0] * 0.4 + 0.3, uv[i][1], c, c, c);
      }
    }

    // frame uniforms
    const sb = saberBase(lk);
    q.writeBuffer(this.frameBuf, 0, new Float32Array([
      this.srcW, this.srcH, this.rtW, this.rtH, this.scale, t, bass, Math.floor(t * 24),
      lk.noteBright, lk.noteGlow, lk.noteFill, lk.noteRim, lk.noteRound,
      originalNotes(lk) ? 0 : 1, 0, lk.noteDepth,
      lk.saberBright, lk.saberThick, lk.saberFlicker, lk.saberReact, lk.saberTint, lk.noteOpacity, 0, 0,
      sb[0], sb[1], sb[2], 0,
      lk.partSize, lk.partHaze, 0, 0,
      lk.bloom, lk.fringe, lk.grain, lk.bgDarken, lk.bgContrast, lk.bgSaturation, lk.bgVignette, lk.relight,
      lk.bassPulse, 0, 0, 0,
    ]));
    if (glass.length) q.writeBuffer(this.glassBuf, 0, new Float32Array(glass));
    if (labels.length) q.writeBuffer(this.labelBuf, 0, new Float32Array(labels));
    if (lk.texOn) {
      this.wantTexture(lk.noteTexture);
      if (this.tex.video) {
        if (!offscreen && this.tex.video.paused) this.tex.video.play().catch(() => {});
        refreshVideo(this.device, this.tex);
      }
    }
    q.writeBuffer(this.noteUni, 0, this.noteParams(lk));
    q.writeBuffer(this.bgUni, 0, this.bgParams(lk));
    if (lk.bgImageOn && lk.bgImage) { this.wantBackground(lk.bgImage); if (this.bgVideo) { if (!offscreen && this.bgVideo.paused) this.bgVideo.play().catch(() => {}); this.refreshBgVideo(); } }
    q.writeBuffer(this.texUni, 0, new Float32Array([['tint', 'natural', 'glow'].indexOf(lk.texMode), lk.texScale, lk.texRelief, lk.texShine, lk.texSolid, this.tex.size, this.tex.lo, this.tex.hi, this.tex.metal, this.tex.tile, lk.texReflect ? 1 : 0, lk.texLive]));
    if (keys.length) q.writeBuffer(this.keysBuf, 0, new Float32Array(keys));
    if (sprites.length) q.writeBuffer(this.spriteBuf, 0, new Float32Array(sprites));
    if (lights.length) q.writeBuffer(this.lightsBuf, 0, new Float32Array(lights));
    q.writeBuffer(this.postUni[6], 0, new Float32Array([0, 0, 0, 0, 0, 0, 0, lights.length / 8]));
    const saberBox = this.writeSaber(t, bass, heat);

    // particles active now
    let nEmit = 0;
    if (L.particles && this.emitStart.length) {
      const hi = this.upperBound(this.emitStart, t);
      const act: number[] = [];
      for (let i = hi - 1; i >= 0 && this.emitStart[i] >= t - this.emitSpan && act.length < MAX_EMIT; i--) {
        if (this.emitEnd[i] >= t) act.push(i);
      }
      if (act.length) {
        const arr = new Float32Array(act.length * 16);
        act.forEach((ei, j) => arr.set(this.emit.subarray(ei * 16, ei * 16 + 16), j * 16));
        q.writeBuffer(this.emitBuf, 0, arr);
        nEmit = act.length;
      }
    }
    if (lk.partMode === 'shape') this.wantShape(lk.partShape);
    q.writeBuffer(this.simUni, 0, new Uint32Array([0, nEmit, PER_EMIT, lk.partMode === 'shape' ? this.nShape : 0]));
    q.writeBuffer(this.simUni, 0, new Float32Array([t]));
    q.writeBuffer(this.simUni, 16, new Float32Array([
      0, -1, 0, 0, // glitter rises straight up the screen
      lk.partSwirl, lk.partWind, lk.partGravity, lk.partLife, lk.partRise, lk.partTwinkle, lk.partStars, lk.partColor,
      lk.partSpeed, lk.partTurbX, lk.partTurbY, lk.partTurbZ,
      lk.partTurbFreq, lk.partTurbEvo, Math.round(lk.partOctaves), lk.partOctScale,
      lk.partOctMul, lk.partSpread, lk.partRays ? 1 : 0, lk.partRayLen,
    ]));
    q.writeBuffer(this.partDrawUni, 0, new Float32Array([lk.partRays ? 1 : 0, lk.partRayLen, lk.partOpacity, lk.partAlphaF, lk.partAdditive, lk.partBright, lk.partTurbZ, 0]));

    const enc = d.createCommandEncoder();
    if (nEmit) {
      const cp = enc.beginComputePass();
      cp.setPipeline(this.simPipe);
      cp.setBindGroup(0, this.group('sim', () => d.createBindGroup({
        layout: this.simPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.simUni } },
          { binding: 1, resource: { buffer: this.emitBuf } },
          { binding: 2, resource: { buffer: this.flowBuf } },
          { binding: 3, resource: { buffer: this.partBuf } },
          { binding: 4, resource: { buffer: this.shapeBuf } },
        ],
      })));
      cp.dispatchWorkgroups(Math.ceil((nEmit * PER_EMIT) / 64));
      cp.end();
    }

    // light layer
    const lp = enc.beginRenderPass({
      colorAttachments: [{ view: this.lightTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
    });
    const frameGroup = (name: string, pipe: GPURenderPipeline) => this.group('f-' + name, () => d.createBindGroup({
      layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.frameBuf } }],
    }));
    if (keys.length) {
      lp.setPipeline(this.keysPipe);
      lp.setBindGroup(0, frameGroup('keys', this.keysPipe));
      lp.setVertexBuffer(0, this.keysBuf);
      lp.draw(keys.length / 7);
    }
    if (glass.length) {
      lp.setPipeline(this.glassPipe);
      lp.setBindGroup(0, frameGroup('glass', this.glassPipe));
      lp.setBindGroup(1, this.group('tex-' + this.tex.key, () => d.createBindGroup({
        layout: this.glassPipe.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: this.texSampler },
          { binding: 1, resource: this.tex.color.createView() },
          { binding: 2, resource: this.tex.normal.createView() },
          { binding: 3, resource: this.tex.rough.createView() },
          { binding: 4, resource: { buffer: this.texUni } },
          { binding: 5, resource: { buffer: this.noteUni } },
        ],
      })));
      lp.setVertexBuffer(0, this.glassBuf);
      lp.draw(4, glass.length / 16);
    }
    if (labels.length) {
      lp.setPipeline(this.labelPipe);
      lp.setBindGroup(0, frameGroup('labels', this.labelPipe));
      lp.setBindGroup(1, this.group('labels1', () => d.createBindGroup({
        layout: this.labelPipe.getBindGroupLayout(1),
        entries: [{ binding: 0, resource: this.atlas.createView() }, { binding: 1, resource: this.sampler }],
      })));
      lp.setVertexBuffer(0, this.labelBuf);
      lp.draw(4, labels.length / 12);
    }
    if (L.saber && saberBox) {
      lp.setPipeline(this.saberPipe);
      lp.setBindGroup(0, frameGroup('saber', this.saberPipe));
      lp.setBindGroup(1, this.group('saber1', () => d.createBindGroup({
        layout: this.saberPipe.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: this.saberUni } },
          { binding: 1, resource: { buffer: this.saberMap } },
          { binding: 2, resource: { buffer: this.heatBuf } },
        ],
      })));
      lp.draw(4);
    }
    if (sprites.length) {
      lp.setPipeline(this.spritePipe);
      lp.setBindGroup(0, frameGroup('sprites', this.spritePipe));
      lp.setVertexBuffer(0, this.spriteBuf);
      lp.draw(4, sprites.length / 12);
    }
    if (nEmit) {
      lp.setPipeline(this.partPipe);
      lp.setBindGroup(0, frameGroup('parts', this.partPipe));
      lp.setBindGroup(1, this.group('parts1', () => d.createBindGroup({
        layout: this.partPipe.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: this.partBuf } }, { binding: 1, resource: { buffer: this.partDrawUni } }],
      })));
      lp.draw(4, nEmit * PER_EMIT);
    }
    lp.end();

    // bloom
    const pass = (pipe: GPURenderPipeline, uni: number, src: GPUTexture, dst: GPUTexture, key: string) => {
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: dst.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      rp.setPipeline(pipe);
      rp.setBindGroup(0, this.group('empty-' + key, () => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [] })));
      rp.setBindGroup(1, this.group('p-' + key, () => d.createBindGroup({
        layout: pipe.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: this.postUni[uni] } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: src.createView() },
        ],
      })));
      rp.draw(3);
      rp.end();
    };
    if (L.bloom) {
      pass(this.downPipe, 0, this.lightTex, this.b1a, 'd1');
      pass(this.blurPipe, 1, this.b1a, this.b1b, 'b1h');
      pass(this.blurPipe, 2, this.b1b, this.b1a, 'b1v');
      pass(this.downPipe, 3, this.b1a, this.b2a, 'd2');
      pass(this.blurPipe, 4, this.b2a, this.b2b, 'b2h');
      pass(this.blurPipe, 5, this.b2b, this.b2a, 'b2v');
    } else {
      for (const tx of [this.b1a, this.b2a]) {
        enc.beginRenderPass({ colorAttachments: [{ view: tx.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] }).end();
      }
    }

    // composite onto the canvas
    if (this.videoTex) {
      const pipe = offscreen ? this.compPipeOff : this.compPipe;
      let view: GPUTextureView;
      if (offscreen) {
        if (!this.offTex || this.offTex.width !== this.rtW || this.offTex.height !== this.rtH) {
          this.offTex?.destroy();
          this.offTex = d.createTexture({ size: [this.rtW, this.rtH], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
        }
        view = this.offTex.createView();
      } else {
        view = this.context.getCurrentTexture().createView();
      }
      const key = offscreen ? 'off' : 'on';
      const cp = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      cp.setPipeline(pipe);
      cp.setBindGroup(0, frameGroup('comp-' + key, pipe));
      cp.setBindGroup(1, this.group('comp1-' + key, () => d.createBindGroup({
        layout: pipe.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: this.postUni[6] } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: this.videoTex!.createView() },
          { binding: 3, resource: this.lightTex.createView() },
          { binding: 4, resource: this.b1a.createView() },
          { binding: 5, resource: this.b2a.createView() },
          { binding: 6, resource: { buffer: this.lightsBuf } },
          { binding: 7, resource: this.bgTex.createView() },
          { binding: 8, resource: { buffer: this.bgUni } },
        ],
      })));
      cp.draw(3);
      cp.end();
    }
    q.submit([enc.finish()]);
    this.stats = { notes: visible, emitters: nEmit, particles: nEmit * PER_EMIT, cpuMs: performance.now() - cpu0 };
  }

  /** Renders one frame offscreen and returns its RGBA pixels (used by export and tests). */
  async capture(source: FrameSource | null, t: number): Promise<{ width: number; height: number; data: Uint8Array }> {
    // video textures show exactly the frame for this moment (export must be repeatable)
    if (this.look.texOn && this.tex.video) await seekVideo(this.tex, t);
    if (this.bgVideo && this.look.bgImageOn) await seekVideo({ video: this.bgVideo } as TexSet, t);
    this.render(source, t, true);
    const w = this.rtW, h = this.rtH;
    const bpr = Math.ceil((w * 4) / 256) * 256;
    const rb = this.device.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: this.offTex! }, { buffer: rb, bytesPerRow: bpr }, [w, h]);
    this.device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(rb.getMappedRange());
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) data.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4);
    rb.unmap();
    rb.destroy();
    return { width: w, height: h, data };
  }

  /** the note style settings the shader reads (NoteParams in glass.wgsl) */
  private noteParams(lk: Look): Float32Array {
    const th = (lk.lightDir * Math.PI) / 180, el = (lk.lightHeight * Math.PI) / 2;
    // the glass facets' light: exactly the original numbers at the default direction
    const gl: [number, number] = lk.lightDir === DEFAULT_LOOK.lightDir ? [0.55, 0.85] : [-Math.cos(th) * 1.012, Math.sin(th) * 1.012];
    const oc = hexRGB(lk.outlineColor);
    const kb = this.kb;
    const cx = this.whiteKeys / 2;
    const C = kb.P(cx, kb.edgeY(cx));
    const shape = lk.noteDim === '3d' ? NOTE_3D.findIndex((o) => o.id === lk.note3d) : NOTE_2D.findIndex((o) => o.id === lk.note2d);
    return new Float32Array([
      lk.noteDim === '3d' ? 1 : 0, Math.max(0, shape), lk.noteEdge, lk.noteDepth,
      lk.noteOpacity, Math.cos(th) * Math.cos(el), -Math.sin(th) * Math.cos(el), Math.sin(el),
      lk.lightPower, lk.lightShine, lk.outlineOn ? 1 : 0, lk.outlineWidth,
      lk.outlineDepth, oc[0], oc[1], oc[2],
      lk.texOn ? 1 : 0, lk.texReflectivity, gl[0], gl[1],
      lk.texBright, lk.texContrast, (lk.texHue * Math.PI) / 180, lk.texSat,
      lk.texMirror ? 1 : 0, lk.texOpacity, lk.texBlend, lk.texEmboss ? 1 : 0,
      lk.texEmbossDepth, lk.texRgbOpacity, lk.texCutOn ? 1 : 0, lk.texCutThresh,
      lk.texCutOpacity, lk.noteDistort, C[0], C[1],
    ]);
  }

  /** background and video placement settings the composite reads (BG in post.wgsl) */
  private bgParams(lk: Look): Float32Array {
    const xform = lk.footScale !== 1 || lk.footX !== 0 || lk.footY !== 0 || lk.footRot !== 0 || lk.footCropT > 0 || lk.footCropB > 0 || lk.footCropL > 0 || lk.footCropR > 0;
    const img = lk.bgImageOn && !!lk.bgImage && this.bgKey === lk.bgImage;
    const active = xform || lk.footOpacity < 1 || lk.footBright !== 0 || lk.footHue !== 0 || lk.bgColorOn || img;
    const c = hexRGB(lk.bgColor);
    const rad = Math.PI / 180;
    return new Float32Array([
      lk.footScale, lk.footX, lk.footY, lk.footRot * rad,
      lk.footOpacity, lk.footCropT, lk.footCropB, lk.footCropL,
      lk.footCropR, lk.footBright, lk.footHue * rad, lk.bgColorOn ? 1 : 0,
      c[0], c[1], c[2], img ? 1 : 0,
      lk.bgImgOpacity, lk.bgImgScale, lk.bgImgX, lk.bgImgY,
      lk.bgImgRot * rad, lk.bgImgBright, lk.bgImgContrast, lk.bgImgHue * rad,
      lk.bgImgSat, this.bgAspect, xform ? 1 : 0, active ? 1 : 0,
    ]);
  }

  /** load a background image or video from the texture library */
  private wantBackground(key: string) {
    if (key === this.bgKey || key === this.bgWant) return;
    this.bgWant = key;
    this.bgLoad = (async () => {
      const files = key.startsWith('user:') && this.userFiles ? await this.userFiles(key.slice(5)) : null;
      if (this.bgWant !== key || !files) return;
      const MAX = 1920;
      let w = 1, h = 1;
      let source: ImageBitmap | null = null;
      let video: HTMLVideoElement | null = null;
      if (files.video) {
        video = document.createElement('video');
        video.muted = true; video.loop = true; video.playsInline = true; video.src = URL.createObjectURL(files.video);
        await new Promise<void>((res) => { video!.onloadeddata = () => res(); video!.onerror = () => res(); setTimeout(res, 15000); });
        if (!video.videoWidth) return;
        w = video.videoWidth; h = video.videoHeight;
        video.play().catch(() => {});
      } else if (files.color) {
        source = await createImageBitmap(files.color);
        w = source.width; h = source.height;
      } else return;
      if (this.bgWant !== key) return;
      const k = Math.min(1, MAX / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
      const tex = this.device.createTexture({ size: [tw, th], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
      const cv = new OffscreenCanvas(tw, th);
      if (source) { cv.getContext('2d')!.drawImage(source, 0, 0, tw, th); this.device.queue.copyExternalImageToTexture({ source: cv }, { texture: tex }, [tw, th]); }
      this.bgVideo?.pause();
      this.bgTex.destroy();
      this.bgTex = tex; this.bgCanvas = cv; this.bgVideo = video; this.bgAspect = w / h; this.bgKey = key;
      delete this.groups['comp1-on']; delete this.groups['comp1-off'];
      if (video) this.refreshBgVideo();
      this.onTexture?.();
    })().catch((e) => console.warn('[background]', e));
  }
  private bgWant = '';
  private bgLoad: Promise<void> = Promise.resolve();

  private refreshBgVideo() {
    const v = this.bgVideo, cv = this.bgCanvas;
    if (!v || !cv || v.readyState < 2) return;
    cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height);
    this.device.queue.copyExternalImageToTexture({ source: cv }, { texture: this.bgTex }, [cv.width, cv.height]);
  }

  /** load the outline points of a particle shape (built-in name or 'user:<id>' SVG) */
  private wantShape(key: string) {
    if (!key || key === this.shapeKey || key === this.shapeWant) return;
    this.shapeWant = key;
    this.shapeLoad = (async () => {
      let text: string | null = null;
      if (key.startsWith('user:')) {
        const f = this.userFiles ? await this.userFiles(key.slice(5)) : null;
        if (f?.color) text = await f.color.text();
      } else {
        const r = await fetch(`${import.meta.env?.BASE_URL ?? '/'}shapes/${key}.svg`);
        if (r.ok) text = await r.text();
      }
      if (!text || this.shapeWant !== key) return;
      const pts = svgToPoints(text);
      if (!pts) { console.warn('[shape] no outline found in', key); return; }
      this.device.queue.writeBuffer(this.shapeBuf, 0, pts);
      this.nShape = pts.length / 4;
      this.shapeKey = key;
      this.onTexture?.();
    })().catch((e) => console.warn('[shape]', e));
  }

  /** start loading a note texture if it isn't the one in use */
  private wantTexture(key: string) {
    if (!key || key === this.texWant) return;
    this.texWant = key;
    this.texLoad = loadTexSet(this.device, key, this.userFiles).then((set) => {
      if (this.texWant !== key) { set?.video?.pause(); set?.color.destroy(); set?.normal.destroy(); set?.rough.destroy(); return; }
      if (!set) { console.warn('[texture] could not load', key); return; }
      const old = this.tex;
      this.tex = set;
      for (const k of Object.keys(this.groups)) if (k.startsWith('tex-')) delete this.groups[k];
      if (old.key) { old.video?.pause(); old.color.destroy(); old.normal.destroy(); old.rough.destroy(); }
      this.onTexture?.();
    });
  }

  /** called when a texture finishes loading, so a paused preview can redraw */
  onTexture: (() => void) | null = null;

  /** resolves once the current look's texture has loaded (for tests and export) */
  async texturesReady(): Promise<void> {
    if (this.look.texOn) this.wantTexture(this.look.noteTexture);
    if (this.look.bgImageOn && this.look.bgImage) this.wantBackground(this.look.bgImage);
    if (this.look.partMode === 'shape') this.wantShape(this.look.partShape);
    await this.texLoad;
    await this.bgLoad;
    await this.shapeLoad;
  }

  /** resolves once the GPU has finished all submitted work (for tests and export) */
  done(): Promise<void> {
    return this.device.queue.onSubmittedWorkDone();
  }

  private uploadSource(source: FrameSource | null) {
    if (!source) return;
    const w = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const h = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!w || !h) return;
    if (!this.videoTex || this.videoTex.width !== w || this.videoTex.height !== h) {
      this.videoTex?.destroy();
      this.videoTex = this.device.createTexture({
        size: [w, h], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      delete this.groups['comp1-on'];
      delete this.groups['comp1-off'];
    }
    this.device.queue.copyExternalImageToTexture({ source }, { texture: this.videoTex }, [w, h]);
  }

  private writeSaber(t: number, bass: number, heat: Float32Array): boolean {
    const kb = this.kb;
    const nK = this.whiteKeys;
    const x0p = -0.2, x1p = nK + 0.2;
    // the saber can sit above or below the back edge of the keys
    const Uv = this.up;
    const off = this.look.saberOffset * kb.unit(nK / 2, kb.edgeY(nK / 2));
    const P0 = (px: number): [number, number] => { const q = kb.P(px, kb.edgeY(px)); return [q[0] + Uv[0] * off, q[1] + Uv[1] * off]; };
    const A = P0(x0p);
    const B = P0(x1p);
    if (Math.abs(B[0] - A[0]) < 4) return false;
    // dense plane-x samples -> screen x, then resample evenly along the screen line
    const N = 400;
    const us: number[] = [], ps: number[] = [], units: number[] = [];
    for (let i = 0; i <= N; i++) {
      const px = x0p + (x1p - x0p) * (i / N);
      us.push(P0(px)[0]);
      ps.push(px);
      units.push(kb.unit(px, kb.edgeY(px)));
    }
    const map = new Float32Array(64 * 2);
    let uMax = 0;
    for (let i = 0; i < 64; i++) {
      const sx = A[0] + (B[0] - A[0]) * (i / 63);
      let j = 0;
      while (j < N - 1 && (us[j + 1] - sx) * Math.sign(B[0] - A[0]) < 0) j++;
      const f = Math.min(1, Math.max(0, (sx - us[j]) / (us[j + 1] - us[j] || 1)));
      map[i * 2] = ps[j] + (ps[j + 1] - ps[j]) * f;
      map[i * 2 + 1] = units[j] + (units[j + 1] - units[j]) * f;
      uMax = Math.max(uMax, map[i * 2 + 1]);
    }
    const scMax = uMax / 30;
    const sty = this.look.saberStyle;
    const tall = Math.max(1, this.look.saberFlicker) * Math.max(1, this.look.saberThick) * (sty === 'flame' ? 2.8 : sty === 'soft' ? 2.5 : sty === 'electric' ? 2.4 : 1);
    const box = [Math.min(A[0], B[0]) - 4, Math.min(A[1], B[1]) - 140 * scMax * tall - 10, Math.max(A[0], B[0]) + 4, Math.max(A[1], B[1]) + 30 * Math.max(1, this.look.saberThick) * (sty === 'soft' ? 3 : 1)];
    const q = this.device.queue;
    const st = ['plasma', 'straight', 'electric', 'soft', 'flame'].indexOf(this.look.saberStyle);
    q.writeBuffer(this.saberUni, 0, new Float32Array([A[0], A[1], B[0], B[1], ...box, bass, t, nK, Math.max(0, st), this.look.saberOpacity, 0, 0, 0]));
    q.writeBuffer(this.saberMap, 0, map);
    q.writeBuffer(this.heatBuf, 0, heat);
    return true;
  }

  private group(key: string, make: () => GPUBindGroup): GPUBindGroup {
    let g = this.groups[key];
    if (!g) { g = make(); this.groups[key] = g; }
    return g;
  }

  private lowerBound(arr: Note[], s: number) {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].s < s) lo = m + 1; else hi = m; }
    return lo;
  }

  private upperBound(arr: number[], v: number) {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m + 1; else hi = m; }
    return lo;
  }
}

/** Distance from (x, y) along direction u to the edge of the frame. */
function exitDist(x: number, y: number, u: [number, number], w: number, h: number): number {
  let d = Infinity;
  if (u[0] > 1e-6) d = Math.min(d, (w - x) / u[0]);
  if (u[0] < -1e-6) d = Math.min(d, -x / u[0]);
  if (u[1] > 1e-6) d = Math.min(d, (h - y) / u[1]);
  if (u[1] < -1e-6) d = Math.min(d, -y / u[1]);
  return Math.max(0, isFinite(d) ? d : 0);
}
