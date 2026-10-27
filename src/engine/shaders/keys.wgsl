// Key glow: a lit key glows in its note's colour, brightest at the back where the note lands and fading towards the
// front, with a little light spilling onto the keys either side. The quad covers the whole key plus that margin;
// the light only falls on key surfaces: a white key where the picture is bright, a black key where it is dark, so the
// black keys between white keys, and a hand over the key, stay as they are. Bar lines (black = 2) are never masked.
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
  @location(2) @interpolate(flat) black: f32,
};
@group(1) @binding(0) var ksamp: sampler;
@group(1) @binding(1) var kvideo: texture_2d<f32>;

@vertex
fn vs(@location(0) p: vec2f, @location(1) uv: vec2f, @location(2) col: vec3f, @location(3) black: f32) -> VOut {
  var o: VOut;
  o.pos = toClip(p);
  o.uv = uv;
  o.col = col;
  o.black = black;
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  if (i.black > 1.5) {
    let e = smoothstep(0.0, 0.12, min(i.uv.x, 1.0 - i.uv.x)) * smoothstep(0.0, 0.06, min(i.uv.y, 1.0 - i.uv.y));
    return vec4f(i.col * e * 0.85, 0.0);
  }
  let isBlack = i.black > 0.5;
  let src = F.view.xy + i.pos.xy / F.scale;
  let v = textureSampleLevel(kvideo, ksamp, src / F.srcSize, 0.0).rgb;
  let luma = dot(v, vec3f(0.2126, 0.7152, 0.0722));
  // white keys are the brightest thing there; black keys the darkest; skin sits in between
  let onKey = select(smoothstep(0.5, 0.6, luma), 1.0 - smoothstep(0.1, 0.26, luma), isBlack);
  // across the key: full inside it, then a soft spill onto the neighbours (the key fills the middle of the quad)
  let core = select(0.5 / 1.6, 0.26 / 0.66, isBlack);         // half the key's width, as a share of the quad
  let dx = abs(i.uv.x - 0.5);
  let inside = 1.0 - smoothstep(core - 0.03, core + 0.01, dx);
  let spill = exp(-sq(max(dx - core, 0.0) / 0.07)) * 0.35;
  let across = max(inside, spill) * smoothstep(0.5, 0.42, dx);
  // along the key: brightest at the back where the note lands, fading towards the front
  let along = mix(1.0, select(0.28, 0.5, isBlack), pow(i.uv.y, 0.8)) * smoothstep(0.0, 0.04, i.uv.y) * smoothstep(0.0, 0.05, 1.0 - i.uv.y);
  // light on a white key takes its colour from the note, a little brighter where the key is brighter
  let k = select(0.7 + 0.5 * luma, 0.9, isBlack);
  return vec4f(i.col * across * along * onKey * k, 0.0);
}
