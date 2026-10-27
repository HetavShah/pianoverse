// Particles on the GPU. The plan (emitters.ts) is made once per project; each frame the emitters alive at that
// moment are uploaded, a compute pass works out every particle's position from its emitter (no state carried
// between frames), and the particles are drawn into the light layer.
import simSrc from '../shaders/particles_sim.wgsl?raw';
import partsSrc from '../shaders/particles_draw.wgsl?raw';
import { mulberry32 } from '../random';
import type { UserFiles } from '../noteTextures';
import type { Gpu } from './gpu';
import type { FrameData, LightLayer } from './layers';
import type { DrawModel } from './model';
import { EmitterPlan, PER_EMIT, ROW } from './emitters';
import { ShapeLibrary } from './resources';
import { particleDrawParams, simParams } from './uniforms';

/** most emitters alive at once */
const MAX_EMIT = 512;
/** waves in the flow field that swirls the particles */
const FLOW_WAVES = 10;

export class ParticleSystem implements LightLayer {
  readonly shapes: ShapeLibrary;
  private plan: EmitterPlan | null = null;
  /** emitters alive this frame (0: nothing to simulate or draw) */
  private alive = 0;
  private emitBuf: GPUBuffer;
  private flowBuf: GPUBuffer;
  private partBuf: GPUBuffer;
  private simUni: GPUBuffer;
  private drawUni: GPUBuffer;
  private simPipe: GPUComputePipeline;
  private drawPipe: GPURenderPipeline;

  constructor(private gpu: Gpu, files: () => UserFiles | null) {
    this.shapes = new ShapeLibrary(gpu, files);
    this.emitBuf = gpu.storage(MAX_EMIT * ROW * 4);
    this.flowBuf = gpu.storage(FLOW_WAVES * 2 * 16);
    this.partBuf = gpu.storage(MAX_EMIT * PER_EMIT * 48, false);
    this.simUni = gpu.uniform(144);
    this.drawUni = gpu.uniform(32);
    this.simPipe = gpu.device.createComputePipeline({ layout: 'auto', compute: { module: gpu.module(simSrc, false), entryPoint: 'main' } });
    this.drawPipe = gpu.lightPipeline(gpu.module(partsSrc), []);
    this.writeFlow();
  }

  /** work out every note's emitters (once per project or look) */
  setPlan(m: DrawModel) { this.plan = new EmitterPlan(m); }

  /** the flow field: a few travelling waves at random sizes and directions (the same every run) */
  private writeFlow() {
    const rnd = mulberry32(3);
    const a = new Float32Array(FLOW_WAVES * 2 * 4);
    for (let i = 0; i < FLOW_WAVES; i++) {
      const lam = Math.exp(Math.log(70) + rnd() * (Math.log(300) - Math.log(70)));
      const ang = rnd() * Math.PI * 2;
      const k = (2 * Math.PI) / lam;
      const speed = 35 + rnd() * 35;
      const w = (0.25 + rnd() * 0.65) * (rnd() < 0.5 ? -1 : 1);
      a.set([k * Math.cos(ang), k * Math.sin(ang), speed / k, w], i * 4);
      a[(FLOW_WAVES + i) * 4] = rnd() * Math.PI * 2;
    }
    this.gpu.write(this.flowBuf, a);
  }

  /** upload the emitters alive at this moment and the look's motion settings */
  prepare(m: DrawModel, f: FrameData): boolean {
    const lk = m.look, t = f.scene.t;
    this.alive = 0;
    if (f.layers.particles && this.plan && this.plan.start.length) {
      const act = this.plan.aliveAt(t, MAX_EMIT);
      const amb = EmitterPlan.ambient(m);
      if (amb && act.length >= MAX_EMIT) act.pop();
      const rows = act.length + (amb ? 1 : 0);
      if (rows) {
        const arr = new Float32Array(rows * ROW);
        if (amb) arr.set(amb, 0);
        act.forEach((ei, j) => arr.set(this.plan!.rows.subarray(ei * ROW, ei * ROW + ROW), (j + (amb ? 1 : 0)) * ROW));
        this.gpu.write(this.emitBuf, arr);
        this.alive = rows;
      }
    }
    const usesShapes = lk.partMode === 'shape' || m.scenes.length > 0;
    if (usesShapes && this.plan) this.shapes.use(this.plan.shapeKeys);
    // Sim header: time (written over the first word), emitters, slots per emitter, shapes ready
    this.gpu.write(this.simUni, new Uint32Array([0, this.alive, PER_EMIT, usesShapes && this.shapes.isLoaded ? 1 : 0]));
    this.gpu.write(this.simUni, new Float32Array([t]));
    this.gpu.write(this.simUni, simParams(lk), 16);
    this.gpu.write(this.drawUni, particleDrawParams(lk));
    return this.alive > 0;
  }

  get emitters() { return this.alive; }

  /** compute every live particle's position */
  simulate(enc: GPUCommandEncoder) {
    if (!this.alive) return;
    const cp = enc.beginComputePass();
    cp.setPipeline(this.simPipe);
    cp.setBindGroup(0, this.gpu.groups.get(this.simPipe, 0, [this.simUni, this.emitBuf, this.flowBuf, this.partBuf, this.shapes.buffer]));
    cp.dispatchWorkgroups(Math.ceil((this.alive * PER_EMIT) / 64));
    cp.end();
  }

  draw(pass: GPURenderPassEncoder, f: FrameData) {
    pass.setPipeline(this.drawPipe);
    pass.setBindGroup(0, this.gpu.groups.get(this.drawPipe, 0, [f.frameBuf]));
    pass.setBindGroup(1, this.gpu.groups.get(this.drawPipe, 1, [this.partBuf, this.drawUni]));
    pass.draw(4, this.alive * PER_EMIT);
  }
}
