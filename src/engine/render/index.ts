// The rendering engine's public face: everything the app needs to draw frames. See Renderer.ts for how a frame
// is made, and ARCHITECTURE.md for the whole picture.
export { Renderer } from './Renderer';
export type { FrameSource, FrameStats } from './Renderer';
export { DEFAULT_LAYERS } from './scene';
export type { Layers } from './scene';
export type { View } from './viewport';
