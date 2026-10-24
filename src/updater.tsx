// In-app updates: on start, ask GitHub Releases for a newer signed build and offer a one-click install.
import { useEffect, useState } from 'react';

type Phase =
  | { kind: 'idle' }
  | { kind: 'available'; version: string; install: () => Promise<void> }
  | { kind: 'downloading'; version: string; pct: number | null }
  | { kind: 'error'; message: string };

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useAppVersion() {
  const [version, setVersion] = useState<string>('');
  useEffect(() => {
    if (!inTauri()) return;
    import('@tauri-apps/api/app').then((m) => m.getVersion()).then(setVersion).catch(() => {});
  }, []);
  return version;
}

export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    if (!inTauri()) return;
    let cancelled = false;
    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const { relaunch } = await import('@tauri-apps/plugin-process');
        const update = await check();
        if (!update || cancelled) return;
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
        // no network or no release yet: stay quiet, just log it
        console.warn('[updater]', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (phase.kind === 'idle') return null;
  if (phase.kind === 'error') return <div className="update error">Update failed: {phase.message}</div>;
  if (phase.kind === 'downloading') {
    return <div className="update">Downloading {phase.version}{phase.pct !== null ? ` · ${phase.pct}%` : '…'} — Pianoverse will restart</div>;
  }
  return (
    <div className="update">
      <span>Version <b>{phase.version}</b> is available</span>
      <button
        type="button"
        className="btn primary small"
        onClick={() => phase.install().catch((e) => setPhase({ kind: 'error', message: String(e?.message || e) }))}
      >
        Install and restart
      </button>
    </div>
  );
}
