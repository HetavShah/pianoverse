// Particle shapes: points spread evenly along the outline of an SVG, scaled to fit a unit box
// (x and y from -0.5 to 0.5, y down), for the "Shape" particle animation.

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
    shapes.forEach((s, i) => {
      if (!lens[i]) return;
      const m = s.getCTM();
      const count = Math.max(2, Math.round((n * lens[i]) / total));
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
    const out = new Float32Array(Math.min(pts.length, MAX_SHAPE_POINTS * 2));
    for (let i = 0; i < out.length; i += 2) { out[i] = (pts[i] - cx) / s; out[i + 1] = (pts[i + 1] - cy) / s; }
    return out;
  } finally {
    host.remove();
  }
}
