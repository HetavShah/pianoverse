// The renderer: draws a frame of the project over a frame of the video, on the GPU (WebGPU).
//
// A frame is drawn in four stages:
//   1. scene      SceneBuilder works out this moment's notes, flashes, lights and saber heat on the CPU (scene.ts)
//   2. particles  the emitters alive now are simulated on the GPU (particles.ts, from the plan in emitters.ts)
//   3. light      every glowing thing is drawn additively into the light layer (layers.ts)
//   4. post       bloom spreads the light, and the composite lays video, background, light and cards together
//
// Renderer is a facade over those parts: the app only sets the project, the camera window and the output size,
// and asks for frames. Everything per project (resolved look, prepared notes, the particle plan) is made once in
// setProject; everything per frame is in render().
import type { Brand } from '../titles';
import type { UserFiles } from '../noteTextures';
import type { ProjectFile } from '../project';
import { Gpu } from './gpu';
import { BarLinesLayer, FrameData, LabelsLayer, LightLayer, NotesLayer, SaberLayer, SpritesLayer } from './layers';
import { DrawModel } from './model';
import { ParticleSystem } from './particles';
import { PER_EMIT } from './emitters';
import { Bloom, Composite, LightTargets, postModule } from './post';
import { BackgroundImage, TitleCards } from './resources';
import { DEFAULT_LAYERS, FrameScene, Layers, SceneBuilder } from './scene';
import { backgroundParams, frameUniforms, lightingParams } from './uniforms';
import { View, Viewport } from './viewport';

export type FrameSource = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement;
export interface FrameStats { notes: number; emitters: number; particles: number; cpuMs: number }

export class Renderer {
  /** which parts are drawn */
  layers: Layers = { ...DEFAULT_LAYERS };
  stats: FrameStats = { notes: 0, emitters: 0, particles: 0, cpuMs: 0 };
  /** export: effects only, with transparency (for editing programs) */
  alphaOut = false;
  /** show the video without its lighting (the Light step's compare) */
  lightingOff = false;
  /** the stretch of the video the cards belong to (export of a section); null = the part in use (the trim) */
  cardSpan: [number, number] | null = null;
  /** reads the user's own textures (set by the app) */
  userFiles: UserFiles | null = null;
  /** called when a texture, background, shape or logo finishes loading, so a paused preview can redraw */
  onTexture: (() => void) | null = null;

  private gpu: Gpu;
  private context: GPUCanvasContext;
  private model: DrawModel | null = null;
  private scenes: SceneBuilder | null = null;
  private vp = new Viewport();
  private targets: LightTargets;
  private videoTex: GPUTexture | null = null;

  // the parts of a frame
  private frameBuf: GPUBuffer;
  private lightsBuf: GPUBuffer;
  private bgUni: GPUBuffer;
  private lightingUni: GPUBuffer;
  private notes: NotesLayer;
  private particles: ParticleSystem;
  /** drawn into the light layer in this order */
  private lightLayers: LightLayer[];
  private bloom: Bloom;
  private composite: Composite;
  private background: BackgroundImage;
  private cards: TitleCards;

  /** Factory: WebGPU setup is asynchronous, so a renderer is made with Renderer.create, never with new. */
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

  private constructor(private canvas: HTMLCanvasElement, device: GPUDevice, readonly adapterName: string) {
    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('Could not create a WebGPU canvas.');
    this.context = ctx;
    const format = navigator.gpu.getPreferredCanvasFormat();
    device.lost.then((info) => console.error('[gpu] device lost:', info.reason, info.message));
    device.addEventListener('uncapturederror', (e) => console.error('[gpu]', (e as GPUUncapturedErrorEvent).error.message));
    ctx.configure({ device, format, alphaMode: 'opaque' });
    const gpu = this.gpu = new Gpu(device, format);
    const files = () => this.userFiles;
    const ready = () => this.onTexture?.();

    this.frameBuf = gpu.uniform(192);
    this.lightsBuf = gpu.storage(128 * 32);
    this.bgUni = gpu.uniform(128);
    this.lightingUni = gpu.uniform(128);
    this.notes = new NotesLayer(gpu, files);
    this.particles = new ParticleSystem(gpu, files);
    this.lightLayers = [new BarLinesLayer(gpu), this.notes, new LabelsLayer(gpu), new SaberLayer(gpu), new SpritesLayer(gpu), this.particles];
    const post = postModule(gpu);
    this.bloom = new Bloom(gpu, post);
    this.composite = new Composite(gpu, post);
    this.background = new BackgroundImage(gpu, files);
    this.cards = new TitleCards(gpu);
    for (const loader of [this.notes.texture, this.background, this.particles.shapes, this.cards]) loader.onReady = ready;
    this.targets = new LightTargets(gpu);
    this.resize();
  }

