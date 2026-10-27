# Pianoverse architecture

How the code is organised, why it is organised that way, and how to extend it. Read this before changing
anything big; the comments at the top of each file go into the detail.

## The big picture

Pianoverse is a desktop app (Tauri 2 on Windows) whose interface is a web page (React + TypeScript) and whose
effects are drawn on the graphics card with WebGPU. Rust in `src-tauri/` does the few things a web page can't:
reading and writing files, running FFmpeg for conversion and export, and updates.

```
src/
  engine/   everything that works without a screen: the project model, the renderer, the models, the maths
  ui/       the screens: React components and hooks, in feature folders
  App.tsx   the shell that wires the ui hooks together
src-tauri/  the desktop side (files, FFmpeg, updates)
test/       browser tests driving the real app (Playwright)
```

**The one rule: `engine/` never imports from `ui/`.** The engine can run with no screens at all: in a test, a
command-line export or a future web version. Screens depend on the engine, never the other way round.

## How a video becomes an effect video

1. **Import**: a video (and optionally its MIDI) becomes a project (`engine/project.ts`). Trim and crop are
   saved on the project; the video file is never changed.
2. **Notes and sync**: notes come from the MIDI or from a note finder listening to the audio (`engine/ml`), and
   are lined up with the video by matching note starts to the attacks heard in the audio (`engine/audio/sync.ts`).
3. **Calibrate**: four corners mark the keyboard, the tracker follows it through every frame
   (`engine/vision/tracker.ts`), and the key fit lines the key layout up with the picture (`engine/vision/keyFit.ts`).
   The result is one homography per frame: keyboard plane → video pixels.
4. **Style / Light / Camera**: the look (`engine/look`), the video's lighting (`engine/lighting.ts`) and the
   virtual camera (`engine/camera.ts`) are all settings on the project.
5. **Export**: every frame is drawn by the same renderer as the preview and piped to FFmpeg (`ui/export/exportRun.ts`
   → `src-tauri/src/export.rs`).

## Engine

| Module | What it does |
|---|---|
| `project.ts` | The saved project file, the trim and crop in use, notes prepared for drawing |
| `keyboard.ts` | Key geometry on the keyboard's plane, the key fit, where a note lands on screen |
| `look/` | `settings.ts` (the `Look` type, defaults, upgrading old looks), `color.ts` (palettes, colour modes), `presets.ts` (gallery looks) |
| `lighting.ts` | The video's own lighting (Light step) |
| `camera.ts` | Shots and transitions of the virtual camera; the window of the video shown at any moment |
| `titles.ts` | The opening title and end card |
| `render/` | The WebGPU renderer (below) |
| `ml/` | Note finders (below) |
| `audio/` | One FFT, sync (onset envelope and alignment), beat tracking, the audio worker |
| `vision/` | Keyboard tracking (features, RANSAC homography) and the key fit |
| `notes.ts` | MIDI parsing and note sources |
| `calibration.ts`, `geometry.ts` | Keyboard presets, homography maths |
| `random.ts` | Seeded random numbers: every render of a frame is identical |

### The renderer (`engine/render`)

`Renderer` is a **facade**: the app only calls `setProject`, `setView`, `setOutput`, `render` and `capture`.
A frame goes through four stages:

```
DrawModel (once per project)          SceneBuilder (per frame, CPU)
  look resolved, notes coloured,  ──▶   falling notes, labels, flashes,
  particle plan made                    hand lights, saber heat
                                              │
ParticleSystem.simulate (GPU compute) ◀───────┤
                                              ▼
Light layer (additive, half float):  bar lines → notes → labels → saber → flashes → particles
                                              ▼
Bloom (two blurred levels)  ──▶  Composite: video (lit + graded) + background + light + bloom + cards
```

| File | Job |
|---|---|
| `Renderer.ts` | Facade and frame orchestration |
| `model.ts` | `DrawModel`: the project prepared once |
| `scene.ts` | `SceneBuilder` → `FrameScene` (plain instance data; no GPU) |
| `emitters.ts` | The particle plan: one **strategy** per particle style (`PARTICLE_MODES`) |
| `particles.ts` | GPU particle simulation and drawing |
| `layers.ts` | One class per part of the light layer, each a `LightLayer` (`prepare` uploads, `draw` draws) |
| `post.ts` | Bloom and composite |
| `resources.ts` | Loaded on demand: note texture, background, shape outlines, title cards (`LatestLoader`) |
| `uniforms.ts` | One function per shader struct, packing settings in WGSL order |
| `gpu.ts` | Device helpers and `BindGroups`, a cache keyed by the exact resources bound |
| `viewport.ts` | Camera window, crop and output size |

Particles are **stateless**: a particle's position at time *t* is computed from its emitter alone, so any frame
can be drawn on its own, in any order. That is what makes scrubbing and export repeatable.

### Note finders (`engine/ml`)

```ts
interface NoteFinder { sampleRate: number; find(audio, onProgress): Promise<RawNote[]> }
createNoteFinder('piano' | 'any')   // factory; each model's code loads on first use
```

