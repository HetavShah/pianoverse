import type { ReactNode } from 'react';
import { inTauri, PickKind } from '../services/media';

/** A file-open control: the native dialog in the desktop app, a file input in a browser. */
export default function PickButton(props: { what: PickKind; className: string; children: ReactNode; disabled?: boolean; onPick: (what: PickKind) => void; onFiles: (f: FileList | null) => void }) {
  const { what, className, children, onPick, onFiles, disabled } = props;
  if (inTauri()) return <button type="button" className={className} onClick={() => onPick(what)} disabled={disabled}>{children}</button>;
  const accept = what === 'video' ? 'video/*,.mp4,.mov,.webm,.mkv' : what === 'project' ? '.pianoverse,.json,application/json' : what === 'midi' ? '.mid,.midi,audio/midi' : 'video/*,.mp4,.mov,.webm,.mkv,.pianoverse,.json,application/json,.mid,.midi';
  return (
    <label className={className + (disabled ? ' disabled' : '')}>
      {children}
      <input type="file" multiple={what === 'any'} accept={accept} hidden disabled={disabled} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
    </label>
  );
}
