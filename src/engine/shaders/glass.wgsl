// Glass note bars: rounded rectangle with rim, bevel facets, inner edge line, faint body, sheen, corner glint.
// Output rgb = additive light, a = how much the glass darkens the footage behind it.
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) dims: vec4f,  // width, length, light gain, absorb gain
  @location(2) @interpolate(flat) col: vec3f,
  @location(3) along: f32,                      // distance above the landing point, along the fall direction
};

// Notes travel along a fall direction: U points from the landing point back toward where notes come from.
@vertex
fn vs(@builtin(vertex_index) vi: u32,
      @location(0) a0: vec4f,   // landing x, landing y, bottom (distance along U), top (distance along U)
      @location(1) a1: vec4f,   // width, gain, absorb gain, U.x
      @location(2) a2: vec4f) -> VOut {  // colour, U.y
  let w = a1.x;
  let pad = 1.3 * w;
  let U = vec2f(a1.w, a2.w);
  let N = vec2f(-U.y, U.x);
  let c = corner(vi);
  let x = mix(-w * 0.5 - pad, w * 0.5 + pad, c.x);
  let s0 = max(a0.z - pad, 0.0);           // never below the saber
  let s = mix(a0.w + pad, s0, c.y);
  let p = a0.xy + U * s + N * x;
  var o: VOut;
  o.pos = toClip(p);
  o.local = vec2f(x, (a0.z + a0.w) * 0.5 - s);
  o.dims = vec4f(w, a0.w - a0.z, a1.y, a1.z);
  o.col = a2.xyz;
  o.along = s;
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  if (i.along < 0.0) { discard; }
  let w = i.dims.x;
  let L = max(i.dims.y, w);
  let px = i.local.x;
  let py = i.local.y;
  let bx = w * 0.5;
  let by = L * 0.5;
  let r = w * 0.26;
  let qx = abs(px) - (bx - r);
  let qy = abs(py) - (by - r);
  let d = length(max(vec2f(qx, qy), vec2f(0.0))) + min(max(qx, qy), 0.0) - r;
  var g: vec2f;
  if (qx > 0.0 && qy > 0.0) { g = normalize(vec2f(qx, qy)) * vec2f(sign(px), sign(py)); }
  else if (qx > qy) { g = vec2f(sign(px), 0.0); }
  else { g = vec2f(0.0, sign(py)); }

  let inside = 1.0 / (1.0 + exp(clamp(d / 0.7, -50.0, 50.0)));
  let rimT = max(1.7, w * 0.085);
  let rim = exp(-sq((d + rimT * 0.55) / (rimT * 0.6)));
  let inset = max(4.0, w * 0.22);
  let rim2 = exp(-sq((d + inset) / 0.85));
  let band = inside / (1.0 + exp(clamp(-(d + inset) / 0.8, -50.0, 50.0)));
  let fl = -(g.x * 0.55 + g.y * 0.85);                  // facets lit from the upper left
  let bevel = band * (0.38 + 0.9 * pow(clamp(fl, 0.0, 1.0), 1.3));
  let rimLit = 0.55 + 0.45 * clamp(fl + 0.35, 0.0, 1.0);
  let vgrad = clamp(0.5 + py / (2.0 * by), 0.0, 1.0);    // glass catches key light from below
  let body = inside * (0.05 + 0.10 * vgrad) * (1.0 - band);
  let sheen = inside * (1.0 - band) * exp(-sq((px * 0.8 + py * 0.25 + bx * 0.15) / (w * 0.12))) * 0.22;
  let dout = max(d, 0.0);
  var halo = exp(-dout / (w * 0.22)) * 0.30 + exp(-dout / (w * 0.9)) * 0.07;
  if (d <= 0.0) { halo = 0.0; }
  let gx = px + bx - r * 0.75;
  let gy = py + by - r * 0.75;
  let glint = exp(-(gx * gx + gy * gy) / sq(rimT * 1.3));
  let col = i.col;
  let rgb = rim * lighten(col, 0.6) * 1.15 * rimLit
          + rim2 * lighten(col, 0.35) * 0.55
          + bevel * lighten(col, 0.3) * 0.75
          + body * col
          + sheen * lighten(col, 0.5)
          + halo * col
          + vec3f(glint * 0.9);
  return vec4f(rgb * i.dims.z, inside * 0.42 * i.dims.w);
}
