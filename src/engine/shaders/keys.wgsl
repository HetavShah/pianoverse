// Key glow: each lit key drawn as its projected quad with feathered edges.
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
};

@vertex
fn vs(@location(0) p: vec2f, @location(1) uv: vec2f, @location(2) col: vec3f) -> VOut {
  var o: VOut;
  o.pos = toClip(p);
  o.uv = uv;
  o.col = col;
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  let e = smoothstep(0.0, 0.12, min(i.uv.x, 1.0 - i.uv.x)) * smoothstep(0.0, 0.06, min(i.uv.y, 1.0 - i.uv.y));
  return vec4f(i.col * e * 0.85, 0.0);
}
