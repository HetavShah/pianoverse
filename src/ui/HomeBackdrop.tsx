// Behind the Projects title: notes falling slowly onto a keyboard line, in the app's own note colours.
// It shows what Pianoverse does at a glance. The notes pass behind the title and its line of text (they are cut
// out where the type sits), so the words always read. Still frame under reduced motion; paused while hidden.
import { useEffect, useRef } from 'react';
import { pal } from '../engine/project';

type Falling = { p: number; t0: number; len: number; v: number };
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const LOW = 36, KEYS = 61; // C2 to C7, like the sample take
const SPEED = 70; // px a second
const KEY_H = 26;

export default function HomeBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext('2d')!;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, last = performance.now(), t = 0, nextAt = 0, pitch = 60;
    let holes: DOMRect[] = []; // where the title's type sits, in canvas pixels
    const notes: Falling[] = [];
    const whiteKeys: number[] = [];
    for (let n = LOW; n < LOW + KEYS; n++) if (WHITE.includes(n % 12)) whiteKeys.push(n);
    const size = () => {
      const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const hero = cv.parentElement;
      holes = hero ? [...hero.querySelectorAll('h1, .sub, .row-actions')].map((el) => {
        const b = el.getBoundingClientRect();
        return new DOMRect(b.left - r.left - 10, b.top - r.top - 8, b.width + 20, b.height + 16);
      }) : [];
    };
    const keyX = (p: number) => {
      const kw = w / whiteKeys.length;
      const i = whiteKeys.findIndex((k) => k >= p);
      const black = !WHITE.includes(p % 12);
      return { x: (i < 0 ? whiteKeys.length - 1 : i) * kw - (black ? kw * 0.25 : 0), wid: Math.min(black ? 7 : 10, kw * 0.3), kw };
    };
    // a wandering melody with a low note under it now and then
    const spawn = () => {
      pitch = Math.max(LOW + 14, Math.min(LOW + KEYS - 4, pitch + Math.round((Math.random() - 0.5) * 9)));
      const v = 0.45 + Math.random() * 0.55;
      notes.push({ p: pitch, t0: t, len: 0.25 + Math.random() * 0.9, v });
      if (Math.random() < 0.3) notes.push({ p: pitch - 12 - Math.round(Math.random() * 7), t0: t, len: 0.8 + Math.random() * 1.4, v: v * 0.8 });
      nextAt = t + 0.16 + Math.random() * 0.34;
    };
    const draw = () => {
      g.clearRect(0, 0, w, h);
      const line = h - KEY_H;
      const fall = line; // seconds to fall = line / SPEED
      // the keyboard: white keys as hairline cells
      const kw = w / whiteKeys.length;
      g.fillStyle = 'rgba(242,239,232,0.05)';
      g.fillRect(0, line, w, KEY_H);
      g.fillStyle = 'rgba(22,22,21,1)';
      for (let i = 1; i < whiteKeys.length; i++) g.fillRect(Math.round(i * kw), line, 1, KEY_H);
      // the notes fall behind the type: everything but the type's boxes
      g.save();
      g.beginPath();
      g.rect(0, 0, w, h);
      for (const b of holes) g.rect(b.x, b.y, b.width, b.height);
      g.clip('evenodd');
      for (const n of notes) {
        const y1 = (t - n.t0) * SPEED; // bottom edge of the bar
        const y0 = y1 - n.len * SPEED; // top edge
        const { x, wid } = keyX(n.p);
        const c = pal(n.p).map((q) => Math.round(q * 255)).join(',');
        // the key lights while the note is landing
        if (y1 >= line && y0 <= line) {
          g.fillStyle = `rgba(${c},${0.35 * n.v})`;
          g.fillRect(x + (kw - wid) / 2 - kw * 0.15, line, wid + kw * 0.3, KEY_H);
          g.fillStyle = `rgba(${c},${0.9 * n.v})`;
          g.fillRect(x + (kw - wid) / 2 - kw * 0.4, line - 1, wid + kw * 0.8, 2);
        }
        const top = Math.max(0, y0), bottom = Math.min(line, y1);
        if (bottom > top) {
          g.fillStyle = `rgba(${c},${0.3 + 0.35 * n.v})`;
          g.fillRect(x + (kw - wid) / 2, top, wid, bottom - top);
        }
      }
      g.restore();
      while (notes.length && (t - notes[0].t0) * SPEED - notes[0].len * SPEED > fall + 20) notes.shift();
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      while (t >= nextAt) spawn();
      draw();
      raf = requestAnimationFrame(tick);
    };
    size();
    document.fonts?.ready.then(() => { size(); if (still) draw(); });
    const ro = new ResizeObserver(() => { size(); if (still) draw(); });
    ro.observe(cv);
    if (still) {
      // a still frame from part-way through a phrase
      for (let i = 0; i < 400; i++) { t += 1 / 60; while (t >= nextAt) spawn(); }
      draw();
    } else {
      // start with notes already in the air
      for (let i = 0; i < 240; i++) { t += 1 / 60; while (t >= nextAt) spawn(); }
      raf = requestAnimationFrame(tick);
    }
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) { last = performance.now(); raf = requestAnimationFrame(tick); }
    };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return <canvas ref={ref} className="home-backdrop" aria-hidden="true" />;
}
