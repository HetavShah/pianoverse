// The light layer: everything glowing is drawn additively into one half-float texture, which bloom spreads and the
// composite lays over the video. Each part is a LightLayer that uploads its share of the frame and draws itself;
// the renderer draws them in a fixed order (bar lines, notes, labels, saber, flashes, then particles on top).
import glassSrc from '../shaders/glass.wgsl?raw';
import labelsSrc from '../shaders/labels.wgsl?raw';
import barsSrc from '../shaders/barlines.wgsl?raw';
import spritesSrc from '../shaders/sprites.wgsl?raw';
import saberSrc from '../shaders/saber.wgsl?raw';
import type { UserFiles } from '../noteTextures';
import { Gpu, instanceLayout } from './gpu';
import type { DrawModel } from './model';
import { NoteTexture, noteNameAtlas } from './resources';
import { FrameScene, HEAT_CELLS, Layers, MAX_BAR_QUADS, MAX_NOTES, MAX_SPRITES } from './scene';
import { noteParams, texParams } from './uniforms';

/** what every layer gets: the frame uniforms (bind group 0) and the frame's scene */
export interface FrameData {
  /** Frame uniforms (common.wgsl), bound as group 0 of every layer */
  frameBuf: GPUBuffer;
  scene: FrameScene;
  /** which parts are shown */
  layers: Layers;
  /** the frame is being captured (export): videos are seeked, not played */
  offscreen: boolean;
  /** this frame's lights where notes land (8 floats each: x, y, radius, strength, colour), and how many */
  lights: GPUBuffer;
  lightCount: number;
}

export interface LightLayer {
  /** upload this frame's data; false when there is nothing to draw */
  prepare(m: DrawModel, f: FrameData): boolean;
  draw(pass: GPURenderPassEncoder, f: FrameData): void;
}

/** shared bits of a layer with one pipeline */
abstract class PipelineLayer implements LightLayer {
  protected abstract pipe: GPURenderPipeline;
  constructor(protected gpu: Gpu) {}
  abstract prepare(m: DrawModel, f: FrameData): boolean;
  abstract draw(pass: GPURenderPassEncoder, f: FrameData): void;
  /** set the pipeline and its frame uniforms (group 0) */
  protected begin(pass: GPURenderPassEncoder, f: FrameData) {
    pass.setPipeline(this.pipe);
    pass.setBindGroup(0, this.gpu.groups.get(this.pipe, 0, [f.frameBuf]));
  }
}

/** bar lines (one quad of six vertices per line) */
export class BarLinesLayer extends PipelineLayer {
  protected pipe: GPURenderPipeline;
  private buf: GPUBuffer;
  constructor(gpu: Gpu) {
    super(gpu);
    this.buf = gpu.vertices(MAX_BAR_QUADS * 6 * 32);
    this.pipe = gpu.lightPipeline(gpu.module(barsSrc), [{ arrayStride: 32, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x2' },
      { shaderLocation: 1, offset: 8, format: 'float32x2' },
      { shaderLocation: 2, offset: 16, format: 'float32x3' },
    ] }], 'triangle-list');
  }
  prepare(_m: DrawModel, { scene }: FrameData) {
    if (!scene.bars.count) return false;
    this.gpu.write(this.buf, scene.bars.array());
    return true;
  }
  draw(pass: GPURenderPassEncoder, f: FrameData) {
    this.begin(pass, f);
    pass.setVertexBuffer(0, this.buf);
    pass.draw(f.scene.bars.data.length / 8);
  }
}

/** the falling notes (glass, 2D or 3D styles, with an optional texture) */
export class NotesLayer extends PipelineLayer {
  protected pipe: GPURenderPipeline;
  readonly texture: NoteTexture;
  private buf: GPUBuffer;
  private texSampler: GPUSampler;
  private texUni: GPUBuffer;
  private noteUni: GPUBuffer;
  constructor(gpu: Gpu, files: () => UserFiles | null) {
    super(gpu);
    this.texture = new NoteTexture(gpu, files);
    this.buf = gpu.vertices(MAX_NOTES * 64);
    this.texSampler = gpu.device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 8 });
    this.texUni = gpu.uniform(48);
    this.noteUni = gpu.uniform(144);
    this.pipe = gpu.lightPipeline(gpu.module(glassSrc), [instanceLayout(4)]);
  }
  prepare(m: DrawModel, { scene, offscreen }: FrameData) {
    const lk = m.look;
    if (scene.notes.count) this.gpu.write(this.buf, scene.notes.array());
    if (lk.texOn) { this.texture.request(lk.noteTexture); this.texture.refresh(!offscreen); }
    this.gpu.write(this.noteUni, noteParams(m));
    this.gpu.write(this.texUni, texParams(lk, this.texture.set));
    return scene.notes.count > 0;
  }
  draw(pass: GPURenderPassEncoder, f: FrameData) {
    const t = this.texture.set;
    this.begin(pass, f);
    pass.setBindGroup(1, this.gpu.groups.get(this.pipe, 1, [this.texSampler, t.color, t.normal, t.rough, this.texUni, this.noteUni]));
    pass.setVertexBuffer(0, this.buf);
    pass.draw(4, f.scene.notes.count);
  }
}

