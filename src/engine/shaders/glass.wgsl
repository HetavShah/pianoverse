// Glass note bars: rounded rectangle with rim, bevel facets, inner edge line, faint body, sheen, corner glint.
// Output rgb = additive light, a = how much the glass darkens the footage behind it.
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) dims: vec4f,  // width, length, light gain, absorb gain
  @location(2) @interpolate(flat) col: vec3f,
  @location(3) along: f32,                      // distance above the landing point, along the fall direction
  @location(4) @interpolate(flat) seed: f32,    // per note: which part of a texture it shows
};

// note texture (textured style): colour, surface normals (OpenGL convention), roughness
@group(1) @binding(0) var texSamp: sampler;
@group(1) @binding(1) var texC: texture_2d<f32>;
@group(1) @binding(2) var texN: texture_2d<f32>;
@group(1) @binding(3) var texR: texture_2d<f32>;
struct TexParams { mode: f32, scale: f32, relief: f32, shine: f32, solid: f32, size: f32, lo: f32, hi: f32, metal: f32, tile: f32, reflect: f32, live: f32 };
@group(1) @binding(4) var<uniform> TP: TexParams;

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

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  if (i.along < 0.0) { discard; }
  let style = u32(F.noteStyle + 0.5);
  let shape = u32(F.noteShape + 0.5);
  if (style != 0u || shape != 0u) { return styled(i, style, shape); }
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
  let col = i.col;
  let rgb = (rim * lighten(col, 0.6) * 1.15 * rimLit
          + rim2 * lighten(col, 0.35) * 0.55) * F.noteRim
          + bevel * lighten(col, 0.3) * 0.75
          + (body * col
          + sheen * lighten(col, 0.5)) * F.noteFill
          + halo * col * F.noteGlow
          + vec3f(glint * 0.9) * F.noteRim;
  return vec4f(rgb * i.dims.z * F.noteBright, inside * 0.42 * i.dims.w);
}

