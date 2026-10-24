// In-app updates: on start, every 5 minutes, on window focus, and when the version label is clicked, ask GitHub Releases
// for a newer signed build and offer a one-click install. The result is always visible next to the version.
import { useCallback, useEffect, useRef, useState } from 'react';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current'; at: Date }
  | { kind: 'available'; version: string; install: () => Promise<void> }
  | { kind: 'downloading'; version: string; pct: number | null }
  | { kind: 'error'; message: string };

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const errText = (e: unknown) => String((e as { message?: string })?.message ?? e);

function useAppVersion() {
  const [version, setVersion] = useState<string>('');
  useEffect(() => {
    if (!inTauri()) return;
    import('@tauri-apps/api/app').then((m) => m.getVersion()).then(setVersion).catch(() => {});
  }, []);
  return version;
}

export function VersionAndUpdates() {
  const version = useAppVersion();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const busy = useRef(false);

  const run = useCallback(async () => {
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
          let total = 0;
          let done = 0;
          setPhase({ kind: 'downloading', version: update.version, pct: null });
          await update.downloadAndInstall((ev) => {
            if (ev.event === 'Started') total = ev.data.contentLength ?? 0;
            if (ev.event === 'Progress') {
              done += ev.data.chunkLength;
              setPhase({ kind: 'downloading', version: update.version, pct: total ? Math.round((done / total) * 100) : null });
            }
          });
          await relaunch();
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
    const tick = () => { last = Date.now(); run(); };
    tick();
    // every 5 minutes, and whenever the window comes back into focus (at most once a minute)
    const timer = window.setInterval(tick, 5 * 60 * 1000);
    const onFocus = () => { if (Date.now() - last > 60 * 1000) tick(); };
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [run]);

  if (!version) return null;

  const status =
    phase.kind === 'checking' ? 'checking for updates…'
    : phase.kind === 'current' ? 'up to date'
    : phase.kind === 'error' ? 'update check failed'
    : '';

  return (
    <>
      <button
        type="button"
        className={'version' + (phase.kind === 'error' ? ' bad' : '')}
        onClick={run}
        title={phase.kind === 'error' ? `${phase.message}\n\nClick to check again.` : 'Click to check for updates'}
      >
        v{version}{status && <span className="status"> · {status}</span>}
      </button>
      {phase.kind === 'error' && <span className="update error" title={phase.message}>Update check failed: {phase.message}</span>}
      {phase.kind === 'downloading' && (
        <span className="update">Downloading {phase.version}{phase.pct !== null ? ` · ${phase.pct}%` : '…'} — Pianoverse will restart</span>
      )}
      {phase.kind === 'available' && (
        <span className="update">
          <span>Version <b>{phase.version}</b> is available</span>
          <button
            type="button"
            className="btn primary small"
            onClick={() => phase.install().catch((e) => setPhase({ kind: 'error', message: errText(e) }))}
          >
            Install and restart
          </button>
        </span>
      )}
    </>
  );
}
