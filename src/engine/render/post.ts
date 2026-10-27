// After the light layer: bloom (the light, downsampled twice and blurred, so bright things glow) and the composite
// (the video with its lighting and look grade, the background, the light layer and bloom on top, coloured light on
// the hands, film grain and fringe, and the title cards last).
import postSrc from '../shaders/post.wgsl?raw';
import { Gpu, LIGHT_FMT } from './gpu';

/** the light layer and the bloom chain (half and a sixth of the render size) */
export class LightTargets {
  light!: GPUTexture;
  b1a!: GPUTexture;
  b1b!: GPUTexture;
  b2a!: GPUTexture;
  b2b!: GPUTexture;
  constructor(private gpu: Gpu) {}

  get width() { return this.light?.width ?? 0; }
  get height() { return this.light?.height ?? 0; }

  resize(w: number, h: number) {
    const tex = (tw: number, th: number) => this.gpu.texture(tw, th, LIGHT_FMT, GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
    for (const t of [this.light, this.b1a, this.b1b, this.b2a, this.b2b]) t?.destroy();
    this.light = tex(w, h);
    const w1 = Math.ceil(w / 2), h1 = Math.ceil(h / 2);
    const w2 = Math.ceil(w1 / 3), h2 = Math.ceil(h1 / 3);
    this.b1a = tex(w1, h1); this.b1b = tex(w1, h1);
    this.b2a = tex(w2, h2); this.b2b = tex(w2, h2);
  }
}

/** Post (post.wgsl): texel size, blur direction, sigma, downsample factor, clamp input, light count */
const postParams = (texel: [number, number], dir: [number, number], sigma: number, factor: number, clampIn: number, nLights = 0) =>
  new Float32Array([texel[0], texel[1], dir[0], dir[1], sigma, factor, clampIn, nLights]);

/** the shader module shared by bloom and composite */
export const postModule = (gpu: Gpu) => gpu.module(postSrc);

export class Bloom {
  private down: GPURenderPipeline;
  private blur: GPURenderPipeline;
  /** one uniform per step: light -> b1, b1 blur H, b1 blur V, b1 -> b2, b2 blur H, b2 blur V */
  private uni: GPUBuffer[];

  constructor(private gpu: Gpu, module: GPUShaderModule) {
    this.down = gpu.fullscreen(module, 'fsDown', LIGHT_FMT);
    this.blur = gpu.fullscreen(module, 'fsBlur', LIGHT_FMT);
    this.uni = Array.from({ length: 6 }, () => gpu.uniform(32));
  }

  /** blur sizes follow the camera's zoom (pxScale: pixels of the frame per video pixel) and the look's width */
  write(T: LightTargets, pxScale: number, width: number) {
    const w1 = T.b1a.width, h1 = T.b1a.height, w2 = T.b2a.width, h2 = T.b2a.height;
    const steps = [
      postParams([1 / T.width, 1 / T.height], [0, 0], 1, 2, 1),
      postParams([1 / w1, 1 / h1], [1, 0], 5 * pxScale * width, 1, 0),
      postParams([1 / w1, 1 / h1], [0, 1], 5 * pxScale * width, 1, 0),
      postParams([1 / w1, 1 / h1], [0, 0], 1, 3, 0),
      postParams([1 / w2, 1 / h2], [1, 0], 7 * pxScale * width, 1, 0),
      postParams([1 / w2, 1 / h2], [0, 1], 7 * pxScale * width, 1, 0),
    ];
    steps.forEach((p, i) => this.gpu.write(this.uni[i], p));
  }

  encode(enc: GPUCommandEncoder, T: LightTargets, on: boolean) {
    if (!on) {
      // no bloom: the composite reads empty bloom textures
      for (const tx of [T.b1a, T.b2a]) this.gpu.pass(enc, tx, { r: 0, g: 0, b: 0, a: 1 }).end();
      return;
    }
    const step = (pipe: GPURenderPipeline, uni: number, src: GPUTexture, dst: GPUTexture) => {
      const rp = this.gpu.pass(enc, dst, { r: 0, g: 0, b: 0, a: 1 });
      rp.setPipeline(pipe);
      rp.setBindGroup(0, this.gpu.groups.get(pipe, 0, []));
      rp.setBindGroup(1, this.gpu.groups.get(pipe, 1, [this.uni[uni], this.gpu.sampler, src]));
      rp.draw(3);
      rp.end();
    };
    step(this.down, 0, T.light, T.b1a);
    step(this.blur, 1, T.b1a, T.b1b);
    step(this.blur, 2, T.b1b, T.b1a);
    step(this.down, 3, T.b1a, T.b2a);
    step(this.blur, 4, T.b2a, T.b2b);
    step(this.blur, 5, T.b2b, T.b2a);
  }
}

/** what the composite lays together */
export interface CompositeInputs {
  frameBuf: GPUBuffer;
  video: GPUTexture;
  targets: LightTargets;
  lights: GPUBuffer;
  lightCount: number;
  background: GPUTexture;
  backgroundUni: GPUBuffer;
  cards: GPUTexture;
  lightingUni: GPUBuffer;
}

export class Composite {
  /** to the screen, and to an offscreen texture for capture */
  private toScreen: GPURenderPipeline;
  private toTexture: GPURenderPipeline;
  private uni: GPUBuffer;
  private offTex: GPUTexture | null = null;

  constructor(private gpu: Gpu, module: GPUShaderModule) {
    this.toScreen = gpu.fullscreen(module, 'fsComposite', gpu.format);
    this.toTexture = gpu.fullscreen(module, 'fsComposite', 'rgba8unorm');
    this.uni = gpu.uniform(32);
  }

  /** the last captured frame */
  get captured() { return this.offTex; }

  encode(enc: GPUCommandEncoder, screen: GPUCanvasContext | null, w: number, h: number, inp: CompositeInputs) {
    let view: GPUTextureView;
    if (!screen) {
      if (!this.offTex || this.offTex.width !== w || this.offTex.height !== h) {
        this.offTex?.destroy();
        this.offTex = this.gpu.texture(w, h, 'rgba8unorm', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC);
      }
      view = this.offTex.createView();
    } else {
      view = screen.getCurrentTexture().createView();
    }
    this.gpu.write(this.uni, postParams([0, 0], [0, 0], 0, 0, 0, inp.lightCount));
    const pipe = screen ? this.toScreen : this.toTexture;
    const cp = this.gpu.pass(enc, view, { r: 0, g: 0, b: 0, a: 1 });
    cp.setPipeline(pipe);
    cp.setBindGroup(0, this.gpu.groups.get(pipe, 0, [inp.frameBuf]));
    const T = inp.targets;
    cp.setBindGroup(1, this.gpu.groups.get(pipe, 1, [
      this.uni, this.gpu.sampler, inp.video, T.light, T.b1a, T.b2a, inp.lights, inp.background, inp.backgroundUni, inp.cards, inp.lightingUni,
    ]));
    cp.draw(3);
    cp.end();
  }
}
