// Fullscreen passes: downsample, separable blur, final composite.
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vsFull(@builtin(vertex_index) vi: u32) -> VOut {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: VOut;
  o.pos = vec4f(p * 2.0 - vec2f(1.0), 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}

struct Post { texel: vec2f, dir: vec2f, sigma: f32, factor: f32, clampIn: f32, nLights: f32 };
@group(1) @binding(0) var<uniform> PO: Post;
@group(1) @binding(1) var samp: sampler;
@group(1) @binding(2) var srcTex: texture_2d<f32>;

// box downsample by an integer factor (input texel size in PO.texel)
@fragment
fn fsDown(i: VOut) -> @location(0) vec4f {
  let n = i32(PO.factor);
  var acc = vec3f(0.0);
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      let off = (vec2f(f32(x), f32(y)) - vec2f(f32(n - 1) * 0.5)) * PO.texel;
      var c = textureSampleLevel(srcTex, samp, i.uv + off, 0.0).rgb;
      if (PO.clampIn > 0.5) { c = min(c, vec3f(1.0)); }
      acc += c;
    }
  }
  return vec4f(acc / f32(n * n), 1.0);
}

@fragment
fn fsBlur(i: VOut) -> @location(0) vec4f {
  let r = i32(ceil(PO.sigma * 3.0));
  var acc = vec3f(0.0);
  var wsum = 0.0;
  for (var k = -r; k <= r; k++) {
    let w = exp(-f32(k * k) / (2.0 * PO.sigma * PO.sigma));
    acc += textureSampleLevel(srcTex, samp, i.uv + PO.dir * PO.texel * f32(k), 0.0).rgb * w;
    wsum += w;
  }
  return vec4f(acc / wsum, 1.0);
}

@group(1) @binding(3) var lightTex: texture_2d<f32>;
@group(1) @binding(4) var bloom1: texture_2d<f32>;
@group(1) @binding(5) var bloom2: texture_2d<f32>;
@group(1) @binding(6) var<storage, read> lights: array<vec4f>;   // pairs: (x, y, radius, strength), (r, g, b, -)

fn hashU(p: vec2u, s: u32) -> f32 {
  var h = p.x * 1973u + p.y * 9277u + s * 26699u;
  h = (h ^ (h >> 15u)) * 2246822519u;
  h = (h ^ (h >> 13u)) * 3266489917u;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967296.0;
}

@group(1) @binding(7) var bgTex: texture_2d<f32>;
struct BG {
  fScale: f32, fX: f32, fY: f32, fRot: f32,
  fOpacity: f32, cropT: f32, cropB: f32, cropL: f32,
  cropR: f32, fBright: f32, fHue: f32, colorOn: f32,
  colR: f32, colG: f32, colB: f32, imgOn: f32,
  iOpacity: f32, iScale: f32, iX: f32, iY: f32,
  iRot: f32, iBright: f32, iContrast: f32, iHue: f32,
  iSat: f32, iAspect: f32, xform: f32, on: f32,
  alphaOut: f32, q1: f32, q2: f32, q3: f32,
};
@group(1) @binding(8) var<uniform> BGU: BG;
@group(1) @binding(9) var cardTex: texture_2d<f32>;   // opening title / end card, premultiplied

// the video's own lighting (Light step, see lighting.ts)
struct LT {
  on: f32, exposure: f32, contrast: f32, highlights: f32,
  shadows: f32, warmth: f32, saturation: f32, room: f32,
  reach: f32, softness: f32, vignette: f32, whiteKeys: f32,
  h0: f32, h1: f32, h2: f32, h3: f32, h4: f32, h5: f32, h6: f32, h7: f32, h8: f32,   // video pixels -> keyboard plane
  fx0: f32, fk: f32, fsh: f32,                                                         // the key fit (project.ts KeyFit)
  tracked: f32, q1: f32, q2: f32, q3: f32, q4: f32, q5: f32, q6: f32, q7: f32,
};
@group(1) @binding(10) var<uniform> LTU: LT;

