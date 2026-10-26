# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Rendered inside a Tauri 2 desktop shell on Windows 10/11 (WebView2, React 18, Vite). The design language is web, not native Windows.

## Users

Pianists who film their own playing, usually on a phone, and post it as Shorts, Reels or YouTube videos. They are musicians first and casual video editors second. They open Pianoverse once per recorded take, at a desk, with the performance video and the MIDI recorded alongside it, and work through it in one sitting.

## Product Purpose

Pianoverse turns a real piano performance video into a falling-notes visualizer that sits on the player's actual keys: notes drop onto the keys that were pressed, a saber line lights up where they land, keys glow and particles fly. The result is exported at platform-ready sizes. Success is a finished, good-looking video for one take without needing a video editor.

## Positioning

Effects are drawn on the real keyboard in the real footage. The keyboard is tracked frame by frame (one homography per frame), so notes stay on the right keys even when the camera moves. Synthesia-style tools render a fake keyboard instead.

## Operating Context

- A five-step flow per project: Import → Notes and sync → Calibrate → Style → (Camera) → Export. Projects autosave and are listed on a Projects home screen.
- Inputs: a performance video (phone HEVC is converted once) and a MIDI file. With no MIDI, notes are detected from the audio.
- A live GPU preview (WebGPU/WGSL) runs while styling. Export encodes on the GPU (NVENC/AMF/QSV) through FFmpeg.
- Output targets: Shorts 1080×1920, landscape 1920×1080, square, 4K vertical, and transparent ProRes 4444 for editors.

## Capabilities and Constraints

- Style layers: Colours, Notes, Saber, Impact, Particles, Lighting, Background, Glow and film, each with its own controls. Presets save looks for reuse.
- Shape sections on the timeline make particles trace an outline. Loop ranges are set on the timeline.
- Camera: shots (Wide, Follow hands, Close-up), beat-aligned transitions, Auto camera, frame shape.
- Undo/redo, keyboard shortcuts (`?`), auto-update, autosave.
- Every existing feature, step and control must survive a redesign. Layout and flow may be restructured.
- Terminology already in use: look, preset, layer, saber, impact, shape section, calibrate, take.

## Brand Commitments

- The name "Pianoverse", with that spelling, is fixed.
- The teal accent, the app icon and the dark theme are not binding and may change.

## Evidence on Hand

- Sample project: `samples/interstellar-take1.*`.
- Rendered looks and screenshots: `docs/images/` (looks.jpg, demo.gif, shape-heart.jpg, screen-*.png).
- Note-style and texture thumbnails: `public/notestyles/`, `public/textures/*/thumb.jpg`.
- There are no user testimonials, user counts or press. Do not invent any.

## Product Principles

1. The performance is the hero. The player's footage and the effects on it matter more than the chrome around them.
2. Musicians, not editors. Use plain musical language and visible results instead of video-production jargon.
3. One take, one sitting. The flow moves a person from raw video to export without detours.
4. Live and exact. What the preview shows is what export produces.
