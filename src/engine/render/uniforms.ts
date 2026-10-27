// Uniform layouts: each function packs settings into the exact float layout a shader struct expects. Keep the order
// in step with the WGSL struct named in each comment.
import { DEFAULT_LOOK, Look, NOTE_2D, NOTE_3D, saberBase } from '../look';
import { lightingActive } from '../lighting';
import type { DrawModel } from './model';
import type { View } from './viewport';

const hexRGB = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** notes drawn by the original approved glass code (anything else goes through the style shader) */
const originalNotes = (lk: Look) => lk.noteDim === '3d' && lk.note3d === 'glass' && !lk.texOn && lk.noteEdge === 1 && lk.noteOpacity === 1
  && lk.lightDir === DEFAULT_LOOK.lightDir && lk.lightPower === 1 && lk.lightShine === 1 && lk.noteDistort === 0;

/** Frame (common.wgsl): sizes, time and the look's settings every shader may read */
export function frameUniforms(m: DrawModel, rt: [number, number], vw: View, pxScale: number, t: number, bass: number, fade: [number, number]): Float32Array {
  const lk = m.look;
  const sb = saberBase(lk);
  return new Float32Array([
    m.srcW, m.srcH, rt[0], rt[1], pxScale, t, bass, Math.floor(t * 24),
    lk.noteBright, lk.noteGlow, lk.noteFill, lk.noteRim, lk.noteRound,
    originalNotes(lk) ? 0 : 1, 0, lk.noteDepth,
    lk.saberBright, lk.saberThick, lk.saberFlicker, lk.saberReact, lk.saberTint, lk.noteOpacity, lk.saberIdle, 0,
    sb[0], sb[1], sb[2], 0,
    lk.partSize, lk.partHaze, 0, 0,
    lk.bloom, lk.fringe, lk.grain, lk.bgDarken, lk.bgContrast, lk.bgSaturation, lk.bgVignette, lk.relight,
    lk.bassPulse, fade[0], fade[1], 0,
    vw.x, vw.y, vw.w, vw.h,
  ]);
}

/** NoteParams (glass.wgsl): the note style */
export function noteParams(m: DrawModel): Float32Array {
  const lk = m.look;
  const th = (lk.lightDir * Math.PI) / 180, el = (lk.lightHeight * Math.PI) / 2;
  // the glass facets' light: exactly the original numbers at the default direction
  const gl: [number, number] = lk.lightDir === DEFAULT_LOOK.lightDir ? [0.55, 0.85] : [-Math.cos(th) * 1.012, Math.sin(th) * 1.012];
  const oc = hexRGB(lk.outlineColor);
  const kb = m.kb;
  const cx = m.whiteKeys / 2;
  const C = kb.P(cx, kb.edgeY(cx));
  const shape = lk.noteDim === '3d' ? NOTE_3D.findIndex((o) => o.id === lk.note3d) : NOTE_2D.findIndex((o) => o.id === lk.note2d);
  return new Float32Array([
    lk.noteDim === '3d' ? 1 : 0, Math.max(0, shape), lk.noteEdge, lk.noteDepth,
    lk.noteOpacity, Math.cos(th) * Math.cos(el), -Math.sin(th) * Math.cos(el), Math.sin(el),
    lk.lightPower, lk.lightShine, lk.outlineOn ? 1 : 0, lk.outlineWidth,
    lk.outlineDepth, oc[0], oc[1], oc[2],
    lk.texOn ? 1 : 0, lk.texReflectivity, gl[0], gl[1],
    lk.texBright, lk.texContrast, (lk.texHue * Math.PI) / 180, lk.texSat,
    lk.texMirror ? 1 : 0, lk.texOpacity, lk.texBlend, lk.texEmboss ? 1 : 0,
    lk.texEmbossDepth, lk.texRgbOpacity, lk.texCutOn ? 1 : 0, lk.texCutThresh,
    lk.texCutOpacity, lk.noteDistort, C[0], C[1],
  ]);
}

/** TexParams (glass.wgsl): how the note texture is applied, and what the loaded texture is like */
export function texParams(lk: Look, tex: { size: number; lo: number; hi: number; metal: number; tile: number }): Float32Array {
  return new Float32Array([['tint', 'natural', 'glow'].indexOf(lk.texMode), lk.texScale, lk.texRelief, lk.texShine, lk.texSolid, tex.size, tex.lo, tex.hi, tex.metal, tex.tile, lk.texReflect ? 1 : 0, lk.texLive]);
}

