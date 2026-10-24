// Note material textures: colour, surface normals and roughness, uploaded with mipmaps.
// Built-in textures live in public/textures/<id>/. The user's own textures ('user:<id>') come from their
// texture library; when one has no normal or roughness map, those are derived from its colour image.

export interface TexSet {
  key: string; color: GPUTexture; normal: GPUTexture; rough: GPUTexture; size: number;
  /** brightness range of the colour map (2nd..98th percentile), so faint patterns still read when tinted */
  lo: number; hi: number;
  /** 1 for metals: reflections take the texture's colour */
  metal: number;
  /** how large the texture is drawn by default, relative to the note width */
  tile: number;
  /** video textures: the playing video, redrawn into the colour map every frame */
  video?: HTMLVideoElement;
  frame?: OffscreenCanvas;
}

/** built-in textures that are videos */
const VIDEO_IDS = new Set(['crystal']);

const METAL: Record<string, number> = { foil: 1 };
// fine patterns (marble's hairline veins, foil's crinkles) need to be drawn larger to read on a narrow note
const TILE: Record<string, number> = { ice: 1.3, onyx: 1.6, marble: 3.5, foil: 2.5, crystal: 1.6 };

function levels(c: ImageData): [number, number] {
  const hist = new Uint32Array(256);
  for (let i = 0; i < c.data.length; i += 4) hist[Math.round(lum(c.data, i) * 255)]++;
  const n = c.data.length / 4;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
  if (hi - lo < 8) { lo = Math.max(0, lo - 4); hi = Math.min(255, hi + 4); }
  return [lo / 255, hi / 255];
}

/** the image files of one of the user's textures (the app reads them from its texture library) */
export type UserFiles = (id: string) => Promise<{ color?: Blob; video?: Blob; normal?: Blob; rough?: Blob; metal?: Blob } | null>;

const SIZE = 512;

async function bitmap(src: string | Blob | undefined): Promise<ImageBitmap | null> {
  if (!src) return null;
  try {
    if (typeof src !== 'string') return await createImageBitmap(src);
    const r = await fetch(src);
    if (!r.ok) return null;
    return await createImageBitmap(await r.blob());
  } catch {
    return null;
  }
}

/** square SIZE×SIZE pixels of an image (cropped to its centre square) */
function pixels(img: ImageBitmap | OffscreenCanvas): ImageData {
  const c = new OffscreenCanvas(SIZE, SIZE);
  const g = c.getContext('2d')!;
  const s = Math.min(img.width, img.height);
  g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, SIZE, SIZE);
  return g.getImageData(0, 0, SIZE, SIZE);
}

function upload(device: GPUDevice, img: ImageData): GPUTexture {
  const levels = Math.floor(Math.log2(SIZE)) + 1;
  const tex = device.createTexture({
    size: [SIZE, SIZE], format: 'rgba8unorm', mipLevelCount: levels,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  let src = new OffscreenCanvas(SIZE, SIZE);
  src.getContext('2d')!.putImageData(img, 0, 0);
  for (let l = 0, s = SIZE; l < levels; l++, s = Math.max(1, s >> 1)) {
    let lvl = src;
    if (l > 0) {
      lvl = new OffscreenCanvas(s, s);
      const g = lvl.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, s, s);
      src = lvl;
    }
    device.queue.copyExternalImageToTexture({ source: lvl }, { texture: tex, mipLevel: l }, [s, s]);
  }
  return tex;
}

const lum = (d: Uint8ClampedArray, i: number) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;

/** surface normals from the image's brightness, treated as a height map (wraps at the edges so it tiles) */
function deriveNormal(c: ImageData, strength = 3): ImageData {
  const n = SIZE, d = c.data, h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = lum(d, i * 4);
  // soften so the bumps follow shapes, not pixel noise
  const b = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += h[((y + dy + n) % n) * n + ((x + dx + n) % n)];
    b[y * n + x] = s / 9;
  }
  const out = new ImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const gx = b[y * n + ((x + 1) % n)] - b[y * n + ((x - 1 + n) % n)];
    const gy = b[((y + 1) % n) * n + x] - b[((y - 1 + n) % n) * n + x];
    let nx = -gx * strength, ny = gy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * n + x) * 4;
    out.data[o] = (nx * 0.5 + 0.5) * 255; out.data[o + 1] = (ny * 0.5 + 0.5) * 255; out.data[o + 2] = (nz * 0.5 + 0.5) * 255; out.data[o + 3] = 255;
  }
  return out;
}

/** roughness from brightness: bright parts read as polished */
function deriveRough(c: ImageData): ImageData {
  const out = new ImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = (0.75 - 0.45 * lum(c.data, i * 4)) * 255;
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v; out.data[i * 4 + 3] = 255;
  }
  return out;
}

function openVideo(src: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.crossOrigin = 'anonymous'; v.preload = 'auto';
    const done = (ok: boolean) => { v.onloadeddata = null; v.onerror = null; resolve(ok ? v : null); };
    v.onloadeddata = () => done(true);
    v.onerror = () => done(false);
    v.src = src;
    setTimeout(() => done(v.readyState >= 2), 15000);
  });
}

