// The sliding underline: the orange line under the chosen item of a group (the steps in the top bar, and every row of
// choices: tabs, Fade in / Open up / Swell, crop shapes…) glides to the new choice instead of jumping.
//
// One observer for the whole app, so no screen has to know about it: any `.seg` or `.stepper` gets a line, placed
// under the child marked `.on`, and moved whenever a child's `on` changes or the group changes size. While the chosen
// step's name slides open the line follows it frame by frame. With "reduce animations" on in Windows it just moves.
const GROUPS = '.seg, .stepper';
/** how long the line keeps following a growing item, ms (a little longer than the CSS transition) */
const FOLLOW = 420;

export function installSlidingInk(root: HTMLElement = document.body): () => void {
  const inks = new Map<HTMLElement, HTMLElement>();
  const until = new Map<HTMLElement, number>();
  let raf = 0;

  const inkOf = (g: HTMLElement) => {
    let ink = inks.get(g);
    if (!ink || !g.contains(ink)) {
      ink = document.createElement('span');
      ink.className = 'ink instant';
      ink.setAttribute('aria-hidden', 'true');
      g.appendChild(ink);
      inks.set(g, ink);
      requestAnimationFrame(() => requestAnimationFrame(() => ink!.classList.remove('instant')));
    }
    return ink;
  };

  const place = (g: HTMLElement) => {
    const ink = inkOf(g);
    const on = [...g.querySelectorAll<HTMLElement>('.on')].find((el) => el.closest(GROUPS) === g && el !== ink);
    const r = on?.getBoundingClientRect(), gr = g.getBoundingClientRect();
    if (!on || !r || !r.width) { ink.style.opacity = '0'; return; }
    ink.style.opacity = '1';
    ink.style.width = `${r.width}px`;
    ink.style.transform = `translate(${r.left - gr.left + g.scrollLeft}px, ${r.bottom - gr.top - 2}px)`;
  };

  const loop = () => {
    raf = 0;
    const now = performance.now();
    for (const [g, t] of until) {
      if (!g.isConnected) { until.delete(g); inks.delete(g); continue; }
      place(g);
      if (now > t) until.delete(g);
    }
    if (until.size) raf = requestAnimationFrame(loop);
  };
  const follow = (g: HTMLElement) => {
    until.set(g, performance.now() + FOLLOW);
    if (!raf) raf = requestAnimationFrame(loop);
  };

  const ro = new ResizeObserver((entries) => { for (const e of entries) place(e.target as HTMLElement); });
  const adopt = (g: HTMLElement) => { if (!inks.has(g)) { ro.observe(g); place(g); } };
  root.querySelectorAll<HTMLElement>(GROUPS).forEach(adopt);

  const mo = new MutationObserver((records) => {
    for (const m of records) {
      const el = m.target as HTMLElement;
      if (m.type === 'attributes') {
        if (el.classList?.contains('ink')) continue;
        const g = el.closest<HTMLElement>(GROUPS);
        if (g) { if (!inks.has(g)) adopt(g); follow(g); }
      } else {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement) || n.classList.contains('ink')) return;
          if (n.matches(GROUPS)) adopt(n);
          n.querySelectorAll<HTMLElement>(GROUPS).forEach(adopt);
          const g = n.closest<HTMLElement>(GROUPS);
          if (g) follow(g);
        });
      }
    }
  });
  mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  return () => { mo.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); };
}
