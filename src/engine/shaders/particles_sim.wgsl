// Stateless particle plumes: every particle's position at time t is computed from its emitter's launch,
// so any frame can be drawn on its own (scrubbing, parallel export, identical results every time).
struct Emitter {
  start: f32, life: f32, rate: f32, count: f32,
  pos: vec2f, vel: vec2f,
  col: vec3f, vn: f32,
  seed: f32, kind: f32, pad0: f32, pad1: f32,
};
struct Particle { pos: vec2f, vel: vec2f, b: f32, star: f32, z: f32, pad: f32, col: vec4f };
struct Params {
  time: f32, nEmit: u32, perEmit: u32, nShape: u32, up: vec2f, pad2: vec2f,
  // physics and look (1 / 0 = the original approved look)
  swirl: f32, wind: f32, gravity: f32, lifeMul: f32,
  rise: f32, twinkle: f32, stars: f32, colorMix: f32,
  speed: f32, turbX: f32, turbY: f32, turbZ: f32,
  freq: f32, evo: f32, octaves: f32, octScale: f32,
  octMul: f32, spread: f32, rays: f32, rayLen: f32,
};

@group(0) @binding(0) var<uniform> PP: Params;
@group(0) @binding(1) var<storage, read> emitters: array<Emitter>;
@group(0) @binding(2) var<storage, read> flow: array<vec4f>;   // 0..9: kx, ky, amplitude, omega; 10..19: phase
@group(0) @binding(3) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(4) var<storage, read> shape: array<vec4f>;   // outline points in drawing order: x, y, outline start, outline count (< 0: open)

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

// the turbulence: the air current at the chosen size and speed, with finer layers on top (octaves)
fn turbVel(p: vec2f, t: f32) -> vec2f {
  var v = flowVel(p * PP.freq, t * PP.evo);
  let n = u32(PP.octaves + 0.5);
  var f = PP.freq;
  var a = 1.0;
  for (var o = 1u; o < n; o++) {
    f *= PP.octScale;
    a *= PP.octMul;
    v += flowVel(p * f + vec2f(37.0 * f32(o), 11.0 * f32(o)), t * PP.evo * (1.0 + 0.35 * f32(o))) * a;
  }
  return v * vec2f(PP.turbX, PP.turbY);
}

// shared ending: fade in and out over the particle's life, twinkle, colour
fn finishP(pos: vec2f, vel: vec2f, age: f32, plife: f32, bright: f32, star: f32, col: vec3f, st: ptr<function, u32>) -> Particle {
  var o: Particle;
  let twPh = rnd(st) * 6.2831853;
  let tf = 6.0 + 20.0 * rnd(st);
  let env = clamp(age / 0.06, 0.0, 1.0) * pow(clamp(1.0 - age / plife, 0.0, 1.0), 1.3);
  let s1 = sin(age * tf + twPh);
  let tw = max(mix(1.0, 0.55 + 0.45 * s1 * s1, PP.twinkle), 0.0);
  o.pos = pos;
  o.vel = vel;
  o.b = env * tw * bright;
  o.star = star;
  o.z = 0.0;
  o.pad = 0.0;
  o.col = vec4f(col, tw);
  return o;
}

