// Particle shapes: points spread evenly along the outlines of an SVG, in drawing order, scaled to fit a
// unit box (x and y from -0.5 to 0.5, y down), for the "Shape" particle animation. Each point is 4 numbers:
// x, y, the index where its outline starts, and that outline's point count (negative for an open line).

export const MAX_SHAPE_POINTS = 4096;

export function svgToPoints(svgText: string, n = 2048): Float32Array | null {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) return null;
  // measure inside the page (lengths and transforms only work on rendered elements)
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden';
  const live = document.importNode(svg, true) as SVGSVGElement;
  host.appendChild(live);
  document.body.appendChild(host);
  try {
    const shapes = [...live.querySelectorAll('path, circle, ellipse, rect, line, polyline, polygon')] as SVGGeometryElement[];
    const lens = shapes.map((s) => { try { return s.getTotalLength(); } catch { return 0; } });
    const total = lens.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return null;
    const pts: number[] = [];
    const segs: [number, number][] = [];  // first point, count
    shapes.forEach((s, i) => {
      if (!lens[i]) return;
      const m = s.getCTM();
      const count = Math.max(2, Math.round((n * lens[i]) / total));
      segs.push([pts.length / 2, count]);
      for (let k = 0; k < count; k++) {
        const p = s.getPointAtLength((lens[i] * k) / count);
        const x = m ? m.a * p.x + m.c * p.y + m.e : p.x;
        const y = m ? m.b * p.x + m.d * p.y + m.f : p.y;
        pts.push(x, y);
      }
    });
    // fit into the unit box, keeping proportions
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
    const s = Math.max(x1 - x0, y1 - y0) || 1;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // every outline runs clockwise on screen and starts at its lowest point (nearest the keyboard)
    const ordered: number[] = [];
    const segInfo: [number, number, boolean][] = [];
    for (const [first, count] of segs) {
      let list: [number, number][] = [];
      for (let k = 0; k < count; k++) list.push([pts[(first + k) * 2], pts[(first + k) * 2 + 1]]);
      const step = Math.hypot(list[1][0] - list[0][0], list[1][1] - list[0][1]) || 1e-6;
      const closed = Math.hypot(list[count - 1][0] - list[0][0], list[count - 1][1] - list[0][1]) < step * 3;
      if (closed) {
        let area = 0;
        for (let k = 0; k < count; k++) { const [x0, y0] = list[k], [x1, y1] = list[(k + 1) % count]; area += x0 * y1 - x1 * y0; }
        if (area < 0) list.reverse();
        let low = 0;
        for (let k = 1; k < count; k++) if (list[k][1] > list[low][1]) low = k;
        list = [...list.slice(low), ...list.slice(0, low)];
      } else if (list[count - 1][1] > list[0][1]) list.reverse();
      segInfo.push([ordered.length / 2, count, closed]);
      for (const [x, y] of list) ordered.push(x, y);
    }
    const nPts = Math.min(ordered.length / 2, MAX_SHAPE_POINTS);
    const out = new Float32Array(nPts * 4);
    for (const [first, count, closed] of segInfo) {
      if (first >= nPts) break;
      const cnt = Math.min(count, nPts - first);
      for (let k = 0; k < cnt; k++) {
        const j = first + k;
        out[j * 4] = (ordered[j * 2] - cx) / s;
        out[j * 4 + 1] = (ordered[j * 2 + 1] - cy) / s;
        out[j * 4 + 2] = first;
        out[j * 4 + 3] = closed ? cnt : -cnt;
      }
    }
    return out;
  } finally {
    host.remove();
  }
}

/**
 * Outlines of a picture (PNG / JPG): the shape is the dark part of a light picture, the light part of a dark
 * one, or the opaque part of a picture with transparency. Its edges are traced (marching squares), joined into
 * loops, smoothed, and spread evenly into points in the same form as svgToPoints.
 */
