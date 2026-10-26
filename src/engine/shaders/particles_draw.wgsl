// Draws each simulated particle as a tiny glitter point with a soft glow; a few flash a star glint.
struct Particle { pos: vec2f, vel: vec2f, b: f32, star: f32, z: f32, pad: f32, col: vec4f };
@group(1) @binding(0) var<storage, read> parts: array<Particle>;
struct DrawP { rays: f32, rayLen: f32, opacity: f32, alphaF: f32, additive: f32, bright: f32, turbZ: f32, pad: f32 };
@group(1) @binding(1) var<uniform> DP: DrawP;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) col: vec4f,   // rgb, brightness
  @location(2) @interpolate(flat) star: f32,
  @location(3) @interpolate(flat) ray: vec4f,   // streak: direction, half length, size scale
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let P = parts[ii];
  if (P.b < 0.01) { o.pos = OFFSCREEN; return o; }
  let c0 = corner(vi) * 2.0 - vec2f(1.0);
  if (P.pad > 1.5) {
    // a soft glow (radius in z)
    let gh = P.z * 2.6;
    o.pos = toClip(P.pos + c0 * gh);
    o.local = c0 * gh;
    o.ray = vec4f(2.0, 0.0, P.z, 1.0);
    o.col = vec4f(P.col.rgb, P.b);
    o.star = 0.0;
    return o;
  }
  let isStar = P.star > 0.5 && P.b > 0.35;
  var half = max(9.0, 4.0 / F.scale) * max(F.partSize, sqrt(F.partSize * max(F.partHaze, 1.0)));
  if (isStar) { half = 24.0 * F.partSize; }
  let zs = max(0.2, 1.0 + 0.5 * P.z);
  half *= zs;
  let c = corner(vi) * 2.0 - vec2f(1.0);
  var p = P.pos + c * half;
  o.local = c * half;
  o.ray = vec4f(0.0, 0.0, 0.0, zs);
  let sp = length(P.vel);
  let spark = P.pad > 0.5;
  if ((DP.rays > 0.5 || spark) && sp > 1.0 && !isStar) {
    // a short streak along the particle's motion (sparks always have one)
    let dir = P.vel / sp;
    let len = max(half, sp * select(0.045 * DP.rayLen, 0.035, spark) * F.partSize);
    let nrm = vec2f(-dir.y, dir.x);
    p = P.pos + dir * (c.x * (len + half)) + nrm * (c.y * half);
    o.local = vec2f(c.x * (len + half), c.y * half);
    o.ray = vec4f(1.0, 0.0, len, zs);
  }
  o.pos = toClip(p);
  o.col = vec4f(P.col.rgb, P.b);
  o.star = select(0.0, 1.0, isStar);
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  var lp = i.local;
  if (i.ray.x > 1.5) {
    let R = i.ray.z;
    let gl = exp(-dot(lp, lp) / (2.0 * R * R));
    let rgbG = i.col.rgb * i.col.a * gl * 0.5 * F.partHaze;
    return vec4f(rgbG * DP.additive * DP.bright * DP.opacity, 0.0);
  }
  if (i.ray.x > 0.5) { lp.x = max(abs(lp.x) - i.ray.z, 0.0); }    // streak: a line with round ends
  let rr = dot(lp, lp);
  let sig = max(0.75, 0.6 / F.scale) * F.partSize * i.ray.w;
  let norm = sq(0.75 / sig);
  var g = (0.962 * norm * exp(-rr / (2.0 * sig * sig)) + 0.072 * F.partHaze * exp(-rr / (13.52 * F.partSize * F.partSize))) * 1.3;
  var rgb = i.col.rgb * i.col.a * g;
  if (i.star > 0.5) {
    let x = i.local.x;
    let y = i.local.y;
    let L = 7.65 * F.partSize;
    let wd = max(0.8, 0.7 / F.scale) * F.partSize;
    let u = (x + y) * 0.7071;
    let v = (x - y) * 0.7071;
    let ps2 = F.partSize * F.partSize;
    let s = exp(-rr / (2.0 * 1.02 * 1.02 * ps2)) + 0.28 * exp(-rr / (2.0 * 3.06 * 3.06 * ps2))
          + 0.7 * (exp(-abs(x) / L) * exp(-sq(y / wd)) + exp(-abs(y) / L) * exp(-sq(x / wd)))
          + 0.25 * (exp(-abs(u) / (L * 0.5)) * exp(-sq(v / wd)) + exp(-abs(v) / (L * 0.5)) * exp(-sq(u / wd)));
    rgb += i.col.rgb * i.col.a * 0.9 * s;
  }
  let lum = dot(rgb, vec3f(0.333));
  return vec4f(rgb * DP.additive * DP.bright * DP.opacity, min(lum, 1.0) * DP.alphaF * DP.opacity);
}
