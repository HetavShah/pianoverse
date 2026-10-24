// Notes: the original glass bar (exact approved look) plus every other note style: 2D (filled, hollow,
// ball, soft glow, optional outline) and 3D (glass, gem, round, outline, angled) with adjustable lighting,
// and an optional texture laid over any of them.
// Output rgb = additive light, a = how much the note darkens the footage behind it.
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) dims: vec4f,  // width, length, light gain, absorb gain
  @location(2) @interpolate(flat) col: vec3f,
  @location(3) along: f32,                      // distance above the landing point, along the fall direction
  @location(4) @interpolate(flat) seed: f32,    // per note: which part of a texture it shows
  @location(5) @interpolate(flat) col2: vec4f,  // colour at the note's top end, w = 1 when it differs
};

// the note's colour here: a gradient from the landing end up to the top when the colours run along the notes
fn noteCol(i: VOut, py: f32, by: f32) -> vec3f {
  if (i.col2.w < 0.5) { return i.col; }
  return mix(i.col2.xyz, i.col, clamp(0.5 + py / (2.0 * by), 0.0, 1.0));
}

// note texture: colour, surface normals (OpenGL convention), roughness
@group(1) @binding(0) var texSamp: sampler;
@group(1) @binding(1) var texC: texture_2d<f32>;
@group(1) @binding(2) var texN: texture_2d<f32>;
@group(1) @binding(3) var texR: texture_2d<f32>;
struct TexParams { mode: f32, scale: f32, relief: f32, shine: f32, solid: f32, size: f32, lo: f32, hi: f32, metal: f32, tile: f32, reflect: f32, live: f32 };
@group(1) @binding(4) var<uniform> TP: TexParams;
struct NoteParams {
  dim: f32, shape: f32, edge: f32, depth: f32,
  opacity: f32, lightX: f32, lightY: f32, lightZ: f32,
  lightPower: f32, shine: f32, outlineOn: f32, outlineW: f32,
  outlineDepth: f32, outlineR: f32, outlineG: f32, outlineB: f32,
  texOn: f32, reflectivity: f32, glassLX: f32, glassLY: f32,
  tBright: f32, tContrast: f32, tHue: f32, tSat: f32,
  tMirror: f32, tOpacity: f32, tBlend: f32, emboss: f32,
  embossDepth: f32, rgbOpacity: f32, cutOn: f32, cutThresh: f32,
  cutOpacity: f32, distort: f32, centerX: f32, centerY: f32,
};
@group(1) @binding(5) var<uniform> NP: NoteParams;

// Notes travel along a fall direction: U points from the landing point back toward where notes come from.
@vertex
fn vs(@builtin(vertex_index) vi: u32,
      @location(0) a0: vec4f,   // landing x, landing y, bottom (distance along U), top (distance along U)
      @location(1) a1: vec4f,   // width, gain, absorb gain, U.x
      @location(2) a2: vec4f,   // colour, U.y
      @location(3) a3: vec4f) -> VOut {  // top colour, has top colour
  let w = a1.x;
  let pad = 1.3 * w;
  let U = vec2f(a1.w, a2.w);
  let N = vec2f(-U.y, U.x);
  let c = corner(vi);
  let x = mix(-w * 0.5 - pad, w * 0.5 + pad, c.x);
  let s0 = max(a0.z - pad, 0.0);           // never below the saber
  let s = mix(a0.w + pad, s0, c.y);
  var p = a0.xy + U * s + N * x;
  if (NP.distort != 0.0) {
    // position distortion: notes spread out or close in towards the keyboard's middle as they rise
    let k = clamp(1.0 + NP.distort * s / F.srcSize.y, 0.05, 4.0);
    let lat = dot(a0.xy - vec2f(NP.centerX, NP.centerY), N);
    p = a0.xy + U * s + N * (lat * (k - 1.0) + x * k);
  }
  var o: VOut;
  o.pos = toClip(p);
  o.local = vec2f(x, (a0.z + a0.w) * 0.5 - s);
  o.dims = vec4f(w, a0.w - a0.z, a1.y, a1.z);
  o.col = a2.xyz;
  o.col2 = a3;
  o.along = s;
  o.seed = fract(sin(a0.x * 12.9898 + a0.y * 78.233) * 43758.5453);
  return o;
}

