// Lighting of the video itself (the Light step): exposure, contrast, highlights, shadows, warmth and saturation of
// the whole picture, and the room around the keyboard, which can be darkened so the keys and your hands stand out
// (the lit area follows the tracked keyboard). Applied to the footage before the look's own grade and the effects.

export interface Lighting {
  /** stops brighter (+) or darker (−) */
  exposure: number;
  contrast: number;
  /** pull down (−) or lift (+) the brightest parts */
  highlights: number;
  /** deepen (−) or lift (+) the darkest parts */
  shadows: number;
  /** cooler (−) or warmer (+) */
  warmth: number;
  saturation: number;
  /** brightness of the room away from the keyboard (1 = as filmed, 0 = black) */
  room: number;
  /** how far the light round the keyboard reaches */
  reach: number;
  /** how gently it fades into the room */
  softness: number;
  vignette: number;
}

export const DEFAULT_LIGHTING: Lighting = {
  exposure: 0, contrast: 1, highlights: 0, shadows: 0, warmth: 0, saturation: 1,
  room: 1, reach: 1, softness: 1, vignette: 0,
};

export const LIGHT_PRESETS: { id: string; label: string; set: Lighting }[] = [
  { id: 'filmed', label: 'As filmed', set: DEFAULT_LIGHTING },
  { id: 'moody', label: 'Moody room', set: { exposure: 0.1, contrast: 1.1, highlights: 0.1, shadows: -0.2, warmth: 0.2, saturation: 0.9, room: 0.25, reach: 1, softness: 0.8, vignette: 0.4 } },
  { id: 'stage', label: 'Warm stage', set: { exposure: 0.25, contrast: 1.15, highlights: -0.2, shadows: 0.15, warmth: 0.6, saturation: 1.1, room: 0.45, reach: 1.3, softness: 1, vignette: 0.3 } },
  { id: 'night', label: 'Night', set: { exposure: -0.2, contrast: 1.2, highlights: 0, shadows: -0.3, warmth: -0.5, saturation: 0.6, room: 0.08, reach: 0.8, softness: 0.6, vignette: 0.6 } },
];

export function resolveLighting(p?: Partial<Lighting> | null): Lighting {
  return { ...DEFAULT_LIGHTING, ...(p ?? {}) };
}

/** true when the lighting changes the picture at all */
export function lightingActive(l: Lighting): boolean {
  return (Object.keys(DEFAULT_LIGHTING) as (keyof Lighting)[]).some((k) => Math.abs(l[k] - DEFAULT_LIGHTING[k]) > 1e-4);
}

/** the preset these settings match, if any */
export function lightPresetOf(l: Lighting): string | null {
  const hit = LIGHT_PRESETS.find((p) => (Object.keys(p.set) as (keyof Lighting)[]).every((k) => Math.abs(p.set[k] - l[k]) < 1e-4));
  return hit?.id ?? null;
}
