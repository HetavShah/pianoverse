// Note labels: note names from a glyph atlas (6 x 4 cells), drawn as light on top of the notes.
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) col: vec4f,
};
@group(1) @binding(0) var atlas: texture_2d<f32>;
@group(1) @binding(1) var atlasSamp: sampler;

@vertex
fn vs(@builtin(vertex_index) vi: u32,
      @location(0) a0: vec4f,   // centre x, centre y, half size, atlas cell
      @location(1) a1: vec4f,   // up x, up y (the note's fall direction), unused, unused
      @location(2) a2: vec4f) -> VOut {  // colour, opacity
  let c = corner(vi) * 2.0 - vec2f(1.0);
  // text stays upright on screen even when notes fall at an angle
  let p = a0.xy + vec2f(c.x, c.y) * a0.z;
  var o: VOut;
  o.pos = toClip(p);
  let cell = u32(a0.w + 0.5);
  let cx = f32(cell % 6u);
  let cy = f32(cell / 6u);
  o.uv = (vec2f(cx, cy) + corner(vi)) / vec2f(6.0, 4.0);
  o.col = a2;
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  let a = textureSample(atlas, atlasSamp, i.uv).r;
  return vec4f(i.col.rgb * a * i.col.a, 0.0);
}