fn lightVideo(c0: vec3f, srcPx: vec2f, fuv: vec2f) -> vec3f {
  let W3 = vec3f(0.2126, 0.7152, 0.0722);
  var x = c0 * exp2(LTU.exposure);
  // shadows: lift or deepen the dark end; highlights: lift or pull down the bright end
  let dk = 1.0 - smoothstep(0.0, 0.5, dot(x, W3));
  if (LTU.shadows > 0.0) { x = x + LTU.shadows * 0.35 * dk * max(vec3f(1.0) - x, vec3f(0.0)); } else { x = x * (1.0 + LTU.shadows * 0.6 * dk); }
  let br = smoothstep(0.5, 1.0, dot(x, W3));
  if (LTU.highlights < 0.0) { x = x * (1.0 + LTU.highlights * 0.5 * br); } else { x = x + LTU.highlights * 0.3 * br * max(vec3f(1.0) - x, vec3f(0.0)); }
  x = clamp((x - vec3f(0.5)) * LTU.contrast + vec3f(0.5), vec3f(0.0), vec3f(1.0));
  x = x * vec3f(1.0 + 0.12 * LTU.warmth, 1.0, 1.0 - 0.12 * LTU.warmth);
  let l = dot(x, W3);
  x = max(vec3f(l) + (x - vec3f(l)) * LTU.saturation, vec3f(0.0));
  // the room: darker away from the keyboard (measured on the keyboard's plane, in white keys)
  if (LTU.room < 0.999 && LTU.tracked > 0.5) {
    let q = vec3f(LTU.h0 * srcPx.x + LTU.h1 * srcPx.y + LTU.h2, LTU.h3 * srcPx.x + LTU.h4 * srcPx.y + LTU.h5, LTU.h6 * srcPx.x + LTU.h7 * srcPx.y + LTU.h8);
    var m = 0.0;
    if (q.z > 1e-9) {
      let X = q.x / q.z;
      let Y = q.y / q.z;
      let xs = (X - LTU.fx0 - LTU.fsh * Y) / (1.0 + LTU.fk);
      let half = vec2f(LTU.whiteKeys * 0.5 + 0.5, 0.9);
      let dd = length(max(abs(vec2f(xs - LTU.whiteKeys * 0.5, Y - 0.6)) - half, vec2f(0.0)));
      m = 1.0 - smoothstep(0.5 * LTU.reach, (0.5 + 4.0 * LTU.softness) * LTU.reach + 0.5, dd);
    }
    x = x * (LTU.room + (1.0 - LTU.room) * m);
  }
  if (LTU.vignette > 0.0) {
    let u = fuv - vec2f(0.5);
    x = x * clamp(1.0 - LTU.vignette * (u.x * u.x * 1.6 + u.y * u.y * 1.2), 0.0, 1.0);
  }
  return x;
}

