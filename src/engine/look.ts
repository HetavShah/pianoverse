// The look: every visual setting of the effects, with defaults that reproduce the original approved
// "Interstellar Teal" look exactly. The style panels are generated from LOOK_SCHEMA, the renderer reads Look.

import type { RGB } from './project';

export type NoteDim = '2d' | '3d';
export type Note2D = 'filled' | 'hollow' | 'ball' | 'soft';
export type Note3D = 'glass' | 'gem' | 'round' | 'outline' | 'angled';
export const NOTE_2D: { id: Note2D; label: string }[] = [
  { id: 'filled', label: 'Filled' }, { id: 'hollow', label: 'Hollow' }, { id: 'ball', label: 'Ball' }, { id: 'soft', label: 'Soft glow' },
];
export const NOTE_3D: { id: Note3D; label: string }[] = [
  { id: 'glass', label: 'Glass' }, { id: 'gem', label: 'Gem' }, { id: 'round', label: 'Round' }, { id: 'outline', label: 'Outline' }, { id: 'angled', label: 'Angled' },
];
/** the note styles offered as picture cards (each sets 2D/3D and the shape) */
export const NOTE_STYLE_CARDS: { id: string; label: string; set: Partial<Look> }[] = [
  { id: 'glass', label: 'Glass', set: { noteDim: '3d', note3d: 'glass' } },
  { id: 'gem', label: 'Gem', set: { noteDim: '3d', note3d: 'gem' } },
  { id: 'round', label: 'Round', set: { noteDim: '3d', note3d: 'round' } },
  { id: 'solid', label: 'Solid', set: { noteDim: '2d', note2d: 'filled' } },
  { id: 'outline', label: 'Outline', set: { noteDim: '2d', note2d: 'hollow' } },
  { id: 'soft', label: 'Soft glow', set: { noteDim: '2d', note2d: 'soft' } },
];
export const KEY_NAMES = ['C', 'C♯ / D♭', 'D', 'E♭', 'E', 'F', 'F♯ / G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** Built-in note textures (CC0, ambientCG). A custom texture is 'file:' + the image's path on this computer. */
export const NOTE_TEXTURES: { id: string; label: string; credit: string; video?: boolean }[] = [
  { id: 'crystal', label: 'Crystal flow', credit: 'Moving video texture made from Ice004 · ambientCG (CC0)', video: true },
  { id: 'ice', label: 'Ice', credit: 'Ice004 · ambientCG (CC0)' },
  { id: 'onyx', label: 'Onyx', credit: 'Onyx007 · ambientCG (CC0)' },
  { id: 'marble', label: 'Marble', credit: 'Marble016 · ambientCG (CC0)' },
  { id: 'foil', label: 'Gold foil', credit: 'Foil002 · ambientCG (CC0)' },
];
export type TexMode = 'tint' | 'natural' | 'glow';
export const TEX_MODES: TexMode[] = ['tint', 'natural', 'glow'];

export type PaletteId = 'teal' | 'swan' | 'ember' | 'neon' | 'aurora' | 'synthwave' | 'sunset' | 'ocean' | 'candy' | 'forest' | 'gold' | 'spectrum'
  | 'rainbow' | 'mono' | 'hands'; // the last three are older names, now colour modes (see resolveLook)
/** how notes take their colour */
export type ColorBy = 'pitch' | 'single' | 'random' | 'hands' | 'loudness' | 'time' | 'noteName';
export const COLOR_BY: { id: ColorBy; label: string; hint: string }[] = [
  { id: 'pitch', label: 'By pitch', hint: 'Low notes take one end of the gradient, high notes the other' },
  { id: 'single', label: 'One colour', hint: 'Every note the same colour' },
  { id: 'random', label: 'Random', hint: 'Each note gets its own colour from the gradient' },
  { id: 'hands', label: 'Left / right', hint: 'One colour for each hand, split at a note' },
  { id: 'loudness', label: 'By loudness', hint: 'Soft notes take one end of the gradient, loud notes the other' },
  { id: 'time', label: 'Over time', hint: 'Colours drift through the gradient as the piece plays' },
  { id: 'noteName', label: 'Note names', hint: 'Every C one colour, every G the next, round the colour wheel' },
];

export interface Look {
  // colours
  palette: PaletteId;
  colorA: string; // mono colour / left hand
  colorB: string; // right hand
  splitNote: number; // hands: notes below go to colour A
  colorBy: ColorBy;
  hueShift: number; // degrees, turns every colour round the colour wheel
  colorSat: number; // colour strength
  colorCycle: number; // 'Over time': seconds for one trip through the gradient
  // notes
  noteAngle: number | null; // null = automatic
  noteSpeed: number; // video px per second
  noteWidth: number; // x key width
  noteLength: number; // x the held length
  noteVelocity: number; // 0..1: louder notes wider and brighter
  noteBright: number;
  noteGlow: number; // outer halo
  noteFill: number; // glass body
  noteOpacity: number; // solid notes: how solid the fill is (0 = just the outline)
  noteRim: number; // bright rim
  noteRound: number; // corner roundness 0..1
  noteFade: number; // fade in near the frame edge 0..1
  noteDim: NoteDim;
  note2d: Note2D;
  note3d: Note3D;
  noteEdge: number; // edge / bevel width
  noteDepth: number; // how deep the 3D bevel is
  noteMinLen: number; // shortest note, in note widths
  noteBWRatio: number; // width of white-key notes / black-key notes
  noteDistort: number; // position distortion: notes spread (+) or close in (-) as they rise
  noteSustain: boolean; // notes stay long while the sustain pedal holds them
  lightDir: number; // note lighting: where the light comes from, degrees (0 = right, 90 = top)
  lightHeight: number; // 0 = from the side, 1 = straight on
  lightPower: number;
  lightShine: number;
  outlineOn: boolean; // 2D notes
  outlineWidth: number;
  outlineDepth: number;
  outlineColor: string;
  barLines: boolean;
  barOpacity: number;
  labels: boolean;
  labelSize: number;
  labelOpacity: number;
  labelKey: number; // 0 = C .. 11 = B
  labelQuality: 'major' | 'minor';
  labelAccidental: 'auto' | 'sharp' | 'flat';
  texOn: boolean;
  noteTexture: string; // built-in id or 'user:<id>'
  texMode: TexMode; // tint by note colour, natural colours, or glow where the texture is bright
  texScale: number; // texture size relative to the note width
  texRelief: number; // strength of the surface bumps
  texShine: number; // highlights
  texSolid: number; // 0 = see-through, 1 = solid
  texReflect: boolean; // texture stays put on screen and notes slide through it
  texReflectivity: number; // 3D notes: how much the surface tilt bends the reflection
  texLive: number; // 0 = still, higher = the surface keeps shimmering
  texMirror: boolean;
  texOpacity: number;
  texBlend: number; // how much the texture replaces the plain note colour
  texBright: number;
  texContrast: number;
  texHue: number; // degrees
  texSat: number;
  texEmboss: boolean;
  texEmbossDepth: number;
  texRgbOpacity: number; // the texture's own colours mixed back in
  texCutOn: boolean;
  texCutThresh: number;
  texCutOpacity: number;
  // saber
  saberBright: number;
  saberThick: number;
  saberFlicker: number; // plasma fringe height
  saberReact: number; // flare where you play
  saberTint: number; // 0 = palette colour, 1 = note colours where you play
  // impact
  flashSize: number;
  flashBright: number;
  streakLen: number;
  streakBright: number;
  impactTime: number; // seconds the flash lasts
  // lighting
  keyBright: number; // key glow
  keyAnticipate: number; // seconds keys light before a note lands
  keyHeld: number; // glow while a note is held
  relight: number; // coloured light on hands and keys
  relightRadius: number;
  bassPulse: number;
  // particles
  partAmount: number;
  partRise: number; // launch speed / buoyancy
  partSwirl: number; // air current strength
  partWind: number; // sideways drift -1..1
  partGravity: number; // >0 pulls down, <0 lifts
  partLife: number; // lifetime multiplier
  partSize: number;
  partTwinkle: number;
  partHaze: number; // soft glow around each particle
  partStars: number; // star glints
  partColor: number; // 0 = white, 1 = note colour
  partVelocity: boolean; // louder notes, bigger plumes
  // background
  bgDarken: number;
  bgContrast: number;
  bgSaturation: number;
  bgVignette: number;
  // finish
  bloom: number;
  bloomWide: number;
  fringe: number;
  grain: number;
}

export const DEFAULT_LOOK: Look = {
  colorBy: 'pitch', hueShift: 0, colorSat: 1, colorCycle: 20,
  palette: 'teal', colorA: '#3c6eff', colorB: '#78ffaa', splitNote: 60,
  noteAngle: null, noteSpeed: 680, noteWidth: 1, noteLength: 1, noteVelocity: 1, noteBright: 1, noteGlow: 1, noteFill: 1, noteOpacity: 1, noteRim: 1, noteRound: 1, noteFade: 1, noteDim: '3d', note2d: 'filled', note3d: 'glass', noteEdge: 1, noteDepth: 1,
  noteMinLen: 1.4, noteBWRatio: 1, noteDistort: 0, noteSustain: false,
  lightDir: 123, lightHeight: 0.6, lightPower: 1, lightShine: 1,
  outlineOn: false, outlineWidth: 1, outlineDepth: 0.5, outlineColor: '#ffffff',
  barLines: false, barOpacity: 0.25,
  labels: false, labelSize: 1, labelOpacity: 1, labelKey: 0, labelQuality: 'major', labelAccidental: 'auto',
  texOn: false,
  noteTexture: 'ice', texMode: 'tint', texScale: 1, texRelief: 1, texShine: 1, texSolid: 0.85, texReflect: false, texReflectivity: 1, texLive: 0,
  texMirror: false, texOpacity: 1, texBlend: 1, texBright: 0, texContrast: 1, texHue: 0, texSat: 1,
  texEmboss: false, texEmbossDepth: 1, texRgbOpacity: 0, texCutOn: false, texCutThresh: 0.5, texCutOpacity: 0,
  saberBright: 1, saberThick: 1, saberFlicker: 1, saberReact: 1, saberTint: 1,
  flashSize: 1, flashBright: 1, streakLen: 1, streakBright: 1, impactTime: 1.3,
  keyBright: 1, keyAnticipate: 0.5, keyHeld: 1, relight: 1, relightRadius: 1, bassPulse: 1,
  partAmount: 1, partRise: 1, partSwirl: 1, partWind: 0, partGravity: 0, partLife: 1, partSize: 1, partTwinkle: 1, partHaze: 1, partStars: 1, partColor: 1, partVelocity: true,
  bgDarken: 1, bgContrast: 1, bgSaturation: 1, bgVignette: 1,
  bloom: 1, bloomWide: 1, fringe: 1, grain: 1,
};

/** project.look may hold only some settings (older projects: just noteAngle) */
export function resolveLook(partial: Partial<Look> | undefined | null): Look {
  const old = (partial ?? {}) as Partial<Look> & { noteStyle?: string; noteShape?: string };
  const l = { ...DEFAULT_LOOK, ...old } as Look & { noteStyle?: string; noteShape?: string };
  // looks saved before 2D / 3D notes kept one "material"
  if (old.noteStyle && !('noteDim' in old)) {
    if (old.noteStyle === 'flat') { l.noteDim = '2d'; l.note2d = 'filled'; }
    else if (old.noteStyle === 'texture') { l.noteDim = '3d'; l.note3d = 'angled'; l.texOn = true; }
  }
  delete l.noteStyle; delete l.noteShape;
  // older looks kept the colour mode in the palette
  if (l.palette === 'mono') { l.palette = 'teal'; l.colorBy = 'single'; }
  else if (l.palette === 'hands') { l.palette = 'teal'; l.colorBy = 'hands'; }
  else if (l.palette === 'rainbow') { l.palette = 'spectrum'; l.colorBy = 'noteName'; }
  return l;
}

// ---------- colours ----------

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
function hsvc(h: number, s: number, v: number): RGB {
  const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}

export const PALETTES: { id: PaletteId; label: string; stops?: [number, RGB][] }[] = [
  { id: 'teal', label: 'Interstellar teal', stops: [[0, rgb(60, 110, 255)], [0.45, rgb(20, 215, 190)], [1, rgb(120, 255, 170)]] },
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
  { id: 'spectrum', label: 'Rainbow', stops: [0, 1, 2, 3, 4, 5, 6].map((k) => [k / 6, hsvc(k / 7, 0.8, 1)] as [number, RGB]) },
];
/** the gradients offered in the Colours panel */
export const GRADIENTS = PALETTES;

const LO_P = 40, HI_P = 86;

const hsv = hsvc;

export function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h / 6) % 1 + 1) % 1, mx > 0 ? d / mx : 0, mx];
}
export const hsvToHex = (h: number, s: number, v: number) => toHex(hsv(h, s, v));
export const hexToHsv = (h: string) => rgbToHsv(hex(h));

