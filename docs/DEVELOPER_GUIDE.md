# Developer Guide — ROV Simulator

This guide is for developers (humans or AI agents) who want to extend, modify or maintain the ROV training simulator. It covers architecture, key conventions, extension recipes and quality gates.

## 1. Quick Start

```bash
npm install
npm run dev          # dev server → http://localhost:5173
npm run build        # tsc --noEmit + vite build
npm run preview      # preview dist/
```

Smoke test (Node-side physics verification, no browser needed):

```bash
npx esbuild scripts/physics-smoke.ts --bundle --platform=node --format=esm --outfile=.tmp/smoke.mjs && node .tmp/smoke.mjs
```

Runtime requirements: Node >= 18. Stack: **Three.js + React 18 + TypeScript + Zustand (v4, persist) + Vite**.

## 2. Directory Map

```
src/
  core/                 physics, environment, sonar, tasks, ROV configs (no Three rendering deps)
    physics/            RigidBody6, integrator, Collider, ThrusterAllocator, WaterForces, PhysicsWorld
    environment/        EnvironmentState, CurrentField
    sonar/              SonarParams, SonarSimulator (image generation)
    rov/                ROVConfig, ROVController, registry.ts
    task/               TaskDefinition, TaskRunner, tasks.ts
    terrain.ts          height-field seabed (fbm noise)
  render/               Three.js engine & scene graph
    Engine.ts           main loop, lifecycle, dispose
    SceneManager.ts     scene switching
    scenes/             BaseScene + 8 scene definitions, registry.ts
    rov/                GeneratedROVModel, RovGltfModel
    camera/             CameraRig, ChaseCamera, POVCamera
    environment/        UnderwaterEffects (particles, caustics, water surface)
    sonar/              SonarSampler (raycasts), SonarViewRenderer, DistanceSonar, sonarUtils
    hud/                AttitudeIndicator
  ui/                   React UI
    app/                App, MainMenu, TrainingScreen
    hud/                PovHud, Compass, AttitudeIndicatorView
    settings/           SettingsMenu
    sonar/              SonarView (canvas panel)
  state/                store.ts (app store, persisted), trainingStore.ts (session records)
  i18n/                 index.ts (zh / en / es dictionaries)
  utils/                units, unitsUI, noise, session
scripts/                physics-smoke.ts (regression), alloc-debug.ts, decimate-gltf.mjs
docs/                   design docs (Chinese), this guide, development log
```

## 3. Core Conventions (READ FIRST)

These conventions are load-bearing. Every subsystem follows them.

### 3.1 Units & Physics

- SI units: **meters / seconds / kilograms / newtons**. Speed display in knots (`1 kn = 0.514444 m/s`). Water `ρ = 1025`, `g = 9.81`.
- Depth axis: **-Y is down**, water surface `y = 0`.
- Fixed physics step **1/120 s** with an accumulator (clamped at 0.1 s + `MAX_ACCUMULATE_STEPS`) to prevent the spiral of death.
- Euler order **YXZ** (`x = pitch, y = yaw, z = roll`).
- Model forward is **-Z** in local space. Heading `heading = (360 - yawDeg) % 360`.
- Control frames: **body** (follows vehicle heading) and **world**. In world frame, "forward" = horizontal projection of the nose (from yaw, ignoring pitch/roll), and speed limiting uses the projected velocity.

### 3.2 Registry pattern (extension point)

Everything user-facing is registered, never hard-coded in switches:

- **Scenes**: `render/scenes/registry.ts` + `BaseScene.ts` (`listScenes()`).
- **Vehicles**: `core/rov/registry.ts` (`listRovs()`).
- **Tasks**: `core/task/tasks.ts`.

New scene / vehicle / task = implement definition + register. The UI picks up new entries automatically.

### 3.3 State & persistence

- `src/state/store.ts` — app store with `persist` middleware. **Bump `version` when the persisted shape changes** and migrate if needed.
- `compassStyle` is intentionally NOT persisted (session-scoped).
- `envParams` is excluded from persist; it is written to `localStorage` under key `rov-sim-env` with a **500 ms debounce** (see bottom of store.ts). Do not re-add it to persist.
- `trainingStore.ts` — mission records (exportable as JSON).

### 3.4 i18n

- Dictionaries in `src/i18n/index.ts`: `zh / en / es`. Add a key to **all three** dictionaries.
- UI text must not be hard-coded; scene/vehicle `name`/`description` in definitions are data-only — display them via `t('scene_<id>_name')` / `t('rov_<id>_name')`.
- Language auto-detection: `detectLanguage()` reads `navigator.language` (zh → zh, es → es, anything else → **en**). Manual choice persists and wins after first launch.

