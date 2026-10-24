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
