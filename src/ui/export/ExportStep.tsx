// Step 5: Export. Size, format, frame rate and quality; the frames are rendered by the same engine as the
// preview and encoded by FFmpeg on the graphics card when it can.
import { useEffect, useRef, useState } from 'react';
import type { WS } from '../app/workspace';
import { sourceRect, trimRange } from '../../engine/project';
import Icon from '../components/icons';
import { inTauri } from '../services/media';
import {
  detectEncoders, Encoders, encoderLabel, estimate, ExportProgress, ExportSettings, framePng, outSize, runExport,
  sizesFor, cameraOn, cameraFrameAt, tauriSink, testSink, videoFrame,
} from './exportRun';

const DEFAULTS: ExportSettings = { size: 'shorts', fit: 'crop', fps: 0, codec: 'h264', quality: 'high', audioCopy: true, transparent: false, out: '' };
const fmtLen = (t: number) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };
const fmtDur = (s: number) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
const safeName = (n: string) => n.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Pianoverse';

type Run = { kind: 'idle' } | { kind: 'running'; p: ExportProgress | null } | { kind: 'done'; files: string[]; secs: number; note?: string } | { kind: 'error'; message: string };

export default function ExportStep({ ws }: { ws: WS }) {
  const { project } = ws;
  const [enc, setEnc] = useState<Encoders | null>(null);
  const [encErr, setEncErr] = useState('');
  const [run, setRun] = useState<Run>({ kind: 'idle' });
  const [thumb, setThumb] = useState('');
  const [msg, setMsg] = useState('');
  const cancel = useRef(false);
  const s: ExportSettings = { ...DEFAULTS, ...(project?.exportSettings ?? {}) } as ExportSettings;
  const set = (patch: Partial<ExportSettings>, silent = false) => project && ws.setProject({ ...project, exportSettings: { ...project.exportSettings, ...patch } }, { silent });

  useEffect(() => { detectEncoders().then(setEnc).catch((e) => setEncErr(String(e?.message ?? e))); }, []);
  // default file name in Videos\Pianoverse
  useEffect(() => {
    if (!project || s.out) return;
    (async () => {
      let dir = 'C:\\Users\\You\\Videos\\Pianoverse';
      if (inTauri()) { const { invoke } = await import('@tauri-apps/api/core'); dir = await invoke<string>('export_default_dir'); }
      set({ out: `${dir}${dir.includes('/') ? '/' : '\\'}${safeName(project.name)}.mp4` }, true);
    })().catch(() => {});
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // a preview of the current frame
  useEffect(() => {
    const r = ws.renderer, v = ws.videoEl.current;
    if (!r || !v || !project || run.kind === 'running') return;
    let stop = false;
    (async () => {
      r.setProject(project);
      await r.texturesReady?.();
      const old = r.scaleFactor;
      const oldOut = r.output;
      const cam = cameraOn(project);
      const o = outSize(s, project);
      if (cam) { r.setOutput([o.w, o.h]); r.setScale(Math.min(1, 480 / o.h)); const c = cameraFrameAt(project, ws.time, ws.duration || project.video.frames / (project.video.fps || 30)); r.setView(c.view, c.fade); }
      else r.setScale(Math.min(1, 480 / sourceRect(project).h));
      try {
        const img = await r.capture(videoFrame(v), ws.time);
        if (stop) return;
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height), 0, 0);
        setThumb(c.toDataURL('image/jpeg', 0.85));
      } finally { if (cam) { r.setView(null); r.setOutput(oldOut); } r.setScale(old); }
    })().catch(() => {});
    return () => { stop = true; };
  }, [ws.renderer, project?.id, ws.time]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) return null;
  const duration = ws.duration || project.video.frames / (project.video.fps || 30);
  const sel = ws.loop.range;
  const trim = trimRange(project, duration);
  const part = s.onlySelection && sel ? [Math.max(trim[0], sel[0]), Math.min(trim[1], sel[1])] as [number, number] : null;
  // a swell (Audio → Sound) comes before the video and a ring-out runs on past the end
  const length = (part ? Math.max(0, part[1] - part[0]) : trim[1] - trim[0]) + ws.sound.lead + ws.sound.tail;
  const est = estimate(s, project, length);
  const { w: outW, h: outH } = outSize(s, project);
  const srcRect = sourceRect(project);
  const srcAspect = srcRect.w / srcRect.h;
  const sizeList = sizesFor(project);
  const sizeId = sizeList.find((z) => z.id === s.size)?.id ?? sizeList[0].id;
  const aspectDiffers = !cameraOn(project) && Math.abs(outW / outH - srcAspect) > 0.02;
  const encoder = enc ? (s.codec === 'hevc' ? enc.hevc[0] : enc.h264[0]) : null;
  const hw = !!encoder && !encoder.startsWith('lib');
  // rough time: about 25 ms a frame for 1080p on a mid-range card, scaled by pixels
  const estSecs = est.frames * 0.025 * ((outW * outH) / (1080 * 1920)) * (hw ? 1 : 1.8) * (s.transparent ? 2 : 1);
  const running = run.kind === 'running';
  const srcFps = project.video.fps || 30;

  const start = async () => {
    const r = ws.renderer, v = ws.videoEl.current;
    if (!r || !v || !enc) return;
    const sink = testSink() ?? (inTauri() ? tauriSink : null);
    if (!sink) { setRun({ kind: 'error', message: 'Exporting needs the Pianoverse desktop app.' }); return; }
    cancel.current = false;
    setRun({ kind: 'running', p: null });
    const t0 = performance.now();
    let note: string | undefined;
    try {
      r.setProject(project);
      const files = await runExport({
        renderer: r, video: v, project, duration, settings: s, encoders: enc, sink, range: part,
        onProgress: (p) => { if (p.note) note = p.note; setRun({ kind: 'running', p }); if (p.preview) setThumb(p.preview); },
        cancelled: () => cancel.current,
      });
      setRun({ kind: 'done', files, secs: (performance.now() - t0) / 1000, note });
    } catch (e) {
      const m = String((e as Error)?.message ?? e);
      setRun(m === 'cancelled' ? { kind: 'idle' } : { kind: 'error', message: m });
    }
  };

  const browse = async () => {
    if (!inTauri()) return;
    const { save } = await import('@tauri-apps/plugin-dialog');
    const res = await save({ defaultPath: s.out, filters: [{ name: 'MP4 video', extensions: ['mp4'] }] });
    if (res) set({ out: /\.mp4$/i.test(res) ? res : res + '.mp4' });
  };

  const savePng = async () => {
    const r = ws.renderer, v = ws.videoEl.current;
    if (!r || !v) return;
    setMsg('');
    try {
      const blob = await framePng(r, v, project, s, ws.time);
      if (inTauri()) {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const base = s.out.replace(/\.[a-z0-9]+$/i, '');
        const path = await save({ defaultPath: `${base} ${fmtLen(ws.time).replace(':', '-')}.png`, filters: [{ name: 'PNG image', extensions: ['png'] }] });
        if (!path) return;
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('write_file_bytes', new Uint8Array(await blob.arrayBuffer()), { headers: { path: encodeURIComponent(path) } });
        setMsg(`Saved ${path}`);
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'frame.png'; a.click();
      }
    } catch (e) { setMsg(String((e as Error)?.message ?? e)); }
  };

  const showFile = async (f: string) => { if (inTauri()) { const { invoke } = await import('@tauri-apps/api/core'); await invoke('show_in_folder', { path: f }); } };

  const soundNote = [ws.sound.lead ? `swells in ${ws.sound.lead.toFixed(1)} s` : '', ws.sound.tail ? `rings on ${ws.sound.tail.toFixed(1)} s` : ''].filter(Boolean).join(' · ');

  return (
    <div className="page export-page">
      <div className="page-main">
        <header>
          <h1>Export video</h1>
          <p className="sub">Same look as the preview, at full quality.</p>
        </header>

        <section className="ex-field">
          <span className="ex-label">Size</span>
          <div className="ex-sizes">
            {sizeList.map((z) => (
              <button key={z.id} type="button" className={'ex-size' + (sizeId === z.id ? ' on' : '')} onClick={() => set({ size: z.id })} disabled={running}>
                <span className="radio" />
                <b>{z.label}</b>
                <span className="mono dim">{z.w}×{z.h}</span>
              </button>
            ))}
          </div>
          {aspectDiffers && (
            <div className="ex-fit">
              <span className="dim">Your video is {Math.round(srcRect.w)}×{Math.round(srcRect.h)}:</span>
              <div className="seg">
                <button type="button" className={s.fit === 'crop' ? 'on' : ''} onClick={() => set({ fit: 'crop' })} disabled={running}>Fill the frame (crop)</button>
                <button type="button" className={s.fit === 'fit' ? 'on' : ''} onClick={() => set({ fit: 'fit' })} disabled={running}>Fit inside (black bars)</button>
              </div>
            </div>
          )}
        </section>

        <section className="ex-row3">
          <label className="ex-field"><span className="ex-label">Format</span>
            <select value={s.codec} onChange={(e) => set({ codec: e.target.value as ExportSettings['codec'] })} disabled={running}>
              <option value="h264">MP4 · H.264</option>
              <option value="hevc">MP4 · H.265 (smaller files)</option>
            </select>
          </label>
          <label className="ex-field"><span className="ex-label">Frame rate</span>
            <select value={s.fps} onChange={(e) => set({ fps: Number(e.target.value) })} disabled={running}>
              <option value={0}>Same as video · {Math.round(srcFps)} fps</option>
              {[24, 30, 60].filter((f) => Math.abs(f - srcFps) > 0.5).map((f) => <option key={f} value={f}>{f} fps{f === 60 ? ' (smoother effects)' : ''}</option>)}
            </select>
          </label>
          <label className="ex-field"><span className="ex-label">Quality</span>
            <select value={s.quality} onChange={(e) => set({ quality: e.target.value as ExportSettings['quality'] })} disabled={running}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="small">Small file</option>
            </select>
          </label>
        </section>

        <section className="ex-field">
          <span className="ex-label">Save to</span>
          <div className="ex-save">
            <input type="text" className="mono" value={s.out} onChange={(e) => set({ out: e.target.value })} disabled={running} spellCheck={false} aria-label="Save to" />
            <button type="button" className="btn ghost" onClick={browse} disabled={running || !inTauri()}><Icon name="folder" />Browse</button>
          </div>
        </section>

        <section className="ex-field">
          <span className="ex-label">Options</span>
          <div className="ex-opts">
            {ws.sound.active ? (
              <div className="ex-opt">
                <span><b>Sound</b><small>Your Audio settings{soundNote ? ` · ${soundNote}` : ''}</small></span>
                <button type="button" className="link inline small-text" onClick={() => ws.goStep('audio')}>Change</button>
              </div>
            ) : (
              <label className="ex-opt">
                <span><b>Keep the original sound as it is</b><small>No re-encoding when it's AAC</small></span>
                <input type="checkbox" checked={s.audioCopy} onChange={(e) => set({ audioCopy: e.target.checked })} disabled={running} />
              </label>
            )}
            <label className="ex-opt">
              <span><b>Effects on a transparent background</b><small>An extra ProRes .mov for Premiere or DaVinci Resolve</small></span>
              <input type="checkbox" checked={s.transparent} onChange={(e) => set({ transparent: e.target.checked })} disabled={running || (enc ? !enc.prores : false)} />
            </label>
            {sel && (
              <label className="ex-opt ex-part">
                <span><b>Only the selected part</b><small className="mono">{fmtLen(sel[0])} – {fmtLen(sel[1])}</small></span>
                <input type="checkbox" checked={!!s.onlySelection} onChange={(e) => set({ onlySelection: e.target.checked })} disabled={running} />
              </label>
            )}
          </div>
        </section>
      </div>

      <aside className="page-side ex-side">
        <div className="ex-thumb" style={{ aspectRatio: `${outW} / ${outH}` }}>
          {thumb && <img src={thumb} alt="" style={{ objectFit: s.fit === 'fit' ? 'contain' : 'cover' }} />}
        </div>
        <dl className="ex-stats">
          <dt>Length</dt><dd className="mono">{fmtLen(length)}</dd>
          <dt>Frames</dt><dd className="mono">{est.frames.toLocaleString('en-US')}{est.fps !== srcFps ? ` · ${est.fps} fps` : ''}</dd>
          <dt>Estimated size</dt><dd className="mono">about {est.mb < 10 ? est.mb.toFixed(1) : Math.round(est.mb)} MB{s.transparent ? ' + effects' : ''}</dd>
          <dt>Estimated time</dt><dd className="mono">about {fmtDur(estSecs)}</dd>
          <dt>Encoder</dt><dd className={hw ? '' : 'dim'} title={hw ? 'On the graphics card' : encoder ? 'No graphics-card encoder found, so the processor does it' : undefined}>{encoder ? encoderLabel(encoder) : encErr ? 'Not available' : 'Checking…'}</dd>
        </dl>
        {encErr && <small className="danger-text">{encErr}</small>}

        {run.kind === 'running' && (
          <div className="ex-progress">
            <div className="row">
              <span>{run.p ? (run.p.phase === 'sound' ? 'Preparing the sound…' : <>{run.p.phase === 'effects' ? 'Effects only ' : 'Rendering '}<span className="mono">{run.p.done.toLocaleString('en-US')} / {run.p.total.toLocaleString('en-US')}</span></>) : 'Starting…'}</span>
              <span className="mono dim">{run.p && run.p.done > 10 ? `${fmtDur(run.p.eta)} left` : ''}</span>
            </div>
            <div className="bar"><i style={{ width: `${run.p ? (100 * run.p.done) / run.p.total : 0}%` }} /></div>
            {run.p?.note && <small className="ex-note">{run.p.note}</small>}
            <div className="row"><span /><button type="button" className="btn small" onClick={() => { cancel.current = true; }}><Icon name="cancel" />Cancel</button></div>
          </div>
        )}
        {run.kind === 'done' && (
          <div className="ex-done">
            <b>Saved in {fmtDur(run.secs)}</b>
            {run.note && <small className="ex-note">{run.note}</small>}
            {run.files.map((f) => (
              <div key={f} className="ex-file"><span className="mono" title={f}>{f.split(/[\\/]/).pop()}</span>
                {inTauri() && <button type="button" className="link" onClick={() => showFile(f)}><Icon name="folder" />Show in folder</button>}</div>
            ))}
          </div>
        )}
        {run.kind === 'error' && <div className="ex-error"><b>The export stopped</b><pre>{run.message}</pre></div>}

        <button type="button" className="btn primary big" onClick={start} disabled={running || !enc || !s.out}><Icon name="export" size={18} />{run.kind === 'done' ? 'Export again' : 'Export video'}</button>
        <button type="button" className="btn ghost ex-png" onClick={savePng} disabled={running}><Icon name="saveImage" />Save this frame as PNG</button>
        {msg && <small className="dim">{msg}</small>}
      </aside>

      <footer className="page-foot">
        <button type="button" className="btn" onClick={() => ws.goStep('camera')} disabled={running}>Back to camera</button>
        <button type="button" className="btn" onClick={ws.goHome} disabled={running}>Done</button>
      </footer>
    </div>
  );
}
