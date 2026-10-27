// Note colours under a look: palettes (gradients), the colour modes (one colour, twelve, gradient by pitch,
// loudness or time, tracks, channels, a dividing key, random) and colour helpers.
import type { RGB } from '../project';
import type { Look } from './settings';

export type PaletteId = 'custom' | 'teal' | 'swan' | 'ember' | 'neon' | 'aurora' | 'synthwave' | 'sunset' | 'ocean' | 'candy' | 'forest' | 'gold' | 'spectrum'
  | 'rainbow' | 'mono' | 'hands'; // the last three are older names, now colour modes (see resolveLook)

const hex = (h: string): RGB => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const toHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

const ramp = (stops: [number, RGB][], x: number): RGB => {
  x = Math.min(1, Math.max(0, x));
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i], [b, cb] = stops[i + 1];
    if (x <= b) { const k = (x - a) / (b - a); return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k]; }
  }
  return stops[stops.length - 1][1];
};
const rgb = (r: number, g: number, b: number): RGB => [r / 255, g / 255, b / 255];
/** hue, saturation, value (0..1) to RGB */
export function hsv(h: number, s: number, v: number): RGB {
  const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}

export const PALETTES: { id: PaletteId; label: string; stops?: [number, RGB][] }[] = [
  { id: 'custom', label: 'Custom' },
  { id: 'teal', label: 'Lagoon', stops: [[0, rgb(60, 110, 255)], [0.45, rgb(20, 215, 190)], [1, rgb(120, 255, 170)]] },
  { id: 'swan', label: 'Swan white', stops: [[0, rgb(120, 150, 255)], [0.5, rgb(200, 215, 255)], [1, rgb(255, 255, 255)]] },
  { id: 'ember', label: 'Ember', stops: [[0, rgb(255, 60, 40)], [0.5, rgb(255, 140, 30)], [1, rgb(255, 225, 120)]] },
  { id: 'neon', label: 'Neon', stops: [[0, rgb(140, 60, 255)], [0.5, rgb(255, 60, 200)], [1, rgb(60, 220, 255)]] },
  { id: 'aurora', label: 'Aurora', stops: [[0, rgb(40, 255, 140)], [0.5, rgb(40, 200, 255)], [1, rgb(180, 110, 255)]] },
  { id: 'synthwave', label: 'Synthwave', stops: [[0, rgb(255, 40, 140)], [0.5, rgb(170, 60, 255)], [1, rgb(40, 210, 255)]] },
  { id: 'sunset', label: 'Sunset', stops: [[0, rgb(120, 40, 200)], [0.4, rgb(255, 70, 110)], [0.75, rgb(255, 150, 60)], [1, rgb(255, 220, 110)]] },
  { id: 'ocean', label: 'Ocean', stops: [[0, rgb(30, 60, 220)], [0.5, rgb(0, 160, 255)], [1, rgb(120, 255, 240)]] },
  { id: 'candy', label: 'Candy', stops: [[0, rgb(255, 110, 200)], [0.5, rgb(190, 150, 255)], [1, rgb(110, 230, 255)]] },
  { id: 'forest', label: 'Forest', stops: [[0, rgb(20, 160, 90)], [0.5, rgb(130, 220, 60)], [1, rgb(240, 240, 120)]] },
  { id: 'gold', label: 'Gold', stops: [[0, rgb(200, 110, 30)], [0.5, rgb(255, 190, 70)], [1, rgb(255, 245, 190)]] },
  { id: 'spectrum', label: 'Rainbow', stops: [0, 1, 2, 3, 4, 5, 6].map((k) => [k / 6, hsv(k / 7, 0.8, 1)] as [number, RGB]) },
];
/** the gradients offered in the Colours panel */
export const GRADIENTS = PALETTES;

const LO_P = 40, HI_P = 86;


export function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h / 6) % 1 + 1) % 1, mx > 0 ? d / mx : 0, mx];
}
export const hsvToHex = (h: number, s: number, v: number) => toHex(hsv(h, s, v));
export const hexToHsv = (h: string) => rgbToHsv(hex(h));

