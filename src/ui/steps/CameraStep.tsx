// Camera step (layout waiting for approval): the preview through the camera, and Auto camera.
import { useEffect } from 'react';
import { autoCamera, newCameraTrack } from '../../engine/camera';
import type { WS } from '../workspace';

export default function CameraStep({ ws, attachPreview }: { ws: WS; attachPreview: (c: HTMLCanvasElement | null) => void }) {
  const project = ws.project!;
  const duration = ws.duration || project.video.frames / (project.video.fps || 30);
  // first visit: a camera with an automatic edit
  useEffect(() => {
    if (project.cameraTrack) return;
    const tr = newCameraTrack(project);
    ws.setProject({ ...project, cameraTrack: { ...tr, shots: autoCamera(project, tr.auto, tr.aspect, duration) } }, { silent: true });
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="camera-step">
      <canvas ref={attachPreview} className="preview-canvas" />
    </div>
  );
}
