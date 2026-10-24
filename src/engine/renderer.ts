// WebGPU renderer: video frame + glass notes + saber + key glow + impact sprites + particle plumes + bloom.
import commonSrc from './shaders/common.wgsl?raw';
import { fallUp } from './direction';
import { DEFAULT_LOOK, Look, NOTE_SHAPES, NOTE_STYLES, resolveLook, saberBase } from './look';
import glassSrc from './shaders/glass.wgsl?raw';
import { loadTexSet, placeholder, TexSet, UserFiles } from './noteTextures';
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

  private sampler: GPUSampler;
  private frameBuf: GPUBuffer;
  private glassBuf: GPUBuffer;
  private keysBuf: GPUBuffer;
  private spriteBuf: GPUBuffer;
  private saberUni: GPUBuffer;
  private saberMap: GPUBuffer;
  private heatBuf: GPUBuffer;
  private simUni: GPUBuffer;
  private emitBuf: GPUBuffer;
  private flowBuf: GPUBuffer;
  private partBuf: GPUBuffer;
  private lightsBuf: GPUBuffer;
  private postUni: GPUBuffer[] = [];

  private glassPipe: GPURenderPipeline;
  private keysPipe: GPURenderPipeline;
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
    this.tex = placeholder(d);
    this.glassBuf = buf(MAX_GLASS * 48, U.VERTEX | U.COPY_DST);
    this.keysBuf = buf(MAX_KEYS * 6 * 28, U.VERTEX | U.COPY_DST);
    this.spriteBuf = buf(MAX_SPRITES * 48, U.VERTEX | U.COPY_DST);
    this.saberUni = buf(48, U.UNIFORM | U.COPY_DST);
    this.saberMap = buf(64 * 8, U.STORAGE | U.COPY_DST);
    this.heatBuf = buf(40 * 16, U.STORAGE | U.COPY_DST);
    this.simUni = buf(64, U.UNIFORM | U.COPY_DST);
    this.emitBuf = buf(MAX_EMIT * 64, U.STORAGE | U.COPY_DST);
    this.flowBuf = buf(20 * 16, U.STORAGE | U.COPY_DST);
    this.partBuf = buf(MAX_EMIT * PER_EMIT * 32, U.STORAGE);
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

    const glassM = mod(glassSrc);
    this.glassPipe = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: glassM, entryPoint: 'vs', buffers: [inst3] },
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
    for (const n of this.notes) {
      kb.H = trackingMatrix(this.proj, Math.round(n.s * this.proj.video.fps));
      const tg = kb.target(n.p);
      const rnd = mulberry32(n.idx * 7919 + 101);
      const vv = lk.partVelocity ? n.vn : 0.5; // "louder notes, bigger plumes" off: every note average
      const streams = 1 + (rnd() < 0.35 + 0.4 * vv ? 1 : 0);
      for (let j = 0; j < streams; j++) {
        const a = gauss(rnd, -Math.PI / 2, 0.32);
        const sp = (170 + 100 * rnd()) * (0.8 + 0.5 * vv) * lk.partRise;
        const life = (0.9 + 0.7 * rnd()) * (0.8 + 0.5 * vv) * lk.partLife;
        const rate = (330 + 190 * rnd()) * (0.6 + 0.8 * vv) * lk.partAmount;
        if (rate <= 0) continue;
        rows.push({ start: n.s, end: n.s + life + 2.6 * lk.partLife, data: [n.s, life, rate, 0, tg.x, tg.y, Math.cos(a) * sp, Math.sin(a) * sp, ...n.col, vv, n.idx * 16 + j, 0, 0, 0] });
      }
      const burst = Math.floor((24 + 30 * vv) * lk.partAmount);
      if (burst > 0) rows.push({ start: n.s, end: n.s + 1.4 * lk.partLife, data: [n.s, 0, 0, burst, tg.x, tg.y, 0, 0, ...n.col, vv, n.idx * 16 + 8, 1, 0, 0] });
    }
    rows.sort((a, b) => a.start - b.start);
    this.emit = new Float32Array(rows.length * 16);
    rows.forEach((r, i) => this.emit.set(r.data, i * 16));
    this.emitStart = rows.map((r) => r.start);
    this.emitEnd = rows.map((r) => r.end);
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
      const w = Math.max(24, tg.unit * 1.05) * (lk.noteVelocity === 1 ? 0.9 + 0.2 * vn : 1 + (0.2 * vn - 0.1) * lk.noteVelocity) * lk.noteWidth;
      const len = Math.min(300 * (FALL / 680), Math.max(w * 1.4, (n.e - n.s) * FALL * 0.8 - 8));
      // distances measured from the landing point back along the fall direction
      const sB = dd * FALL;
      const sT = sB + len;
      const sMax = exitDist(tg.x, tg.y, U, this.srcW, this.srcH);
      const at = (d: number): [number, number] => [tg.x + U[0] * d, tg.y + U[1] * d];
      if (L.notes && sT > 0 && sB < sMax + 40 && glass.length / 12 < MAX_GLASS) {
        const fade = lk.noteFade > 0 ? Math.min(1, Math.max(0, (sMax - sB + 60) / (220 * lk.noteFade))) : 1;
        glass.push(tg.x, tg.y, sB, sT, w, fade * (0.85 + 0.3 * vn * lk.noteVelocity), fade, U[0], col[0], col[1], col[2], U[1]);
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

    // frame uniforms
    const sb = saberBase(lk);
    q.writeBuffer(this.frameBuf, 0, new Float32Array([
      this.srcW, this.srcH, this.rtW, this.rtH, this.scale, t, bass, Math.floor(t * 24),
      lk.noteBright, lk.noteGlow, lk.noteFill, lk.noteRim, lk.noteRound,
      Math.max(0, NOTE_STYLES.findIndex((x) => x.id === lk.noteStyle)), Math.max(0, NOTE_SHAPES.findIndex((x) => x.id === lk.noteShape)), lk.noteDepth,
      lk.saberBright, lk.saberThick, lk.saberFlicker, lk.saberReact, lk.saberTint, 0, 0, 0,
      sb[0], sb[1], sb[2], 0,
      lk.partSize, lk.partHaze, 0, 0,
      lk.bloom, lk.fringe, lk.grain, lk.bgDarken, lk.bgContrast, lk.bgSaturation, lk.bgVignette, lk.relight,
      lk.bassPulse, 0, 0, 0,
    ]));
    if (glass.length) q.writeBuffer(this.glassBuf, 0, new Float32Array(glass));
    if (lk.noteStyle === 'texture') this.wantTexture(lk.noteTexture);
    q.writeBuffer(this.texUni, 0, new Float32Array([['tint', 'natural', 'glow'].indexOf(lk.texMode), lk.texScale, lk.texRelief, lk.texShine, lk.texSolid, this.tex.size, this.tex.lo, this.tex.hi, this.tex.metal, this.tex.tile, 0, 0]));
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
      for (let i = hi - 1; i >= 0 && this.emitStart[i] >= t - 5 && act.length < MAX_EMIT; i--) {
        if (this.emitEnd[i] >= t) act.push(i);
      }
      if (act.length) {
        const arr = new Float32Array(act.length * 16);
        act.forEach((ei, j) => arr.set(this.emit.subarray(ei * 16, ei * 16 + 16), j * 16));
        q.writeBuffer(this.emitBuf, 0, arr);
        nEmit = act.length;
      }
    }
    q.writeBuffer(this.simUni, 0, new Uint32Array([0, nEmit, PER_EMIT, 0]));
    q.writeBuffer(this.simUni, 0, new Float32Array([t]));
    q.writeBuffer(this.simUni, 16, new Float32Array([
      0, -1, 0, 0, // glitter rises straight up the screen
      lk.partSwirl, lk.partWind, lk.partGravity, lk.partLife, lk.partRise, lk.partTwinkle, lk.partStars, lk.partColor,
    ]));

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
        ],
      })));
      lp.setVertexBuffer(0, this.glassBuf);
      lp.draw(4, glass.length / 12);
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
        layout: this.partPipe.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: this.partBuf } }],
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

  /** start loading a note texture if it isn't the one in use */
  private wantTexture(key: string) {
    if (!key || key === this.texWant) return;
    this.texWant = key;
    this.texLoad = loadTexSet(this.device, key, this.userFiles).then((set) => {
      if (this.texWant !== key) { set?.color.destroy(); set?.normal.destroy(); set?.rough.destroy(); return; }
      if (!set) { console.warn('[texture] could not load', key); return; }
      const old = this.tex;
      this.tex = set;
      for (const k of Object.keys(this.groups)) if (k.startsWith('tex-')) delete this.groups[k];
      if (old.key) { old.color.destroy(); old.normal.destroy(); old.rough.destroy(); }
      this.onTexture?.();
    });
  }

  /** called when a texture finishes loading, so a paused preview can redraw */
  onTexture: (() => void) | null = null;

  /** resolves once the current look's texture has loaded (for tests and export) */
  async texturesReady(): Promise<void> {
    if (this.look.noteStyle === 'texture') this.wantTexture(this.look.noteTexture);
    await this.texLoad;
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
    const A = kb.P(x0p, kb.edgeY(x0p));
    const B = kb.P(x1p, kb.edgeY(x1p));
    if (Math.abs(B[0] - A[0]) < 4) return false;
    // dense plane-x samples -> screen x, then resample evenly along the screen line
    const N = 400;
    const us: number[] = [], ps: number[] = [], units: number[] = [];
    for (let i = 0; i <= N; i++) {
      const px = x0p + (x1p - x0p) * (i / N);
      us.push(kb.P(px, kb.edgeY(px))[0]);
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
    const tall = Math.max(1, this.look.saberFlicker) * Math.max(1, this.look.saberThick);
    const box = [Math.min(A[0], B[0]) - 4, Math.min(A[1], B[1]) - 140 * scMax * tall - 10, Math.max(A[0], B[0]) + 4, Math.max(A[1], B[1]) + 30 * Math.max(1, this.look.saberThick)];
    const q = this.device.queue;
    q.writeBuffer(this.saberUni, 0, new Float32Array([A[0], A[1], B[0], B[1], ...box, bass, t, nK, 0]));
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
