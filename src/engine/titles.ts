// Opening title and end card: drawn as one transparent layer over the frame (a dark veil plus type),
// so the preview and the export show exactly the same thing.

export type TitleStyle = 'modern' | 'classic' | 'clean';
export const TITLE_STYLES: { id: TitleStyle; label: string }[] = [
  { id: 'modern', label: 'Modern' }, { id: 'classic', label: 'Classic' }, { id: 'clean', label: 'Clean' },
];

/** who made the video: saved once, used in every project */
export interface Brand {
  name: string; // "Hetav Shah"
  handle: string; // "@hetav.piano"
  links: string; // "YouTube · Instagram"
  logo: string; // PNG data URL, or ''
  accent: string;
  style: TitleStyle;
}
export const DEFAULT_BRAND: Brand = { name: '', handle: '', links: '', logo: '', accent: '#e9542d', style: 'modern' };

export interface Titles {
  intro: { on: boolean; title: string; subtitle: string; credit: boolean; dur: number };
  outro: { on: boolean; line: string; logo: boolean; dur: number };
}
export const DEFAULT_TITLES: Titles = {
  intro: { on: false, title: '', subtitle: '', credit: true, dur: 4.5 },
  outro: { on: false, line: 'Thanks for listening', logo: true, dur: 5 },
};
export function resolveTitles(t: Partial<Titles> | undefined | null): Titles {
  return { intro: { ...DEFAULT_TITLES.intro, ...(t?.intro ?? {}) }, outro: { ...DEFAULT_TITLES.outro, ...(t?.outro ?? {}) } };
}

const PAPER = '#f2efe8';
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0 → 1 between a and b, eased */
const ramp = (x: number, a: number, b: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

interface Face { family: string; weight: number; italic?: boolean; upper: boolean; track: number; size: number }
/** the title's typeface for each style (size is in units of 1% of the frame's short side) */
function titleFace(s: TitleStyle): Face {
  if (s === 'classic') return { family: '"Cormorant Garamond"', weight: 500, italic: true, upper: false, track: 0.01, size: 10.5 };
  if (s === 'clean') return { family: '"Archivo Variable", Archivo', weight: 300, upper: false, track: -0.01, size: 8.6 };
  return { family: 'Syncopate', weight: 700, upper: true, track: 0.1, size: 6.4 };
}
const SANS = '"Archivo Variable", Archivo, sans-serif';

/** fonts the cards use, loaded before drawing (export draws the first frame straight away) */
export async function loadTitleFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([
    '700 40px Syncopate', '400 40px Syncopate', 'italic 500 40px "Cormorant Garamond"', '500 40px "Cormorant Garamond"',
    `300 40px ${SANS}`, `500 40px ${SANS}`, `600 40px ${SANS}`,
  ].map((f) => document.fonts.load(f).catch(() => null)));
}

function setFont(ctx: CanvasRenderingContext2D, f: Face, px: number) {
  ctx.font = `${f.italic ? 'italic ' : ''}${f.weight} ${px}px ${f.family}`;
  ctx.letterSpacing = `${(f.track * px).toFixed(2)}px`;
}