/** BG (post.wgsl): the background behind the video and how the video is placed on it */
export function backgroundParams(lk: Look, imageReady: boolean, imageAspect: number, alphaOut: boolean): Float32Array {
  const xform = lk.footScale !== 1 || lk.footX !== 0 || lk.footY !== 0 || lk.footRot !== 0 || lk.footCropT > 0 || lk.footCropB > 0 || lk.footCropL > 0 || lk.footCropR > 0;
  const img = lk.bgImageOn && !!lk.bgImage && imageReady;
  const active = xform || lk.footOpacity < 1 || lk.footBright !== 0 || lk.footHue !== 0 || lk.bgColorOn || img;
  const c = hexRGB(lk.bgColor);
  const rad = Math.PI / 180;
  return new Float32Array([
    lk.footScale, lk.footX, lk.footY, lk.footRot * rad,
    lk.footOpacity, lk.footCropT, lk.footCropB, lk.footCropL,
    lk.footCropR, lk.footBright, lk.footHue * rad, lk.bgColorOn ? 1 : 0,
    c[0], c[1], c[2], img ? 1 : 0,
    lk.bgImgOpacity, lk.bgImgScale, lk.bgImgX, lk.bgImgY,
    lk.bgImgRot * rad, lk.bgImgBright, lk.bgImgContrast, lk.bgImgHue * rad,
    lk.bgImgSat, imageAspect, xform ? 1 : 0, active || alphaOut ? 1 : 0,
    alphaOut ? 1 : 0, 0, 0, 0,
  ]);
}

/**
 * LT (post.wgsl): the video's own lighting. The room is lit round the keyboard as it appears in this frame: the
 * keyboard's outline (four corners in video pixels, from this frame's tracking and the key fit) and the size of a
 * white key on screen. Measured on screen, so it works from any camera angle (on the keyboard's own plane, points far
 * off to the side of a side-on shot fall beyond its horizon and can't be measured).
 */
export function lightingParams(m: DrawModel, off: boolean): Float32Array {
  const L = m.lighting;
  const on = !off && lightingActive(L);
  const H = m.kb.H;
  const fit = m.kb.fit;
  const W = m.whiteKeys;
  const proj = (xs: number, Y: number): [number, number] => {
    const X = fit.x0 + (1 + fit.k) * xs + fit.sh * Y;
    const w = H[6] * X + H[7] * Y + H[8];
    return [(H[0] * X + H[1] * Y + H[2]) / w, (H[3] * X + H[4] * Y + H[5]) / w];
  };
  // the keys with a little margin: half a white key at each end, a little behind and in front
  const q = [proj(-0.5, -0.3), proj(W + 0.5, -0.3), proj(W + 0.5, 1.5), proj(-0.5, 1.5)];
  const len = (p: [number, number], r: [number, number]) => Math.hypot(p[0] - r[0], p[1] - r[1]);
  const unit = (len(q[0], q[1]) + len(q[3], q[2])) / 2 / (W + 1);
  const tracked = !!m.proj.tracking.frames.length && q.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) && unit > 1e-3;
  return new Float32Array([
    on ? 1 : 0, L.exposure, L.contrast, L.highlights,
    L.shadows, L.warmth, L.saturation, L.room,
    L.reach, L.softness, L.vignette, W,
    ...q.flat(), unit, 0, 0, 0,
    tracked ? 1 : 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
}

/** Sim (particles_sim.wgsl), from byte 16: how particles move */
export function simParams(lk: Look): Float32Array {
  return new Float32Array([
    0, -1, 0, 0, // glitter rises straight up the screen
    lk.partSwirl, lk.partWind, lk.partGravity, lk.partLife, lk.partRise, lk.partTwinkle, lk.partStars, lk.partColor,
    lk.partSpeed, lk.partTurbX, lk.partTurbY, lk.partTurbZ,
    lk.partTurbFreq, lk.partTurbEvo, Math.round(lk.partOctaves), lk.partOctScale,
    lk.partOctMul, lk.partSpread, lk.partRays ? 1 : 0, lk.partRayLen,
    lk.partSparkStyle === 'fan' ? 1 : 0, lk.partSmokeStyle === 'fountain' ? 1 : 0, 0, 0,
  ]);
}

/** Draw (particles_draw.wgsl): how particles look */
export function particleDrawParams(lk: Look): Float32Array {
  return new Float32Array([lk.partRays ? 1 : 0, lk.partRayLen, lk.partOpacity, lk.partAlphaF, lk.partAdditive, lk.partBright, lk.partTurbZ, 0]);
}
