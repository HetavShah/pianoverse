// Keyboard shortcuts for the whole app (the list the ? key shows is in Shortcuts.tsx). Text fields keep their own
// keys, including their own undo; sliders and buttons don't.
import { useEffect, useRef } from 'react';
import { STEPS, Step } from './workspace';
import { toast } from '../components/toast';
import type { Loop } from './usePlayback';

export interface ShortcutActions {
  active: boolean;
  fps: number;
  canLeaveImport: boolean;
  undo: () => void;
  redo: () => void;
  goStep: (s: Step) => void;
  togglePlay: () => void;
  seek: (t: number) => void;
  loop: Loop;
  setLoop: (l: Loop) => void;
  toggleStats: () => void;
  toggleHelp: () => void;
  closeHelp: () => void;
}

export function useShortcuts(videoRef: React.MutableRefObject<HTMLVideoElement | null>, actions: ShortcutActions) {
  const a = useRef(actions);
  a.current = actions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const x = a.current;
      if (e.defaultPrevented || !x.active) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const type = (el as HTMLInputElement | null)?.type;
      const typing = !!el && (el.isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color'].includes(type ?? '')));
      const onSlider = tag === 'INPUT' && type === 'range';
      const v = videoRef.current;
      const st = 1 / (x.fps || 30);
      if (e.ctrlKey || e.metaKey) {
        if (typing || e.altKey) return;
        const k = e.code;
        if (k === 'KeyZ' && !e.shiftKey) { e.preventDefault(); x.undo(); }
        else if (k === 'KeyY' || (k === 'KeyZ' && e.shiftKey)) { e.preventDefault(); x.redo(); }
        else if (k === 'KeyS') { e.preventDefault(); toast('Pianoverse saves your project as you go'); }
        else if (/^Digit[1-7]$/.test(k)) {
          e.preventDefault();
          const s = STEPS[Number(k.slice(5)) - 1].id;
          if (s === 'import' || x.canLeaveImport) x.goStep(s);
        }
        return;
      }
      if (typing || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); x.togglePlay(); }
      else if (e.code === 'ArrowRight' && v && !onSlider) { e.preventDefault(); x.seek(v.currentTime + (e.shiftKey ? 1 : st)); }
      else if (e.code === 'ArrowLeft' && v && !onSlider) { e.preventDefault(); x.seek(v.currentTime - (e.shiftKey ? 1 : st)); }
      else if (e.code === 'Home' && v && !onSlider) { e.preventDefault(); x.seek(0); }
      else if (e.code === 'End' && v && !onSlider) { e.preventDefault(); x.seek(v.duration || 0); }
      else if (e.code === 'KeyL') { const l = x.loop; x.setLoop({ ...l, on: !l.on }); toast(l.on ? 'Loop off' : l.range ? 'Looping the selected part' : 'Looping the whole video'); }
      else if (e.code === 'KeyP') x.toggleStats();
      else if (e.key === '?') x.toggleHelp();
      else if (e.code === 'Escape') x.closeHelp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
