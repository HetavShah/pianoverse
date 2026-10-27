// Autosave: the project is saved a moment after every change, with a thumbnail for its card on the Projects page
// (on the Style and Camera steps the thumbnail shows the effects).
import { MutableRefObject, useEffect, useRef, useState } from 'react';
import type { CalibratedProject } from '../../engine/calibration';
import type { Renderer } from '../../engine/render';
import { ago, makeThumb, saveToStore } from '../services/projectStore';
import type { Step } from './workspace';
import { isHeadless } from './testHooks';

type SaveState = { state: 'idle' | 'saving' | 'saved' | 'error'; at: number };

export function useAutosave(project: CalibratedProject | null, ctx: {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  videoOk: boolean;
  renderer: Renderer | null;
  step: Step;
}) {
  const [saved, setSaved] = useState<SaveState>({ state: 'idle', at: 0 });
  const [, setClock] = useState(0);
  const lastThumb = useRef<string | undefined>(undefined);
  const latest = useRef(ctx);
  latest.current = ctx;

  useEffect(() => {
    if (!project?.id) return;
    setSaved((s) => ({ ...s, state: 'saving' }));
    const t = setTimeout(async () => {
      try {
        const { videoRef, videoOk, renderer: r, step } = latest.current;
        const v = videoRef.current;
        let thumb = lastThumb.current;
        if (v && v.videoWidth && videoOk) {
          if ((step === 'style' || step === 'camera') && r && !isHeadless()) {
            try {
              const img = await r.capture(v, v.currentTime);
              const c = document.createElement('canvas');
              c.width = img.width; c.height = img.height;
              c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
              thumb = makeThumb(c);
            } catch { thumb = makeThumb(v); }
          } else if (!thumb || thumb.startsWith('plain:')) {
            thumb = makeThumb(v);
          }
        }
        lastThumb.current = thumb;
        await saveToStore(project, thumb);
        setSaved({ state: 'saved', at: Date.now() });
      } catch {
        setSaved({ state: 'error', at: Date.now() });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [project]);
  // "Saved 2 min ago" stays current
  useEffect(() => { const i = setInterval(() => setClock((c) => c + 1), 30000); return () => clearInterval(i); }, []);

  const text = saved.state === 'saving' ? 'Saving…' : saved.state === 'error' ? 'Not saved' : saved.state === 'saved' ? `Saved ${ago(saved.at)}` : '';
  /** a different project: its thumbnail is made afresh */
  const forgetThumb = () => { lastThumb.current = undefined; };
  return { text, forgetThumb };
}