const gradientAt = (look: Look, x: number): RGB => {
  const pal = PALETTES.find((q) => q.id === look.palette && q.stops) ?? PALETTES[0];
  return ramp(pal.stops!, x);
};
const hash01 = (i: number) => { let t = (i * 0x9e3779b1) >>> 0; t ^= t >>> 15; t = Math.imul(t, 0x85ebca77) >>> 0; t ^= t >>> 13; return (t >>> 0) / 4294967296; };

/** what a note's colour can depend on besides its pitch */
export interface NoteInfo { idx: number; s: number; v: number; k?: number; c?: number }

/** the colour of a note under a look */
export function noteColor(look: Look, p: number, n?: NoteInfo): RGB {
  let c: RGB;
  switch (look.colorBy) {
    case 'single': c = hex(look.colorA); break;
    case 'hands': c = p < look.splitNote ? hex(look.colorA) : hex(look.colorB); break;
    case 'noteName': c = hsv(((((p % 12) + 12) % 12) * 7 % 12) / 12, 0.75, 1); break; // circle of fifths around the wheel
    case 'random': c = gradientAt(look, n ? hash01(n.idx + 1) : 0.5); break;
    case 'loudness': c = gradientAt(look, n ? (n.v - 0.3) / 0.45 : 0.5); break;
    case 'time': { const ph = n ? (n.s / Math.max(1, look.colorCycle)) % 1 : 0.5; c = gradientAt(look, 1 - Math.abs(ph * 2 - 1)); break; }
    default: c = gradientAt(look, (p - LO_P) / (HI_P - LO_P));
  }
  if (look.hueShift === 0 && look.colorSat === 1) return c;
  const [h, s, v] = rgbToHsv(c);
  return hsv(((h + look.hueShift / 360) % 1 + 1) % 1, Math.min(1, s * look.colorSat), v);
}

