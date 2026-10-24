// Homography helpers. Matrices are row-major 3x3 arrays of length 9.
import type { Mat3 } from './project';

export type Pt = [number, number];
/** keyboard corners in video pixels: back-left, back-right, front-right, front-left */
export type Quad = [Pt, Pt, Pt, Pt];

export function apply(H: Mat3, x: number, y: number): Pt {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function mul(A: Mat3, B: Mat3): Mat3 {
  const C = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  }
  return C;
}

export function inv(H: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const k = 1 / det;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
}

export function normalize(H: Mat3): Mat3 {
  const s = H[8];
  return H.map((v) => v / s);
}

/** Solve the symmetric positive system M x = v (Gaussian elimination with partial pivoting). */
function solve(M: number[][], v: number[]): number[] | null {
  const n = v.length;
  const A = M.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

function normTransform(pts: Pt[]): { T: Mat3; out: Pt[] } {
  let mx = 0, my = 0;
  for (const p of pts) { mx += p[0]; my += p[1]; }
  mx /= pts.length; my /= pts.length;
  let d = 0;
  for (const p of pts) d += Math.hypot(p[0] - mx, p[1] - my);
  d = d / pts.length || 1;
  const s = Math.SQRT2 / d;
  return { T: [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1], out: pts.map((p) => [(p[0] - mx) * s, (p[1] - my) * s] as Pt) };
}

/**
 * Homography mapping src -> dst from 4 or more correspondences (normalized linear least squares, h33 = 1).
 * Returns null for degenerate input.
 */
export function findHomography(src: Pt[], dst: Pt[]): Mat3 | null {
  if (src.length < 4) return null;
  const ns = normTransform(src), nd = normTransform(dst);
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  const add = (row: number[], b: number) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += row[i] * b;
      for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j];
    }
  };
  for (let k = 0; k < src.length; k++) {
    const [x, y] = ns.out[k], [u, v] = nd.out[k];
    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = solve(AtA, Atb);
  if (!h || h.some((v) => !isFinite(v))) return null;
  const Hn: Mat3 = [...h, 1];
  // un-normalize: H = Td^-1 * Hn * Ts
  return normalize(mul(mul(inv(nd.T), Hn), ns.T));
}

/** Plane -> video homography from the keyboard corners. Plane: x 0..whiteKeys across, y 0 (back) .. 1 (front). */
export function planeToImage(corners: Quad, whiteKeys: number): Mat3 | null {
  const plane: Pt[] = [[0, 0], [whiteKeys, 0], [whiteKeys, 1], [0, 1]];
  return findHomography(plane, corners);
}

export function cornersOf(H: Mat3, whiteKeys: number): Quad {
  return [apply(H, 0, 0), apply(H, whiteKeys, 0), apply(H, whiteKeys, 1), apply(H, 0, 1)];
}

/** Is the quad convex and wound consistently (no crossed corners)? */
export function quadOk(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-6) return false;
    const s = Math.sign(z);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}