// Every material other than the original glass bar.
fn styled(i: VOut, style: u32, shape: u32) -> vec4f {
  let w = i.dims.x;
  let L = max(i.dims.y, w);
  let p = i.local;
  let bx = w * 0.5;
  let by = L * 0.5;
  let r = min(w * 0.26 * F.noteRound, w * 0.49);
  let d = sdShape(p, bx, by, r, shape);
  let e = 0.5;
  let g = normalize(vec2f(sdShape(p + vec2f(e, 0.0), bx, by, r, shape) - sdShape(p - vec2f(e, 0.0), bx, by, r, shape),
                          sdShape(p + vec2f(0.0, e), bx, by, r, shape) - sdShape(p - vec2f(0.0, e), bx, by, r, shape)) + vec2f(1e-6));
  let col = i.col;
  let inside = 1.0 / (1.0 + exp(clamp(d / 0.7, -50.0, 50.0)));
  let rimT = max(1.7, w * 0.085);
  let rim = exp(-sq((d + rimT * 0.55) / (rimT * 0.6)));
  let inset = max(4.0, w * 0.22);
  let rim2 = exp(-sq((d + inset) / 0.85));
  let band = inside / (1.0 + exp(clamp(-(d + inset) / 0.8, -50.0, 50.0)));
  let fl = -(g.x * 0.55 + g.y * 0.85);                   // lit from the upper left
  let vgrad = clamp(0.5 + p.y / (2.0 * by), 0.0, 1.0);    // 0 at the top, 1 at the landing end
  let dout = max(d, 0.0);
  var halo = exp(-dout / (w * 0.22)) * 0.30 + exp(-dout / (w * 0.9)) * 0.07;
  if (d <= 0.0) { halo = 0.0; }
  var rgb = vec3f(0.0);
  var absorb = 0.0;

  if (style == 0u) {
    // glass in another shape
    let bevel = band * (0.38 + 0.9 * pow(clamp(fl, 0.0, 1.0), 1.3));
    let rimLit = 0.55 + 0.45 * clamp(fl + 0.35, 0.0, 1.0);
    let body = inside * (0.05 + 0.10 * vgrad) * (1.0 - band);
    let sheen = inside * (1.0 - band) * exp(-sq((p.x * 0.8 + p.y * 0.25 + bx * 0.15) / (w * 0.12))) * 0.22;
    rgb = (rim * lighten(col, 0.6) * 1.15 * rimLit + rim2 * lighten(col, 0.35) * 0.55) * F.noteRim
        + bevel * lighten(col, 0.3) * 0.75 + (body * col + sheen * lighten(col, 0.5)) * F.noteFill + halo * col * F.noteGlow;
    absorb = inside * 0.42;
  } else if (style == 1u) {
    // neon tube: a glowing tube just inside the outline, white-hot at its centre
    let tr = max(1.8, w * 0.1);
    let tube = exp(-sq((d + tr * 1.3) / (tr * 0.9)));
    let core = exp(-sq((d + tr * 1.3) / (tr * 0.32)));
    let sat = col * col * 1.6 + col * 0.2;                 // deeper, more saturated tube colour
    rgb = (tube * sat * 1.3 + core * lighten(col, 0.92) * 1.6) * F.noteRim
        + inside * col * 0.02 * F.noteFill + halo * sat * 2.4 * F.noteGlow;
    absorb = inside * 0.12;
  } else if (style == 2u) {
    // frosted: a soft, milky, mostly solid body
    let soft = 1.0 / (1.0 + exp(clamp(d / max(1.2, w * 0.07), -50.0, 50.0)));
    let diffuse = 0.75 + 0.25 * clamp(-(p.x / bx) * 0.6 - (p.y / by) * 0.4, -1.0, 1.0);
    rgb = soft * (0.20 + 0.16 * vgrad) * diffuse * lighten(col, 0.3) * F.noteFill
        + rim * lighten(col, 0.6) * 0.35 * F.noteRim + halo * col * 0.8 * F.noteGlow;
    absorb = soft * 0.6;
  } else if (style == 3u) {
    // crystal: cut facets that catch the light differently, with fine facet edges and glints
    let f1 = (p.x + p.y * 0.42) / w * 1.25;
    let f2 = (p.x - p.y * 0.42) / w * 1.25;
    let cell = vec2f(floor(f1), floor(f2));
    let fb = hash21(cell);
    let shimmer = 0.55 + 0.45 * sin(F.time * 2.2 + fb * 11.0 + i.along * 0.018);
    let edge = min(min(fract(f1), 1.0 - fract(f1)), min(fract(f2), 1.0 - fract(f2))) * w / 1.25;
    let lines = exp(-sq(edge / 0.8));
    let ridge = exp(-sq(p.x / (w * 0.07)));                 // the bright spine of a cut stone
    let facet = 0.04 + 0.85 * pow(fb, 2.5) * shimmer;
    let tint = mix(col * 0.8, lighten(col, 0.8), fb);
    let glintP = vec2f((hash21(cell + 3.1) - 0.5) * w * 0.6, (hash21(cell + 7.7) - 0.5) * w * 0.8);
    let q = p - glintP;
    let tw = pow(max(sin(F.time * 5.0 + fb * 37.0), 0.0), 8.0);
    let spark = (exp(-dot(q, q) / sq(w * 0.035)) + 0.5 * exp(-abs(q.x) / (w * 0.25)) * exp(-sq(q.y / 0.7))
               + 0.5 * exp(-abs(q.y) / (w * 0.25)) * exp(-sq(q.x / 0.7))) * tw * step(0.6, fb);
    rgb = inside * (facet * tint * F.noteFill + lines * lighten(col, 0.6) * 0.22 + ridge * lighten(col, 0.6) * 0.35 + vec3f(spark) * 1.6)
        + rim * lighten(col, 0.8) * 1.3 * F.noteRim + halo * col * 1.1 * F.noteGlow;
    absorb = inside * 0.38;
  } else if (style == 4u) {
    // chrome: mirror-like bands across the width that slide as the note falls
    let k = p.x / bx;
    let slide = i.along * 0.004;
    let env = 0.5 + 0.5 * cos(k * 3.0 + 1.1 + slide);
    let hi = exp(-sq((k + 0.42 - 0.12 * sin(slide * 2.0)) / 0.12));
    let lo = exp(-sq((k - 0.35) / 0.18));
    let metal = 0.015 + 0.42 * pow(env, 3.0) + 1.6 * hi;
    let horizon = smoothstep(-0.05, 0.05, k - 0.1 * sin(slide * 3.0)) ;       // sky above, ground below in the reflection
    let refl = mix(lighten(col, 0.55), col * 0.35, horizon);
    rgb = inside * max(metal - 0.04 * lo, 0.0) * refl * 1.1 * F.noteFill
        + rim * lighten(col, 0.9) * 1.1 * F.noteRim + halo * col * 0.5 * F.noteGlow;
    absorb = inside * 0.9;
  } else if (style == 5u) {
    // flat: a clean solid gradient bar
    let sat = col * col * 1.15 + col * 0.12;                 // a little deeper than the note colour
    let fillc = mix(sat * 1.05, sat * 0.62, vgrad * 0.8);
    let edgeL = exp(-sq((d + 1.2) / 1.0));
    rgb = inside * fillc * 0.95 * F.noteOpacity + edgeL * lighten(col, 0.55) * 0.55 * F.noteRim
        + halo * col * 0.5 * F.noteGlow;
    absorb = inside * 0.92 * F.noteOpacity;
  } else if (style == 6u) {
    // outline: a thin crisp line only
    let line = exp(-sq((d + 0.9) / max(0.9, w * 0.03)));
    rgb = line * lighten(col, 0.5) * 1.4 * F.noteRim + halo * col * 0.7 * F.noteGlow + inside * col * 0.02 * F.noteFill;
    absorb = inside * 0.05;
  } else if (style == 8u) {
    return textured(i, p, d, g, bx, by, inside, rim, halo, inset, vgrad);
  } else {
    // 3D block: a lit front face plus an extruded side face, as if the bar had depth
    let dep = max(w * 0.5, 7.0) * F.noteDepth;
    let E = normalize(vec2f(1.0, 0.6));
    var dside = 1e4;
    for (var k = 1; k <= 6; k++) { dside = min(dside, sdShape(p - E * dep * f32(k) / 6.0, bx, by, r, shape)); }
    let sideIn = (1.0 / (1.0 + exp(clamp(dside / 0.7, -50.0, 50.0)))) * (1.0 - inside);
    let along = clamp(dot(p, E) / max(dep, 1.0), 0.0, 1.0);
    let bevel = band * (0.3 + 0.9 * pow(clamp(fl, 0.0, 1.0), 1.2));
    let front = inside * (lighten(col, 0.15) * (0.32 + 0.12 * (1.0 - vgrad)) + bevel * lighten(col, 0.4) * 0.6) * F.noteFill;
    let side = sideIn * col * (0.11 + 0.14 * (1.0 - along));
    let seam = exp(-sq(d / 0.9)) * (1.0 - inside * 0.5) * step(0.0, -dside);
    let dd = max(min(d, dside), 0.0);
    var h2 = exp(-dd / (w * 0.22)) * 0.30 + exp(-dd / (w * 0.9)) * 0.07;
    if (min(d, dside) <= 0.0) { h2 = 0.0; }
    rgb = front + side + seam * lighten(col, 0.7) * 0.7 * F.noteRim + rim * lighten(col, 0.6) * 0.5 * F.noteRim + h2 * col * 0.8 * F.noteGlow;
    absorb = max(inside, sideIn) * 0.85;
  }
  return vec4f(rgb * i.dims.z * F.noteBright, absorb * i.dims.w);
}