// FOUNTAIN: drops shoot up while the key is held, arc over under gravity and bounce on the keyboard line
fn fountain(E: Emitter, k: u32, t: f32, st: ptr<function, u32>) -> Particle {
  var off: Particle;
  off.pos = vec2f(-10000.0);
  off.b = 0.0;
  let total = min(E.rate * E.life, f32(PP.perEmit));
  if (f32(k) >= total) { return off; }
  let ts = E.start + (f32(k) + rnd(st)) / max(E.rate, 1.0);
  if (ts > t) { return off; }
  let plife = (1.5 + 0.9 * rnd(st)) * PP.lifeMul;
  let age = t - ts;
  if (age > plife) { return off; }
  let ang = gaussR(st) * 0.17;
  let sp = 0.82 + 0.3 * rnd(st);
  var v = vec2f(E.vel.x * cos(ang) - E.vel.y * sin(ang), E.vel.x * sin(ang) + E.vel.y * cos(ang)) * sp;
  let g = vec2f(PP.wind * 140.0, E.pad1 * (1.0 + PP.gravity));
  let sl = E.pad0;                                   // the keyboard line's slope on screen
  let N = normalize(vec2f(-sl, 1.0));
  var q = vec2f(0.0);
  var rem = age;
  var fade = 1.0;
  for (var b = 0; b < 4; b++) {
    let den = g.y - sl * g.x;
    let tHit = -2.0 * (v.y - sl * v.x) / max(den, 1e-3);
    if (tHit <= 0.002 || tHit >= rem) {
      q += v * rem + 0.5 * g * rem * rem;
      v += g * rem;
      break;
    }
    q += v * tHit + 0.5 * g * tHit * tHit;
    v += g * tHit;
    let vn = dot(v, N);
    v = (v - vn * N) * 0.72 - vn * N * 0.42;         // bounce: lose energy, slide a little
    rem -= tHit;
    fade *= 0.75;
  }
  let pos = E.pos + q + vec2f(gaussR(st), gaussR(st)) * 1.5;
  let bright = (0.9 + 0.7 * rnd(st)) * (0.8 + 0.5 * E.vn) * fade;
  var star = 0.0;
  if (rnd(st) < 0.02 * PP.stars) { star = 1.0; }
  let col = mix(vec3f(1.0), vec3f(0.6) + E.col * 0.4, PP.colorMix);
  return finishP(pos, v, age, plife, bright, star, col, st);
}

// HELD-NOTE SPRAY: a fine jet of mist rises while the key is held; letting go ends it with a small burst
fn spray(E: Emitter, k: u32, t: f32, st: ptr<function, u32>) -> Particle {
  var off: Particle;
  off.pos = vec2f(-10000.0);
  off.b = 0.0;
  let total = min(E.rate * E.life, f32(PP.perEmit) - E.count);
  let kf = f32(k);
  var ts: f32;
  var v0: vec2f;
  var plife: f32;
  var bright: f32;
  let base = length(E.vel);
  if (kf < total) {
    ts = E.start + (kf + rnd(st)) / max(E.rate, 1.0);
    let a = -1.5707963 + gaussR(st) * 0.13;
    v0 = vec2f(cos(a), sin(a)) * base * (0.65 + 0.6 * rnd(st));
    plife = (0.7 + 0.7 * rnd(st)) * PP.lifeMul;
    bright = (0.75 + 0.7 * rnd(st)) * (0.8 + 0.5 * E.vn);
  } else if (kf < total + E.count) {
    ts = E.start + E.life;                          // the release burst
    let a = -1.5707963 + gaussR(st) * 0.95;
    v0 = vec2f(cos(a), sin(a)) * base * (0.35 + 0.55 * rnd(st));
    plife = (0.45 + 0.6 * rnd(st)) * PP.lifeMul;
    bright = (1.0 + 0.6 * rnd(st)) * (0.8 + 0.5 * E.vn);
  } else { return off; }
  if (ts > t) { return off; }
  let age = t - ts;
  if (age > plife) { return off; }
  let kd = 2.4;
  let ex = 1.0 - exp(-kd * age);
  var pos = E.pos + v0 * ex / kd + vec2f(PP.wind * 60.0, -38.0 * PP.rise + PP.gravity * 120.0) * age;
  pos += turbVel(pos, t) * min(age, 1.5) * 0.3 * PP.swirl;
  let vel = v0 * (1.0 - ex) + vec2f(0.0, -38.0);
  var star = 0.0;
  if (rnd(st) < 0.012 * PP.stars) { star = 1.0; }
  let col = mix(vec3f(1.0), vec3f(0.6) + E.col * 0.4, PP.colorMix);
  return finishP(pos, vel, age, plife, bright, star, col, st);
}

