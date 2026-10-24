// Stateless particle plumes: every particle's position at time t is computed from its emitter's launch,
// so any frame can be drawn on its own (scrubbing, parallel export, identical results every time).
struct Emitter {
  start: f32, life: f32, rate: f32, count: f32,
  pos: vec2f, vel: vec2f,
  col: vec3f, vn: f32,
  seed: f32, kind: f32, pad0: f32, pad1: f32,
};
struct Particle { pos: vec2f, b: f32, star: f32, col: vec4f };
struct Params {
  time: f32, nEmit: u32, perEmit: u32, pad: u32, up: vec2f, pad2: vec2f,
  // physics and look (1 / 0 = the original approved look)
  swirl: f32, wind: f32, gravity: f32, lifeMul: f32,
  rise: f32, twinkle: f32, stars: f32, colorMix: f32,
};

@group(0) @binding(0) var<uniform> PP: Params;
@group(0) @binding(1) var<storage, read> emitters: array<Emitter>;
@group(0) @binding(2) var<storage, read> flow: array<vec4f>;   // 0..9: kx, ky, amplitude, omega; 10..19: phase
@group(0) @binding(3) var<storage, read_write> parts: array<Particle>;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(st: ptr<function, u32>) -> f32 { *st = pcg(*st); return f32(*st) / 4294967296.0; }
fn gaussR(st: ptr<function, u32>) -> f32 {
  let u = max(rnd(st), 1e-7);
  let v = rnd(st);
  return sqrt(-2.0 * log(u)) * cos(6.2831853 * v);
}

// divergence-free swirling air current (curl of a sum of travelling waves)
fn flowVel(p: vec2f, t: f32) -> vec2f {
  var v = vec2f(0.0);
  for (var i = 0u; i < 10u; i++) {
    let m = flow[i];
    let c = cos(p.x * m.x + p.y * m.y + m.w * t + flow[10u + i].x) * m.z;
    v += vec2f(c * m.y, -c * m.x);
  }
  return v;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let id = gid.x;
  if (id >= arrayLength(&parts)) { return; }
  var o: Particle;
  o.pos = vec2f(-10000.0);
  o.b = 0.0;
  o.star = 0.0;
  o.col = vec4f(0.0);
  let e = id / PP.perEmit;
  let k = id % PP.perEmit;
  if (e >= PP.nEmit) { parts[id] = o; return; }
  let E = emitters[e];
  let t = PP.time;
  var st: u32 = pcg(u32(E.seed) * 9781u + k * 6271u + 17u);
  var ts: f32;
  var pos: vec2f;
  var vel: vec2f;
  var plife: f32;
  var bright: f32;
  var star = 0.0;
  var col: vec3f;

  if (E.kind < 0.5) {
    // stream: an invisible emitter rises from the hit point and sheds particles along its path
    let total = E.rate * E.life / 1.7;
    if (f32(k) >= min(total, f32(PP.perEmit))) { parts[id] = o; return; }
    let u = 1.0 - pow(max(0.0, 1.0 - 1.7 * (f32(k) + rnd(&st)) / (E.rate * E.life)), 1.0 / 1.7);
    ts = E.start + u * E.life;
    if (ts > t) { parts[id] = o; return; }
    plife = (1.2 + 1.3 * rnd(&st)) * PP.lifeMul;
    if (t - ts > plife) { parts[id] = o; return; }
    var ep = E.pos;
    var ev = E.vel;
    var et = E.start;
    while (et < ts) {
      let dt = min(1.0 / 60.0, ts - et);
      let f = flowVel(ep, et);
      ev.x += (f.x * 0.9 * PP.swirl + PP.wind * 70.0 - ev.x) * 1.4 * dt;
      ev.y += (f.y * 1.6 * PP.swirl - 95.0 * PP.rise + PP.gravity * 150.0 - ev.y) * 0.9 * dt;
      ep += ev * dt;
      et += dt;
    }
    pos = ep + vec2f(gaussR(&st), gaussR(&st)) * 2.2;
    vel = ev * 0.25 + vec2f(gaussR(&st), gaussR(&st)) * 14.0;
    bright = (0.45 + 0.55 * rnd(&st)) * (0.7 + 0.5 * E.vn);
    if (rnd(&st) < 0.012 * PP.stars) { star = 1.0; }
    col = mix(vec3f(1.0), vec3f(0.6) + E.col * 0.4, PP.colorMix);
  } else {
    // small burst right at the hit point
    if (f32(k) >= E.count) { parts[id] = o; return; }
    ts = E.start;
    if (ts > t) { parts[id] = o; return; }
    plife = (0.4 + 0.9 * rnd(&st)) * PP.lifeMul;
    if (t - ts > plife) { parts[id] = o; return; }
    let a = -1.5707963 + 0.9 * gaussR(&st);
    let sp = (30.0 + 130.0 * rnd(&st)) * PP.rise;
    pos = E.pos + vec2f(gaussR(&st) * 3.0, gaussR(&st) * 2.0);
    vel = vec2f(cos(a), sin(a)) * sp;
    bright = 0.7 + 0.6 * rnd(&st);
    if (rnd(&st) < 0.05 * PP.stars) { star = 1.0; }
    col = mix(vec3f(1.0), vec3f(0.65) + E.col * 0.35, PP.colorMix);
  }
  let twPh = rnd(&st) * 6.2831853;
  let tf = 6.0 + 20.0 * rnd(&st);

  var pt = ts;
  while (pt < t) {
    let dt = min(1.0 / 40.0, t - pt);
    let f = flowVel(pos, pt);
    // drift with the air current and rise back along the notes' lane
    let goal = vec2f(f.x * 0.55, f.y * 0.8) * PP.swirl + PP.up * 42.0 * PP.rise + vec2f(PP.wind * 50.0, PP.gravity * 110.0);
    vel += (goal - vel) * 2.2 * dt;
    pos += vel * dt;
    pt += dt;
  }
  let age = t - ts;
  let env = clamp(age / 0.06, 0.0, 1.0) * pow(clamp(1.0 - age / plife, 0.0, 1.0), 1.3);
  let s1 = sin(age * tf + twPh);
  let tw = max(mix(1.0, 0.55 + 0.45 * s1 * s1, PP.twinkle), 0.0);
  o.pos = pos;
  o.b = env * tw * bright;
  if (pos.y < -30.0) { o.b = 0.0; }
  o.star = star;
  o.col = vec4f(col, tw);
  parts[id] = o;
}