// ---------- shapes (local coords: x across the note, y along it, +y toward the landing end) ----------
fn hash21(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(41.3, 289.1))) * 15731.743); }

fn sdBar(p: vec2f, bx: f32, by: f32, r: f32) -> f32 {
  let q = abs(p) - vec2f(bx - r, by - r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
// tapered capsule: wide round end at the landing side, narrow round end on top
fn sdDrop(p: vec2f, bx: f32, by: f32) -> f32 {
  let r1 = bx;
  let r2 = bx * 0.28;
  let h = max(2.0 * by - r1 - r2, 0.01);
  var q = vec2f(abs(p.x), (by - r1) - p.y);
  let b = clamp((r1 - r2) / h, -0.99, 0.99);
  let a = sqrt(1.0 - b * b);
  let k = dot(q, vec2f(-b, a));
  if (k < 0.0) { return length(q) - r1; }
  if (k > a * h) { return length(q - vec2f(0.0, h)) - r2; }
  return dot(q, vec2f(a, b)) - r1;
}
// gem: a long hexagon with pointed ends
fn sdGem(p: vec2f, bx: f32, by: f32) -> f32 {
  let a = abs(p);
  let tip = min(bx * 1.15, by * 0.48);
  let n = normalize(vec2f(tip, bx));
  return max(a.x - bx, dot(a - vec2f(0.0, by), n));
}
fn sdShape(p: vec2f, bx: f32, by: f32, r: f32, shape: u32) -> f32 {
  if (shape == 1u) { return sdBar(p, bx, by, bx * 0.98); }
  if (shape == 2u) { return sdGem(p, bx, by); }
  if (shape == 3u) { return sdDrop(p, bx, by); }
  return sdBar(p, bx, by, r);
}

// 2D ball: a round head at the landing end with a thinner tail behind it
fn sdBall(p: vec2f, bx: f32, by: f32) -> f32 {
  let head = length(p - vec2f(0.0, by - bx)) - bx;
  let tw = bx * 0.42;
  let tail = sdBar(p - vec2f(0.0, -bx * 0.5), tw, max(by - bx * 0.5, tw), tw);
  return min(head, tail);
}

fn hueRotate(c: vec3f, a: f32) -> vec3f {
  let k = vec3f(0.57735);
  let ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

struct TexOut { col: vec3f, nrm: vec2f, rough: f32, alpha: f32 };

// the texture under this pixel, adjusted (brightness, contrast, hue, saturation, cut out)
fn texAt(i: VOut, p: vec2f, n: vec3f, w: f32) -> TexOut {
  let tile = w * TP.tile * TP.scale;
  let live = TP.live;
  let lv = min(live, 1.0);
  var uv0 = p / tile + vec2f(i.seed * 7.13, i.seed * 3.71);
  if (TP.reflect > 0.5) {
    // stays put on screen; on 3D notes the surface tilt bends it like a reflection
    uv0 = (i.pos.xy / F.scale) / tile + n.xy * 0.35 * NP.reflectivity * NP.dim;
  }
  var uv = uv0 + vec2f(0.006, -0.02) * F.time * live;
  if (NP.tMirror > 0.5) { uv = 1.0 - abs(1.0 - 2.0 * fract(uv * 0.5)); }   // mirrored tiles join without seams
  let lod = max(0.0, log2(TP.size / max(tile * F.scale, 1.0)) + 0.6);
  var c = textureSampleLevel(texC, texSamp, uv, lod).rgb;
  var tn = textureSampleLevel(texN, texSamp, uv, lod).rgb * 2.0 - 1.0;
  if (live > 0.0) {
    var uv2 = uv0 * 1.37 + vec2f(0.41, 0.17) + vec2f(-0.014, 0.01) * F.time * live;
    if (NP.tMirror > 0.5) { uv2 = 1.0 - abs(1.0 - 2.0 * fract(uv2 * 0.5)); }
    tn = mix(tn, textureSampleLevel(texN, texSamp, uv2, lod).rgb * 2.0 - 1.0, 0.45 * lv);
  }
  let rough = textureSampleLevel(texR, texSamp, uv, lod).r;
  // adjustments
  c = (c - 0.5) * NP.tContrast + 0.5 + NP.tBright;
  if (NP.tHue != 0.0) { c = hueRotate(c, NP.tHue); }
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3f(l), c, NP.tSat), vec3f(0.0));
  var o: TexOut;
  o.col = c;
  o.nrm = vec2f(tn.x, -tn.y) * TP.relief;
  if (NP.emboss > 0.5) {
    // emboss: the texture's light and dark become raised and sunken
    let e = 1.0 / TP.size * exp2(lod);
    let hx = dot(textureSampleLevel(texC, texSamp, uv + vec2f(e, 0.0), lod).rgb - textureSampleLevel(texC, texSamp, uv - vec2f(e, 0.0), lod).rgb, vec3f(0.333));
    let hy = dot(textureSampleLevel(texC, texSamp, uv + vec2f(0.0, e), lod).rgb - textureSampleLevel(texC, texSamp, uv - vec2f(0.0, e), lod).rgb, vec3f(0.333));
    o.nrm += vec2f(-hx, -hy) * 6.0 * NP.embossDepth;
  }
  o.rough = rough;
  o.alpha = 1.0;
  if (NP.cutOn > 0.5) {
    // cut out: dark parts of the texture drop away
    o.alpha = mix(NP.cutOpacity, 1.0, smoothstep(NP.cutThresh - 0.04, NP.cutThresh + 0.04, l));
  }
  return o;
}

// the note colour under the texture, by the texture's colour mode
fn texColour(t: TexOut, col: vec3f) -> vec3f {
  let lum0 = dot(t.col, vec3f(0.2126, 0.7152, 0.0722));
  let lum = clamp((lum0 - TP.lo) / max(TP.hi - TP.lo, 0.02), 0.0, 1.0);
  let mode = u32(TP.mode + 0.5);
  var tinted: vec3f;
  if (mode == 1u) { tinted = t.col * 1.15; }
  else if (mode == 2u) { tinted = col * pow(lum, 2.0) * 2.2 + col * 0.04; }
  else { tinted = col * (0.08 + 1.5 * pow(lum, 1.2)); }
  // original colours mixed back in, then how strongly the texture replaces the plain note colour
  let withOrig = mix(tinted, t.col * 1.1, NP.rgbOpacity * select(1.0, 0.0, mode == 1u));
  return mix(col * 0.55, withOrig, NP.tBlend);
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  if (i.along < 0.0) { discard; }
  if (F.noteStyle > 0.5) { return styled(i); }
  let w = i.dims.x;
  let L = max(i.dims.y, w);
  let px = i.local.x;
  let py = i.local.y;
  let bx = w * 0.5;
  let by = L * 0.5;
  let r = min(w * 0.26 * F.noteRound, w * 0.49);
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
  let col = noteCol(i, py, by);
  let rgb = (rim * lighten(col, 0.6) * 1.15 * rimLit
          + rim2 * lighten(col, 0.35) * 0.55) * F.noteRim
          + bevel * lighten(col, 0.3) * 0.75
          + (body * col
          + sheen * lighten(col, 0.5)) * F.noteFill
          + halo * col * F.noteGlow
          + vec3f(glint * 0.9) * F.noteRim;
  return vec4f(rgb * i.dims.z * F.noteBright, inside * 0.42 * i.dims.w);
}

// Every note style other than the original glass bar.
fn styled(i: VOut) -> vec4f {
  let w = i.dims.x;
  let L = max(i.dims.y, w * 0.3);
  let p = i.local;
  let bx = w * 0.5;
  let by = L * 0.5;
  let r = min(w * 0.26 * F.noteRound, w * 0.49);
  let dim3 = NP.dim > 0.5;
  let shape = u32(NP.shape + 0.5);
  let ball = !dim3 && shape == 2u;
  var d: f32;
  var g: vec2f;
  let e = 0.5;
  if (ball) {
    d = sdBall(p, bx, by);
    g = normalize(vec2f(sdBall(p + vec2f(e, 0.0), bx, by) - sdBall(p - vec2f(e, 0.0), bx, by),
                        sdBall(p + vec2f(0.0, e), bx, by) - sdBall(p - vec2f(0.0, e), bx, by)) + vec2f(1e-6));
  } else {
    d = sdBar(p, bx, by, r);
    g = normalize(vec2f(sdBar(p + vec2f(e, 0.0), bx, by, r) - sdBar(p - vec2f(e, 0.0), bx, by, r),
                        sdBar(p + vec2f(0.0, e), bx, by, r) - sdBar(p - vec2f(0.0, e), bx, by, r)) + vec2f(1e-6));
  }
  let col = noteCol(i, p.y, by);
  let inside = 1.0 / (1.0 + exp(clamp(d / 0.7, -50.0, 50.0)));
  let edgeW = max(1.5, w * select(0.16, 0.3, dim3) * NP.edge);
  let inset = clamp(-d / edgeW, 0.0, 1.0);            // 0 at the outline, 1 once past the edge
  let rimT = max(1.7, w * 0.085 * NP.edge);
  let rim = exp(-sq((d + rimT * 0.55) / (rimT * 0.6)));
  let dout = max(d, 0.0);
  var halo = exp(-dout / (w * 0.22)) * 0.30 + exp(-dout / (w * 0.9)) * 0.07;
  if (d <= 0.0) { halo = 0.0; }
  let vgrad = clamp(0.5 + p.y / (2.0 * by), 0.0, 1.0);
  let op = NP.opacity;
  let Ld = normalize(vec3f(NP.lightX, NP.lightY, NP.lightZ));

  // the surface: tilt (normal) and which part of it shows
  var n = vec3f(0.0, 0.0, 1.0);
  var show = inside;
  if (dim3) {
    let dep = NP.depth;
    if (shape == 1u) {
      // gem: two cut facets round the edge, a flat table on top
      let tier = select(2.2, 0.8, inset > 0.45);
      if (inset < 0.999) { n = normalize(vec3f(g * tier * dep, 1.0)); }
    } else if (shape == 2u) {
      // round: a rod, curved across its width, rounded at the ends
      let u = clamp(p.x / bx, -0.98, 0.98);
      let endT = (1.0 - inset) * g.y;
      n = normalize(vec3f(u * 1.6 * dep, endT * 1.4 * dep, sqrt(1.0 - u * u)));
    } else if (shape == 3u) {
      // outline: only the bevelled rim, hollow inside
      if (inset < 0.999) { n = normalize(vec3f(g * 1.1 * dep, 1.0)); }
      show = inside * (1.0 - smoothstep(0.82, 1.0, inset));
    } else if (shape == 4u) {
      // angled: one sharp chamfer, flat top
      if (inset < 0.999) { n = normalize(vec3f(g * 1.6 * dep, 1.0)); }
    } else {
      // glass in any shape: facets catch the light
      let fl = dot(-g, vec2f(NP.glassLX, NP.glassLY));
      let band = inside / (1.0 + exp(clamp(-(d + edgeW * 1.4) / 0.8, -50.0, 50.0)));
      let rim2 = exp(-sq((d + edgeW * 1.4) / 0.85));
      let bevel = band * (0.38 + 0.9 * pow(clamp(fl, 0.0, 1.0), 1.3)) * NP.lightPower;
      let rimLit = 0.55 + 0.45 * clamp(fl + 0.35, 0.0, 1.0);
      var body = inside * (0.05 + 0.10 * vgrad) * (1.0 - band);
      var bodyCol = col;
      var a = inside * 0.42 * op;
      if (NP.texOn > 0.5) {
        let t = texAt(i, p, vec3f(-g * (1.0 - inset), 1.0), w);
        bodyCol = texColour(t, col);
        body = inside * mix(0.12, 0.55, TP.solid) * t.alpha * (1.0 - band * 0.5);
        a = inside * mix(0.42, 0.9, TP.solid) * t.alpha * op;
      }
      let sheen = inside * (1.0 - band) * exp(-sq((p.x * 0.8 + p.y * 0.25 + bx * 0.15) / (w * 0.12))) * 0.22 * NP.shine;
      let gx = p.x + bx - r * 0.75;
      let gy = p.y + by - r * 0.75;
      let glint = exp(-(gx * gx + gy * gy) / sq(rimT * 1.3)) * select(0.0, 1.0, !ball);
      let rgb = (rim * lighten(col, 0.6) * 1.15 * rimLit + rim2 * lighten(col, 0.35) * 0.55) * F.noteRim
              + bevel * lighten(col, 0.3) * 0.75
              + (body * bodyCol * op + sheen * lighten(col, 0.5)) * F.noteFill
              + halo * col * F.noteGlow
              + vec3f(glint * 0.9 * NP.shine) * F.noteRim;
      return vec4f(rgb * i.dims.z * F.noteBright, a * i.dims.w);
    }
  }

  // the material colour, and texture detail on the surface
  var base = col * col * 1.15 + col * 0.12;               // a little deeper than the note colour
  var gloss = 50.0;
  var alpha = 1.0;
  var texSpec = 1.0;
  if (NP.texOn > 0.5) {
    let t = texAt(i, p, n, w);
    base = texColour(t, col);
    n = normalize(vec3f(n.xy + t.nrm * select(0.6, 1.0, dim3), n.z));
    gloss = mix(120.0, 8.0, clamp(t.rough, 0.0, 1.0));
    texSpec = 1.0 - t.rough * 0.6;
    alpha = t.alpha;
  }

  var rgb: vec3f;
  var absorb: f32;
  if (dim3) {
    // strong light and shade so the cut of the note reads even on narrow notes
    let lam = max(dot(n, Ld), 0.0);
    let diff = 0.1 + 1.05 * pow(lam, 1.6) * NP.lightPower;
    let h = normalize(Ld + vec3f(0.0, 0.0, 1.0));
    let spec = pow(max(dot(n, h), 0.0), gloss) * 1.4 * NP.shine * texSpec * NP.lightPower;
    let fres = pow(1.0 - n.z, 2.0);
    let edgeLine = exp(-sq((d + 1.0) / 1.0));
    rgb = show * alpha * (base * diff * 0.9 * F.noteFill * op + spec * lighten(col, 0.8) + fres * col * 0.3)
        + edgeLine * show * lighten(col, 0.6) * 0.45 * F.noteRim
        + halo * col * 0.55 * F.noteGlow;
    absorb = show * alpha * 0.85 * op;
  } else {
    if (shape == 1u) {
      // hollow: just the line round the note
      let line = exp(-sq((d + edgeW * 0.35) / max(0.9, edgeW * 0.4)));
      rgb = line * lighten(col, 0.45) * 1.3 * F.noteRim + inside * base * 0.04 * op + halo * col * 0.6 * F.noteGlow;
      absorb = inside * 0.05 * op + line * 0.3;
    } else if (shape == 3u) {
      // soft glow: no hard edge at all
      let soft = 1.0 / (1.0 + exp(clamp(d / max(1.5, w * 0.16), -50.0, 50.0)));
      let core = 1.0 / (1.0 + exp(clamp((d + w * 0.22) / max(1.0, w * 0.1), -50.0, 50.0)));
      rgb = (soft * base * 0.75 + core * lighten(col, 0.5) * 0.35) * F.noteFill * op * alpha + halo * col * 0.8 * F.noteGlow;
      absorb = soft * 0.35 * op;
    } else {
      // filled (and ball): a clean solid shape with a light edge
      let fillc = mix(base * 1.05, base * 0.62, vgrad * 0.8);
      var hl = 0.0;
      if (ball) {
        let q = p - vec2f(-bx * 0.3, by - bx * 1.3);
        hl = exp(-dot(q, q) / sq(bx * 0.35)) * 0.6;
      }
      let edgeL = exp(-sq((d + 1.2) / 1.0));
      rgb = inside * alpha * (fillc * 0.95 * F.noteFill * op + hl * lighten(col, 0.8)) + edgeL * lighten(col, 0.55) * 0.55 * F.noteRim
          + halo * col * 0.5 * F.noteGlow;
      if (NP.texOn > 0.5) {
        let diff = 0.55 + 0.45 * max(dot(n, Ld), 0.0);
        rgb = rgb * diff;
      }
      absorb = inside * 0.92 * op * alpha;
    }
    if (NP.outlineOn > 0.5) {
      // outline in its own colour; depth is how far its colour reaches into the note
      let oc = vec3f(NP.outlineR, NP.outlineG, NP.outlineB);
      let ow = max(1.0, w * 0.07 * NP.outlineW);
      let line = inside * (1.0 - smoothstep(ow - 0.7, ow + 0.7, -d));
      let reach = inside * exp(-max(-d - ow, 0.0) / max(0.5, w * 0.45 * NP.outlineDepth)) * NP.outlineDepth * 0.5;
      rgb = mix(rgb, oc * 1.1, line) + oc * reach * 0.35;
      absorb = max(absorb, line * 0.9);
    }
  }
  return vec4f(rgb * i.dims.z * F.noteBright, absorb * i.dims.w);
}