fn hueRot(c: vec3f, a: f32) -> vec3f {
  let k = vec3f(0.57735);
  let ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

// the background behind the video: a colour and/or an image (covering the frame, then moved / scaled / turned)
fn background(uv0: vec2f) -> vec3f {
  var bg = vec3f(0.0);
  if (BGU.colorOn > 0.5) { bg = vec3f(BGU.colR, BGU.colG, BGU.colB); }
  if (BGU.imgOn > 0.5) {
    let ar = F.rtSize.x / F.rtSize.y;   // the frame's shape
    var q = uv0 - vec2f(0.5) - vec2f(BGU.iX, BGU.iY);
    q.x *= ar;
    let cs = cos(-BGU.iRot);
    let sn = sin(-BGU.iRot);
    q = vec2f(q.x * cs - q.y * sn, q.x * sn + q.y * cs) / BGU.iScale;
    // cover: at scale 1 the image just fills the frame
    let hImg = max(1.0, ar / BGU.iAspect);
    let u = vec2f(q.x / (BGU.iAspect * hImg), q.y / hImg) + vec2f(0.5);
    let ins = step(0.0, u.x) * step(u.x, 1.0) * step(0.0, u.y) * step(u.y, 1.0);
    var c = textureSampleLevel(bgTex, samp, clamp(u, vec2f(0.0), vec2f(1.0)), 0.0).rgb;
    c = (c - 0.5) * BGU.iContrast + 0.5 + BGU.iBright;
    if (BGU.iHue != 0.0) { c = hueRot(c, BGU.iHue); }
    let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
    c = clamp(mix(vec3f(l), c, BGU.iSat), vec3f(0.0), vec3f(1.0));
    bg = mix(bg, c, BGU.iOpacity * ins);
  }
  return bg;
}

@fragment
fn fsComposite(i: VOut) -> @location(0) vec4f {
  var uv = i.uv;
  var inside = 1.0;
  if (BGU.xform > 0.5) {
    // the video (with its notes and effects) can be moved, scaled, turned and cropped
    let ar = F.rtSize.x / F.rtSize.y;   // the frame's shape
    var q = i.uv - vec2f(0.5) - vec2f(BGU.fX, BGU.fY);
    q.x *= ar;
    let cs = cos(-BGU.fRot);
    let sn = sin(-BGU.fRot);
    q = vec2f(q.x * cs - q.y * sn, q.x * sn + q.y * cs) / BGU.fScale;
    q.x /= ar;
    uv = q + vec2f(0.5);
    inside = step(BGU.cropL, uv.x) * step(uv.x, 1.0 - BGU.cropR) * step(BGU.cropT, uv.y) * step(uv.y, 1.0 - BGU.cropB);
  }
  // the camera's window onto the video (the light layer is already drawn through it)
  let srcPx = F.view.xy + uv * F.view.zw;
  // footage: darker, contrasty, vignetted
  var src = textureSampleLevel(srcTex, samp, srcPx / F.srcSize, 0.0).rgb;
  if (LTU.on > 0.5) { src = lightVideo(src, srcPx, i.uv); }
  if (BGU.on > 0.5) {
    src = src + BGU.fBright;
    if (BGU.fHue != 0.0) { src = hueRot(src, BGU.fHue); }
    src = clamp(src, vec3f(0.0), vec3f(1.0));
  }
  let lift = 0.07 * F.contrast;
  let x = clamp((src - vec3f(lift)) / (1.0 - lift), vec3f(0.0), vec3f(1.0));
  var base = pow(x, vec3f(1.0 + 0.45 * F.darken)) * (1.0 - 0.08 * F.darken);
  let luma = dot(base, vec3f(0.2126, 0.7152, 0.0722));
  base = max(mix(vec3f(luma), base, F.saturation), vec3f(0.0));
  let vig = 1.0 - 0.5 * F.vignette * (sq((uv.x - 0.56) / 0.8) + sq((uv.y - 0.5) / 0.62));   // follows the frame, not the video
  base *= clamp(vig, max(1.0 - 0.82 * F.vignette, 0.0), 1.0);

  var L = textureSampleLevel(lightTex, samp, uv, 0.0);
  if (BGU.on > 0.5) { L *= inside; }
  base *= 1.0 - clamp(L.a, 0.0, 0.8);

  // coloured light from impacts falling on hands and keys
  var rl = vec3f(0.0);
  let n = u32(PO.nLights);
  for (var k = 0u; k < n; k++) {
    let a = lights[2u * k];
    let c = lights[2u * k + 1u];
    let d = srcPx - a.xy;
    let e = sqrt(sq(d.x / a.z) + sq(d.y / (0.75 * a.z)));
    let dist = (e - 1.0) * a.z;
    rl += c.rgb * a.w / (1.0 + exp(dist / 22.0));
  }
  base *= (vec3f(1.0) + min(rl, vec3f(1.0)) * 2.4 * F.relight) * (1.0 + 0.07 * F.bassPulse * F.bass);

  // light layer + bloom, with a hint of colour fringing
  let px = vec2f(0.8 * F.scale * F.fringe) / F.rtSize;   // fringe of ~0.8 video px at any preview size
  var light = L.rgb;
  light.r = textureSampleLevel(lightTex, samp, uv - vec2f(px.x, 0.0), 0.0).r;
  light.b = textureSampleLevel(lightTex, samp, uv + vec2f(px.x, 0.0), 0.0).b;
  light += (textureSampleLevel(bloom1, samp, uv, 0.0).rgb * 0.45 + textureSampleLevel(bloom2, samp, uv, 0.0).rgb * 0.4) * F.bloom;
  if (BGU.on > 0.5) {
    light *= inside;
    base = mix(background(i.uv), base, inside * BGU.fOpacity);
  }
  let Lc = 0.98 * (vec3f(1.0) - exp(-light * 1.545));   // soft knee: light never burns the hands out
  if (BGU.alphaOut > 0.5) {
    // effects only, on a transparent background: over the original video this gives light + video * (1 - alpha)
    let a = clamp(max(max(max(Lc.r, Lc.g), Lc.b), clamp(L.a, 0.0, 0.8)), 0.0, 1.0);
    let C = textureSampleLevel(cardTex, samp, i.uv, 0.0);
    let ca = a * (1.0 - F.fade);
    let a2 = ca + C.a * (1.0 - ca);
    let c2 = clamp(Lc, vec3f(0.0), vec3f(1.0)) * (1.0 - F.fade) * (1.0 - C.a) + C.rgb;
    return vec4f(select(vec3f(0.0), clamp(c2 / max(a2, 1e-4), vec3f(0.0), vec3f(1.0)), a2 > 1e-4), a2);
  }
  var out = base + Lc * (vec3f(1.0) - base * 0.55);

  let l = clamp(dot(out, vec3f(0.333)), 0.0, 1.0);
  let gn = hashU(vec2u(i.pos.xy), u32(F.grain)) - 0.5;
  out += vec3f(gn * 2.0 * 9.0 / 255.0 * l * (1.0 - l) * F.grainAmt);
  // dip to black or white between shots
  out = mix(out, vec3f(F.fadeWhite), F.fade);
  // opening title / end card on top
  let C = textureSampleLevel(cardTex, samp, i.uv, 0.0);
  out = clamp(out, vec3f(0.0), vec3f(1.0)) * (1.0 - C.a) + C.rgb;
  return vec4f(clamp(out, vec3f(0.0), vec3f(1.0)), 1.0);
}