// VORTEX: particles leave the key and join a ring that orbits above the keyboard; louder notes orbit faster
fn vortex(E: Emitter, k: u32, t: f32, st: ptr<function, u32>) -> Particle {
  var off: Particle;
  off.pos = vec2f(-10000.0);
  off.b = 0.0;
  let total = min(E.rate * E.life, f32(PP.perEmit));
  if (f32(k) >= total) { return off; }
  let ts = E.start + (f32(k) + rnd(st)) / max(E.rate, 1.0);
  if (ts > t) { return off; }
  let plife = (2.6 + 2.2 * rnd(st)) * PP.lifeMul;
  let age = t - ts;
  if (age > plife) { return off; }
  let C = E.vel;                                    // ring centre
  let ax = vec2f(cos(E.pad0), sin(E.pad0));         // along the keyboard
  let ay = vec2f(-ax.y, ax.x);
  let flat = 0.32;                                  // the ring seen at an angle
  let h = E.pos - C;
  let hx = dot(h, ax);
  let hy = dot(h, ay) / flat;
  let R0 = E.pad1 * (0.55 + 0.5 * rnd(st));
  let th0 = atan2(hy, hx) + gaussR(st) * 0.25;
  let w = (0.8 + 1.1 * E.vn) * (0.75 + 0.5 * rnd(st)) * PP.speed;
  let th = th0 + w * age;
  let R = R0 * (1.0 + 0.1 * age * PP.swirl);
  let ph = rnd(st) * 6.2831853;
  let lift = sin(th * 2.0 + ph) * R * 0.05 + (rnd(st) - 0.5) * R * 0.12;
  let orbit = C + ax * cos(th) * R + ay * (sin(th) * R * flat + lift);
  let e = smoothstep(0.0, 0.55, age);
  let pos = mix(E.pos + vec2f(0.0, -220.0) * age, orbit, e);
  let vel = (-ax * sin(th) + ay * cos(th) * flat) * R * w;
  // the far side of the ring is dimmer, the near side brighter
  let depth = 0.6 + 0.4 * sin(th);
  let bright = (0.9 + 0.7 * rnd(st)) * (0.8 + 0.5 * E.vn) * mix(1.0, depth, e);
  var star = 0.0;
  if (rnd(st) < 0.015 * PP.stars) { star = 1.0; }
  let col = mix(vec3f(1.0), vec3f(0.6) + E.col * 0.4, PP.colorMix);
  return finishP(pos, vel, age, plife, bright, star, col, st);
}

// a point along an outline, f in points from its start (wraps round closed outlines, stops at the end of open ones)
fn alongShape(start: u32, cnt: f32, f: f32) -> vec2f {
  let n = abs(cnt);
  var g = f;
  if (cnt > 0.0) { g = f - floor(f / n) * n; } else { g = clamp(f, 0.0, n - 1.001); }
  let i0 = u32(floor(g));
  var i1 = i0 + 1u;
  if (f32(i1) >= n) { i1 = select(i0, 0u, cnt > 0.0); }
  return mix(shape[start + i0].xy, shape[start + i1].xy, fract(g));
}

