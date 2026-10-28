// Export choices saved with a project: the output size, how the video fits it, frame rate, codec, quality and encoder.
export type SizeId = 'source' | 'shorts' | 'landscape' | 'square' | 'k4' | 'k4l';
export const SIZES: { id: SizeId; label: string; w: number; h: number }[] = [
  { id: 'shorts', label: 'Shorts 9:16', w: 1080, h: 1920 },
  { id: 'landscape', label: 'Landscape', w: 1920, h: 1080 },
  { id: 'square', label: 'Square', w: 1080, h: 1080 },
  { id: 'k4', label: '4K vertical', w: 2160, h: 3840 },
  { id: 'k4l', label: '4K landscape', w: 3840, h: 2160 },
];

export interface ExportSettings {
  size: SizeId;
  fit: 'crop' | 'fit';
  fps: number; // 0 = same as the video
  codec: 'h264' | 'hevc';
  quality: 'high' | 'medium' | 'small';
  audioCopy: boolean;
  transparent: boolean;
  out: string;
  /** export only the selected part of the timeline */
  onlySelection?: boolean;
  /** which encoder: 'auto' (the best one that works on this computer) or an FFmpeg encoder ("h264_nvenc", "libx264") */
  encoder?: string;
}
