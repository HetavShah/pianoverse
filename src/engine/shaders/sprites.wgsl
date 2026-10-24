// Impact sprites: kind 0 = round bloom dot, kind 1 = anamorphic streak along the keyboard.
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) a0: vec4f,
  @location(2) @interpolate(flat) a1: vec4f,
  @location(3) @interpolate(flat) col: vec3f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32,
      @location(0) a0: vec4f,   // cx, cy, radius, kind
      @location(1) a1: vec4f,   // dir x, dir y, streak length, streak thickness
      @location(2) a2: vec4f) -> VOut {
  var half = a0.z * 5.0;
  if (a0.w > 0.5) { half = a1.z * 3.0; }
  let c = corner(vi) * 2.0 - vec2f(1.0);
  let p = a0.xy + c * half;
  var o: VOut;
  o.pos = toClip(p);
  o.local = p - a0.xy;
  o.a0 = a0;
  o.a1 = a1;
  o.col = a2.xyz;
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  var g = 0.0;
  if (i.a0.w < 0.5) {
    let r = i.a0.z;
    let rr = dot(i.local, i.local);
    g = exp(-rr / (2.0 * sq(max(0.6 * r, 0.7 / F.scale)))) + 0.28 * exp(-rr / (2.0 * sq(1.8 * r)));
  } else {
    let d = normalize(i.a1.xy);
    let a = dot(i.local, d);
    let b = dot(i.local, vec2f(-d.y, d.x));
    g = exp(-abs(a) / i.a1.z) * exp(-sq(b / max(i.a1.w, 0.7 / F.scale)));
  }
  return vec4f(i.col * g, 0.0);
}
