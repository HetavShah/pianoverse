// Shared by every pass. Geometry is in video pixels (the space keyboard tracking was measured in).
struct Frame {
  srcSize: vec2f,
  rtSize: vec2f,
  scale: f32,   // render-target pixels per video pixel
  time: f32,
  bass: f32,
  grain: f32,
};
@group(0) @binding(0) var<uniform> F: Frame;

fn toClip(p: vec2f) -> vec4f {
  let n = p / F.srcSize;
  return vec4f(n.x * 2.0 - 1.0, 1.0 - n.y * 2.0, 0.0, 1.0);
}
fn lighten(c: vec3f, k: f32) -> vec3f { return c + (vec3f(1.0) - c) * k; }
fn sq(x: f32) -> f32 { return x * x; }
// triangle-strip corners (0,0) (1,0) (0,1) (1,1)
fn corner(vi: u32) -> vec2f { return vec2f(f32(vi & 1u), f32(vi >> 1u)); }
const OFFSCREEN = vec4f(4.0, 4.0, 0.0, 1.0);