/** note names on the notes */
export class LabelsLayer extends PipelineLayer {
  protected pipe: GPURenderPipeline;
  private buf: GPUBuffer;
  private atlas: GPUTexture;
  constructor(gpu: Gpu) {
    super(gpu);
    this.buf = gpu.vertices(MAX_NOTES * 48);
    this.atlas = noteNameAtlas(gpu);
    this.pipe = gpu.lightPipeline(gpu.module(labelsSrc), [instanceLayout(3)]);
  }
  prepare(_m: DrawModel, { scene }: FrameData) {
    if (!scene.labels.count) return false;
    this.gpu.write(this.buf, scene.labels.array());
    return true;
  }
  draw(pass: GPURenderPassEncoder, f: FrameData) {
    this.begin(pass, f);
    pass.setBindGroup(1, this.gpu.groups.get(this.pipe, 1, [this.atlas, this.gpu.sampler]));
    pass.setVertexBuffer(0, this.buf);
    pass.draw(4, f.scene.labels.count);
  }
}

const SABER_STYLES = ['plasma', 'straight', 'electric', 'soft', 'flame'];

/** the saber: a line of light along the back of the keys that flares where notes land */
export class SaberLayer extends PipelineLayer {
  protected pipe: GPURenderPipeline;
  private uni: GPUBuffer;
  /** 64 samples along the line: plane x and pixels per key */
  private map: GPUBuffer;
  private heat: GPUBuffer;
  constructor(gpu: Gpu) {
    super(gpu);
    this.uni = gpu.uniform(64);
    this.map = gpu.storage(64 * 8);
    this.heat = gpu.storage(HEAT_CELLS * 16);
    this.pipe = gpu.lightPipeline(gpu.module(saberSrc), []);
  }

  /** place the line along the keyboard's back edge (offset by the look), and upload the heat */
  prepare(m: DrawModel, { scene, layers }: FrameData) {
    if (!layers.saber) return false;
    const kb = m.kb, lk = m.look;
    const nK = m.whiteKeys;
    const x0p = -0.2, x1p = nK + 0.2;
    // the saber can sit above or below the back edge of the keys
    const Uv = m.up;
    const off = lk.saberOffset * kb.unit(nK / 2, kb.edgeY(nK / 2));
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
    // the box the shader draws in: tall enough for the style's flames
    const scMax = uMax / 30;
    const sty = lk.saberStyle;
    const tall = Math.max(1, lk.saberFlicker) * Math.max(1, lk.saberThick) * (sty === 'flame' ? 2.8 : sty === 'soft' ? 2.5 : sty === 'electric' ? 2.4 : 1);
    const box = [Math.min(A[0], B[0]) - 4, Math.min(A[1], B[1]) - 140 * scMax * tall - 10, Math.max(A[0], B[0]) + 4, Math.max(A[1], B[1]) + 30 * Math.max(1, lk.saberThick) * (sty === 'soft' ? 3 : 1)];
    const st = SABER_STYLES.indexOf(lk.saberStyle);
    this.gpu.write(this.uni, new Float32Array([A[0], A[1], B[0], B[1], ...box, scene.bass, scene.t, nK, Math.max(0, st), lk.saberOpacity, 0, 0, 0]));
    this.gpu.write(this.map, map);
    this.gpu.write(this.heat, scene.heat);
    return true;
  }
  draw(pass: GPURenderPassEncoder, f: FrameData) {
    this.begin(pass, f);
    pass.setBindGroup(1, this.gpu.groups.get(this.pipe, 1, [this.uni, this.map, this.heat]));
    pass.draw(4);
  }
}

/** flashes, streaks and star flares where notes land */
export class SpritesLayer extends PipelineLayer {
  protected pipe: GPURenderPipeline;
  private buf: GPUBuffer;
  constructor(gpu: Gpu) {
    super(gpu);
    this.buf = gpu.vertices(MAX_SPRITES * 48);
    this.pipe = gpu.lightPipeline(gpu.module(spritesSrc), [instanceLayout(3)]);
  }
  prepare(_m: DrawModel, { scene }: FrameData) {
    if (!scene.sprites.count) return false;
    this.gpu.write(this.buf, scene.sprites.array());
    return true;
  }
  draw(pass: GPURenderPassEncoder, f: FrameData) {
    this.begin(pass, f);
    pass.setVertexBuffer(0, this.buf);
    pass.draw(4, f.scene.sprites.count);
  }
}
