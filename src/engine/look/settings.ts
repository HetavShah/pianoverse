// The look: every visual setting of the effects, with defaults that reproduce the original approved look exactly
// (Lagoon's colours). The renderer reads a resolved Look; the Style step's panels are described in
// ui/style/lookSchema.ts; presets (the gallery's looks) are in presets.ts; colours in color.ts.
import type { PaletteId } from './color';
import { hsv, toHex } from './color';


export type NoteDim = '2d' | '3d';
export type Note2D = 'filled' | 'hollow' | 'ball' | 'soft';
export type Note3D = 'glass' | 'gem' | 'round' | 'outline' | 'angled';
export const NOTE_2D: { id: Note2D; label: string }[] = [
  { id: 'filled', label: 'Filled' }, { id: 'hollow', label: 'Hollow' }, { id: 'ball', label: 'Ball' }, { id: 'soft', label: 'Soft glow' },
];
export const NOTE_3D: { id: Note3D; label: string }[] = [
  { id: 'glass', label: 'Glass' }, { id: 'gem', label: 'Gem' }, { id: 'round', label: 'Round' }, { id: 'outline', label: 'Outline' }, { id: 'angled', label: 'Angled' },
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
  saberIdle: number; // glow of the line where nothing is played (0 = lit only where you play)
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
  flashStar: number; // cross of light on each hit, held while the note sounds (0 = off)
  // lighting
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
  partShapeHold: number; // how long particles travel along the shape
  partShapeDir: 'cw' | 'ccw'; // which way round the shape particles travel
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
  partSparks: number; // extra layers on every hit: sparks that arc and fall,
  partGlitter: number; // fine glitter that hangs and twinkles,
  partGlow: number; // and soft glows that rise
  partSparkStyle: 'trails' | 'fan'; // a few long curving trails, or a wide fan of short white sparks
  partSmokeStyle: 'haze' | 'fountain'; // faint haze that rises, or smoke that arcs up and falls like a fountain
  partAmbient: number; // fine dust floating above the keys all the time (0 = none)
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


export const DEFAULT_LOOK: Look = {
  colorBy: 'gradient', hueShift: 0, colorSat: 1, colorCycle: 20,
  gradMap: 'pitch', gradDir: 'across', gradColors: ['#3c6eff', '#14d7be', '#78ffaa'], randomFrom: 'any',
  twelveColors: Array.from({ length: 12 }, (_, i) => toHex(hsv((i * 7) % 12 / 12, 0.75, 1))),
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
  saberBright: 1, saberThick: 1, saberFlicker: 1, saberReact: 1, saberIdle: 1, saberTint: 1,
  saberStyle: 'plasma', saberOpacity: 1, saberOffset: 0, saberCustom: false, saberColor: '#8cf5e1',
  flashSize: 1, flashBright: 1, streakLen: 1, streakBright: 1, impactTime: 1.3, flashStar: 0,
  keyAnticipate: 0, keyHeld: 1, relight: 1, relightRadius: 1, bassPulse: 1,
  partAmount: 1, partRise: 1, partSwirl: 1, partWind: 0, partGravity: 0, partLife: 1, partSize: 1, partTwinkle: 1, partHaze: 1, partStars: 1, partColor: 1, partVelocity: true,
  partSpeed: 1, partMode: 'plume', partShape: 'heart', partShapeSize: 1, partShapeHold: 1, partShapeDir: 'cw', partTurbX: 1, partTurbY: 1, partTurbZ: 0, partTurbFreq: 1, partTurbEvo: 1, partOctaves: 1, partOctScale: 2, partOctMul: 0.5,
  partSpread: 0, partOpacity: 1, partAlphaF: 0, partAdditive: 1, partBright: 1, partRays: false, partRayLen: 1, partSparks: 1, partGlitter: 1, partGlow: 1, partSparkStyle: 'trails', partSmokeStyle: 'haze', partAmbient: 0,
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


/** settings compare by value (some are lists of colours) */
export const sameValue = (a: unknown, b: unknown) => a === b || (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b));