  // ---------- setup ----------

  setProject(proj: ProjectFile) {
    const m = new DrawModel(proj);
    this.model = m;
    this.scenes = new SceneBuilder(m);
    this.particles.setPlan(m);
    this.vp.srcW = proj.video.width;
    this.vp.srcH = proj.video.height;
    this.vp.crop = m.crop;
    this.resize();
  }

  /** the project being drawn */
  get project() { return this.model?.proj ?? null; }

  /** Draw into a different canvas (the preview canvas belongs to whichever screen is showing). */
  attach(canvas: HTMLCanvasElement) {
    if (canvas === this.canvas) return;
    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('Could not create a WebGPU canvas.');
    ctx.configure({ device: this.gpu.device, format: this.gpu.format, alphaMode: 'opaque' });
    this.canvas = canvas;
    this.context = ctx;
    canvas.width = this.vp.rtW;
    canvas.height = this.vp.rtH;
  }

  setScale(scale: number) {
    this.vp.scale = scale;
    this.resize();
  }
  get scaleFactor() { return this.vp.scale; }
  get size() { return { width: this.vp.rtW, height: this.vp.rtH }; }

  /** The frame's size in output pixels (the preview draws it at `scale` of that), or null for the video's own size. */
  setOutput(size: [number, number] | null) {
    if (this.vp.setOutput(size)) this.resize();
  }
  get output() { return this.vp.outSize; }

  /** The part of the video to show (video pixels), and an optional dip to black or white: [amount 0..1, white 0/1]. */
  setView(view: View | null, fade?: [number, number] | null) {
    this.vp.view = view;
    this.vp.fade = fade ?? [0, 0];
  }

  /** the maker's name, handle and logo for the cards */
  setBrand(b: Brand | null) { this.cards.setBrand(b); }

