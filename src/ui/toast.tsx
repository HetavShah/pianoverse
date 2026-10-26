// Short messages at the bottom of the window, instead of system pop-ups.
import { useEffect, useState } from 'react';

export interface Toast { id: number; text: string; kind: 'info' | 'error'; action?: { label: string; run: () => void } }

let list: Toast[] = [];
let nextId = 1;
const subs = new Set<(l: Toast[]) => void>();
const emit = () => subs.forEach((f) => f(list));

export function dismiss(id: number) { list = list.filter((t) => t.id !== id); emit(); }

/** show a message; errors stay longer. A message with the same text replaces the old one. */
export function toast(text: string, opts: { kind?: Toast['kind']; action?: Toast['action']; ms?: number } = {}) {
  const kind = opts.kind ?? 'info';
  const t: Toast = { id: nextId++, text, kind, action: opts.action };
  list = [...list.filter((x) => x.text !== text), t].slice(-3);
  emit();
  window.setTimeout(() => dismiss(t.id), opts.ms ?? (kind === 'error' ? 7000 : 1800));
  return t.id;
}
export const toastError = (e: unknown) => toast(String((e as Error)?.message ?? e), { kind: 'error' });

export function Toasts() {
  const [items, setItems] = useState(list);
  useEffect(() => { subs.add(setItems); return () => { subs.delete(setItems); }; }, []);
  if (!items.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          <span>{t.text}</span>
          {t.action && <button type="button" className="link inline" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          {t.kind === 'error' && <button type="button" className="x" aria-label="Dismiss" onClick={() => dismiss(t.id)}><svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.7" /></svg></button>}
        </div>
      ))}
    </div>
  );
}
