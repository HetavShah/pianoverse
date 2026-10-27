// GPU plumbing shared by every part of the renderer: the device, shader modules (with common.wgsl in front),
// buffers, pipelines with the usual settings, and a bind-group cache.
import commonSrc from '../shaders/common.wgsl?raw';

/** the light layer and bloom chain are drawn in half floats so bright light can go past 1 */
export const LIGHT_FMT: GPUTextureFormat = 'rgba16float';

/** light adds up: every layer drawn into the light texture uses this */
export const ADDITIVE: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};

/** a bindable thing: buffers and samplers bind as they are, textures bind a view of the whole texture */
export type Resource = GPUBuffer | GPUTexture | GPUSampler;

// identity numbers for resources, so a bind group can be looked up by exactly what it binds
const ids = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object) => { let i = ids.get(o); if (!i) { i = nextId++; ids.set(o, i); } return i; };

/**
 * Bind groups cached by the pipeline, group index and the exact resources bound. When a texture is replaced
 * (a new video size, another note texture, a resize) the key changes with it, so a stale bind group can never be
 * used and nothing has to be invalidated by hand.
 */
export class BindGroups {
  private cache = new Map<string, GPUBindGroup>();
  constructor(private device: GPUDevice) {}

  get(pipe: GPURenderPipeline | GPUComputePipeline, group: number, resources: Resource[]): GPUBindGroup {
    const key = `${idOf(pipe)}:${group}:${resources.map(idOf).join(',')}`;
    let g = this.cache.get(key);
    if (!g) {
      // old entries refer to textures that may be gone; a small cache is rebuilt cheaply
      if (this.cache.size > 512) this.cache.clear();
      g = this.device.createBindGroup({
        layout: pipe.getBindGroupLayout(group),
        entries: resources.map((r, binding) => ({
          binding,
          resource: r instanceof GPUBuffer ? { buffer: r } : r instanceof GPUTexture ? r.createView() : r,
        })),
      });
      this.cache.set(key, g);
    }
    return g;
  }
}

/** The device and what is made from it. One per Renderer (the gallery has its own renderer, and so its own). */
export class Gpu {
  readonly queue: GPUQueue;
  readonly groups: BindGroups;
  /** clamp-to-edge linear sampler (video, light, bloom) */
  readonly sampler: GPUSampler;

  constructor(readonly device: GPUDevice, readonly format: GPUTextureFormat) {
    this.queue = device.queue;
    this.groups = new BindGroups(device);
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  }

  buffer(size: number, usage: GPUBufferUsageFlags): GPUBuffer {
    return this.device.createBuffer({ size, usage });
  }
  uniform(size: number): GPUBuffer { return this.buffer(size, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST); }
  storage(size: number, writable = true): GPUBuffer { return this.buffer(size, GPUBufferUsage.STORAGE | (writable ? GPUBufferUsage.COPY_DST : 0)); }
  vertices(size: number): GPUBuffer { return this.buffer(size, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST); }

  texture(w: number, h: number, format: GPUTextureFormat, usage: GPUTextureUsageFlags): GPUTexture {
    return this.device.createTexture({ size: [Math.max(1, w), Math.max(1, h)], format, usage });
  }
  /** a texture sampled by shaders and filled from images or the CPU */
  imageTexture(w: number, h: number): GPUTexture {
    return this.texture(w, h, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT);
  }

  write(buf: GPUBuffer, data: Float32Array | Uint32Array, offset = 0) { this.queue.writeBuffer(buf, offset, data); }

  /** a shader module; most shaders get common.wgsl (Frame uniforms, helpers) in front */
  module(code: string, withCommon = true): GPUShaderModule {
    const m = this.device.createShaderModule({ code: withCommon ? commonSrc + '\n' + code : code });
    m.getCompilationInfo().then((info) => {
      for (const msg of info.messages) if (msg.type === 'error') console.error('[wgsl]', msg.lineNum, msg.message);
    });
    return m;
  }

  /** a pipeline drawing into the light layer (additive); vs/fs entry points */
  lightPipeline(module: GPUShaderModule, buffers: GPUVertexBufferLayout[], topology: GPUPrimitiveTopology = 'triangle-strip'): GPURenderPipeline {
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs', buffers },
      fragment: { module, entryPoint: 'fs', targets: [{ format: LIGHT_FMT, blend: ADDITIVE }] },
      primitive: { topology },
    });
  }

  /** a full-screen pipeline (one triangle from vsFull) */
  fullscreen(module: GPUShaderModule, entryPoint: string, format: GPUTextureFormat): GPURenderPipeline {
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vsFull' },
      fragment: { module, entryPoint, targets: [{ format }] },
    });
  }

  /** a render pass over one texture, cleared first */
  pass(enc: GPUCommandEncoder, target: GPUTexture | GPUTextureView, clear: GPUColor): GPURenderPassEncoder {
    const view = target instanceof GPUTexture ? target.createView() : target;
    return enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: clear }] });
  }
}

/** instance layouts: n vec4s per instance */
export function instanceLayout(vec4s: number): GPUVertexBufferLayout {
  return {
    arrayStride: vec4s * 16, stepMode: 'instance',
    attributes: Array.from({ length: vec4s }, (_, i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' as GPUVertexFormat })),
  };
}