  /** match the canvas and light targets to the render size */
  private resize() {
    const w = this.vp.rtW, h = this.vp.rtH;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.targets.width !== w || this.targets.height !== h) this.targets.resize(w, h);
  }

  // ---------- per frame ----------

  render(source: FrameSource | null, t: number, offscreen = false) {
    const m = this.model;
    if (!m || !this.scenes) return;
    const cpu0 = performance.now();
    m.trackAt(t);
    this.uploadSource(source);

    const scene = this.scenes.build(t, this.layers);
    this.writeFrame(m, scene, offscreen);

    // every layer uploads its part, the particles are simulated, then the light layer is drawn in order
    const f: FrameData = { frameBuf: this.frameBuf, scene, layers: this.layers, offscreen, lights: this.lightsBuf, lightCount: scene.lights.count };
    const shown = this.lightLayers.filter((l) => l.prepare(m, f));
    const enc = this.gpu.device.createCommandEncoder();
    this.particles.simulate(enc);
    const light = this.gpu.pass(enc, this.targets.light, { r: 0, g: 0, b: 0, a: 0 });
    for (const l of shown) l.draw(light, f);
    light.end();

    this.bloom.encode(enc, this.targets, this.layers.bloom);
    if (this.videoTex) {
      const vw = this.vp.window();
      const keysMid = m.whiteKeys / 2;
      const keysAt = (m.kb.P(keysMid, m.kb.edgeY(keysMid))[1] - vw.y) / vw.h;
      const cards = this.cards.layer(t, this.vp.rtW, this.vp.rtH, m.titles, this.cardSpan ?? m.trim, m.proj.name, Number.isFinite(keysAt) ? keysAt : 0.6);
      this.composite.encode(enc, offscreen ? null : this.context, this.vp.rtW, this.vp.rtH, {
        frameBuf: this.frameBuf, video: this.videoTex, targets: this.targets, lights: this.lightsBuf, lightCount: scene.lights.count,
        background: this.background.texture, backgroundUni: this.bgUni, cards, lightingUni: this.lightingUni,
      });
    }
    this.gpu.queue.submit([enc.finish()]);
    const emitters = this.particles.emitters;
    this.stats = { notes: scene.visible, emitters, particles: emitters * PER_EMIT, cpuMs: performance.now() - cpu0 };
  }

  /** the uniforms every pass shares, and the composite's */
  private writeFrame(m: DrawModel, scene: FrameScene, offscreen: boolean) {
    const lk = m.look;
    const vw = this.vp.window();
    const pxScale = this.vp.rtW / vw.w;
    this.gpu.write(this.frameBuf, frameUniforms(m, [this.vp.rtW, this.vp.rtH], vw, pxScale, scene.t, scene.bass, this.vp.fade));
    this.bloom.write(this.targets, pxScale, lk.bloomWide);
    if (lk.bgImageOn && lk.bgImage) { this.background.request(lk.bgImage); this.background.refresh(!offscreen); }
    this.gpu.write(this.bgUni, backgroundParams(lk, this.background.shows(lk.bgImage), this.background.aspect, this.alphaOut));
    this.gpu.write(this.lightingUni, lightingParams(m, this.lightingOff));
    if (scene.lights.count) this.gpu.write(this.lightsBuf, scene.lights.array());
  }

  /** Renders one frame offscreen and returns its RGBA pixels (used by export and tests). */
  async capture(source: FrameSource | null, t: number): Promise<{ width: number; height: number; data: Uint8Array }> {
    // video textures show exactly the frame for this moment (export must be repeatable)
    const lk = this.model?.look;
    if (lk?.texOn) await this.notes.texture.seek(t);
    if (lk?.bgImageOn) await this.background.seek(t);
    this.render(source, t, true);
    const w = this.vp.rtW, h = this.vp.rtH;
    const bpr = Math.ceil((w * 4) / 256) * 256;
    const rb = this.gpu.buffer(bpr * h, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
    const enc = this.gpu.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: this.composite.captured! }, { buffer: rb, bytesPerRow: bpr }, [w, h]);
    this.gpu.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(rb.getMappedRange());
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) data.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4);
    rb.unmap();
    rb.destroy();
    return { width: w, height: h, data };
  }

  /** resolves once the current look's texture, background and shapes have loaded (for tests and export) */
  async texturesReady(): Promise<void> {
    const m = this.model;
    if (m) {
      const lk = m.look;
      if (lk.texOn) this.notes.texture.request(lk.noteTexture);
      if (lk.bgImageOn && lk.bgImage) this.background.request(lk.bgImage);
      if (lk.partMode === 'shape' || m.scenes.length) this.particles.shapes.use([lk.partShape || 'heart', ...m.scenes.map((sc) => sc.shape || 'heart')]);
    }
    await this.notes.texture.ready();
    await this.background.ready();
    await this.particles.shapes.ready();
  }

  /** resolves once the GPU has finished all submitted work (for tests and export) */
  done(): Promise<void> { return this.gpu.queue.onSubmittedWorkDone(); }

  /** copy the video frame into the GPU */
  private uploadSource(source: FrameSource | null) {
    if (!source) return;
    const w = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const h = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!w || !h) return;
    if (!this.videoTex || this.videoTex.width !== w || this.videoTex.height !== h) {
      this.videoTex?.destroy();
      this.videoTex = this.gpu.imageTexture(w, h);
    }
    this.gpu.queue.copyExternalImageToTexture({ source }, { texture: this.videoTex }, [w, h]);
  }
}
