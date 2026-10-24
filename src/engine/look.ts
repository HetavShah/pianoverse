// The look: every visual setting of the effects, with defaults that reproduce the original approved
// "Interstellar Teal" look exactly. The style panels are generated from LOOK_SCHEMA, the renderer reads Look.

import type { RGB } from './project';

export type NoteStyle = 'glass' | 'neon' | 'frosted' | 'crystal' | 'chrome' | 'flat' | 'outline' | 'block3d' | 'texture';
export type NoteShape = 'bar' | 'pill' | 'gem' | 'drop';
export const NOTE_STYLES: { id: NoteStyle; label: string }[] = [
  { id: 'glass', label: 'Glass' }, { id: 'neon', label: 'Neon tube' }, { id: 'frosted', label: 'Frosted' }, { id: 'crystal', label: 'Crystal' },
  { id: 'chrome', label: 'Chrome' }, { id: 'flat', label: 'Flat' }, { id: 'outline', label: 'Outline' }, { id: 'block3d', label: '3D block' },
  { id: 'texture', label: 'Texture' },
];
export const NOTE_SHAPES: { id: NoteShape; label: string }[] = [
  { id: 'bar', label: 'Bar' }, { id: 'pill', label: 'Pill' }, { id: 'gem', label: 'Gem' }, { id: 'drop', label: 'Drop' },
];

/** Built-in note textures (CC0, ambientCG). A custom texture is 'file:' + the image's path on this computer. */
export const NOTE_TEXTURES: { id: string; label: string; credit: string }[] = [
  { id: 'ice', label: 'Ice', credit: 'Ice004 · ambientCG (CC0)' },
  { id: 'onyx', label: 'Onyx', credit: 'Onyx007 · ambientCG (CC0)' },
  { id: 'marble', label: 'Marble', credit: 'Marble016 · ambientCG (CC0)' },
  { id: 'foil', label: 'Gold foil', credit: 'Foil002 · ambientCG (CC0)' },
];
export type TexMode = 'tint' | 'natural' | 'glow';
export const TEX_MODES: TexMode[] = ['tint', 'natural', 'glow'];

export type PaletteId = 'teal' | 'swan' | 'ember' | 'neon' | 'aurora' | 'rainbow' | 'mono' | 'hands';

export interface Look {
  // colours
  palette: PaletteId;
  colorA: string; // mono colour / left hand
  colorB: string; // right hand
  splitNote: number; // hands: notes below go to colour A
  // notes
  noteAngle: number | null; // null = automatic
  noteSpeed: number; // video px per second
  noteWidth: number; // x key width
  noteVelocity: number; // 0..1: louder notes wider and brighter
  noteBright: number;
  noteGlow: number; // outer halo
  noteFill: number; // glass body
  noteRim: number; // bright rim
  noteRound: number; // corner roundness 0..1
  noteFade: number; // fade in near the frame edge 0..1
  noteStyle: NoteStyle;
  noteShape: NoteShape;
  noteDepth: number; // 3D block depth
  noteTexture: string; // built-in id or 'file:<path>'
  texMode: TexMode; // tint by note colour, natural colours, or glow where the texture is bright
  texScale: number; // texture size relative to the note width
  texRelief: number; // strength of the surface bumps
  texShine: number; // highlights
  texSolid: number; // 0 = see-through, 1 = solid
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
  palette: 'teal', colorA: '#3c6eff', colorB: '#78ffaa', splitNote: 60,
  noteAngle: null, noteSpeed: 680, noteWidth: 1, noteVelocity: 1, noteBright: 1, noteGlow: 1, noteFill: 1, noteRim: 1, noteRound: 1, noteFade: 1, noteStyle: 'glass', noteShape: 'bar', noteDepth: 1,
  noteTexture: 'ice', texMode: 'tint', texScale: 1, texRelief: 1, texShine: 1, texSolid: 0.85,
  saberBright: 1, saberThick: 1, saberFlicker: 1, saberReact: 1, saberTint: 1,
  flashSize: 1, flashBright: 1, streakLen: 1, streakBright: 1, impactTime: 1.3,
  keyBright: 1, keyAnticipate: 0.5, keyHeld: 1, relight: 1, relightRadius: 1, bassPulse: 1,
  partAmount: 1, partRise: 1, partSwirl: 1, partWind: 0, partGravity: 0, partLife: 1, partSize: 1, partTwinkle: 1, partHaze: 1, partStars: 1, partColor: 1, partVelocity: true,
  bgDarken: 1, bgContrast: 1, bgSaturation: 1, bgVignette: 1,
  bloom: 1, bloomWide: 1, fringe: 1, grain: 1,
};