### 3.5 Performance budget (already optimized — keep it that way)

- HUD updates at 10 Hz via `store.hud`; only small components (`PovHud`, `HudStatusBar`) subscribe to `hud` — **never** subscribe the whole `TrainingScreen` to `hud`.
- Sonar sampling: frame-sliced — each tick only samples **1/3 of beams** (`SonarSampler.sample(pos, yaw, start, count)` + `SonarSimulator.renderFrame`). Low graphics quality scales beams ×0.6.
- `SonarSimulator` reuses a `Uint8ClampedArray` (rebuilt only on resize). Fixed noise pattern (`rngBase = 0`).
- Physics hot path avoids allocation: reuse temp vectors, reuse `invQuat` in `RigidBody6`.
- Engine loop clamps `dt ≤ 0.1 s`.
- `SettingsMenu` is lazy: outer shell returns null when closed (inner hooks only run when open).
- Seafloor ray-march step is 1.6 m (DME precision ±1.6 m).

## 4. Extension Recipes

### 4.1 Add a new scene

1. Create `src/render/scenes/MyScene.ts` implementing `SceneDefinition` (extends `BaseScene` or standalone). Use `registerScene(id, def)`.
2. Target objects: set `userData.taskTarget = { id, radius }` for mission targeting. Spawn ROV at `y = -1.2` (surface start).
3. Add i18n keys `scene_<id>_name` / `scene_<id>_desc`.
4. If the scene has a task, add it in `core/task/tasks.ts` (optionally referencing `taskTarget`).

### 4.2 Add a new vehicle

1. Create config in `src/core/rov/ROVConfig.ts` or a new file, implement `ROVConfig`.
2. Thrusters: for full 6-DOF control use a vector layout (see `chasing_m2`: 8 thrusters, 4 front / 4 rear, all-vector 3D oblique).
3. Add `maxSwaySpeedKnots` / `maxHeaveSpeedKnots` for directional speed limits.
4. Register in `core/rov/registry.ts`; add `rov_<id>_name` / `rov_<id>_desc` i18n keys.
5. Visuals: `GeneratedROVModel` renders from config; attach the manipulator arm to `armGroup` if the vehicle has one.

### 4.3 Add a mission

Implement a `TaskDefinition` in `core/task/tasks.ts`: brief, objective zones, success criteria (e.g. distance + action hold). The `TaskRunner` polls ROV state; task state flows into `store.taskState` at 10 Hz and renders in `TaskPanel`.

### 4.4 Add sonar settings

Extend `SonarParams` + `SONAR_RANGES`. Remember to update `FREQ_PRESETS` (low/high) and the panel in `SonarView.tsx` (slider min/max per frequency). `verticalDeg` drives the 3 sub-ray tilt spread in `SonarSampler`.

## 5. Physics Engine Notes

- `RigidBody6`: inertia `Ix = m/12·(h² + w²)` (axis convention: x = roll around the length axis, so height × width). Do not "fix" this back to height × length.
- `ThrusterAllocator`: solves thruster forces from desired body-space wrench.
- `WaterForces`: buoyancy (restoring moment intentionally removed for ROV realism), quadratic drag, angular damping `[140,110,120] / [7,5,6]` for the generic ROV.
- `PhysicsWorld.setDvl()`: DVL uses PD anchor hold + velocity damping — with no input the vehicle holds position (verified drift 0.031 m vs 1.31 m in 4 s at 0.5 m/s current). Current is scaled ×0.3 with DVL.
- `CurrentField.velocityAt`: `currentDirectionDeg >= 359.9` switches to fbm **turbulence mode** (random direction + strength pulsation). This is the UI's "turbulence" trigger — do not add a new UI field for it.

## 6. Known Boundaries & Pitfalls

- **Do not** add HUD subscription to large components (see 3.5).
- **Do not** re-add `envParams` to persist.
- **Do not** change the noise slider to inverted mapping (user explicitly requested direct mapping: value = noise).
- Sonar image width = `beamCount` columns; `renderFrame` writes `[startBeam, startBeam + count)` — never write past `beamCount`.
- Windows dev: kill the dev server via `netstat -ano | grep :5173` + `taskkill //F //PID <pid>`.
- Git commits must keep the `Made-with: Proma` trailer (org policy).

## 7. Suggested Next Steps (backlog)

- i18n of dynamic object names (scene meshes still use Chinese names in `userData`).
- Frame-slicing the sonar further (e.g. 6 slices) if CPU still matters on low-end devices.
- GLTF external model pipeline (`RovGltfModel`) is implemented but not the default — could be wired for branded vehicles.
- Static hosting + CI (GitHub Pages workflow) for demo deployments.
