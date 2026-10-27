// Which way notes fall on screen.
import { ProjectFile, trackingMatrix } from './project';
import { keyboardOf } from './keyboard';

export type ProjectWithLook = ProjectFile & { look?: { noteAngle?: number | null } };

/** Notes' direction as a unit vector pointing from a landing point back toward where notes come from. */
export function fallUp(proj: ProjectWithLook): [number, number] {
  const r = (noteAngle(proj) * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
}

/** Angle in degrees from straight down: 0 = notes fall from the top, +35 = from the upper right. */
export function noteAngle(proj: ProjectWithLook): number {
  const set = proj.look?.noteAngle;
  return typeof set === 'number' ? set : autoNoteAngle(proj);
}

/** Lanes need at least this angle between the falling notes and the keyboard to stay apart. */
const MIN_CROSS = 44;
export const MAX_TILT = 60;

/**
 * Straight down unless the keyboard runs close to vertical on screen; then tilt toward the back of the keys
 * just enough that notes cross the keyboard at MIN_CROSS degrees (so each key keeps its own lane).
 */
export function autoNoteAngle(proj: ProjectFile): number {
  const f = proj.tracking.frames;
  if (!f.length) return 0;
  const kb = keyboardOf(proj);
  kb.H = trackingMatrix(proj, Math.floor(f.length / 2));
  const mid = proj.keyboard.whiteKeys / 2;
  const a = kb.P(mid - 2, 0.5), b = kb.P(mid + 2, 0.5);
  const back = kb.P(mid, 0), front = kb.P(mid, 1);
  // square to the keyboard, pointing behind it
  let ux = -(b[1] - a[1]), uy = b[0] - a[0];
  if (ux * (back[0] - front[0]) + uy * (back[1] - front[1]) < 0) { ux = -ux; uy = -uy; }
  const perp = (Math.atan2(ux, -uy) * 180) / Math.PI; // the square-on angle
  const axisFromVertical = 90 - Math.abs(perp);
  if (axisFromVertical >= MIN_CROSS) return 0;
  const tilt = Math.sign(perp) * (MIN_CROSS - axisFromVertical);
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, Math.round(tilt)));
}