// Textured notes: a real material texture (colour + surface normals + roughness) lit by a key light,
// kept recognisably a note by the palette rim and glow.
fn textured(i: VOut, p: vec2f, d: f32, g: vec2f, bx: f32, by: f32, inside: f32, rim: f32, halo: f32, inset: f32, vgrad: f32) -> vec4f {
  let w = i.dims.x;
  let col = i.col;
  let tile = w * TP.tile * TP.scale;
  // the texture either rides along with the note, or stays put on screen so notes slide through it
  // like a reflection; "live" slowly drifts it and moves the light so different facets glint in turn
  let live = TP.live;
  let lv = min(live, 1.0);
  var uv0 = p / tile + vec2f(i.seed * 7.13, i.seed * 3.71);
  if (TP.reflect > 0.5) { uv0 = (i.pos.xy / F.scale) / tile; }
  let uv = uv0 + vec2f(0.013, -0.045) * F.time * live;
  let lod = max(0.0, log2(TP.size / max(tile * F.scale, 1.0)));
  let tc = textureSampleLevel(texC, texSamp, uv, lod).rgb;
  var tn = textureSampleLevel(texN, texSamp, uv, lod).rgb * 2.0 - 1.0;
  if (live > 0.0) {
    // a second, differently moving layer of the same surface, so the pattern itself keeps changing
    let uv2 = uv0 * 1.37 + vec2f(0.41, 0.17) + vec2f(-0.031, 0.022) * F.time * live;
    let tn2 = textureSampleLevel(texN, texSamp, uv2, lod).rgb * 2.0 - 1.0;
    tn = mix(tn, tn2, 0.45 * lv);
  }
  let rough = textureSampleLevel(texR, texSamp, uv, lod).r;
  // surface normal: the texture's relief plus a rounded bevel towards the note's edges
  let edge = 1.0 - smoothstep(0.0, inset * 1.4, -d);
  let n = normalize(vec3f(tn.x * TP.relief + g.x * edge * 0.9, -tn.y * TP.relief + g.y * edge * 0.9, 1.0));
  let la = F.time * 1.9 * live + i.seed * 6.2832;
  let Lk = normalize(vec3f(-0.5 + 0.5 * lv * sin(la), -0.65 + 0.45 * lv * cos(la * 0.83), 0.6));   // key light from the upper left
  let diffuse = max(dot(n, Lk), 0.0);
  let h = normalize(Lk + vec3f(0.0, 0.0, 1.0));
  let gloss = mix(120.0, 6.0, clamp(rough, 0.0, 1.0));
  var spec = pow(max(dot(n, h), 0.0), gloss) * (1.0 - rough * 0.7) * TP.shine;
  if (live > 0.0) {
    // tiny bright glints from a fast-moving second light
    let lb = F.time * 4.3 * live + i.seed * 17.0;
    let L2 = normalize(vec3f(0.7 * sin(lb), 0.7 * cos(lb * 1.13), 0.55));
    spec += pow(max(dot(n, normalize(L2 + vec3f(0.0, 0.0, 1.0))), 0.0), 260.0) * 2.2 * lv * TP.shine;
  }
  let fres = pow(1.0 - n.z, 2.0);
  let lum0 = dot(tc, vec3f(0.2126, 0.7152, 0.0722));
  let lum = clamp((lum0 - TP.lo) / max(TP.hi - TP.lo, 0.02), 0.0, 1.0);   // the texture's own range, stretched
  // a simple studio surrounding for reflections: soft bright bands that move with the surface's tilt
  let env = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(n.x * 7.0 + n.y * 4.0 + 1.3), 3.0) + 0.6 * smoothstep(0.2, 0.9, -n.y);
  var base: vec3f;
  var specCol = lighten(col, 0.85);
  let mode = u32(TP.mode + 0.5);
  let metal = TP.metal > 0.5;
  if (mode == 1u) {
    base = tc * 1.15;                                    // natural colours
    if (metal) {
      base = tc * tc * (0.12 + 1.4 * env);               // metal: its colour comes from what it reflects
      specCol = tc * 1.4;
    }
  } else if (mode == 2u) {
    base = col * pow(lum, 2.0) * 2.2 + col * 0.04;       // bright parts glow in the note colour
  } else {
    base = col * (0.08 + 1.5 * pow(lum, 1.2));           // tinted by the note colour
    if (metal) { base = col * (0.1 + 1.2 * env); }
  }
  let lit = select(base * (0.35 + 0.75 * diffuse), base, metal && mode != 2u);
  let rgb = inside * (lit * mix(0.45, 1.0, TP.solid) * F.noteFill + spec * specCol * 1.3 + fres * col * 0.35)
          + rim * lighten(col, 0.6) * 0.55 * F.noteRim + halo * col * 0.45 * F.noteGlow;   // textured notes: a softer halo so the material reads
  return vec4f(rgb * i.dims.z * F.noteBright, inside * mix(0.12, 0.95, TP.solid) * i.dims.w);
}
