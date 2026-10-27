// Key glow: each lit key drawn as its projected quad with feathered edges. The light only falls on the key itself:
// a white key where the picture is bright, a black key where it is dark, so a hand over the key stays in front.
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
  @location(2) @interpolate(flat) black: f32,
};
@group(1) @binding(0) var ksamp: sampler;
@group(1) @binding(1) var kvideo: texture_2d<f32>;

@vertex
fn vs(@location(0) p: vec2f, @location(1) uv: vec2f, @location(2) col: vec3f, @location(3) black: f32) -> VOut {
  var o: VOut;
  o.pos = toClip(p);
  o.uv = uv;
  o.col = col;
  o.black = black;
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  let e = smoothstep(0.0, 0.12, min(i.uv.x, 1.0 - i.uv.x)) * smoothstep(0.0, 0.06, min(i.uv.y, 1.0 - i.uv.y));
  let src = F.view.xy + i.pos.xy / F.scale;
  let v = textureSampleLevel(kvideo, ksamp, src / F.srcSize, 0.0).rgb;
  let luma = dot(v, vec3f(0.2126, 0.7152, 0.0722));
  // white keys are the brightest thing there; black keys the darkest; skin sits in between
  var onKey = select(smoothstep(0.5, 0.6, luma), 1.0 - smoothstep(0.1, 0.26, luma), i.black > 0.5);
  if (i.black > 1.5) { onKey = 1.0; }            // bar lines float above the keys
  return vec4f(i.col * e * 0.85 * onKey, 0.0);
}