/** the saber's resting colour: the palette's middle */
export function saberBase(look: Look): RGB {
  if (look.palette === 'teal' && look.colorBy === 'pitch' && look.hueShift === 0 && look.colorSat === 1) return rgb(140, 245, 225); // exact original
  const c = noteColor(look, 64);
  return [0.35 + 0.65 * c[0], 0.35 + 0.65 * c[1], 0.35 + 0.65 * c[2]];
}

// ---------- panel schema ----------

export type LayerId = 'colors' | 'notes' | 'saber' | 'impact' | 'particles' | 'lighting' | 'background' | 'finish';

export type Control =
  | { key: keyof Look; kind: 'slider'; label: string; min: number; max: number; step: number; unit?: string; fmt?: (v: number) => string; hint?: string; when?: (l: Look) => boolean; hue?: boolean }
  | { key: keyof Look; kind: 'colorBy'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'wheel'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'select'; label: string; options: { value: string; label: string }[]; when?: (l: Look) => boolean; segmented?: boolean }
  | { key: keyof Look; kind: 'texture'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'noteStyle'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'color'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'toggle'; label: string; hint?: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'note'; label: string; when?: (l: Look) => boolean };

export interface Section { title: string; controls: Control[]; /** hidden under "More settings" */ more?: boolean }

