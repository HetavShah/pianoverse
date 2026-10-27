// The project as the renderer needs it: settings resolved to full values and the notes prepared once, so nothing
// per frame has to look at the raw project file again.
import { fallUp } from '../direction';
import { Look, resolveLook } from '../look';
import { Lighting, resolveLighting } from '../lighting';
import { Keyboard, keyboardOf, Note, ParticleScene, prepareNotes, ProjectFile, Rect, sourceRect, trackingMatrix, trimRange } from '../project';
import { resolveTitles, Titles } from '../titles';

/** drawings shape particles can use at once (slot 0: the look's own shape, then one per section) */
export const SHAPE_SLOTS = 8;

export class DrawModel {
  readonly look: Look;
  readonly titles: Titles;
  readonly lighting: Lighting;
  /** notes in time order, with their colours */
  readonly notes: Note[];
  /** the keyboard; its tracking (H) is set to the current frame by the renderer */
  readonly kb: Keyboard;
  readonly whiteKeys: number;
  /** unit vector from a landing point back toward where notes come from (screen space) */
  readonly up: [number, number];
  /** bar starts (seconds), for bar lines */
  readonly bars: number[];
  /** sections where particles trace a shape */
  readonly scenes: ParticleScene[];
  /** the part of the frame in use (crop), or null for all of it */
  readonly crop: Rect | null;

  constructor(readonly proj: ProjectFile) {
    this.look = resolveLook(proj.look);
    this.titles = resolveTitles(proj.titles);
    this.lighting = resolveLighting(proj.lighting);
    this.kb = keyboardOf(proj);
    this.whiteKeys = proj.keyboard.whiteKeys;
    const cr = sourceRect(proj);
    this.crop = cr.w < proj.video.width || cr.h < proj.video.height ? cr : null;
    this.scenes = (proj.particleScenes ?? []).filter((sc) => sc.end > sc.start).slice(0, SHAPE_SLOTS - 1);
    const ns = proj.noteSource;
    this.bars = ns?.bars ? ns.bars.map((b) => b + ns.offset) : [];
    this.notes = prepareNotes(proj.notes, proj.keyboard.lowestNote, proj.keyboard.keys, this.look);
    this.up = fallUp(proj);
  }

  get srcW() { return this.proj.video.width; }
  get srcH() { return this.proj.video.height; }
  get fps() { return this.proj.video.fps; }
  get duration() { return this.proj.video.duration ?? this.proj.video.frames / (this.proj.video.fps || 30); }
  /** the part of the timeline in use (trim), seconds */
  get trim(): [number, number] { return trimRange(this.proj, this.duration); }

  /** point the keyboard at the tracking of the frame shown at time t */
  trackAt(t: number) { this.kb.H = trackingMatrix(this.proj, Math.round(t * this.proj.video.fps)); }
}
