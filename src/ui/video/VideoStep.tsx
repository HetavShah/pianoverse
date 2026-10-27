// Video step: everything about the picture's timing and framing, trim and crop (VideoEditor). The video file is never
// changed; the project keeps the trim and crop and every later step and the export follow them.
import { fmtDur } from '../services/projectStore';
import { trimRange } from '../../engine/project';
import type { WS } from '../app/workspace';
import VideoEditor from './VideoEditor';

const Arrow = () => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h9M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>;

export default function VideoStep({ ws }: { ws: WS }) {
  const project = ws.project!;
  const v = project.video;
  const duration = ws.duration || v.duration || v.frames / (v.fps || 30);
  const [a, b] = trimRange(project, duration);
  return (
    <div className="page">
      <div className="page-main">
        <div>
          <h1>Video</h1>
          <p className="sub">Keep the part you want and frame it.</p>
        </div>
        <VideoEditor ws={ws} />
      </div>

      <aside className="page-side">
        <h2>This video</h2>
        <dl className="facts">
          <dt>File</dt><dd title={v.file}>{v.file}</dd>
          <dt>Size</dt><dd className="mono">{v.width}×{v.height}</dd>
          <dt>Frame rate</dt><dd className="mono">{Math.round((v.fps || 30) * 100) / 100} fps</dd>
          {v.codec && <><dt>Format</dt><dd>{v.codec}</dd></>}
          <dt>Length</dt><dd className="mono">{fmtDur(duration)}{b - a < duration - 0.05 ? ` · using ${fmtDur(b - a)}` : ''}</dd>
        </dl>
        <p className="help">The sound fades and transitions follow this trim. Set them on <button type="button" className="link inline" onClick={() => ws.goStep('audio')}>Audio</button>.</p>
        <p className="help">Brightness, colour and the room's lighting are on <button type="button" className="link inline" onClick={() => ws.goStep('light')}>Light</button>.</p>
      </aside>

      <footer className="page-foot">
        <button type="button" className="btn" onClick={() => ws.goStep('import')}>Back</button>
        <button type="button" className="btn primary" onClick={() => ws.goStep('audio')}>Continue to audio <Arrow /></button>
      </footer>
    </div>
  );
}