// SHAPE: particles rise from the key to the start of an outline (its lowest point), trace the whole outline
// once in one direction, and disappear as they get back to where they started
fn shapeP(E: Emitter, k: u32, t: f32, st: ptr<function, u32>) -> Particle {
  var off: Particle;
  off.pos = vec2f(-10000.0);
  off.b = 0.0;
  if (PP.nShape == 0u) { return off; }
  let total = min(E.rate * E.life, f32(PP.perEmit));
  if (f32(k) >= total) { return off; }
  let ts = E.start + (f32(k) + rnd(st)) / max(E.rate, 1.0);
  if (ts > t) { return off; }
  let size = E.pad0;
  // which outline: picked by length (a random point on the drawing, then its outline)
  let idx = min(u32(rnd(st) * f32(PP.nShape)), PP.nShape - 1u);
  let P = shape[idx];
  let start = u32(P.z);
  let cnt = P.w;
  let n = abs(cnt);
  let dir = select(1.0, E.count, cnt > 0.0);     // +1 clockwise, -1 anticlockwise (open lines always run forwards)
  let tRise = 0.6 / max(PP.speed, 0.1);
  let tTrace = 2.4 * E.pad1 * (n / f32(PP.nShape) * 0.5 + 0.5) / max(PP.speed, 0.1) * (0.98 + 0.04 * rnd(st));
  let age = t - ts;
  if (age > tRise + tTrace) { return off; }
  let wob = vec2f(gaussR(st), gaussR(st)) * size * 0.005;
  let home = E.vel + shape[start].xy * size;
  var pos: vec2f;
  var vel: vec2f;
  var b = 1.0;
  if (age < tRise) {
    // rise from the key and arrive at the start heading along the outline
    let u = age / tRise;
    let e = u * u * (3.0 - 2.0 * u);
    let ahead = E.vel + alongShape(start, cnt, 4.0 * dir) * size;
    let p0 = E.pos;
    let p1 = E.pos + vec2f(gaussR(st) * size * 0.06, -size * 0.25);
    let p2 = home - normalize(ahead - home + vec2f(1e-4)) * size * 0.18;
    let m = 1.0 - e;
    pos = m * m * m * p0 + 3.0 * m * m * e * p1 + 3.0 * m * e * e * p2 + e * e * e * home + wob * e;
    vel = (home - p0) / tRise;
    b = smoothstep(0.0, 0.15, u);
  } else {
    // trace the outline once, then vanish as it closes
    let u = (age - tRise) / tTrace;
    var f = u * n * dir;
    if (cnt < 0.0) { f = u * (n - 1.0); }
    pos = E.vel + alongShape(start, cnt, f) * size + wob;
    vel = (E.vel + alongShape(start, cnt, f + dir) * size - (pos - wob)) * (n / tTrace);
    b = 1.0 - smoothstep(0.9, 1.0, u);
  }
  var o: Particle;
  let twPh = rnd(st) * 6.2831853;
  let s1 = sin(age * (6.0 + 14.0 * rnd(st)) + twPh);
  let tw = max(mix(1.0, 0.6 + 0.4 * s1 * s1, PP.twinkle), 0.0);
  o.pos = pos;
  o.vel = vel;
  o.b = (0.9 + 0.6 * rnd(st)) * (0.8 + 0.4 * E.vn) * b * tw;
  o.star = select(0.0, 1.0, rnd(st) < 0.015 * PP.stars);
  o.z = 0.0;
  o.pad = 0.0;
  o.col = vec4f(mix(vec3f(1.0), vec3f(0.6) + E.col * 0.4, PP.colorMix), tw);
  return o;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let id = gid.x;
  if (id >= arrayLength(&parts)) { return; }
  var o: Particle;
  o.pos = vec2f(-10000.0);
  o.vel = vec2f(0.0);
  o.b = 0.0;
  o.star = 0.0;
  o.z = 0.0;
  o.pad = 0.0;
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

  if (E.kind > 1.5) {
    var p: Particle;
    if (E.kind < 2.5) { p = fountain(E, k, t, &st); }
    else if (E.kind < 3.5) { p = spray(E, k, t, &st); }
    else if (E.kind < 4.5) { p = vortex(E, k, t, &st); }
    else { p = shapeP(E, k, t, &st); }
    parts[id] = p;
    return;
  }
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
      let f = turbVel(ep, et);
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
    let sp = (30.0 + 130.0 * rnd(&st)) * PP.rise * PP.speed;
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
    let f = turbVel(pos, pt);
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
  o.vel = vel;
  o.b = env * tw * bright;
  if (PP.turbZ > 0.0) {
    // drifting towards and away from you: size and brightness breathe
    let zph = fract(f32(k) * 0.618034 + E.seed * 0.1373) * 6.2831853;
    o.z = sin(age * (1.3 + 1.7 * fract(f32(k) * 0.37)) * PP.evo + zph) * PP.turbZ;
    o.b *= max(0.0, 1.0 + 0.45 * o.z);
  }
  if (pos.y < -30.0) { o.b = 0.0; }
  o.star = star;
  o.col = vec4f(col, tw);
  parts[id] = o;
}
