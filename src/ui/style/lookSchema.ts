// The Style step's panels, described as data: each layer (Colours, Notes, Saber …) is a list of sections, each a
// list of controls bound to a Look setting. LookControls draws them, so adding a setting to a panel is one line here.
import { COLOR_BY, GRADIENTS, KEY_NAMES, Look, NOTE_2D, NOTE_3D, NOTE_NAMES, PARTICLE_PRESETS, SABER_STYLES } from '../../engine/look';

/** the note styles offered as picture cards (each sets 2D/3D and the shape) */
export const NOTE_STYLE_CARDS: { id: string; label: string; set: Partial<Look> }[] = [
  { id: 'glass', label: 'Glass', set: { noteDim: '3d', note3d: 'glass' } },
  { id: 'gem', label: 'Gem', set: { noteDim: '3d', note3d: 'gem' } },
  { id: 'round', label: 'Round', set: { noteDim: '3d', note3d: 'round' } },
  { id: 'solid', label: 'Solid', set: { noteDim: '2d', note2d: 'filled' } },
  { id: 'outline', label: 'Outline', set: { noteDim: '2d', note2d: 'hollow' } },
  { id: 'soft', label: 'Soft glow', set: { noteDim: '2d', note2d: 'soft' } },
];
/** saber styles as picture-free cards */
export const SABER_CARDS = SABER_STYLES.map((s0) => ({ id: s0.id, label: s0.label, set: { saberStyle: s0.id } as Partial<Look> }));


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
  | { key: keyof Look; kind: 'shapePick'; label: string; when?: (l: Look) => boolean }
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
      { key: 'saberIdle', kind: 'slider', label: 'Glow where you don’t play', min: 0, max: 1, step: 0.01, fmt: pct, hint: 'Lower it and the saber lights up only where notes land' },
      { key: 'keyHeld', kind: 'slider', label: 'Glow over held notes', min: 0, max: 2.5, step: 0.01, fmt: pct, when: (l) => l.saberIdle < 1 },
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
      { key: 'flashStar', kind: 'slider', label: 'Star flare', min: 0, max: 2.5, step: 0.01, fmt: pct, hint: 'A cross of light on each key you play' },
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
    { title: 'Shape', controls: [
      { key: 'partShape', kind: 'shapePick', label: 'Shape', when: (l) => l.partMode === 'shape' },
      { key: 'partShapeSize', kind: 'slider', label: 'Shape size', min: 0.3, max: 1.6, step: 0.01, fmt: x, when: (l) => l.partMode === 'shape' },
      { key: 'partShapeDir', kind: 'select', label: 'Direction', segmented: true, when: (l) => l.partMode === 'shape', options: [{ value: 'cw', label: 'Clockwise' }, { value: 'ccw', label: 'Anticlockwise' }] },
    ] },
    { title: 'Main particles', controls: [
      { key: 'partSize', kind: 'slider', label: 'Particle size', min: 0.3, max: 3, step: 0.01, fmt: x },
      { key: 'partAmount', kind: 'slider', label: 'Particle count', min: 0, max: 3, step: 0.01, fmt: pct },
      { key: 'partSpeed', kind: 'slider', label: 'Particle speed', min: 0, max: 3, step: 0.01, fmt: x },
      { key: 'partLife', kind: 'slider', label: 'Particle lifetime', min: 0.3, max: 3, step: 0.01, fmt: x },
      { key: 'partShapeHold', kind: 'slider', label: 'Time to trace a shape', min: 0.5, max: 2, step: 0.01, fmt: (v) => `${(6.3 * v).toFixed(1)} s`, hint: 'How long sparks take to go once round a shape (in shape sections too)' },
    ] },
    { title: 'Layers on every hit', controls: [
      { key: 'partSparks', kind: 'slider', label: 'Sparks', min: 0, max: 3, step: 0.01, fmt: pct, hint: 'Bright sparks that fly out and fall' },
      { key: 'partGlitter', kind: 'slider', label: 'Glitter', min: 0, max: 3, step: 0.01, fmt: pct, hint: 'Fine dust that hangs in the air and twinkles' },
      { key: 'partGlow', kind: 'slider', label: 'Glow and smoke', min: 0, max: 3, step: 0.01, fmt: pct, hint: 'Soft light and smoke from each key' },
      { key: 'partSparkStyle', kind: 'select', label: 'Sparks', segmented: true, options: [{ value: 'trails', label: 'Long trails' }, { value: 'fan', label: 'Fan' }] },
      { key: 'partSmokeStyle', kind: 'select', label: 'Smoke', segmented: true, options: [{ value: 'haze', label: 'Rising haze' }, { value: 'fountain', label: 'Fountain' }] },
      { key: 'partAmbient', kind: 'slider', label: 'Floating dust', min: 0, max: 2, step: 0.01, fmt: pct, hint: 'Fine dust hanging above the keys the whole time' },
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
