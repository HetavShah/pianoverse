// The preview: one renderer for the app, lent to whichever screen shows a preview (Style, Light, Camera). It keeps
// the renderer in step with the project, the camera, the zoom, the eye toggles and the brand, and draws a frame on
// request.
import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_LAYERS, Layers, Renderer, View } from '../../engine/render';
import { CalibratedProject, testNotes } from '../../engine/calibration';
import { aspectInfo } from '../../engine/camera';
import type { Brand } from '../../engine/titles';
import { cameraFrameAt } from '../export/exportRun';
import { userTextureFiles } from '../services/textureStore';
import { exposeForTests, isHeadless } from './testHooks';

export function usePreview(videoRef: MutableRefObject<HTMLVideoElement | null>, opts: {
  project: CalibratedProject | null;
  duration: number;
  playing: boolean;
  /** a screen with a preview is showing */
  previewing: boolean;
  /** the Camera step is showing: the preview looks through the camera */
  cameraStep: boolean;
  brand: Brand;
}) {
  const { project, duration, playing, previewing, cameraStep, brand } = opts;
  const rendererRef = useRef<Renderer | null>(null);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [gpuName, setGpuName] = useState('');
  const [frameTick, setFrameTick] = useState(0);
  const [scale, setScale] = useState(0.5);
  const [layers, setLayers] = useState<Layers>({ ...DEFAULT_LAYERS });
  /** show a sweep over every key instead of the notes (also shown while there are no notes yet) */
  const [sweep, setSweep] = useState(false);
  // zoomed in on the Style preview to check detail: the part of the video shown (null = all of it)
  const [inspect, setInspect] = useState<View | null>(null);
  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState('');
  const frameTimes = useRef<number[]>([]);

  // GPU: one renderer for the app (made once); screens lend it their canvas
  useEffect(() => {
    let cancelled = false;
    if (rendererRef.current) return;
    Renderer.create(document.createElement('canvas'))
      .then((r) => {
        if (cancelled) return;
        rendererRef.current = r;
        r.userFiles = userTextureFiles;
        setGpuName(r.adapterName);
        exposeForTests('pianoverse', { renderer: r });
      })
      .catch((e) => setGpuError(String(e?.message || e)));
    return () => { cancelled = true; };
  }, []);

  // what the renderer sees: real notes, or a sweep over every key when there are none yet
  const noNotes = !!project && project.notes.length === 0;
  const renderProject = useMemo(() => {
    if (!project) return null;
    if (!(sweep || noNotes)) return project;
    return { ...project, notes: testNotes(project.keyboard.lowestNote, project.keyboard.keys, duration || project.video.frames / project.video.fps) };
  }, [project, sweep, noNotes, duration]);

  const camOn = cameraStep && !!project?.cameraTrack?.on;
  const camRef = useRef<{ p: CalibratedProject; dur: number } | null>(null);
  camRef.current = camOn && project ? { p: project, dur: duration || project.video.frames / (project.video.fps || 30) } : null;
  const inspectRef = useRef<View | null>(null);
  inspectRef.current = camOn ? null : inspect;

  /** draw the frame at t (default: the video's current time) */
  const draw = useCallback((t?: number) => {
    const r = rendererRef.current;
    const v = videoRef.current;
    if (!r || !v || v.readyState < 2 || !v.videoWidth) return;
    const tt = t ?? v.currentTime;
    const cam = camRef.current;
    if (cam) { const f = cameraFrameAt(cam.p, tt, cam.dur); r.setView(f.view, f.fade); } else r.setView(inspectRef.current);
    if (isHeadless()) return; // automated tests capture offscreen
    r.render(v, tt);
    const ft = frameTimes.current;
    ft.push(performance.now());
    while (ft.length > 30) ft.shift();
    // frame rate only means something during playback (seeks would read as a tiny number)
    if (ft.length > 5 && !videoRef.current?.paused) setFps(Math.round(((ft.length - 1) * 1000) / (ft[ft.length - 1] - ft[0])));
    const s = r.stats;
    setStats(`${r.size.width}×${r.size.height} · ${s.notes} notes · ${s.emitters} emitters · CPU ${s.cpuMs.toFixed(1)} ms`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** a new frame is showing: draw it if a preview is open, and tell the screens */
  const redraw = useCallback((t?: number) => {
    if (previewing) draw(t);
    setFrameTick((k) => k + 1);
  }, [previewing, draw]);

  // keep the renderer in step
  const r = rendererRef.current;
  useEffect(() => { if (previewing && renderProject && r) { r.setProject(renderProject); draw(); } }, [renderProject, gpuName, draw, previewing]); // eslint-disable-line react-hooks/exhaustive-deps
  // a texture finished loading: show it even while paused
  useEffect(() => { if (r) r.onTexture = () => { if (previewing) draw(); }; }, [gpuName, draw, previewing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { r?.setScale(scale); if (previewing) draw(); }, [scale, gpuName, draw, previewing]); // eslint-disable-line react-hooks/exhaustive-deps
  const camAspect = project?.cameraTrack?.aspect;
  useEffect(() => {
    if (!r) return;
    r.setOutput(camOn && camAspect ? aspectInfo(camAspect).size : null);
    if (!camOn) r.setView(null);
    if (previewing) draw();
  }, [camOn, camAspect, gpuName, draw, previewing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (r) { r.layers = layers; if (previewing) draw(); } }, [layers, draw, previewing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (previewing) draw(); }, [inspect, draw, previewing]);
  useEffect(() => { if (r) { r.setBrand(brand); if (previewing) draw(); } }, [brand, gpuName, draw, previewing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!playing) { frameTimes.current = []; setFps(0); } }, [playing]);

  /** a screen gives the renderer its canvas */
  const attachPreview = useCallback((c: HTMLCanvasElement | null) => {
    const rr = rendererRef.current;
    if (!c || !rr) return;
    rr.attach(c);
    if (renderProject) rr.setProject(renderProject);
    rr.setScale(scale);
    requestAnimationFrame(() => draw());
  }, [renderProject, scale, draw, gpuName]); // eslint-disable-line react-hooks/exhaustive-deps

  // test hook: the camera's window at a moment (null when the Camera step isn't showing it)
  exposeForTests('pianoverseCamera', (t: number) => { const c = camRef.current; return c ? cameraFrameAt(c.p, t, c.dur) : null; });

  return {
    renderer: rendererRef.current, gpuName, gpuError, frameTick, redraw, attachPreview,
    scale, setScale, layers, setLayers, sweep, setSweep, inspect, setInspect, fps, stats,
  };
}
