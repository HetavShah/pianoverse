// Shared by every pass. Geometry is in video pixels (the space keyboard tracking was measured in).
// The camera shows the part of the video in `view` (x, y, width, height in video pixels) on the whole frame.
struct Frame {
  srcSize: vec2f,
  rtSize: vec2f,
  scale: f32,   // render-target pixels per video pixel (bigger when the camera zooms in)
  time: f32,
  bass: f32,
  grain: f32,
  // look (see look.ts; 1 = the original approved look)
  noteBright: f32, noteGlow: f32, noteFill: f32, noteRim: f32,
  noteRound: f32, noteStyle: f32, noteShape: f32, noteDepth: f32,
  saberBright: f32, saberThick: f32, saberFlicker: f32, saberReact: f32,
  saberTint: f32, noteOpacity: f32, saberIdle: f32, lpad5: f32,  // saberIdle: glow of the line where nothing is played
  saberBase: vec4f,
  partSize: f32, partHaze: f32, lpad6: f32, lpad7: f32,
  bloom: f32, fringe: f32, grainAmt: f32, darken: f32,
  contrast: f32, saturation: f32, vignette: f32, relight: f32,
  bassPulse: f32, fade: f32, fadeWhite: f32, lpad10: f32,
  view: vec4f,
};
@group(0) @binding(0) var<uniform> F: Frame;

fn toClip(p: vec2f) -> vec4f {
  let n = (p - F.view.xy) / F.view.zw;
  return vec4f(n.x * 2.0 - 1.0, 1.0 - n.y * 2.0, 0.0, 1.0);
}
fn lighten(c: vec3f, k: f32) -> vec3f { return c + (vec3f(1.0) - c) * k; }
fn sq(x: f32) -> f32 { return x * x; }
// triangle-strip corners (0,0) (1,0) (0,1) (1,1)
fn corner(vi: u32) -> vec2f { return vec2f(f32(vi & 1u), f32(vi >> 1u)); }
const OFFSCREEN = vec4f(4.0, 4.0, 0.0, 1.0);