export function imageToPoints(img: ImageBitmap | HTMLImageElement, n = 2048): { outline: Float32Array; fill: Float32Array } | null {
  const MAX = 320;
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  const W = Math.max(8, Math.round(img.width * k)), H = Math.max(8, Math.round(img.height * k));
  const cv = new OffscreenCanvas(W + 2, H + 2);
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 1, 1, W, H);
  const d = g.getImageData(0, 0, W + 2, H + 2).data;
  const GW = W + 2, GH = H + 2;
  // what counts as "inside": transparency if the picture has any, otherwise whichever of dark / light the border isn't
  let transparent = false;
  for (let y = 1; y <= H && !transparent; y += 2) for (let x = 1; x <= W; x += 2) if (d[(y * GW + x) * 4 + 3] < 200) { transparent = true; break; }
  const lum = (i: number) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  let border = 0, nb = 0;
  for (let x = 1; x <= W; x++) { border += lum((1 * GW + x) * 4) + lum((H * GW + x) * 4); nb += 2; }
  const darkShape = border / nb > 0.5;
  const v = new Float32Array(GW * GH); // 1 = inside
  for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) {
    const i = (y * GW + x) * 4;
    v[y * GW + x] = transparent ? d[i + 3] / 255 : darkShape ? 1 - lum(i) : lum(i);
  }
  // marching squares at level 0.5: edge points keyed by the grid edge they sit on
  const T = 0.5;
  const pt = new Map<number, [number, number]>();
  const key = (x: number, y: number, vert: number) => (y * GW + x) * 2 + vert;
  const edgePt = (x: number, y: number, vert: number): number => {
    const id = key(x, y, vert);
    if (!pt.has(id)) {
      const a = v[y * GW + x], b = vert ? v[(y + 1) * GW + x] : v[y * GW + x + 1];
      const t = Math.abs(b - a) > 1e-6 ? (T - a) / (b - a) : 0.5;
      pt.set(id, vert ? [x, y + t] : [x + t, y]);
    }
    return id;
  };
  const next = new Map<number, number>();
  for (let y = 0; y < GH - 1; y++) for (let x = 0; x < GW - 1; x++) {
    const tl = v[y * GW + x] > T ? 1 : 0, tr = v[y * GW + x + 1] > T ? 1 : 0, br = v[(y + 1) * GW + x + 1] > T ? 1 : 0, bl = v[(y + 1) * GW + x] > T ? 1 : 0;
    const c = tl * 8 + tr * 4 + br * 2 + bl;
    if (c === 0 || c === 15) continue;
    const top = () => edgePt(x, y, 0), bottom = () => edgePt(x, y + 1, 0), left = () => edgePt(x, y, 1), right = () => edgePt(x + 1, y, 1);
    // segments oriented so the inside is on one consistent side
    const seg = (a: number, b: number) => next.set(a, b);
    switch (c) {
      case 1: seg(left(), bottom()); break;
      case 2: seg(bottom(), right()); break;
      case 3: seg(left(), right()); break;
      case 4: seg(right(), top()); break;
      case 5: seg(left(), top()); seg(right(), bottom()); break;
      case 6: seg(bottom(), top()); break;
      case 7: seg(left(), top()); break;
      case 8: seg(top(), left()); break;
      case 9: seg(top(), bottom()); break;
      case 10: seg(top(), right()); seg(bottom(), left()); break;
      case 11: seg(top(), right()); break;
      case 12: seg(right(), left()); break;
      case 13: seg(right(), bottom()); break;
      case 14: seg(bottom(), left()); break;
    }
  }
  // join segments into loops
  const loops: [number, number][][] = [];
  const used = new Set<number>();
  for (const s0 of next.keys()) {
    if (used.has(s0)) continue;
    const loop: [number, number][] = [];
    let cur: number | undefined = s0;
    while (cur !== undefined && !used.has(cur)) { used.add(cur); loop.push(pt.get(cur)!); cur = next.get(cur); }
    if (loop.length >= 3) loops.push(loop);
  }
  if (!loops.length) return null;
  // smooth each loop a little and drop specks
  const lenOf = (l: [number, number][]) => { let s = 0; for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; };
  const smooth = (l: [number, number][]) => l.map((p, i) => { const a = l[(i - 1 + l.length) % l.length], b = l[(i + 1) % l.length]; return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4] as [number, number]; });
  const kept = loops.map((l) => smooth(smooth(l))).filter((l) => lenOf(l) > Math.max(W, H) * 0.06);
  if (!kept.length) return null;
  const total = kept.reduce((s, l) => s + lenOf(l), 0);
  // spread points evenly along each loop and write them as an SVG-like list of closed outlines
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GW} ${GH}">`;
  for (const l of kept) svg += `<path d="M${l.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' L')} Z"/>`;
  svg += '</svg>';
  void total;
  const outline = svgToPoints(svg, Math.floor(n * 0.45));
  if (!outline) return null;
  // the same unit box as the outline points
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of kept) for (const [x, y] of l) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const sc = Math.max(x1 - x0, y1 - y0) || 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // fill: points spread over the inside, each with the direction the picture "flows" there (along its strokes;
  // round the middle where the inside is solid)
  const blur = new Float32Array(GW * GH);
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
    let a = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += v[(y + dy) * GW + x + dx]; blur[y * GW + x] = a / 9;
  }
  // solid areas (like a black hole's disc) stay dark: only the strokes near an edge get filled
  const R = Math.max(3, Math.round(Math.max(W, H) / 60));
  const near = new Uint8Array(GW * GH);
  const isIn = (x: number, y: number) => x >= 0 && y >= 0 && x < GW && y < GH && v[y * GW + x] > T;
  for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) {
    if (!isIn(x, y)) continue;
    let edge = false;
    for (let dy = -R; dy <= R && !edge; dy += 1) for (let dx = -R; dx <= R; dx += 1) if (dx * dx + dy * dy <= R * R && !isIn(x + dx, y + dy)) { edge = true; break; }
    near[y * GW + x] = edge ? 1 : 0;
  }
  const inside: number[] = [];
  let mx = 0, my = 0;
  for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) if (v[y * GW + x] > T) { mx += x; my += y; if (near[y * GW + x]) inside.push(x, y); }
  const nIn = inside.length / 2;
  if (!nIn) return { outline, fill: new Float32Array(0) };
  let tot = 0; for (let i = 0; i < v.length; i++) if (v[i] > T) tot++;
  mx /= Math.max(1, tot); my /= Math.max(1, tot);
  const nFill = Math.min(Math.floor(n * 0.55), nIn);
  const fill = new Float32Array(nFill * 4);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let k = 0; k < nFill; k++) {
    const j = Math.floor(rnd() * nIn);
    const x = inside[j * 2] + rnd() - 0.5, y = inside[j * 2 + 1] + rnd() - 0.5;
    const xi = Math.round(x), yi = Math.round(y);
    const gx = blur[yi * GW + Math.min(GW - 1, xi + 1)] - blur[yi * GW + Math.max(0, xi - 1)];
    const gy = blur[Math.min(GH - 1, yi + 1) * GW + xi] - blur[Math.max(0, yi - 1) * GW + xi];
    let ang: number;
    if (Math.hypot(gx, gy) > 0.05) ang = Math.atan2(gx, -gy);          // along the edge
    else ang = Math.atan2(x - mx, -(y - my));                          // round the middle
    fill[k * 4] = (x - cx) / sc; fill[k * 4 + 1] = (y - cy) / sc; fill[k * 4 + 2] = ang; fill[k * 4 + 3] = 0;
  }
  return { outline, fill };
}
