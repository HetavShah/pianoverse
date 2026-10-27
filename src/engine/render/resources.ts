// Things the renderer loads on demand: the note texture, the background image or video, the outlines for shape
// particles, the note-name atlas and the title cards. Loads are asynchronous and the latest request wins, so
// clicking through looks quickly never shows an older choice after a newer one.
import { MAX_SHAPE_POINTS, svgToPoints } from '../shapePoints';
import { loadTexSet, placeholder, refreshVideo, seekVideo, TexSet, UserFiles } from '../noteTextures';
import { Brand, DEFAULT_BRAND, drawTitles, Titles } from '../titles';
import type { Gpu } from './gpu';
import { SHAPE_SLOTS } from './model';

/**
 * Loads by key; a load that finishes after a newer request is discarded (Template Method: subclasses say how to
 * load, take in and throw away a result).
 */
export abstract class LatestLoader<T> {
  protected wanted = '';
  protected loaded = '';
  private pending: Promise<void> = Promise.resolve();
  /** called when something new is ready, so a paused preview can redraw */
  onReady: (() => void) | null = null;

  request(key: string) {
    if (!key || key === this.wanted || key === this.loaded) return;
    this.wanted = key;
    this.pending = this.load(key).then((v) => {
      if (this.wanted !== key) { if (v) this.discard(v); return; }
      if (!v) { console.warn(`[${this.label}] could not load`, key); return; }
      this.accept(v);
      this.loaded = key;
      this.onReady?.();
    }).catch((e) => console.warn(`[${this.label}]`, e));
  }
  /** resolves once the latest request has finished */
  ready(): Promise<void> { return this.pending; }
  get isLoaded() { return this.loaded !== ''; }
  get loadedKey() { return this.loaded; }

  protected abstract readonly label: string;
  protected abstract load(key: string): Promise<T | null>;
  protected abstract accept(v: T): void;
  protected abstract discard(v: T): void;
}

/** the note texture (Texture note style): colour, normal and roughness maps, possibly a looping video */
export class NoteTexture extends LatestLoader<TexSet> {
  protected readonly label = 'texture';
  set: TexSet;
  constructor(private gpu: Gpu, private files: () => UserFiles | null) { super(); this.set = placeholder(gpu.device); }

  protected load(key: string) { return loadTexSet(this.gpu.device, key, this.files()); }
  protected accept(v: TexSet) { const old = this.set; this.set = v; if (old.key) this.discard(old); }
  protected discard(v: TexSet) { v.video?.pause(); v.color.destroy(); v.normal.destroy(); v.rough.destroy(); }

  /** keep a video texture playing and copy its current frame */
  refresh(playing: boolean) {
    if (!this.set.video) return;
    if (playing && this.set.video.paused) this.set.video.play().catch(() => {});
    refreshVideo(this.gpu.device, this.set);
  }
  /** show exactly the frame for time t (export must be repeatable) */
  seek(t: number) { return this.set.video ? seekVideo(this.set, t) : Promise.resolve(); }
}

interface BackgroundData { tex: GPUTexture; canvas: OffscreenCanvas; video: HTMLVideoElement | null; aspect: number }

/** the background image or video behind the footage (from the user's texture library) */
export class BackgroundImage extends LatestLoader<BackgroundData> {
  protected readonly label = 'background';
  texture: GPUTexture;
  aspect = 1;
  private canvas: OffscreenCanvas | null = null;
  private video: HTMLVideoElement | null = null;
  constructor(private gpu: Gpu, private files: () => UserFiles | null) { super(); this.texture = gpu.imageTexture(1, 1); }

  protected async load(key: string): Promise<BackgroundData | null> {
    const userFiles = this.files();
    const files = key.startsWith('user:') && userFiles ? await userFiles(key.slice(5)) : null;
    if (this.wanted !== key || !files) return null;
    const MAX = 1920;
    let w = 1, h = 1;
    let source: ImageBitmap | null = null;
    let video: HTMLVideoElement | null = null;
    if (files.video) {
      video = document.createElement('video');
      video.muted = true; video.loop = true; video.playsInline = true; video.src = URL.createObjectURL(files.video);
      await new Promise<void>((res) => { video!.onloadeddata = () => res(); video!.onerror = () => res(); setTimeout(res, 15000); });
      if (!video.videoWidth) return null;
      w = video.videoWidth; h = video.videoHeight;
      video.play().catch(() => {});
    } else if (files.color) {
      source = await createImageBitmap(files.color);
      w = source.width; h = source.height;
    } else return null;
    if (this.wanted !== key) { video?.pause(); return null; }
    const k = Math.min(1, MAX / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
    const tex = this.gpu.imageTexture(tw, th);
    const canvas = new OffscreenCanvas(tw, th);
    if (source) { canvas.getContext('2d')!.drawImage(source, 0, 0, tw, th); this.gpu.queue.copyExternalImageToTexture({ source: canvas }, { texture: tex }, [tw, th]); }
    return { tex, canvas, video, aspect: w / h };
  }
  protected accept(v: BackgroundData) {
    this.video?.pause();
    this.texture.destroy();
    this.texture = v.tex; this.canvas = v.canvas; this.video = v.video; this.aspect = v.aspect;
    if (v.video) this.refresh(false);
  }
  protected discard(v: BackgroundData) { v.video?.pause(); v.tex.destroy(); }

  /** copy a background video's current frame */
  refresh(playing: boolean) {
    const v = this.video, cv = this.canvas;
    if (!v) return;
    if (playing && v.paused) v.play().catch(() => {});
    if (!cv || v.readyState < 2) return;
    cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height);
    this.gpu.queue.copyExternalImageToTexture({ source: cv }, { texture: this.texture }, [cv.width, cv.height]);
  }
  seek(t: number) { return this.video ? seekVideo({ video: this.video } as TexSet, t) : Promise.resolve(); }
  /** the image ready to show is the one this key asks for */
  shows(key: string) { return this.loaded === key; }
}