/** project.look may hold only some settings (older projects: just noteAngle) */
export function resolveLook(partial: Partial<Look> | undefined | null): Look {
  return { ...DEFAULT_LOOK, ...(partial ?? {}) };
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

export const PALETTES: { id: PaletteId; label: string; stops?: [number, RGB][] }[] = [
  { id: 'teal', label: 'Interstellar teal', stops: [[0, rgb(60, 110, 255)], [0.45, rgb(20, 215, 190)], [1, rgb(120, 255, 170)]] },
  { id: 'swan', label: 'Swan white', stops: [[0, rgb(120, 150, 255)], [0.5, rgb(200, 215, 255)], [1, rgb(255, 255, 255)]] },
  { id: 'ember', label: 'Ember', stops: [[0, rgb(255, 60, 40)], [0.5, rgb(255, 140, 30)], [1, rgb(255, 225, 120)]] },
  { id: 'neon', label: 'Neon', stops: [[0, rgb(140, 60, 255)], [0.5, rgb(255, 60, 200)], [1, rgb(60, 220, 255)]] },
  { id: 'aurora', label: 'Aurora', stops: [[0, rgb(40, 255, 140)], [0.5, rgb(40, 200, 255)], [1, rgb(180, 110, 255)]] },
  { id: 'rainbow', label: 'Rainbow (by note name)' },
  { id: 'mono', label: 'One colour' },
  { id: 'hands', label: 'Left / right hand' },
];

const LO_P = 40, HI_P = 86;

function hsv(h: number, s: number, v: number): RGB {
  const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}

/** the colour of a pitch under a look */
export function noteColor(look: Look, p: number): RGB {
  switch (look.palette) {
    case 'mono': return hex(look.colorA);
    case 'hands': return p < look.splitNote ? hex(look.colorA) : hex(look.colorB);
    case 'rainbow': return hsv(((((p % 12) + 12) % 12) * 7 % 12) / 12, 0.75, 1); // circle of fifths around the wheel
    default: {
      const pal = PALETTES.find((x) => x.id === look.palette) ?? PALETTES[0];
      return ramp(pal.stops!, (p - LO_P) / (HI_P - LO_P));
    }
  }
}

/** the saber's resting colour: the palette's middle */
export function saberBase(look: Look): RGB {
  if (look.palette === 'teal') return rgb(140, 245, 225); // exact original
  const c = noteColor(look, 64);
  return [0.35 + 0.65 * c[0], 0.35 + 0.65 * c[1], 0.35 + 0.65 * c[2]];
}

// ---------- panel schema ----------

export type LayerId = 'colors' | 'notes' | 'saber' | 'impact' | 'particles' | 'lighting' | 'background' | 'finish';

export type Control =
  | { key: keyof Look; kind: 'slider'; label: string; min: number; max: number; step: number; unit?: string; fmt?: (v: number) => string; hint?: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'select'; label: string; options: { value: string; label: string }[]; when?: (l: Look) => boolean; segmented?: boolean }
  | { key: keyof Look; kind: 'texture'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'color'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'toggle'; label: string; hint?: string }
  | { key: keyof Look; kind: 'note'; label: string; when?: (l: Look) => boolean };

export interface Section { title: string; controls: Control[] }

const pct = (v: number) => `${Math.round(v * 100)}`;
const x = (v: number) => `${v.toFixed(2)}×`;
const s1 = (v: number) => `${v.toFixed(1)} s`;
const tex = (l: Look) => l.noteStyle === 'texture';

export const LOOK_SCHEMA: Record<LayerId, Section[]> = {
  colors: [
    { title: 'Palette', controls: [
      { key: 'palette', kind: 'select', label: 'Colours', options: PALETTES.map((p) => ({ value: p.id, label: p.label })) },
      { key: 'colorA', kind: 'color', label: 'Colour', when: (l) => l.palette === 'mono' },
      { key: 'colorA', kind: 'color', label: 'Left hand', when: (l) => l.palette === 'hands' },
      { key: 'colorB', kind: 'color', label: 'Right hand', when: (l) => l.palette === 'hands' },
      { key: 'splitNote', kind: 'note', label: 'Split at', when: (l) => l.palette === 'hands' },
    ] },
  ],
  notes: [
    { title: 'Motion', controls: [
      { key: 'noteSpeed', kind: 'slider', label: 'Fall speed', min: 250, max: 1500, step: 10, fmt: (v) => `${Math.round(v)} px/s`, hint: 'Faster notes are longer for the same held time' },
    ] },
    { title: 'Shape', controls: [
      { key: 'noteWidth', kind: 'slider', label: 'Width', min: 0.4, max: 1.8, step: 0.01, fmt: x },
      { key: 'noteRound', kind: 'slider', label: 'Rounded corners', min: 0, max: 1.6, step: 0.01, fmt: pct },
      { key: 'noteVelocity', kind: 'slider', label: 'Louder notes bigger', min: 0, max: 2, step: 0.01, fmt: pct },
    ] },
    { title: 'Material', controls: [
      { key: 'noteStyle', kind: 'select', label: 'Material', segmented: true, options: [{ value: 'glass', label: 'Glass' }, { value: 'texture', label: 'Texture' }] },
      { key: 'noteTexture', kind: 'texture', label: 'Texture', when: tex },
      { key: 'texMode', kind: 'select', label: 'Colour', segmented: true, when: tex, options: [{ value: 'tint', label: 'Tinted' }, { value: 'natural', label: 'Natural' }, { value: 'glow', label: 'Glow' }] },
      { key: 'texScale', kind: 'slider', label: 'Texture size', min: 0.25, max: 4, step: 0.01, fmt: x, when: tex },
      { key: 'texRelief', kind: 'slider', label: 'Bumps', min: 0, max: 3, step: 0.01, fmt: pct, when: tex, hint: 'How strongly the surface detail catches the light' },
      { key: 'texShine', kind: 'slider', label: 'Shine', min: 0, max: 3, step: 0.01, fmt: pct, when: tex },
      { key: 'texSolid', kind: 'slider', label: 'Solid', min: 0, max: 1, step: 0.01, fmt: pct, when: tex, hint: 'Low lets the video show through the notes' },
    ] },
    { title: 'Look', controls: [
      { key: 'noteBright', kind: 'slider', label: 'Brightness', min: 0.2, max: 2, step: 0.01, fmt: pct },
      { key: 'noteRim', kind: 'slider', label: 'Rim light', min: 0, max: 2, step: 0.01, fmt: pct },
      { key: 'noteFill', kind: 'slider', label: 'Body', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'noteGlow', kind: 'slider', label: 'Glow', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'noteFade', kind: 'slider', label: 'Fade in', min: 0, max: 1, step: 0.01, fmt: pct, hint: 'How softly notes appear at the edge of the frame' },
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
