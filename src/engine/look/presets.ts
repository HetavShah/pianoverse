// Presets: the looks in the gallery (each a complete style), the particle presets, and applying a preset to a
// project's look (settings that belong to one video are kept).
import { DEFAULT_LOOK, Look, resolveLook, sameValue } from './settings';

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
  { id: 'shape', label: 'Shape (whole video)', set: { partMode: 'shape', partAmount: 1, partSpeed: 1, partSwirl: 1, partLife: 1, partSize: 1, partRays: false, partOctaves: 1, partTurbFreq: 1, partSpread: 0, partGravity: 0, partWind: 0, partRise: 1 } },
  { id: 'twirl', label: 'Twirl', set: { partMode: 'plume', partAmount: 1.2, partSpeed: 0.8, partSwirl: 2.2, partLife: 1.6, partSize: 1, partRays: false, partOctaves: 2, partTurbFreq: 0.6, partSpread: 0, partGravity: 0, partWind: 0.2, partRise: 0.7 } },
];


export interface Preset { id: string; name: string; builtIn?: boolean; look: Partial<Look> }

const parts = (id: string) => PARTICLE_PRESETS.find((p) => p.id === id)!.set;
/** the looks in the gallery: each a complete style (colours, notes, saber, particles, finish) */
// Two ways of drawing particles, after the two best-known piano visualisers:
// fountain (Patrik Pietschmann): smoke thrown up from each key that arcs over and sinks, a fan of short white sparks,
//   fine dust hanging in the air the whole time;
// concert (Rousseau): compact clouds of coloured dust with white-hot centres, a few long curving trails, a faint
//   rising haze, a star of light on each key and a saber lit only where you play.
const fountainStyle: Partial<Look> = {
  ...parts('fountain'), partAmount: 0.3, partSize: 0.8, partRays: false,
  partSparkStyle: 'fan', partSparks: 1.2, partSmokeStyle: 'fountain', partGlow: 1.2, partGlitter: 0.3, partAmbient: 1.1,
  flashStar: 0.6, saberIdle: 0.25,
};
const concertStyle: Partial<Look> = {
  ...parts('default'), partRays: false, partColor: 1.2,
  partSparkStyle: 'trails', partSparks: 1.2, partSmokeStyle: 'haze', partGlow: 1, partGlitter: 1.1, partAmbient: 0.35,
  flashStar: 1.1, saberIdle: 0.08,
};
/** the looks in the gallery: each a complete style (colours, notes, saber, particles, finish) */
export const BUILT_IN_PRESETS: Preset[] = ([
  { id: 'interstellar-teal', name: 'Lagoon', look: { ...fountainStyle, noteRound: 1.4 } },
  { id: 'concert', name: 'Concert', look: {
    ...concertStyle, palette: 'gold', noteDim: '2d', note2d: 'filled', noteRound: 1.92, noteGlow: 0.6, noteOpacity: 0.95, noteRim: 0.6,
    saberStyle: 'straight', saberIdle: 0.06, saberCustom: true, saberColor: '#d9d4ff', saberThick: 0.8, saberTint: 1,
    flashStar: 1.3, flashSize: 1.3, streakLen: 0.6, relight: 1.5, partColor: 1.25, partSparks: 1.3, partGlitter: 1.2, partGlow: 1.2,
    bgDarken: 1.6, bgSaturation: 0.4, bloom: 1.1 } },
  { id: 'ember', name: 'Ember', look: { ...concertStyle, palette: 'ember', saberStyle: 'flame', saberIdle: 0.15, noteGlow: 1.2, bloom: 1.15, relight: 1.4, partSparks: 1.6, partGlitter: 1.3, bgSaturation: 0.5 } },
  { id: 'neon-night', name: 'Neon Night', look: { ...fountainStyle, palette: 'neon', noteDim: '2d', note2d: 'hollow', noteRound: 1.2, saberStyle: 'electric', partGlow: 1.3, partAmbient: 1.2, bloom: 1.35, fringe: 1.8, bgDarken: 1.5, bgSaturation: 0.55 } },
  { id: 'aurora', name: 'Aurora', look: { ...fountainStyle, palette: 'aurora', gradMap: 'time', colorCycle: 16, noteDim: '2d', note2d: 'soft', saberStyle: 'soft', partSmokeStyle: 'fountain', partGlow: 1.4, partSparks: 0.6, partAmbient: 1.5, bloomWide: 1.4 } },
  { id: 'swan', name: 'Swan', look: { ...concertStyle, palette: 'swan', saberStyle: 'soft', saberIdle: 0.15, partColor: 0.25, partAmount: 0.75, partStars: 1.6, partGlitter: 1.4, partSparks: 0.8, partAmbient: 0.6, bgSaturation: 0.45, relight: 0.6 } },
  { id: 'gold-leaf', name: 'Gold Leaf', look: { ...concertStyle, palette: 'gold', texOn: true, noteTexture: 'foil', texMode: 'natural', saberStyle: 'straight', saberCustom: true, saberColor: '#ffd27a', saberIdle: 0.2, partColor: 0.9, partSparks: 1.6, flashStar: 1, partAmbient: 0.5, bgSaturation: 0.7 } },
  { id: 'ink', name: 'Ink', look: { ...fountainStyle, colorBy: 'single', colorA: '#f2efe8', noteDim: '2d', note2d: 'filled', noteRound: 1.2, saberStyle: 'straight', saberCustom: true, saberColor: '#ffffff', saberIdle: 0.1, partColor: 0, partGlow: 0.5, partAmbient: 0.8, bgSaturation: 0, bgContrast: 1.35, grain: 2, bloom: 0.6, relight: 0.4 } },
  { id: 'synthwave', name: 'Synthwave', look: { ...fountainStyle, palette: 'synthwave', note3d: 'angled', saberStyle: 'electric', fringe: 2.2, bgVignette: 1.5, bgSaturation: 0.7 } },
  { id: 'ocean-gem', name: 'Ocean Gem', look: { ...fountainStyle, palette: 'ocean', note3d: 'gem', partGlow: 1.4, partAmbient: 1.2 } },
  { id: 'crystal', name: 'Crystal', look: { ...concertStyle, palette: 'swan', texOn: true, noteTexture: 'crystal', texMode: 'glow', saberStyle: 'soft', saberIdle: 0.12, ...parts('turb'), partColor: 0.5, partGlitter: 1.8, partSparks: 0.8, partAmbient: 1 } },
] as Preset[]).map((p) => ({ ...p, builtIn: true }));

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
  return (Object.keys(DEFAULT_LOOK) as (keyof Look)[]).every((k) => PER_VIDEO_KEYS.includes(k) || sameValue(a[k], b[k]));
}

/** the look to store in a preset: everything except the settings that belong to one video */
export function presetLookFrom(current: Partial<Look> | undefined): Partial<Look> {
  const l: Partial<Look> = { ...resolveLook(current) };
  for (const k of PER_VIDEO_KEYS) delete l[k];
  return l;
}
