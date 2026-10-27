// Audio step: two pages under one tab. Notes and sync: the MIDI file or the notes found in the audio, lined up with
// the video. Sound: how the sound starts and ends and how it sounds.
import { useState } from 'react';
import NotesStep from '../notes/NotesStep';
import type { WS } from '../app/workspace';
import SoundStep from './SoundStep';

type Tab = 'notes' | 'sound';
const TABS: { id: Tab; label: string }[] = [{ id: 'notes', label: 'Notes and sync' }, { id: 'sound', label: 'Sound' }];
// the page last open, for coming back to the step during the session
let lastTab: Tab = 'notes';

export default function AudioStep({ ws }: { ws: WS }) {
  const [tab, setTabState] = useState<Tab>(lastTab);
  const setTab = (t: Tab) => { lastTab = t; setTabState(t); };
  const head = (
    <div className="audio-head">
      <h1>Audio</h1>
      <div className="seg big" role="tablist" aria-label="Audio">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}{t.id === 'sound' && ws.sound.active && <span className="tab-dot" aria-label="changed" />}
          </button>
        ))}
      </div>
    </div>
  );
  return tab === 'notes' ? <NotesStep ws={ws} head={head} /> : <SoundStep ws={ws} head={head} />;
}
