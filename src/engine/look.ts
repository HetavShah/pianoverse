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
/** SeeMusic-style particle presets: each sets the particle physics and look */
export const PARTICLE_PRESETS: { id: string; label: string; set: Partial<Look> }[] = [
  { id: 'default', label: 'Default', set: { partMode: 'plume', partAmount: 1, partSpeed: 1, partSwirl: 1, partLife: 1, partSize: 1, partRays: false, partOctaves: 1, partTurbFreq: 1, partSpread: 0, partGravity: 0, partWind: 0, partRise: 1 } },
  { id: 'explode', label: 'Explode', set: { partMode: 'plume', partAmount: 1.6, partSpeed: 2.6, partSwirl: 0.4, partLife: 0.7, partSize: 1, partRays: false, partOctaves: 1, partTurbFreq: 1, partSpread: 0.4, partGravity: 0.35, partWind: 0, partRise: 1 } },
  { id: 'fast', label: 'Fast playing', set: { partMode: 'plume', partAmount: 0.7, partSpeed: 1.4, partSwirl: 0.8, partLife: 0.55, partSize: 0.85, partRays: false, partOctaves: 1, partTurbFreq: 1.3, partSpread: 0, partGravity: 0, partWind: 0, partRise: 1.2 } },
  { id: 'count', label: 'High count', set: { partMode: 'plume', partAmount: 2.8, partSpeed: 1, partSwirl: 1, partLife: 1, partSize: 0.75, partRays: false, partOctaves: 1, partTurbFreq: 1, partSpread: 0.2, partGravity: 0, partWind: 0, partRise: 1 } },
  { id: 'turb', label: 'High turbulence', set: { partMode: 'plume', partAmount: 1.2, partSpeed: 1, partSwirl: 2.6, partLife: 1.3, partSize: 1, partRays: false, partOctaves: 3, partTurbFreq: 1.4, partSpread: 0, partGravity: 0, partWind: 0, partRise: 0.8 } },
  { id: 'streaks', label: 'Long streaklets', set: { partMode: 'plume', partAmount: 0.9, partSpeed: 1.6, partSwirl: 0.6, partLife: 1.1, partSize: 0.9, partRays: true, partRayLen: 2.2, partOctaves: 1, partTurbFreq: 1, partSpread: 0, partGravity: 0, partWind: 0, partRise: 1.2 } },
  { id: 'straight', label: 'Straight out', set: { partMode: 'plume', partAmount: 1, partSpeed: 1.8, partSwirl: 0.05, partLife: 1, partSize: 1, partRays: true, partRayLen: 1, partOctaves: 1, partTurbFreq: 1, partSpread: 0, partGravity: 0, partWind: 0, partRise: 1.6 } },
  { id: 'fountain', label: 'Fountain', set: { partMode: 'fountain', partAmount: 1, partSpeed: 1, partSwirl: 1, partLife: 1, partSize: 1, partRays: false, partOctaves: 1, partTurbFreq: 1, partSpread: 0, partGravity: 0, partWind: 0, partRise: 1 } },
  { id: 'spray', label: 'Held-note spray', set: { partMode: 'spray', partAmount: 1, partSpeed: 1, partSwirl: 1, partLife: 1, partSize: 0.85, partRays: false, partOctaves: 1, partTurbFreq: 1, partSpread: 0, partGravity: 0, partWind: 0, partRise: 1 } },
  { id: 'vortex', label: 'Vortex', set: { partMode: 'vortex', partAmount: 1, partSpeed: 1, partSwirl: 1, partLife: 1, partSize: 1, partRays: false, partOctaves: 1, partTurbFreq: 1, partSpread: 0, partGravity: 0, partWind: 0, partRise: 1 } },
  { id: 'twirl', label: 'Twirl', set: { partMode: 'plume', partAmount: 1.2, partSpeed: 0.8, partSwirl: 2.2, partLife: 1.6, partSize: 1, partRays: false, partOctaves: 2, partTurbFreq: 0.6, partSpread: 0, partGravity: 0, partWind: 0.2, partRise: 0.7 } },
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

export type PaletteId = 'custom' | 'teal' | 'swan' | 'ember' | 'neon' | 'aurora' | 'synthwave' | 'sunset' | 'ocean' | 'candy' | 'forest' | 'gold' | 'spectrum'
  | 'rainbow' | 'mono' | 'hands'; // the last three are older names, now colour modes (see resolveLook)
/** how notes take their colour (the first seven are offered; the rest are older names, see resolveLook) */
export type ColorBy = 'single' | 'twelve' | 'gradient' | 'tracks' | 'channels' | 'hands' | 'random'
  | 'pitch' | 'loudness' | 'time' | 'noteName';
export const COLOR_BY: { id: ColorBy; label: string; hint: string }[] = [
  { id: 'single', label: '1 colour', hint: 'Every note the same colour' },
  { id: 'twelve', label: '12 colours', hint: 'One colour for each note name: every C, every C♯ …' },
  { id: 'gradient', label: 'Gradient', hint: 'Colours blend across the keyboard, along each note, by loudness or over time' },
  { id: 'tracks', label: 'Tracks', hint: 'One colour per MIDI track' },
  { id: 'channels', label: 'Channels', hint: 'One colour per MIDI channel' },
  { id: 'hands', label: 'Divide', hint: 'One colour below a dividing key, another above it' },
  { id: 'random', label: 'Random', hint: 'Each note gets its own colour' },
];
export type GradMap = 'pitch' | 'loudness' | 'time';
export type GradDir = 'across' | 'up' | 'diagUp' | 'diagDown';
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export type SaberStyle = 'plasma' | 'straight' | 'electric' | 'soft' | 'flame';
export const SABER_STYLES: { id: SaberStyle; label: string }[] = [
  { id: 'plasma', label: 'Plasma' }, { id: 'straight', label: 'Straight' }, { id: 'electric', label: 'Electric' }, { id: 'soft', label: 'Soft beam' }, { id: 'flame', label: 'Flame' },
];
/** saber styles as picture-free cards */
export const SABER_CARDS = SABER_STYLES.map((s0) => ({ id: s0.id, label: s0.label, set: { saberStyle: s0.id } as Partial<Look> }));

export interface Look {
  // colours
  palette: PaletteId;
  colorA: string; // mono colour / left hand
  colorB: string; // right hand
  splitNote: number; // hands: notes below go to colour A
  colorBy: ColorBy;
  gradMap: GradMap; // what the gradient follows
  gradDir: GradDir; // across the keyboard, up each note, or both
  gradColors: string[]; // the custom gradient's colours (palette 'custom')
  twelveColors: string[]; // C, C♯ … B
  trackColors: string[];
  channelColors: string[];
  randomFrom: 'gradient' | 'any';
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
  saberStyle: SaberStyle;
  saberOpacity: number;
  saberOffset: number; // moves the saber up (+) or down (-) from the back edge of the keys, in key widths
  saberCustom: boolean; // use saberColor instead of the palette
  saberColor: string;
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
  partSpeed: number; // launch speed
  partMode: 'plume' | 'fountain' | 'spray' | 'vortex' | 'shape'; // the kind of particle animation
  partShape: string; // 'shape' mode: built-in name or 'user:<id>' SVG
  partShapeSize: number;
  partShapeHold: number; // how long the shape holds
  partTurbX: number; partTurbY: number; partTurbZ: number; // turbulence strength per direction (Z: in and out of the screen)
  partTurbFreq: number; // size of the swirls (higher = smaller, busier)
  partTurbEvo: number; // how fast the swirls change
  partOctaves: number; // layers of finer swirls
  partOctScale: number; // each layer this much finer
  partOctMul: number; // each layer this much weaker
  partSpread: number; // how widely particles start round the hit point
  partOpacity: number;
  partAlphaF: number; // how much particles darken what is behind them
  partAdditive: number; // how much light they add
  partBright: number;
  partRays: boolean; // particles stretch along their motion
  partRayLen: number;
  // background
  bgDarken: number;
  bgContrast: number;
  bgSaturation: number;
  bgVignette: number;
  footOpacity: number; footScale: number; footX: number; footY: number; footRot: number;
  footCropT: number; footCropB: number; footCropL: number; footCropR: number;
  footBright: number; footHue: number;
  bgColorOn: boolean; bgColor: string;
  bgImageOn: boolean; bgImage: string; // texture library key
  bgImgOpacity: number; bgImgScale: number; bgImgX: number; bgImgY: number; bgImgRot: number;
  bgImgBright: number; bgImgContrast: number; bgImgHue: number; bgImgSat: number;
  // finish
  bloom: number;
  bloomWide: number;
  fringe: number;
  grain: number;
}

function hsvEarly(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}
const toHexEarly = (c: [number, number, number]) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

export const DEFAULT_LOOK: Look = {
  colorBy: 'gradient', hueShift: 0, colorSat: 1, colorCycle: 20,
  gradMap: 'pitch', gradDir: 'across', gradColors: ['#3c6eff', '#14d7be', '#78ffaa'], randomFrom: 'any',
  twelveColors: Array.from({ length: 12 }, (_, i) => toHexEarly(hsvEarly((i * 7) % 12 / 12, 0.75, 1))),
  trackColors: ['#2e9bff', '#3ccf3c', '#a35cff', '#ff8a2e', '#ff4f9a', '#2ee0d0', '#ffd23c', '#e8e8e8'],
  channelColors: ['#2e9bff', '#3ccf3c', '#a35cff', '#ff8a2e', '#ff4f9a', '#2ee0d0', '#ffd23c', '#e8e8e8'],
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
  saberStyle: 'plasma', saberOpacity: 1, saberOffset: 0, saberCustom: false, saberColor: '#8cf5e1',
  flashSize: 1, flashBright: 1, streakLen: 1, streakBright: 1, impactTime: 1.3,
  keyBright: 1, keyAnticipate: 0.5, keyHeld: 1, relight: 1, relightRadius: 1, bassPulse: 1,
  partAmount: 1, partRise: 1, partSwirl: 1, partWind: 0, partGravity: 0, partLife: 1, partSize: 1, partTwinkle: 1, partHaze: 1, partStars: 1, partColor: 1, partVelocity: true,
  partSpeed: 1, partMode: 'plume', partShape: 'heart', partShapeSize: 1, partShapeHold: 1, partTurbX: 1, partTurbY: 1, partTurbZ: 0, partTurbFreq: 1, partTurbEvo: 1, partOctaves: 1, partOctScale: 2, partOctMul: 0.5,
  partSpread: 0, partOpacity: 1, partAlphaF: 0, partAdditive: 1, partBright: 1, partRays: false, partRayLen: 1,
  bgDarken: 1, bgContrast: 1, bgSaturation: 1, bgVignette: 1,
  footOpacity: 1, footScale: 1, footX: 0, footY: 0, footRot: 0, footCropT: 0, footCropB: 0, footCropL: 0, footCropR: 0, footBright: 0, footHue: 0,
  bgColorOn: false, bgColor: '#000000', bgImageOn: false, bgImage: '',
  bgImgOpacity: 1, bgImgScale: 1, bgImgX: 0, bgImgY: 0, bgImgRot: 0, bgImgBright: 0, bgImgContrast: 1, bgImgHue: 0, bgImgSat: 1,
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
  // older colour modes are now gradient settings or 12 colours
  if (l.colorBy === 'pitch' || l.colorBy === 'loudness' || l.colorBy === 'time') { l.gradMap = l.colorBy; l.colorBy = 'gradient'; }
  else if (l.colorBy === 'noteName') l.colorBy = 'twelve';
  if (l.colorBy === 'random' && !('randomFrom' in old)) l.randomFrom = 'gradient';
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
  { id: 'custom', label: 'Custom' },
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

// ---------- panel schema ----------

export type LayerId = 'colors' | 'notes' | 'saber' | 'impact' | 'particles' | 'lighting' | 'background' | 'finish';

export type Control =
  | { key: keyof Look; kind: 'slider'; label: string; min: number; max: number; step: number; unit?: string; fmt?: (v: number) => string; hint?: string; when?: (l: Look) => boolean; hue?: boolean }
  | { key: keyof Look; kind: 'colorBy'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'wheel'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'select'; label: string; options: { value: string; label: string }[]; when?: (l: Look) => boolean; segmented?: boolean }
  | { key: keyof Look; kind: 'texture'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'noteStyle'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'swatches'; label: string; count?: number; names?: string[]; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'cards'; label: string; cards: { id: string; label: string; set: Partial<Look> }[]; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'bgImage'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'color'; label: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'toggle'; label: string; hint?: string; when?: (l: Look) => boolean }
  | { key: keyof Look; kind: 'note'; label: string; when?: (l: Look) => boolean };

export interface Section { title: string; controls: Control[]; /** hidden under "More settings" */ more?: boolean; /** starts folded */ fold?: boolean }

const pct = (v: number) => `${Math.round(v * 100)}`;
const x = (v: number) => `${v.toFixed(2)}×`;
const s1 = (v: number) => `${v.toFixed(1)} s`;
const tex = (l: Look) => l.texOn;
const is2d = (l: Look) => l.noteDim === '2d';
const is3d = (l: Look) => l.noteDim === '3d';
const isGrad = (l: Look) => l.colorBy === 'gradient';

export const LOOK_SCHEMA: Record<LayerId, Section[]> = {
  colors: [
    { title: 'Colour mode', controls: [
      { key: 'colorBy', kind: 'colorBy', label: 'Colour by' },
    ] },
    { title: 'Colours', controls: [
      { key: 'colorA', kind: 'wheel', label: 'Colour', when: (l) => l.colorBy === 'single' },
      { key: 'twelveColors', kind: 'swatches', label: 'Note colours', names: NOTE_NAMES, when: (l) => l.colorBy === 'twelve' },
      { key: 'gradMap', kind: 'select', label: 'Gradient follows', segmented: true, when: isGrad, options: [{ value: 'pitch', label: 'Pitch' }, { value: 'loudness', label: 'Loudness' }, { value: 'time', label: 'Time' }] },
      { key: 'gradDir', kind: 'select', label: 'Direction', segmented: true, when: isGrad, options: [{ value: 'across', label: '→' }, { value: 'up', label: '↑' }, { value: 'diagUp', label: '↗' }, { value: 'diagDown', label: '↘' }] },
      { key: 'palette', kind: 'select', label: 'Gradient', when: (l) => isGrad(l) || (l.colorBy === 'random' && l.randomFrom === 'gradient'), options: GRADIENTS.map((p) => ({ value: p.id, label: p.label })) },
      { key: 'gradColors', kind: 'swatches', label: 'Custom gradient colours', count: 6, when: (l) => (isGrad(l) || l.colorBy === 'random') && l.palette === 'custom' },
      { key: 'colorCycle', kind: 'slider', label: 'Seconds per cycle', min: 4, max: 120, step: 1, fmt: (v) => `${Math.round(v)} s`, when: (l) => isGrad(l) && l.gradMap === 'time' },
      { key: 'trackColors', kind: 'swatches', label: 'Track colours', names: ['Track 1', 'Track 2', 'Track 3', 'Track 4', 'Track 5', 'Track 6', 'Track 7', 'Track 8'], when: (l) => l.colorBy === 'tracks' },
      { key: 'channelColors', kind: 'swatches', label: 'Channel colours', names: ['Ch 1', 'Ch 2', 'Ch 3', 'Ch 4', 'Ch 5', 'Ch 6', 'Ch 7', 'Ch 8'], when: (l) => l.colorBy === 'channels' },
      { key: 'colorA', kind: 'wheel', label: 'Below the dividing key', when: (l) => l.colorBy === 'hands' },
      { key: 'colorB', kind: 'wheel', label: 'From the dividing key up', when: (l) => l.colorBy === 'hands' },
      { key: 'splitNote', kind: 'note', label: 'Dividing key', when: (l) => l.colorBy === 'hands' },
      { key: 'randomFrom', kind: 'select', label: 'Random from', segmented: true, when: (l) => l.colorBy === 'random', options: [{ value: 'any', label: 'Any colour' }, { value: 'gradient', label: 'A gradient' }] },
    ] },
    { title: 'Adjust', controls: [
      { key: 'hueShift', kind: 'slider', label: 'Hue', min: -180, max: 180, step: 1, fmt: (v) => `${Math.round(v)}°`, hue: true, hint: 'Turns every colour round the colour wheel' },
      { key: 'colorSat', kind: 'slider', label: 'Saturation', min: 0, max: 1.5, step: 0.01, fmt: pct },
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
    { title: 'Saber style', controls: [
      { key: 'saberStyle', kind: 'cards', label: 'Style', cards: SABER_CARDS },
    ] },
    { title: 'Saber', controls: [
      { key: 'saberBright', kind: 'slider', label: 'Brightness', min: 0, max: 2.5, step: 0.01, fmt: pct },
      { key: 'saberOpacity', kind: 'slider', label: 'Opacity', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'saberOffset', kind: 'slider', label: 'Position', min: -1.5, max: 1.5, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'Moves the saber above (+) or below (−) the back edge of the keys' },
      { key: 'saberThick', kind: 'slider', label: 'Scale', min: 0.3, max: 3, step: 0.01, fmt: x },
    ] },
    { title: 'Colour', controls: [
      { key: 'saberCustom', kind: 'toggle', label: 'Custom colour' },
      { key: 'saberColor', kind: 'wheel', label: 'Saber colour', when: (l) => l.saberCustom },
      { key: 'saberTint', kind: 'slider', label: 'Take note colours', min: 0, max: 1, step: 0.01, fmt: pct, hint: 'Where you play, the saber takes on the notes\' colours' },
    ] },
    { title: 'Motion', fold: true, controls: [
      { key: 'saberFlicker', kind: 'slider', label: 'Flame height', min: 0, max: 3, step: 0.01, fmt: pct, when: (l) => l.saberStyle !== 'straight' && l.saberStyle !== 'soft' },
      { key: 'saberReact', kind: 'slider', label: 'Flare where you play', min: 0, max: 2.5, step: 0.01, fmt: pct },
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
    { title: 'Presets', controls: [
      { key: 'partAmount', kind: 'cards', label: 'Preset', cards: PARTICLE_PRESETS },
    ] },
    { title: 'Main particles', controls: [
      { key: 'partSize', kind: 'slider', label: 'Particle size', min: 0.3, max: 3, step: 0.01, fmt: x },
      { key: 'partAmount', kind: 'slider', label: 'Particle count', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'partSpeed', kind: 'slider', label: 'Particle speed', min: 0, max: 3, step: 0.01, fmt: x },
      { key: 'partLife', kind: 'slider', label: 'Particle lifetime', min: 0.3, max: 3, step: 0.01, fmt: x },
    ] },
    { title: 'Particle turbulence', fold: true, controls: [
      { key: 'partSwirl', kind: 'slider', label: 'Turbulence', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'partTurbX', kind: 'slider', label: 'Turbulence X', min: 0, max: 3, step: 0.01, fmt: x },
      { key: 'partTurbY', kind: 'slider', label: 'Turbulence Y', min: 0, max: 3, step: 0.01, fmt: x },
      { key: 'partTurbZ', kind: 'slider', label: 'Turbulence Z', min: 0, max: 2, step: 0.01, fmt: x, hint: 'Particles drift towards and away from you: they grow, shrink and flicker' },
      { key: 'partTurbFreq', kind: 'slider', label: 'Turbulence frequency', min: 0.2, max: 4, step: 0.01, fmt: x },
      { key: 'partTurbEvo', kind: 'slider', label: 'Evolution speed', min: 0, max: 4, step: 0.01, fmt: x },
      { key: 'partOctaves', kind: 'slider', label: 'Turbulence octaves', min: 1, max: 3, step: 1, fmt: (v) => String(Math.round(v)) },
      { key: 'partOctScale', kind: 'slider', label: 'Octave scale', min: 1.2, max: 4, step: 0.01, fmt: x, when: (l) => l.partOctaves > 1 },
      { key: 'partOctMul', kind: 'slider', label: 'Octave multiplier', min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2), when: (l) => l.partOctaves > 1 },
      { key: 'partSpread', kind: 'slider', label: 'Particle spread', min: 0, max: 2, step: 0.01, fmt: x },
      { key: 'partWind', kind: 'slider', label: 'Sideways drift', min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
      { key: 'partGravity', kind: 'slider', label: 'Gravity', min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}`, hint: 'Positive pulls glitter down, negative lifts it faster' },
      { key: 'partRise', kind: 'slider', label: 'Rise height', min: 0, max: 2.5, step: 0.01, fmt: pct },
    ] },
    { title: 'Particle look', fold: true, controls: [
      { key: 'partOpacity', kind: 'slider', label: 'Particle opacity', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'partAlphaF', kind: 'slider', label: 'Alpha factor', min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How much particles darken what is behind them' },
      { key: 'partAdditive', kind: 'slider', label: 'Additive factor', min: 0, max: 2, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How much light particles add' },
      { key: 'partBright', kind: 'slider', label: 'Particle brightness', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'partColor', kind: 'slider', label: 'Note colour', min: 0, max: 1.5, step: 0.01, fmt: pct, hint: '0 = white glitter' },
      { key: 'partTwinkle', kind: 'slider', label: 'Twinkle', min: 0, max: 1.5, step: 0.01, fmt: pct },
      { key: 'partHaze', kind: 'slider', label: 'Haze', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'partStars', kind: 'slider', label: 'Star glints', min: 0, max: 4, step: 0.01, fmt: pct },
      { key: 'partVelocity', kind: 'toggle', label: 'Louder notes, bigger plumes' },
    ] },
    { title: 'Particle rays', fold: true, controls: [
      { key: 'partRays', kind: 'toggle', label: 'Particle rays', hint: 'Particles stretch into short streaks along their motion' },
      { key: 'partRayLen', kind: 'slider', label: 'Ray length', min: 0.2, max: 4, step: 0.01, fmt: x, when: (l) => l.partRays },
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
    { title: 'Video', controls: [
      { key: 'footOpacity', kind: 'slider', label: 'Video opacity', min: 0, max: 1, step: 0.01, fmt: pct, hint: 'Lower lets the background show through your video' },
      { key: 'bgDarken', kind: 'slider', label: 'Darken', min: 0, max: 2, step: 0.01, fmt: pct },
      { key: 'footBright', kind: 'slider', label: 'Video brightness', min: -0.5, max: 0.5, step: 0.01, fmt: (v) => v.toFixed(2) },
      { key: 'bgContrast', kind: 'slider', label: 'Video contrast', min: 0, max: 2, step: 0.01, fmt: pct },
      { key: 'footHue', kind: 'slider', label: 'Video hue', min: -180, max: 180, step: 1, fmt: (v) => `${Math.round(v)}°`, hue: true },
      { key: 'bgSaturation', kind: 'slider', label: 'Video saturation', min: 0, max: 2, step: 0.01, fmt: pct },
      { key: 'bgVignette', kind: 'slider', label: 'Vignette', min: 0, max: 2, step: 0.01, fmt: pct },
    ] },
    { title: 'Video position', fold: true, controls: [
      { key: 'footScale', kind: 'slider', label: 'Scale', min: 0.3, max: 2, step: 0.01, fmt: x, hint: 'The notes and effects move with the video' },
      { key: 'footX', kind: 'slider', label: 'Position X', min: -0.5, max: 0.5, step: 0.005, fmt: (v) => v.toFixed(2) },
      { key: 'footY', kind: 'slider', label: 'Position Y', min: -0.5, max: 0.5, step: 0.005, fmt: (v) => v.toFixed(2) },
      { key: 'footRot', kind: 'slider', label: 'Rotation', min: -45, max: 45, step: 0.5, fmt: (v) => `${v}°` },
      { key: 'footCropT', kind: 'slider', label: 'Crop top', min: 0, max: 0.6, step: 0.005, fmt: pct },
      { key: 'footCropB', kind: 'slider', label: 'Crop bottom', min: 0, max: 0.6, step: 0.005, fmt: pct },
      { key: 'footCropL', kind: 'slider', label: 'Crop left', min: 0, max: 0.6, step: 0.005, fmt: pct },
      { key: 'footCropR', kind: 'slider', label: 'Crop right', min: 0, max: 0.6, step: 0.005, fmt: pct },
    ] },
    { title: 'Background', controls: [
      { key: 'bgColorOn', kind: 'toggle', label: 'Background colour' },
      { key: 'bgColor', kind: 'wheel', label: 'Colour', when: (l) => l.bgColorOn },
      { key: 'bgImageOn', kind: 'toggle', label: 'Background image or video' },
      { key: 'bgImage', kind: 'bgImage', label: 'Image', when: (l) => l.bgImageOn },
    ] },
    { title: 'Background image', fold: true, controls: [
      { key: 'bgImgOpacity', kind: 'slider', label: 'Image opacity', min: 0, max: 1, step: 0.01, fmt: pct, when: (l) => l.bgImageOn },
      { key: 'bgImgScale', kind: 'slider', label: 'Image scale', min: 0.3, max: 3, step: 0.01, fmt: x, when: (l) => l.bgImageOn },
      { key: 'bgImgX', kind: 'slider', label: 'Image position X', min: -0.5, max: 0.5, step: 0.005, fmt: (v) => v.toFixed(2), when: (l) => l.bgImageOn },
      { key: 'bgImgY', kind: 'slider', label: 'Image position Y', min: -0.5, max: 0.5, step: 0.005, fmt: (v) => v.toFixed(2), when: (l) => l.bgImageOn },
      { key: 'bgImgRot', kind: 'slider', label: 'Image rotation', min: -180, max: 180, step: 1, fmt: (v) => `${v}°`, when: (l) => l.bgImageOn },
      { key: 'bgImgBright', kind: 'slider', label: 'Image brightness', min: -0.5, max: 0.5, step: 0.01, fmt: (v) => v.toFixed(2), when: (l) => l.bgImageOn },
      { key: 'bgImgContrast', kind: 'slider', label: 'Image contrast', min: 0, max: 3, step: 0.01, fmt: (v) => v.toFixed(2), when: (l) => l.bgImageOn },
      { key: 'bgImgHue', kind: 'slider', label: 'Image hue', min: -180, max: 180, step: 1, fmt: (v) => `${Math.round(v)}°`, hue: true, when: (l) => l.bgImageOn },
      { key: 'bgImgSat', kind: 'slider', label: 'Image saturation', min: 0, max: 2, step: 0.01, fmt: (v) => v.toFixed(2), when: (l) => l.bgImageOn },
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

/** settings compare by value (some are lists of colours) */
export const sameValue = (a: unknown, b: unknown) => a === b || (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b));

/** does the project's look still match the preset exactly? */
export function matchesPreset(current: Partial<Look> | undefined, preset: Preset): boolean {
  const a = resolveLook(current), b = resolveLook(preset.look);
  return (Object.keys(DEFAULT_LOOK) as (keyof Look)[]).every((k) => PER_VIDEO_KEYS.includes(k) || sameValue(a[k], b[k]));
}

/** the look to store in a preset: everything except the settings that belong to one video */
export function presetLookFrom(current: Partial<Look> | undefined): Partial<Look> {
  const l: Partial<Look> = { ...resolveLook(current) };
  for (const k of PER_VIDEO_KEYS) delete l[k];
  return l;
}