const evenStops = (cols: string[]): [number, RGB][] => (cols.length ? cols : ['#ffffff']).map((c, i, a) => [a.length > 1 ? i / (a.length - 1) : 0, hex(c)] as [number, RGB]);
const gradientAt = (look: Look, x: number): RGB => {
  if (look.palette === 'custom') { const st = evenStops(look.gradColors); return st.length > 1 ? ramp(st, x) : st[0][1]; }
  const pal = PALETTES.find((q) => q.id === look.palette && q.stops) ?? PALETTES[1];
  return ramp(pal.stops!, x);
};
const hash01 = (i: number) => { let t = (i * 0x9e3779b1) >>> 0; t ^= t >>> 15; t = Math.imul(t, 0x85ebca77) >>> 0; t ^= t >>> 13; return (t >>> 0) / 4294967296; };

/** what a note's colour can depend on besides its pitch */
export interface NoteInfo { idx: number; s: number; v: number; k?: number; c?: number }

const adjust = (look: Look, c: RGB): RGB => {
  if (look.hueShift === 0 && look.colorSat === 1) return c;
  const [h, s, v] = rgbToHsv(c);
  return hsv(((h + look.hueShift / 360) % 1 + 1) % 1, Math.min(1, s * look.colorSat), v);
};

/** where on the gradient a note sits (0..1) */
function gradPos(look: Look, p: number, n?: NoteInfo): number {
  if (look.gradMap === 'loudness') return n ? (n.v - 0.3) / 0.45 : 0.5;
  if (look.gradMap === 'time') { const ph = n ? (n.s / Math.max(1, look.colorCycle)) % 1 : 0.5; return 1 - Math.abs(ph * 2 - 1); }
  return (p - LO_P) / (HI_P - LO_P);
}

/** the colour of a note under a look (at its landing end) */
export function noteColor(look: Look, p: number, n?: NoteInfo): RGB {
  let c: RGB;
  switch (look.colorBy) {
    case 'single': c = hex(look.colorA); break;
    case 'hands': c = p < look.splitNote ? hex(look.colorA) : hex(look.colorB); break;
    case 'twelve': case 'noteName': c = hex(look.twelveColors[((p % 12) + 12) % 12] ?? '#ffffff'); break;
    case 'tracks': c = hex(look.trackColors[(n?.k ?? 0) % look.trackColors.length] ?? '#ffffff'); break;
    case 'channels': c = hex(look.channelColors[(n?.c ?? 0) % look.channelColors.length] ?? '#ffffff'); break;
    case 'random': c = look.randomFrom === 'any' ? hsv(n ? hash01(n.idx + 1) : 0.5, 0.75, 1) : gradientAt(look, n ? hash01(n.idx + 1) : 0.5); break;
    default: {
      const x = gradPos(look, p, n);
      c = gradientAt(look, look.gradDir === 'up' ? 0 : x);
    }
  }
  return adjust(look, c);
}

/** the colour at a note's far (top) end when the gradient runs along the notes; null = same as noteColor */
export function noteColorTop(look: Look, p: number, n?: NoteInfo): RGB | null {
  const g = look.colorBy === 'gradient' || look.colorBy === 'pitch' || look.colorBy === 'loudness' || look.colorBy === 'time';
  if (!g || look.gradDir === 'across') return null;
  const x = gradPos(look, p, n);
  const top = look.gradDir === 'up' ? 1 : look.gradDir === 'diagUp' ? x + 0.4 : x - 0.4;
  return adjust(look, gradientAt(look, Math.min(1, Math.max(0, top))));
}

/** the saber's resting colour: the palette's middle */
export function saberBase(look: Look): RGB {
  if (look.saberCustom) return hex(look.saberColor);
  if (look.palette === 'teal' && look.colorBy === 'gradient' && look.gradMap === 'pitch' && look.gradDir === 'across' && look.hueShift === 0 && look.colorSat === 1) return rgb(140, 245, 225); // exact original
  const c = noteColor(look, 64);
  return [0.35 + 0.65 * c[0], 0.35 + 0.65 * c[1], 0.35 + 0.65 * c[2]];
}