/**
 * Outlines for shape particles: up to SHAPE_SLOTS drawings (built-in names or 'user:<id>' SVGs) packed in one
 * storage buffer: a table of (first point, point count) per slot, then the points.
 */
export class ShapeLibrary extends LatestLoader<{ table: Float32Array; points: Float32Array }> {
  protected readonly label = 'shape';
  readonly buffer: GPUBuffer;
  constructor(private gpu: Gpu, private files: () => UserFiles | null) {
    super();
    this.buffer = gpu.storage((SHAPE_SLOTS + MAX_SHAPE_POINTS) * 16);
  }
  /** load these shapes (one per slot) */
  use(keys: string[]) { this.request(keys.join('|')); }

  protected async load(sig: string) {
    const keys = sig.split('|');
    const lists: (Float32Array | null)[] = [];
    for (const key of keys) {
      let text: string | null = null;
      try {
        if (key.startsWith('user:')) {
          const userFiles = this.files();
          const f = userFiles ? await userFiles(key.slice(5)) : null;
          if (f?.color) text = await f.color.text();
        } else {
          const r = await fetch(`${import.meta.env?.BASE_URL ?? '/'}shapes/${key}.svg`);
          if (r.ok) text = await r.text();
        }
      } catch { text = null; }
      const pts = text ? svgToPoints(text, Math.floor(MAX_SHAPE_POINTS / Math.max(1, keys.length))) : null;
      if (text && !pts) console.warn('[shape] no outline found in', key);
      lists.push(pts);
    }
    // table: per slot (first point, point count); points follow, with their outline starts made absolute
    const table = new Float32Array(SHAPE_SLOTS * 4);
    const all: number[] = [];
    lists.forEach((pts, i) => {
      if (!pts || i >= SHAPE_SLOTS) return;
      const first = SHAPE_SLOTS + all.length / 4;
      table[i * 4] = first; table[i * 4 + 1] = pts.length / 4;
      for (let k = 0; k < pts.length; k += 4) all.push(pts[k], pts[k + 1], pts[k + 2] + first, pts[k + 3]);
    });
    return { table, points: new Float32Array(all) };
  }
  protected accept(v: { table: Float32Array; points: Float32Array }) {
    this.gpu.write(this.buffer, v.table);
    if (v.points.length) this.gpu.write(this.buffer, v.points, SHAPE_SLOTS * 16);
  }
  protected discard() {}
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** note names, sharp spellings in cells 0-11 and flat spellings in 12-23 (64 px cells, 6 x 4) */
export function noteNameAtlas(gpu: Gpu): GPUTexture {
  const C = 64, W = C * 6, H = C * 4;
  const tex = gpu.imageTexture(W, H);
  try {
    const cv = new OffscreenCanvas(W, H);
    const g = cv.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...SHARP_NAMES, ...FLAT_NAMES].forEach((name, i) => {
      g.font = `600 ${name.length > 1 ? 34 : 40}px "Segoe UI", "Segoe UI Symbol", "DejaVu Sans", sans-serif`;
      g.fillText(name, (i % 6) * C + C / 2, Math.floor(i / 6) * C + C / 2 + 2);
    });
    gpu.queue.copyExternalImageToTexture({ source: cv }, { texture: tex }, [W, H]);
  } catch (e) { console.warn('[labels]', e); }
  return tex;
}

/** The opening title and end card: drawn with a 2D canvas each frame they show, as a texture laid over the frame. */
export class TitleCards {
  brand: Brand = DEFAULT_BRAND;
  /** called when the logo has loaded, so a paused preview can redraw */
  onReady: (() => void) | null = null;
  /** a transparent 1×1 texture for frames without a card */
  readonly blank: GPUTexture;
  private logo: HTMLImageElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private tex: GPUTexture | null = null;

  constructor(private gpu: Gpu) {
    this.blank = gpu.texture(1, 1, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    gpu.queue.writeTexture({ texture: this.blank }, new Uint8Array([0, 0, 0, 0]), { bytesPerRow: 4 }, [1, 1]);
  }

  setBrand(b: Brand | null) {
    const nb = b ?? DEFAULT_BRAND;
    if (nb.logo !== this.brand.logo || (nb.logo && !this.logo)) {
      this.logo = null;
      if (nb.logo) {
        const img = new Image();
        img.onload = () => { if (this.brand.logo === nb.logo) { this.logo = img; this.onReady?.(); } };
        img.src = nb.logo;
      }
    }
    this.brand = nb;
  }

  /** this moment's cards at the render size (keysAt: where the keys are, as a share of the frame's height) */
  layer(t: number, w: number, h: number, titles: Titles, span: [number, number], projectName: string, keysAt: number): GPUTexture {
    if (!titles.intro.on && !titles.outro.on) return this.blank;
    const cv = (this.canvas ??= document.createElement('canvas'));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    if (!drawTitles(cv.getContext('2d')!, w, h, t, span, titles, this.brand, this.logo, projectName, keysAt)) return this.blank;
    if (!this.tex || this.tex.width !== w || this.tex.height !== h) {
      this.tex?.destroy();
      this.tex = this.gpu.imageTexture(w, h);
    }
    this.gpu.queue.copyExternalImageToTexture({ source: cv }, { texture: this.tex, premultipliedAlpha: true }, [w, h]);
    return this.tex;
  }
}
