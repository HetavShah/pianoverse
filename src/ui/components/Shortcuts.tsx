// The keyboard shortcuts sheet (press ? or open it from the settings menu).
const GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: 'Playback',
    keys: [
      [['Space'], 'Play or pause'],
      [['←', '→'], 'One frame back or forward'],
      [['Shift', '←  →'], 'One second back or forward'],
      [['Home', 'End'], 'Jump to the start or end'],
      [['L'], 'Loop on or off'],
    ],
  },
  {
    title: 'Editing',
    keys: [
      [['Ctrl', 'Z'], 'Undo'],
      [['Ctrl', 'Y'], 'Redo (also Ctrl+Shift+Z)'],
      [['Ctrl', '1–8'], 'Go to a step'],
      [['0–9'], 'On Style: Looks, the eight layers, Titles'],
    ],
  },
  {
    title: 'Other',
    keys: [
      [['P'], 'Show performance stats'],
      [['?'], 'Show this sheet'],
    ],
  },
];

export default function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal shortcuts" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h2>Keyboard shortcuts</h2><button type="button" className="x" aria-label="Close" onClick={onClose}><svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.7" /></svg></button></div>
        {GROUPS.map((g) => (
          <section key={g.title}>
            <span className="section-label">{g.title}</span>
            {g.keys.map(([keys, what]) => (
              <div className="sc-row" key={what}>
                <span>{what}</span>
                <span className="sc-keys">{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
