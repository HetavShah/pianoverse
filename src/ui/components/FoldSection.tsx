// A titled group of settings in a side panel that folds away: a heading with a chevron, a one-line note saying
// what the group is for, and a dot on the heading when it is folded and something in it is changed.
import { ReactNode, useState } from 'react';

export default function FoldSection({ title, note, changed = false, open: initial = true, first = false, children }: {
  title: string; note?: ReactNode; changed?: boolean; open?: boolean; first?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <section className={'ctl-section fold-section' + (first ? ' first' : '')}>
      <button type="button" className="section-label fold" onClick={() => setOpen(!open)} aria-expanded={open}>
        <svg className="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: `rotate(${open ? 90 : 0}deg)` }}><path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        {title}{!open && changed ? <span className="dot" title="Changed" /> : null}
      </button>
      {open && note && <p className="fold-note">{note}</p>}
      {open && children}
    </section>
  );
}