/** draw the video's current frame into the colour map (with mipmaps) */
export function refreshVideo(device: GPUDevice, set: TexSet) {
  const v = set.video;
  if (!v || v.readyState < 2 || !v.videoWidth) return;
  const c = set.frame ?? (set.frame = new OffscreenCanvas(SIZE, SIZE));
  const g = c.getContext('2d')!;
  const sz = Math.min(v.videoWidth, v.videoHeight);
  g.drawImage(v, (v.videoWidth - sz) / 2, (v.videoHeight - sz) / 2, sz, sz, 0, 0, SIZE, SIZE);
  mipsFrom(device, set.color, c);
}

/** wait until the video shows the frame for time t (loops) — for exact, repeatable frames in export */
export async function seekVideo(set: TexSet, t: number) {
  const v = set.video;
  if (!v || !v.duration || !isFinite(v.duration)) return;
  const want = ((t % v.duration) + v.duration) % v.duration;
  if (Math.abs(v.currentTime - want) < 1 / 120) return;
  v.pause();
  await new Promise<void>((res) => { const f = () => { v.removeEventListener('seeked', f); res(); }; v.addEventListener('seeked', f); v.currentTime = want; setTimeout(res, 3000); });
}

function mipsFrom(device: GPUDevice, tex: GPUTexture, src0: OffscreenCanvas) {
  let src = src0;
  for (let l = 0, s = SIZE; l < tex.mipLevelCount; l++, s = Math.max(1, s >> 1)) {
    let lvl = src;
    if (l > 0) {
      lvl = new OffscreenCanvas(s, s);
      lvl.getContext('2d')!.drawImage(src, 0, 0, s, s);
      src = lvl;
    }
    device.queue.copyExternalImageToTexture({ source: lvl }, { texture: tex, mipLevel: l }, [s, s]);
  }
}

const flat = (device: GPUDevice, r: number, g: number, b: number) => {
  const c = new ImageData(SIZE, SIZE);
  for (let i = 0; i < c.data.length; i += 4) { c.data[i] = r; c.data[i + 1] = g; c.data[i + 2] = b; c.data[i + 3] = 255; }
  return upload(device, c);
};

async function loadVideoSet(device: GPUDevice, key: string, src: string, tile: number): Promise<TexSet | null> {
  const v = await openVideo(src);
  if (!v) return null;
  v.play().catch(() => {});
  const set: TexSet = {
    key, size: SIZE, lo: 0.05, hi: 0.95, metal: 0, tile,
    color: flat(device, 0, 0, 0), normal: flat(device, 128, 128, 255), rough: flat(device, 90, 90, 90), video: v,
  };
  refreshVideo(device, set);
  return set;
}

export async function loadTexSet(device: GPUDevice, key: string, userFiles: UserFiles | null): Promise<TexSet | null> {
  if (VIDEO_IDS.has(key)) return loadVideoSet(device, key, `${import.meta.env?.BASE_URL ?? '/'}textures/${key}/video.webm`, TILE[key] ?? 1.6);
  if (key.startsWith('user:')) {
    const f = userFiles ? await userFiles(key.slice(5)) : null;
    if (f?.video) return loadVideoSet(device, key, URL.createObjectURL(f.video), 1.6);
  }
  let color: ImageBitmap | null, normal: ImageBitmap | null = null, rough: ImageBitmap | null = null;
  let metal = METAL[key] ?? 0;
  if (key.startsWith('user:')) {
    const files = userFiles ? await userFiles(key.slice(5)) : null;
    if (!files) return null;
    color = await bitmap(files.color);
    if (!color) return null;
    [normal, rough] = await Promise.all([bitmap(files.normal), bitmap(files.rough)]);
    const m = await bitmap(files.metal);
    if (m) { const px = pixels(m); let sum = 0; for (let i = 0; i < px.data.length; i += 4) sum += px.data[i]; metal = sum / (px.data.length / 4) / 255 > 0.5 ? 1 : 0; }
  } else {
    const base = `${import.meta.env?.BASE_URL ?? '/'}textures/${key}/`;
    [color, normal, rough] = await Promise.all([bitmap(base + 'color.jpg'), bitmap(base + 'normal.png'), bitmap(base + 'rough.jpg')]);
    if (!color) return null;
  }
  const c = pixels(color);
  const [lo, hi] = levels(c);
  return {
    key, size: SIZE, lo, hi, metal, tile: TILE[key] ?? 2,
    color: upload(device, c),
    normal: upload(device, normal ? pixels(normal) : deriveNormal(c)),
    rough: upload(device, rough ? pixels(rough) : deriveRough(c)),
  };
}

/** a flat stand-in until a texture has loaded */
export function placeholder(device: GPUDevice): TexSet {
  const one = (r: number, g: number, b: number) => {
    const t = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: t }, new Uint8Array([r, g, b, 255]), { bytesPerRow: 4 }, [1, 1]);
    return t;
  };
  return { key: '', size: 1, lo: 0, hi: 1, metal: 0, tile: 1.3, color: one(200, 200, 200), normal: one(128, 128, 255), rough: one(128, 128, 128) };
}
