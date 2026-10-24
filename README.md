# Pianoverse

Windows app that adds glass falling notes, a light saber and particle plumes to piano performance videos, rendered live on the GPU.

## Milestone 1 — engine prototype

- GPU renderer (WebGPU / WGSL) reproducing the approved look: glass notes landing on the saber, flame saber with plasma fringe, key glow, impact flashes, coloured light on hands and keys, stateless particle plumes, bloom.
- Plays the sample video with all effects live; layers can be toggled; preview quality Quarter / Half / Full.
- Shortcuts: Space play/pause, ← → step one frame (Shift: one second), P shows render stats.

## Try it

1. Install the latest build from the repository's **Releases** page (`Pianoverse_…_x64-setup.exe`).
2. Open **Open video…** → `samples/interstellar-take1.mp4`, then **Open project data…** → `samples/interstellar-take1.pvproj.json`.

## Develop

```
npm install
npm run tauri dev      # desktop app with hot reload
npm run build          # type-check + web build
```

Every push to `main` builds the Windows installer on GitHub Actions and publishes it as a pre-release.

## Layout

- `src/engine/project.ts` — project file, notes, keyboard geometry (homography tracking)
- `src/engine/renderer.ts` — per-frame scene building and GPU passes
- `src/engine/shaders/*.wgsl` — effects
- `src-tauri/` — Windows app shell
- `test/render_frames.mjs` — headless render check (Chromium + software WebGPU)