- `transkun/`: Transkun 2.0 for piano (ONNX Runtime). `model.ts` loads the 51 MB model once (lazy singleton),
  `features.ts` is the front end (log-mel), `decode.ts` turns network output into notes, `index.ts` stitches the
  16-second windows and folds in the sustain pedal. Kept step for step identical to the reference implementation.
- `basicPitch.ts`: Spotify's Basic Pitch for any instrument (TensorFlow.js).

## UI

```
ui/
  app/         the shell's hooks: useSession, usePlayback, usePreview, useAutosave, useShortcuts, useLibrary,
               history (undo), workspace (what every step receives), TopBar, testHooks
  components/  shared widgets: Dial, Transport, ScrubBar, PickButton, toast, Shortcuts, palette
  services/    storage and platform: projects, presets, textures, media picking, audio decoding, saving files
  home/ import/ notes/ calibrate/ style/ light/ camera/ export/
               one folder per screen: the step component and everything only it uses
```

- Every step receives one `WS` object (`ui/app/workspace.ts`) rather than a dozen props: the project and
  `setProject`, playback, the preview renderer, the library. A step only reads what it needs.
- **Every edit goes through `setProject`**, which records an undo step (`ui/app/history.ts`). Quick runs of edits
  (a slider drag, typing) merge into one step.
- **Project files** (`ui/services/projectFile.ts`): "Save project file…" writes a `.pianoverse` file, a ZIP
  container with a `mimetype` entry first, `project.json`, the card's thumbnail and the user's own textures and
  shape drawings the project uses. Windows opens `.pianoverse` files with Pianoverse (file association; a second
  launch hands its files to the open window). Autosave keeps plain JSON in the app's data folder, which is quicker
  to write on every change; older `.pvproj.json` files still open.
- The Style panels are **data**: `ui/style/lookSchema.ts` lists every control, bound to a `Look` setting, and
  `LookControls` draws them.

## Design patterns, and why each is there

| Pattern | Where | Why |
|---|---|---|
| Facade | `Renderer` | The app needs five calls, not the fifteen classes behind them |
| Strategy | `PARTICLE_MODES` (emitters.ts), `LightLayer` list | Each particle style / glowing element is self-contained; adding one doesn't touch the others |
| Factory | `createNoteFinder`, `Renderer.create` | Choose and lazily load a model by id; WebGPU setup is asynchronous, so no public constructor |
| Template Method | `LatestLoader` | The "latest request wins" loading logic is written once; subclasses only say how to load, take in and discard |
| Lazy singleton | `transkunModel` | A 51 MB model must not be loaded twice |
| Flyweight | `fftOf(n)` | FFT tables made once per size and shared |
| Cache keyed by identity | `BindGroups` | A replaced texture changes the key, so a stale bind group can't be used and nothing is invalidated by hand |
| Data-driven UI | `lookSchema.ts` | Adding a setting to a panel is one line |

Patterns deliberately **not** used:

- **No singleton GPU device.** The look gallery has its own renderer so hovering a card can never disturb the
  main preview.
- **No global state store** (Redux and the like). The project is one immutable object with undo history; hooks
  hold the rest. A store would add ceremony without solving a problem we have.
- **No tiny functions for their own sake.** A method does one meaningful job (`impact`, `saberHeat`, `barLines`)
  and keeps its maths together.

## How to…

**Add a look setting**: add the field to `Look` and its default to `DEFAULT_LOOK` (`engine/look/settings.ts`);
add one line to the right panel in `ui/style/lookSchema.ts`; read it in the renderer (if a shader needs it, add
it to the WGSL struct and to the matching function in `render/uniforms.ts`, in the same position).

**Add a gallery look**: one entry in `BUILT_IN_PRESETS` (`engine/look/presets.ts`), starting from
`fountainStyle` or `concertStyle`.

**Add a particle style**: an entry in `PARTICLE_MODES` (`render/emitters.ts`) that turns a note into emitter
rows, a new `Kind` and its case in `shaders/particles_sim.wgsl`, and the option in `Look.partMode`.

**Add a glowing element** (something drawn into the light layer): a class implementing `LightLayer` in
`render/layers.ts` with its shader, added to the list in `Renderer`.

**Add a note finder**: a class implementing `NoteFinder` in `engine/ml/`, a branch in `createNoteFinder`, and
the option in the Notes step.

**Add a step**: its id and label in `STEPS` (`ui/app/workspace.ts`), a folder under `ui/` with its component,
and a line in `App.tsx`'s router.

## Testing

Browser tests drive the real app in Chromium with software WebGPU (`npx vite preview --port 4173` first).

- **Unit tests** (`node test/unit/run.mjs`): code that needs no browser or GPU, bundled with esbuild and run in
  Node, with in-memory fakes for storage (`test/unit/fakeTextures.ts`).

- **Golden frames** (`node test/golden.mjs`): 26 frames covering every look, particle style, lighting, crop,
  camera, titles, textures and the transparent export, compared pixel by pixel with recorded copies
  (`node test/golden.mjs record` after an intended visual change). Rendering is deterministic, so a refactor
  must show `max 0`.
- **UI flows**: `undo_flow`, `looks_titles`, `camera_ui`, `light_edit`, `calibrate_flow`, `app_screens`,
  `export_e2e` and others in `test/`.
- Scripts starting with `_` are tools for demos and investigations, not tests.