const pct = (v: number) => `${Math.round(v * 100)}`;
const x = (v: number) => `${v.toFixed(2)}×`;
const s1 = (v: number) => `${v.toFixed(1)} s`;
const tex = (l: Look) => l.texOn;
const is2d = (l: Look) => l.noteDim === '2d';
const is3d = (l: Look) => l.noteDim === '3d';
const usesGradient = (l: Look) => ['pitch', 'random', 'loudness', 'time'].includes(l.colorBy);

export const LOOK_SCHEMA: Record<LayerId, Section[]> = {
  colors: [
    { title: 'Colour notes', controls: [
      { key: 'colorBy', kind: 'colorBy', label: 'Colour by' },
    ] },
    { title: 'Palette', controls: [
      { key: 'palette', kind: 'select', label: 'Gradient', when: usesGradient, options: GRADIENTS.map((p) => ({ value: p.id, label: p.label })) },
      { key: 'colorA', kind: 'wheel', label: 'Colour', when: (l) => l.colorBy === 'single' },
      { key: 'colorA', kind: 'wheel', label: 'Left hand', when: (l) => l.colorBy === 'hands' },
      { key: 'colorB', kind: 'wheel', label: 'Right hand', when: (l) => l.colorBy === 'hands' },
      { key: 'splitNote', kind: 'note', label: 'Split at', when: (l) => l.colorBy === 'hands' },
      { key: 'colorCycle', kind: 'slider', label: 'Seconds per cycle', min: 4, max: 120, step: 1, fmt: (v) => `${Math.round(v)} s`, when: (l) => l.colorBy === 'time' },
    ] },
    { title: 'Adjust', controls: [
      { key: 'hueShift', kind: 'slider', label: 'Hue', min: -180, max: 180, step: 1, fmt: (v) => `${Math.round(v)}°`, hue: true, hint: 'Turns every colour round the colour wheel' },
      { key: 'colorSat', kind: 'slider', label: 'Colour strength', min: 0, max: 1.5, step: 0.01, fmt: pct },
    ] },
  ],
  notes: [
    { title: 'Style', controls: [
      { key: 'note3d', kind: 'noteStyle', label: 'Style' },
    ] },
    { title: 'Texture', controls: [
      { key: 'noteTexture', kind: 'texture', label: 'Texture' },
    ] },
    { title: 'Adjust', controls: [
      { key: 'noteWidth', kind: 'slider', label: 'Width', min: 0.3, max: 1.8, step: 0.01, fmt: x },
      { key: 'noteRound', kind: 'slider', label: 'Rounded corners', min: 0, max: 1.92, step: 0.01, fmt: pct },
      { key: 'noteBright', kind: 'slider', label: 'Brightness', min: 0.2, max: 2.5, step: 0.01, fmt: pct },
      { key: 'noteGlow', kind: 'slider', label: 'Glow', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'noteSpeed', kind: 'slider', label: 'Fall speed', min: 250, max: 1500, step: 10, fmt: (v) => `${Math.round(v)} px/s` },
    ] },
    // ---- everything below sits under "More settings"
    { title: 'Shape', more: true, controls: [
      { key: 'noteDim', kind: 'select', label: 'Dimensions', segmented: true, options: [{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }] },
      { key: 'note2d', kind: 'select', label: 'Style', segmented: true, when: is2d, options: NOTE_2D.map((o) => ({ value: o.id, label: o.label })) },
      { key: 'note3d', kind: 'select', label: 'Shape', segmented: true, when: is3d, options: NOTE_3D.map((o) => ({ value: o.id, label: o.label })) },
      { key: 'noteEdge', kind: 'slider', label: 'Edge width', min: 0.2, max: 4, step: 0.01, fmt: x },
      { key: 'noteDepth', kind: 'slider', label: 'Note depth', min: 0, max: 3, step: 0.01, fmt: x, when: (l) => is3d(l) && l.note3d !== 'glass' },
      { key: 'noteLength', kind: 'slider', label: 'Length', min: 0.3, max: 2.5, step: 0.01, fmt: x, hint: 'Longer or shorter bars; they still land on time' },
      { key: 'noteMinLen', kind: 'slider', label: 'Minimum length', min: 0.3, max: 4, step: 0.01, fmt: x, hint: 'Shortest note, in note widths' },
      { key: 'noteBWRatio', kind: 'slider', label: 'White / black width ratio', min: 0.5, max: 2.5, step: 0.01, fmt: (v) => v.toFixed(2) },
      { key: 'noteOpacity', kind: 'slider', label: 'Opacity', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'noteDistort', kind: 'slider', label: 'Position distortion', min: -1, max: 1, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'Notes close in (−) or spread out (+) as they rise' },
      { key: 'noteVelocity', kind: 'slider', label: 'Louder notes bigger', min: 0, max: 2, step: 0.01, fmt: pct },
      { key: 'noteFade', kind: 'slider', label: 'Fade in', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'noteSustain', kind: 'toggle', label: 'Sustain draw hold', hint: 'Notes stay long while the sustain pedal holds them (MIDI files)' },
    ] },
    { title: 'Lighting', more: true, controls: [
      { key: 'lightDir', kind: 'slider', label: 'Light direction', min: 0, max: 360, step: 1, fmt: (v) => `${Math.round(v)}°` },
      { key: 'lightHeight', kind: 'slider', label: 'Light height', min: 0.05, max: 1, step: 0.01, fmt: pct },
      { key: 'lightPower', kind: 'slider', label: 'Light strength', min: 0, max: 2.5, step: 0.01, fmt: pct },
      { key: 'lightShine', kind: 'slider', label: 'Shine', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'noteRim', kind: 'slider', label: 'Edge light', min: 0, max: 2, step: 0.01, fmt: pct },
      { key: 'noteFill', kind: 'slider', label: 'Body', min: 0, max: 3, step: 0.01, fmt: pct },
    ] },
    { title: 'Outline', more: true, controls: [
      { key: 'outlineOn', kind: 'toggle', label: 'Outline (2D notes)', when: is2d },
      { key: 'outlineWidth', kind: 'slider', label: 'Outline width', min: 0.2, max: 4, step: 0.01, fmt: x, when: (l) => is2d(l) && l.outlineOn },
      { key: 'outlineDepth', kind: 'slider', label: 'Outline depth', min: 0, max: 2, step: 0.01, fmt: (v) => v.toFixed(2), when: (l) => is2d(l) && l.outlineOn },
      { key: 'outlineColor', kind: 'wheel', label: 'Outline colour', when: (l) => is2d(l) && l.outlineOn },
    ] },
    { title: 'Texture details', more: true, controls: [
      { key: 'texMode', kind: 'select', label: 'Colour', segmented: true, when: tex, options: [{ value: 'tint', label: 'Tinted' }, { value: 'natural', label: 'Natural' }, { value: 'glow', label: 'Glow' }] },
      { key: 'texReflect', kind: 'toggle', label: 'Reflection (texture stays put)', when: tex },
      { key: 'texReflectivity', kind: 'slider', label: '3D reflectivity', min: 0, max: 2, step: 0.01, fmt: pct, when: (l) => tex(l) && is3d(l) && l.texReflect },
      { key: 'texScale', kind: 'slider', label: 'Scale', min: 0.25, max: 4, step: 0.01, fmt: x, when: tex },
      { key: 'texOpacity', kind: 'slider', label: 'Opacity', min: 0, max: 1, step: 0.01, fmt: pct, when: tex },
      { key: 'texBlend', kind: 'slider', label: 'Blend', min: 0, max: 1, step: 0.01, fmt: pct, when: tex },
      { key: 'texRelief', kind: 'slider', label: 'Bumps', min: 0, max: 3, step: 0.01, fmt: pct, when: tex },
      { key: 'texLive', kind: 'slider', label: 'Live shimmer', min: 0, max: 2, step: 0.01, fmt: pct, when: tex },
      { key: 'texSolid', kind: 'slider', label: 'Solid', min: 0, max: 1, step: 0.01, fmt: pct, when: (l) => tex(l) && is3d(l) && l.note3d === 'glass' },
      { key: 'texMirror', kind: 'toggle', label: 'Use mirroring', when: tex },
      { key: 'texBright', kind: 'slider', label: 'Texture brightness', min: -0.5, max: 0.5, step: 0.01, fmt: (v) => v.toFixed(2), when: tex },
      { key: 'texContrast', kind: 'slider', label: 'Texture contrast', min: 0, max: 3, step: 0.01, fmt: (v) => v.toFixed(2), when: tex },
      { key: 'texHue', kind: 'slider', label: 'Texture hue', min: -180, max: 180, step: 1, fmt: (v) => `${Math.round(v)}°`, hue: true, when: tex },
      { key: 'texSat', kind: 'slider', label: 'Texture saturation', min: 0, max: 2, step: 0.01, fmt: (v) => v.toFixed(2), when: tex },
      { key: 'texRgbOpacity', kind: 'slider', label: 'Original colour', min: 0, max: 1, step: 0.01, fmt: pct, when: tex },
      { key: 'texEmboss', kind: 'toggle', label: 'Emboss', when: tex },
      { key: 'texEmbossDepth', kind: 'slider', label: 'Emboss depth', min: 0, max: 3, step: 0.01, fmt: (v) => v.toFixed(2), when: (l) => tex(l) && l.texEmboss },
      { key: 'texCutOn', kind: 'toggle', label: 'Cut out', when: tex },
      { key: 'texCutThresh', kind: 'slider', label: 'Cut out threshold', min: 0, max: 1, step: 0.01, fmt: pct, when: (l) => tex(l) && l.texCutOn },
      { key: 'texCutOpacity', kind: 'slider', label: 'Cut out opacity', min: 0, max: 1, step: 0.01, fmt: pct, when: (l) => tex(l) && l.texCutOn },
    ] },
    { title: 'Bar lines and labels', more: true, controls: [
      { key: 'barLines', kind: 'toggle', label: 'Bar lines', hint: 'A line at the start of every bar (MIDI files)' },
      { key: 'barOpacity', kind: 'slider', label: 'Bar lines opacity', min: 0, max: 1, step: 0.01, fmt: pct, when: (l) => l.barLines },
      { key: 'labels', kind: 'toggle', label: 'Note names' },
      { key: 'labelSize', kind: 'slider', label: 'Label size', min: 0.4, max: 2.5, step: 0.01, fmt: x, when: (l) => l.labels },
      { key: 'labelOpacity', kind: 'slider', label: 'Label opacity', min: 0, max: 1, step: 0.01, fmt: pct, when: (l) => l.labels },
      { key: 'labelKey', kind: 'select', label: 'Key', when: (l) => l.labels, options: KEY_NAMES.map((k, i) => ({ value: String(i), label: k })) },
      { key: 'labelQuality', kind: 'select', label: 'Major / minor', segmented: true, when: (l) => l.labels, options: [{ value: 'major', label: 'Major' }, { value: 'minor', label: 'Minor' }] },
      { key: 'labelAccidental', kind: 'select', label: 'Accidentals', segmented: true, when: (l) => l.labels, options: [{ value: 'auto', label: 'From key' }, { value: 'sharp', label: '♯' }, { value: 'flat', label: '♭' }] },
    ] },
  ],
  saber: [
    { title: 'Saber', controls: [
      { key: 'saberBright', kind: 'slider', label: 'Brightness', min: 0, max: 2.5, step: 0.01, fmt: pct },
      { key: 'saberThick', kind: 'slider', label: 'Thickness', min: 0.3, max: 3, step: 0.01, fmt: x },
      { key: 'saberFlicker', kind: 'slider', label: 'Plasma height', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'saberReact', kind: 'slider', label: 'Flare where you play', min: 0, max: 2.5, step: 0.01, fmt: pct },
      { key: 'saberTint', kind: 'slider', label: 'Take note colours', min: 0, max: 1, step: 0.01, fmt: pct },
    ] },
  ],
  impact: [
    { title: 'Flash', controls: [
      { key: 'flashSize', kind: 'slider', label: 'Size', min: 0.2, max: 3, step: 0.01, fmt: x },
      { key: 'flashBright', kind: 'slider', label: 'Brightness', min: 0, max: 2.5, step: 0.01, fmt: pct },
      { key: 'impactTime', kind: 'slider', label: 'Length', min: 0.3, max: 3, step: 0.05, fmt: s1 },
    ] },
    { title: 'Streak', controls: [
      { key: 'streakLen', kind: 'slider', label: 'Length', min: 0, max: 4, step: 0.01, fmt: x },
      { key: 'streakBright', kind: 'slider', label: 'Brightness', min: 0, max: 3, step: 0.01, fmt: pct },
    ] },
  ],
  particles: [
    { title: 'Motion', controls: [
      { key: 'partAmount', kind: 'slider', label: 'Amount', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'partRise', kind: 'slider', label: 'Rise height', min: 0, max: 2.5, step: 0.01, fmt: pct },
      { key: 'partSwirl', kind: 'slider', label: 'Swirl', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'partWind', kind: 'slider', label: 'Sideways drift', min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
      { key: 'partGravity', kind: 'slider', label: 'Gravity', min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}`, hint: 'Positive pulls glitter down, negative lifts it faster' },
      { key: 'partLife', kind: 'slider', label: 'Lifetime', min: 0.3, max: 3, step: 0.01, fmt: x },
    ] },
    { title: 'Look', controls: [
      { key: 'partSize', kind: 'slider', label: 'Particle size', min: 0.4, max: 3, step: 0.01, fmt: x },
      { key: 'partTwinkle', kind: 'slider', label: 'Twinkle', min: 0, max: 1.5, step: 0.01, fmt: pct },
      { key: 'partHaze', kind: 'slider', label: 'Haze', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'partStars', kind: 'slider', label: 'Star glints', min: 0, max: 4, step: 0.01, fmt: pct },
      { key: 'partColor', kind: 'slider', label: 'Note colour', min: 0, max: 1.5, step: 0.01, fmt: pct, hint: '0 = white glitter' },
      { key: 'partVelocity', kind: 'toggle', label: 'Louder notes, bigger plumes' },
    ] },
  ],
  lighting: [
    { title: 'Keys', controls: [
      { key: 'keyBright', kind: 'slider', label: 'Key glow', min: 0, max: 2.5, step: 0.01, fmt: pct },
      { key: 'keyAnticipate', kind: 'slider', label: 'Light up before landing', min: 0, max: 1.5, step: 0.05, fmt: s1 },
      { key: 'keyHeld', kind: 'slider', label: 'Glow while held', min: 0, max: 2.5, step: 0.01, fmt: pct },
    ] },
    { title: 'On your hands', controls: [
      { key: 'relight', kind: 'slider', label: 'Coloured light', min: 0, max: 2.5, step: 0.01, fmt: pct },
      { key: 'relightRadius', kind: 'slider', label: 'Light radius', min: 0.3, max: 3, step: 0.01, fmt: x },
      { key: 'bassPulse', kind: 'slider', label: 'Bass pulse', min: 0, max: 4, step: 0.01, fmt: pct },
    ] },
  ],
  background: [
    { title: 'Footage', controls: [
      { key: 'bgDarken', kind: 'slider', label: 'Darken', min: 0, max: 2, step: 0.01, fmt: pct },
      { key: 'bgContrast', kind: 'slider', label: 'Contrast', min: 0, max: 2, step: 0.01, fmt: pct },
      { key: 'bgSaturation', kind: 'slider', label: 'Colour', min: 0, max: 2, step: 0.01, fmt: pct },
      { key: 'bgVignette', kind: 'slider', label: 'Vignette', min: 0, max: 2, step: 0.01, fmt: pct },
    ] },
  ],
  finish: [
    { title: 'Glow', controls: [
      { key: 'bloom', kind: 'slider', label: 'Bloom', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'bloomWide', kind: 'slider', label: 'Bloom width', min: 0.4, max: 3, step: 0.01, fmt: x },
    ] },
    { title: 'Film', controls: [
      { key: 'fringe', kind: 'slider', label: 'Colour fringe', min: 0, max: 4, step: 0.01, fmt: pct },
      { key: 'grain', kind: 'slider', label: 'Grain', min: 0, max: 3, step: 0.01, fmt: pct },
    ] },
  ],
};

// ---------- presets ----------

export interface Preset { id: string; name: string; builtIn?: boolean; look: Partial<Look> }

export const BUILT_IN_PRESETS: Preset[] = [
  { id: 'interstellar-teal', name: 'Interstellar Teal', builtIn: true, look: {} },
];

/** settings that belong to a video rather than a look (kept when a preset is applied) */
export const PER_VIDEO_KEYS: (keyof Look)[] = ['noteAngle', 'splitNote'];

export function applyPreset(current: Partial<Look> | undefined, preset: Preset): Partial<Look> {
  const keep: Partial<Look> = {};
  for (const k of PER_VIDEO_KEYS) if (current && k in current) (keep as Record<string, unknown>)[k] = current[k];
  return { ...preset.look, ...keep };
}

/** does the project's look still match the preset exactly? */
export function matchesPreset(current: Partial<Look> | undefined, preset: Preset): boolean {
  const a = resolveLook(current), b = resolveLook(preset.look);
  return (Object.keys(DEFAULT_LOOK) as (keyof Look)[]).every((k) => PER_VIDEO_KEYS.includes(k) || a[k] === b[k]);
}

/** the look to store in a preset: everything except the settings that belong to one video */
export function presetLookFrom(current: Partial<Look> | undefined): Partial<Look> {
  const l: Partial<Look> = { ...resolveLook(current) };
  for (const k of PER_VIDEO_KEYS) delete l[k];
  return l;
}
