// Draws each simulated particle as a tiny glitter point with a soft glow; a few flash a star glint.
struct Particle { pos: vec2f, b: f32, star: f32, col: vec4f };
@group(1) @binding(0) var<storage, read> parts: array<Particle>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) col: vec4f,   // rgb, brightness
  @location(2) @interpolate(flat) star: f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let P = parts[ii];
  if (P.b < 0.01) { o.pos = OFFSCREEN; return o; }
  let isStar = P.star > 0.5 && P.b > 0.35;
  var half = max(9.0, 4.0 / F.scale);
  if (isStar) { half = 24.0; }
  let c = corner(vi) * 2.0 - vec2f(1.0);
  let p = P.pos + c * half;
  o.pos = toClip(p);
  o.local = c * half;
  o.col = vec4f(P.col.rgb, P.b);
  o.star = select(0.0, 1.0, isStar);
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  let rr = dot(i.local, i.local);
  let sig = max(0.75, 0.6 / F.scale);
  let norm = sq(0.75 / sig);
  var g = (0.962 * norm * exp(-rr / (2.0 * sig * sig)) + 0.072 * exp(-rr / 13.52)) * 1.3;
  var rgb = i.col.rgb * i.col.a * g;
  if (i.star > 0.5) {
    let x = i.local.x;
    let y = i.local.y;
    let L = 7.65;
    let wd = max(0.8, 0.7 / F.scale);
    let u = (x + y) * 0.7071;
    let v = (x - y) * 0.7071;
    let s = exp(-rr / (2.0 * 1.02 * 1.02)) + 0.28 * exp(-rr / (2.0 * 3.06 * 3.06))
          + 0.7 * (exp(-abs(x) / L) * exp(-sq(y / wd)) + exp(-abs(y) / L) * exp(-sq(x / wd)))
          + 0.25 * (exp(-abs(u) / (L * 0.5)) * exp(-sq(v / wd)) + exp(-abs(v) / (L * 0.5)) * exp(-sq(u / wd)));
    rgb += i.col.rgb * i.col.a * 0.9 * s;
  }
  return vec4f(rgb, 0.0);
}
