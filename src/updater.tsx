// In-app updates: on start, every 5 minutes, on window focus, and on request, ask GitHub Releases for a newer
// signed build. An available update shows as a pill in the top bar; details live in the settings menu.
import { useCallback, useEffect, useRef, useState } from 'react';

export type UpdatePhase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current'; at: Date }
  | { kind: 'available'; version: string; install: () => Promise<void> }
  | { kind: 'downloading'; version: string; pct: number | null }
  | { kind: 'error'; message: string };

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const errText = (e: unknown) => String((e as { message?: string })?.message ?? e);

export function useUpdater() {
  const [version, setVersion] = useState('');
  const [phase, setPhase] = useState<UpdatePhase>({ kind: 'idle' });
  const busy = useRef(false);

  useEffect(() => {
    if (!inTauri()) return;
    import('@tauri-apps/api/app').then((m) => m.getVersion()).then(setVersion).catch(() => {});
  }, []);

  const check = useCallback(async () => {
    if (!inTauri() || busy.current) return;
    busy.current = true;
    setPhase((p) => (p.kind === 'available' || p.kind === 'downloading' ? p : { kind: 'checking' }));
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      const update = await check({ timeout: 30000 });
      if (!update) { setPhase({ kind: 'current', at: new Date() }); return; }
      setPhase({
        kind: 'available',
        version: update.version,
        install: async () => {
          let total = 0, done = 0;
          setPhase({ kind: 'downloading', version: update.version, pct: null });
          try {
            await update.downloadAndInstall((ev) => {
              if (ev.event === 'Started') total = ev.data.contentLength ?? 0;
              if (ev.event === 'Progress') {
                done += ev.data.chunkLength;
                setPhase({ kind: 'downloading', version: update.version, pct: total ? Math.round((done / total) * 100) : null });
              }
            });
            await relaunch();
          } catch (e) {
            setPhase({ kind: 'error', message: errText(e) });
          }
        },
      });
    } catch (e) {
      console.warn('[updater]', e);
      setPhase({ kind: 'error', message: errText(e) });
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!inTauri()) return;
    let last = 0;
    const tick = () => { last = Date.now(); check(); };
    tick();
    const timer = window.setInterval(tick, 5 * 60 * 1000);
    const onFocus = () => { if (Date.now() - last > 60 * 1000) tick(); };
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [check]);

  return { version, phase, check };
}

/** Top-bar pill: only when there is something to act on. */
export function UpdatePill({ phase }: { phase: UpdatePhase }) {
  if (phase.kind === 'downloading') {
    return <span className="update">Downloading {phase.version}{phase.pct !== null ? ` · ${phase.pct}%` : '…'} — Pianoverse will restart</span>;
  }
  if (phase.kind !== 'available') return null;
  return (
    <span className="update">
      <span>Version <b>{phase.version}</b> is available</span>
      <button type="button" className="btn primary small" onClick={() => phase.install()}>Install and restart</button>
    </span>
  );
}

export function updateStatusText(phase: UpdatePhase): string {
  switch (phase.kind) {
    case 'checking': return 'Checking for updates…';
    case 'current': return 'Up to date';
    case 'available': return `Version ${phase.version} is available`;
    case 'downloading': return `Downloading ${phase.version}…`;
    case 'error': return `Update check failed: ${phase.message}`;
    default: return '';
  }
}
