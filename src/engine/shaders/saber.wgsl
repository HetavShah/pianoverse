// Light saber along the measured back edge of the keys, with a flickering plasma fringe that flares where you play.
struct Saber {
  A: vec2f,        // line start (video px), plane x = -0.2
  B: vec2f,        // line end, plane x = 36.2
  box: vec4f,      // x0, y0, x1, y1 bounds to draw
  bass: f32,
  time: f32,
  keys: f32,       // white keys on the keyboard
  pad: f32,
};
@group(1) @binding(0) var<uniform> S: Saber;
@group(1) @binding(1) var<storage, read> smap: array<vec2f>;  // 64 samples along the line: plane x, px per key
@group(1) @binding(2) var<storage, read> heat: array<vec4f>;  // per key: colour-weighted sum (xyz), heat (w)

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let c = corner(vi);
  return toClip(vec2f(mix(S.box.x, S.box.z, c.x), mix(S.box.y, S.box.w, c.y)));
}

fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), u.x),
             mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn fbm(p: vec2f) -> f32 {
  var a = 0.5;
  var s = 0.0;
  var q = p;
  for (var k = 0; k < 4; k++) {
    s += a * vnoise(q);
    q = q * 2.03 + vec2f(17.1, 9.2);
    a *= 0.5;
  }
  return clamp((s / 0.9375 - 0.22) / 0.56, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  let src = fp.xy / F.scale;
  let s = (src.x - S.A.x) / (S.B.x - S.A.x);
  if (s < 0.0 || s > 1.0) { discard; }
  let fi = s * 63.0;
  let i0 = u32(floor(fi));
  let i1 = min(i0 + 1u, 63u);
  let m = mix(smap[i0], smap[i1], fract(fi));
  let pcol = m.x;
  let sc = m.y / 30.0;
  let endf = clamp((pcol + 0.2) / 0.6, 0.0, 1.0) * clamp((S.keys + 0.2 - pcol) / 0.6, 0.0, 1.0);

  let hx = clamp(pcol - 0.5, 0.0, 39.0);
  let h0 = u32(floor(hx));
  let h1 = min(h0 + 1u, 39u);
  let hv = mix(heat[h0], heat[h1], fract(hx));
  let hk = min(hv.w, 2.5);
  var hc = vec3f(150.0, 255.0, 222.0) / 255.0;
  if (hv.w > 0.05) { hc = hv.xyz / hv.w; }
  let base = vec3f(140.0, 245.0, 225.0) / 255.0;
  let colc = mix(base, lighten(hc, 0.25), clamp(hk, 0.0, 1.0));

  let t = S.time;
  let swell = (0.55 + 0.45 * sin(pcol * 1.1 + t * 1.9)) * (0.6 + 0.4 * sin(pcol * 0.37 - t * 1.2 + 1.3));
  let h = (7.0 + 9.0 * swell + 26.0 * sqrt(hk)) * sc;
  let I = (0.6 + 0.25 * S.bass + 0.9 * hk) * endf;

  let vline = S.A.y + (S.B.y - S.A.y) * s;
  let dy = vline - src.y;            // > 0 above the line
  let above = max(dy, 0.0);

  let warp = 7.0 * sin(src.y * 0.035 + t * 2.3) + 5.0 * sin(src.y * 0.081 - t * 3.1 + src.x * 0.013);
  let n1 = fbm(vec2f((src.x * 2.2 + warp) / 60.0, (src.y * 1.8 + t * 160.0) / 192.0));
  let n2 = fbm(vec2f((src.x * 3.5 - warp * 1.4) / 60.0 + 31.7, (src.y * 2.6 + t * 260.0) / 192.0 + 11.3));
  let turb = n1 * 0.65 + n2 * 0.35;

  var plume = 0.0;
  var haze = 0.0;
  if (dy > -1.5) {
    plume = exp(-above / h) * pow(max((turb - 0.30 * pow(above / h, 0.7)) * 1.9, 0.0), 1.6);
    haze = exp(-above / (h * 0.45));
  }
  let coreW = max(1.15, 0.9 / F.scale);
  let core = exp(-sq(dy / coreW));
  let inner = exp(-sq(dy / max(3.2, 1.2 / F.scale)));
  let outer = exp(-abs(dy) / 9.0);

  let rgb = (vec3f(core * 1.25)
           + inner * lighten(colc, 0.55) * 0.75
           + outer * colc * 0.22
           + haze * colc * 0.30
           + plume * lighten(colc, 0.4)) * I;
  return vec4f(rgb, 0.0);
}