/** one line of type, centred, shrunk to fit the width */
function line(ctx: CanvasRenderingContext2D, text: string, f: Face, px: number, x: number, y: number, maxW: number, color: string, alpha: number) {
  if (!text || alpha <= 0.002) return;
  const s = f.upper ? text.toUpperCase() : text;
  setFont(ctx, f, px);
  const w = ctx.measureText(s).width;
  if (w > maxW) { px *= maxW / w; setFont(ctx, f, px); }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  // a soft shadow keeps the type readable over bright notes
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = px * 0.35;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // trailing letter-spacing would push the line right of centre
  ctx.fillText(s, x + (f.track * px) / 2, y);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function veil(ctx: CanvasRenderingContext2D, w: number, h: number, a: number) {
  if (a <= 0.002) return;
  ctx.globalAlpha = 1;
  // darker in the middle where the type sits, so the edges keep some of the picture
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, `rgba(0,0,0,${Math.min(1, a * (0.72 + 0.28 * a))})`); // fully black at a = 1
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function rule(ctx: CanvasRenderingContext2D, cx: number, y: number, len: number, thick: number, color: string, alpha: number) {
  if (len <= 0.5 || alpha <= 0.002) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(cx - len / 2, y - thick / 2, len, thick);
  ctx.globalAlpha = 1;
}

/** where each card is on the timeline (seconds) for a video or exported section from s0 to s1 */
export function cardTimes(titles: Titles, span: [number, number]) {
  const len = span[1] - span[0];
  const introDur = Math.min(titles.intro.dur, len * 0.45);
  const outroDur = Math.min(titles.outro.dur, len * 0.45);
  return {
    intro: titles.intro.on && introDur > 0.5 ? [span[0], span[0] + introDur] as [number, number] : null,
    outro: titles.outro.on && outroDur > 0.5 ? [span[1] - outroDur, span[1]] as [number, number] : null,
  };
}

/**
 * Draw the cards for moment t into a w×h canvas (cleared first). Returns false when nothing shows,
 * so the renderer can skip uploading a blank layer. `keysAt` is where the keyboard's back edge is
 * (0 = top of the frame, 1 = bottom), so the type can sit in the space above the keys.
 */
export function drawTitles(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, span: [number, number],
  titles: Titles, brand: Brand, logo: CanvasImageSource | null, projectName: string, keysAt = 0.6): boolean {
  const { intro, outro } = cardTimes(titles, span);
  const inIntro = intro && t >= intro[0] - 1e-3 && t < intro[1];
  const inOutro = outro && t >= outro[0] && t <= outro[1] + 1e-3;
  ctx.clearRect(0, 0, w, h);
  if (!inIntro && !inOutro) return false;
  const u = Math.min(w, h) / 100;
  const cx = w / 2;
  const maxW = w * 0.84;
  const face = titleFace(brand.style);
  const accent = brand.accent || DEFAULT_BRAND.accent;
  const small: Face = { family: SANS, weight: 500, upper: true, track: 0.3, size: 2.8 };
  // the middle of the type block: above the keys, never too near the top
  const mid = h * Math.min(0.44, Math.max(0.24, keysAt - 0.17));

  if (inIntro) {
    const [a, b] = intro!;
    const x = t - a, D = b - a;
    const out = 1 - ramp(x, D - 1.0, D - 0.25);
    // from black, down to a veil the title reads on, then back to the performance
    veil(ctx, w, h, x < 0.35 ? 1 : 0.62 + 0.38 * (1 - ramp(x, 0.35, 1.3)) - 0.62 * ramp(x, D - 1.1, D));
    const ty = mid - u * 4 + u * 1.6 * (1 - ramp(x, 0.45, 1.6));
    const title = titles.intro.title.trim() || projectName;
    const titlePx = face.size * u;
    const tf = { ...face, track: face.track + (face.upper ? 0.05 * ramp(x, 0.4, D) : 0) }; // a slow widening
    line(ctx, title, tf, titlePx, cx, ty, maxW, PAPER, ramp(x, 0.45, 1.35) * out);
    const ry = ty + titlePx * 0.95 + u * 1.2;
    rule(ctx, cx, ry, Math.min(w * 0.14, u * 16) * ramp(x, 0.95, 1.8), Math.max(1, u * 0.22), accent, out);
    let y = ry + u * 4.8;
    if (titles.intro.subtitle.trim()) {
      line(ctx, titles.intro.subtitle.trim(), small, small.size * u, cx, y, maxW, PAPER, 0.86 * ramp(x, 1.15, 1.95) * out);
      y += u * 4.6;
    }
    if (titles.intro.credit && brand.name.trim()) {
      const cf: Face = { family: SANS, weight: 500, upper: false, track: 0.03, size: 2.7 };
      line(ctx, `Played by ${brand.name.trim()}`, cf, cf.size * u, cx, y, maxW, PAPER, 0.62 * ramp(x, 1.5, 2.3) * out);
    }
  }

  if (inOutro) {
    const [a, b] = outro!;
    const x = t - a, D = b - a;
    veil(ctx, w, h, 0.8 * ramp(x, 0, 1.2) + 0.2 * ramp(x, D - 0.9, D - 0.1));
    const fadeEnd = 1 - ramp(x, D - 0.9, D - 0.1);
    const hasLogo = titles.outro.logo && !!logo;
    let y = mid - u * (hasLogo ? 12 : 5);
    if (hasLogo) {
      const img = logo as HTMLImageElement;
      const iw = (img.naturalWidth || (img as unknown as { width: number }).width) || 1;
      const ih = (img.naturalHeight || (img as unknown as { height: number }).height) || 1;
      const lh = u * 13, lw = Math.min(w * 0.5, (lh * iw) / ih);
      const lhh = (lw * ih) / iw;
      ctx.globalAlpha = ramp(x, 0.4, 1.2) * fadeEnd;
      ctx.drawImage(logo!, cx - lw / 2, y - lhh / 2, lw, lhh);
      ctx.globalAlpha = 1;
      y += lhh / 2 + u * 7;
    }
    const lf = { ...face, size: face.size * 0.78 };
    line(ctx, titles.outro.line.trim(), lf, lf.size * u, cx, y, maxW, PAPER, ramp(x, 0.6, 1.4) * fadeEnd);
    y += lf.size * u * 0.9 + u * 1.4;
    rule(ctx, cx, y, Math.min(w * 0.12, u * 14) * ramp(x, 1.0, 1.7), Math.max(1, u * 0.22), accent, fadeEnd);
    y += u * 5;
    const nameF: Face = { family: SANS, weight: 600, upper: false, track: 0.02, size: 3.5 };
    if (brand.name.trim()) { line(ctx, brand.name.trim(), nameF, nameF.size * u, cx, y, maxW, PAPER, ramp(x, 1.1, 1.8) * fadeEnd); y += u * 4.8; }
    const handleF: Face = { family: SANS, weight: 500, upper: false, track: 0.03, size: 3 };
    if (brand.handle.trim()) { line(ctx, brand.handle.trim(), handleF, handleF.size * u, cx, y, maxW, accent, ramp(x, 1.3, 2.0) * fadeEnd); y += u * 4.4; }
    if (brand.links.trim()) line(ctx, brand.links.trim(), small, small.size * 0.9 * u, cx, y, maxW, PAPER, 0.6 * ramp(x, 1.5, 2.2) * fadeEnd);
  }
  return true;
}
