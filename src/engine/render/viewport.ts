// What part of the video the frame shows, and at what size it is drawn.
//
// The frame is the whole video (or its crop from the Import step) unless an output size is set, in which case the
// frame has that shape and shows a window of the video: the camera's window when one is set, otherwise the biggest
// window of that shape in the middle. The render target is the frame's size times `scale` (preview quality).
import type { Rect } from '../project';

/** a window onto the video, in video pixels */
export interface View { x: number; y: number; w: number; h: number }

export class Viewport {
  /** the video's size, in video pixels */
  srcW = 1080;
  srcH = 1920;
  /** the part of the frame in use (Import step crop), or null for all of it */
  crop: Rect | null = null;
  /** output size in pixels (camera or export shape), or null for the video's own size */
  outSize: [number, number] | null = null;
  /** the camera's window, or null */
  view: View | null = null;
  /** dip to black or white: [amount 0..1, white 0/1] */
  fade: [number, number] = [0, 0];
  /** render-target pixels per frame pixel */
  scale = 0.5;

  /** the frame's size before scaling */
  get frameW() { return this.outSize ? this.outSize[0] : Math.round(this.crop?.w ?? this.srcW); }
  get frameH() { return this.outSize ? this.outSize[1] : Math.round(this.crop?.h ?? this.srcH); }
  /** the render target's size */
  get rtW() { return Math.max(2, Math.round(this.frameW * this.scale)); }
  get rtH() { return Math.max(2, Math.round(this.frameH * this.scale)); }

  /** the window used this frame: the camera's, or the whole video (covering the frame if its shape differs) */
  window(): View {
    if (this.view) return this.view;
    const R = this.crop ?? { x: 0, y: 0, w: this.srcW, h: this.srcH };
    if (!this.outSize) return R;
    const a = this.outSize[0] / this.outSize[1];
    const w = Math.min(R.w, R.h * a), h = w / a;
    return { x: R.x + (R.w - w) / 2, y: R.y + (R.h - h) / 2, w, h };
  }

  /** set the output size; true when the frame's size changed */
  setOutput(size: [number, number] | null): boolean {
    const same = (this.outSize?.[0] ?? -1) === (size?.[0] ?? -1) && (this.outSize?.[1] ?? -1) === (size?.[1] ?? -1);
    this.outSize = size ? [Math.max(2, Math.round(size[0])), Math.max(2, Math.round(size[1]))] : null;
    return !same;
  }
}
