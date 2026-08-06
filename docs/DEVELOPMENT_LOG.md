# Development Log — ROV Simulator

Chronological record of the project, milestones and key decisions. Useful for onboarding humans/AI and for auditing why things are the way they are.

## M1 — Project skeleton & core loop

- **Stack**: Three.js + React 18 + TypeScript + Zustand (persist) + Vite; `index.html` sets a global sans-serif font stack and dark `color-scheme` for `<select>/<option>`.
- **Physics core**: `RigidBody6` (6-DOF, Euler YXZ, `-Y` = down), fixed 1/120 s step with accumulator (clamp 0.1 s + `MAX_ACCUMULATE_STEPS`), semi-implicit Euler, quaternion normalization every step.
- **World**: height-field seabed (`fbm` noise), water surface, sky, underwater particles/light shafts.
- **Views**: chase camera, POV camera, 2D fan sonar (multi-beam raycasts + image synthesis).
- **Scenes & vehicles & tasks**: registry-driven (scene/rov/task), 4 scenes, 1 vehicle, mission system with records + JSON export.

## M2 — World-frame semantics fix

- "Forward" in world mode redefined as the **horizontal projection of the vehicle nose** (from yaw, ignoring pitch/roll); speed limiting uses projected velocity. Verified: after 88° yaw, forward input moves +x (east).
- Control frame toggle body/world (`G`).

## M3 — Static water default, arm mount, fine grabbing

- Default turbulence 0; all 4 base scenes have zero baseline current (local eddies kept).
- Manipulator arm mounts **per scene** (`ROVVisual.setArmVisible`, only on `salvage`); generated model includes hydraulic arm group.
- Fine grab system: mouse-wheel mode switch (camera / gripper), arm reach 0.9 m, `gripSize ≤ opening (0.45 × open)`, per-prop grip sizes (phone 0.08 / dummy 0.2 / suitcase 0.3 / container 2.4), status bar opening %, i18n failure hints (`grab_too_far` / `grab_gap`), `handleRestart` clears `grabbedRef`.

## M4 — Gamepad & settings

- Xbox full mapping: left stick fwd/back + turn, right stick strafe + heave; LB/RB pitch, LT/RT roll; A = hold action; B = lights; X tap view / hold HUD; Y tap level / hold frame; Start = menu; Back tap sonar / hold HUD. Menu navigation with trigger edges + repeat throttle (left/right 130 ms) + LB/RB tab switch.
- Gamepad sensitivity presets: low 0.5 / medium 0.75 / high 1.0.
- In-session **SettingsMenu** (modal, tabs: display (sonar first) / environment / controls / misc), keyboard + gamepad navigable. Top bar now display-only + ⚙ + ❓; main menu has language switch.

## M5 — POV HUD redesign

- Two layouts: `corner` (large attitude box + depth/temp/pitch/roll + speed grid + compass disk) and `hud` (rolling compass strip with world-sampled cardinals, depth scale top=0, pitch scale, 120° roll arc, outer range rings, frameless info bar).
- All elements avoid the top bar (top ≥ 62) and status bar (bottom ≥ 56).
- DME contact shows 0 m (ray-march starts at t=0.05).

## M6 — Units, i18n, persistence, M2 vehicle, 4 new scenes

- Units m↔ft, °C↔℉ (knots unchanged); trilingual UI (zh/en/es) covering menus/HUD/settings/tasks/records/grab hints.
- Zustand persist **version 4** (compassStyle not persisted); training session snapshots every 3 s (pose/elapsed) restored via `SimulationEngine.teleport`.
- **CHASING M2**: compact 0.72×0.48×0.4 m, 30 kg, 8 thrusters (4 front / 4 rear, all-vector 3D oblique), 6-DOF independent control verified; max speeds 3 kn fwd / 1.5 kn sway / 1.5 kn heave; angular damping consistent with generic; micro-positive buoyancy 0.3%.
- **4 new scenes**: oilrig / pipeline_ext / pipeline_int (4-wall collision) / aquaculture (net mesh + damaged target). All 8 scenes spawn at y=-1.2.
- Sky/surface separation (bright sky 0xdcefff + sun + clouds; water 0x5fb8d8 α0.55); water ripple (400×400, 64×64 verts, dual-sine animation + normal recompute; disabled on low graphics).

## M7 — Sonar performance & stability fixes

- Ray-march target set = scene props only; water/sky/sun/clouds/seaweed excluded from sonar.
- DME "up" resolves surface distance `max(0.04 - origin.y, 0)`.
- Sonar interval 100 ms → 120 ms floor; `SonarView` validates engine scene reference and rebuilds `SonarSampler` on scene change.
- Noise slider inverted mapping (1 - noise) — **later reverted** (see M12).

## M8 — DVL & environment models

- **DVL** (Doppler velocity log): PD anchor hold + velocity damping; current ×0.3. Verified hold: drift 0.031 m vs 1.31 m without DVL at 0.5 m/s current. Status bar indicator; enable in Settings → Controls.
- **Environment model** three modes: sea / river / custom. `EnvironmentState` adds `envModel/seaState/riverKnots` + `SEA_STATES` + `recomputeFlow` (sea/river derive speed/turbulence; custom keeps sliders). Per-scene defaults (salvage sea 1, dam sea 0 + turbulence 0.3, ship sea 2, bridge river 2 kn, oilrig sea 3, pipeline_ext sea 1, pipeline_int river 1 kn, aquaculture sea 1).
- **Turbulence mode**: `CurrentField.velocityAt` returns fbm random-direction flow when `currentDirectionDeg ≥ 359.9` (verified random displacement (1.16, 0.99) in 4 s). Triggered via the existing direction slider max — no new UI.

## M9 — Deep code review (performance & hidden bugs)

- **Bug fix**: `RigidBody6` inertia `Ix` formula was `h² + l²`, corrected to `h² + w²` (roll axis cross-section is YZ).
- **Alloc fix**: `velocityBody` / `relativeVelocityBody` reuse instance `invQuat` instead of `clone().invert()` every step.
- **Render fix**: HUD at 10 Hz re-rendered the whole `TrainingScreen`; decoupled — `PovHud` reads `hud` internally, status bar reads via small `HudStatusBar` component.
- Engine loop clamps `dt ≤ 0.1 s` (prevents jumps after background tab return).
- Sonar quality tier: low graphics → beams ×0.6 (`SonarSampler.setBeamScale`).
- Seafloor ray-march step 1.2 → 1.6 m.
- **Frame-sliced sonar**: each tick samples only 1/3 of beams (`sample(pos, yaw, start, count)` + `SonarSimulator.renderFrame`), image scrolls smoothly; fixed noise pattern (`rngBase = 0`) eliminates flicker.
- `envParams` excluded from persist; debounced (500 ms) localStorage write.
- `SettingsMenu` lazy rendering (zero inner hooks when closed).

## M10 — Full i18n coverage & browser-language detection

- ~33 new keys across zh/en/es: 8 scene names/descriptions, 2 vehicle names/descriptions, sonar panel labels (freq switch, palette, range/sector/gain/noise, hint), task elapsed, POV attitude.
- No hard-coded Chinese left in UI text (scene/vehicle `name` remain data-only).
- `detectLanguage()`: `navigator.language` → zh / es / **en fallback**; manual choice persists and wins.

## M11 — UI cleanup & input fixes

- Removed top-bar chips (coordinate frame, power %) that collided with the task panel; moved HUD-layout & unit chips to the status bar; removed the controls hint line.
- `S` key now toggles sonar (was shadowed by KEYMAP's backward); backward moved to `Z`; removed `3` key sonar toggle.

## M12 — Sonar parameter tuning (user-requested)

- Noise: default = 1, slider min 1 / max 2, **direct mapping** (inverted mapping reverted at user request; default must have audible noise).
- Frequencies re-tuned: **high freq** max sector 80°, max range 40 m, vertical ±6° (12° total); **low freq** max sector 120°, max range 120 m, vertical ±10° (20° total). Vertical sub-rays now symmetric around 0 driven by `params.verticalDeg`; sliders' max are frequency-dependent.

## M13 — Git & docs

- `git init`, `.gitignore` (node_modules/dist/.tmp/logs/editor/env), first commit `23dca89`.
- Bilingual README (EN `README.md` + `README.zh-CN.md`): intro, deployment (dev/build/static hosting), controls.
- This development log + `DEVELOPER_GUIDE.md` for second-stage development.

## Open backlog

- i18n of dynamic scene-mesh names.
- Further sonar frame-slicing (6 slices) on low-end devices.
- GLTF external model pipeline as default for branded vehicles.
- CI + GitHub Pages workflow.

## M14 — Realism pass, model integration & deep review fixes

- **Realism**: geometry subdivisions (cylinders 24 / spheres 24 / tori 16-24); ROV duct guards, DVL probe, sonar probe; 8 scenes got real-world details (Salvage bridge house + portholes, Ship deck containers + waterline, Dam gate rails + baffle blocks, Bridge crossbeams, OilRig manifold + anti-scour plates, Pipeline anode blocks + pebbles, PipelineInt fouling rings, Aquaculture fish school); RoomEnvironment PMREM as `scene.environment`; procedural canvas textures (`concrete/rusty/plate/mud/deepmetal`) applied to seabed, hull, platforms, pipes, concrete.
- **Ship scene**: GLTF external model support (`SceneGltfModel.fit` auto-orients/scales/bottoms any GLB hull) evaluated with the user-provided `ship.glb`, then reverted to a refined procedural hull (streamlined bow + bulbous bow, bridge/funnel/mast at stern, mid-deck containers, detailed 4-blade propeller with shaft/hub/rudder). Extra real parts in other scenes (OilRig K-node joints, Dam gate plates, Pipeline weld rings).
- **Input polish**: light cones visible only in POV (third person hides them, `ROVVisual.setLightConesVisible`); tether (buoyancy line) is a 48-segment yellow `TubeGeometry` (0xFFE800) from the ROV top with pose-affected exit, no surface buoy; tether feature then cancelled (default off, UI switch removed, migrate clears old persisted value, code retained).
- **Sonar follows camera**: `SonarSampler.sample` takes `pose` (pitch/roll), beam directions are rotated by the full vehicle attitude quaternion (yaw/pitch/roll YXZ) so the fan tracks the POV camera.
- **Deep review (3 parallel sub-agent reviews + parent physics audit), all fixes**:
  - `RigidBody6` inertia fix: `Ix = m/12·(h²+l²)` (was using width; length is the Z axis).
  - `SimulationEngine.reset()` now clears control input and cancels level-attitude (old inputs persisted across reset).
  - Ship task: `check_sides` split into sequential `check_port` → `check_starboard` steps (previous logic could never trigger).
  - Thruster rotor animation: rotor wrapped in an orientation `Group` (Euler accumulation no longer overwrites the duct-aligned quaternion — no more wobble).
  - `SceneManager` GLTF async race guard: drop the model if the scene changed while loading; `Engine` disposes `scene.environment` and the removed ROV; tether hide/dispose branches; Bridge target ring uses stored `markerY`.
  - i18n: `handleRestart` re-localizes tasks (was falling back to Chinese); SonarView meta/high-freq/beam labels now i18n; `fmtTemp` imperial `toFixed(1)`; `settings_nav_hint` key; MainMenu locale-aware dates.
  - Perf: integrator quaternion temps reused; `ROVController` caches speed-limit sqrt and writes `out` in place; `ThrusterAllocator.allocate` reuses buffers (no per-step array churn); `WaterForces` precomputes half-drag constants; DVL damp constant; sonar view draws brightness+palette in one pass with reused `ImageData`; `Compass` memoized; SonarView meta readout extracted (no whole-view hud subscription); water ripples update every other frame; dead code/keys cleaned (`bodyToWorld/worldToBody`, `createStaticSnapshot`, 8 unused i18n keys, unused `matVec`); persist migrate versioned (v5).

## Open backlog
- i18n of dynamic scene-mesh names.
- Further sonar frame-slicing (6 slices) on low-end devices.
- GLTF external model pipeline as default for branded vehicles (ship.glb provided but not used; procedural hull kept).
- CI + GitHub Pages workflow.

## M15 — Gamepad remap, sonar fixes, motor lock, tether removal

- **Gamepad**: D-pad now drives pitch (up/down) and roll (left/right); LB/RB drive gripper open/close (hold); LT/RT unassigned. D-pad directions flipped per user (up = nose down, right = roll left).
- **Gripper**: jaws now spread **laterally** (rotation around Y, both sides) with slimmer fingers for clearer opening visibility.
- **Sonar**: sub-ray echoes are de-duplicated by distance (no more triple arc ghosts); vertical coverage upgraded 3 → 5 sub-rays; frame slicing 3 → 6 (smoother rolling); target refresh every 6 samples; sonar is force-closed on every training entry (was auto-open & stale).
- **Motor lock system**: every training starts with motors **locked** — no thruster force (vehicle drifts up like before). Tap Space / gamepad A to unlock/lock. When unlocked and idle, the physics applies a hover compensation (net-buoyancy cancel + lateral damping) so the vehicle holds position; thrusters show a slight idle spin. Lock status shown bold in the bottom status bar (before speed) and in the POV corner box; locked inputs show "Unlock motors first". Help panel & README updated.
- **Tether removed**: deleted `Tether.ts`; all tether hooks removed from `PhysicsWorld`, `SimulationEngine`, `Engine`, store, HUD, i18n (bundle −4.3 kB gzip).
- Verified: locked 3 s drifts to 9.80 m depth; unlocked 3/6 s holds 10.00 m at 0 kn.

## M16 — UX polish (toast, HUD text, sonar artifacts, help tabs)

- Unlock-first hint is now a **semi-transparent centered toast** (2.5 s) instead of a bottom bar text.
- POV corner motor status shows just "Unlocked / Locked" (no label, no emoji); bottom bar keeps the bold "⚡ Motors Locked".
- Sonar: seabed echo generated only by the lowest sub-ray with a single main echo (no more parallel arc ghost lines); frequency switching rebuilds the image when the sector angle changes (no stale 120° remnants after switching back to high).
- Help panel now has **two tabs: Keyboard / Gamepad** with full gamepad mapping (sticks, D-pad, LB/RB, A/B/X/Y, Start/Back).

## M17 — POV motor readouts, sonar residue & freq hotkeys

- POV corner motor readout keeps its blue label, value now just "Locked / Unlocked".
- POV HUD mode bottom info bar shows motor status before speed (same style).
- Sonar: reused ImageData is zeroed each draw (kills stale fan remnants after high/low switch); frequency switches via `Back` hold; freq lives in the store (`sonarFreq`, not persisted) so keyboard/gamepad share it.
- Sonar header split: title + meta on row 1, all buttons on row 2 (no wrap from 40m vs 120m width).
- Help panel & README updated for Back hold = freq switch.

## M18 — Full zh naming, M2S visuals/tuning, attitude limits

- TrainingScreen vehicle name now uses i18n (`rov_<id>_name`) → shows "潜鲛P100 S" everywhere in Chinese.
- M2S thrusters: duct black, blades bright yellow plastic.
- Generic ROV gets `attitudeLimits` { pitch ±60°, roll ±45° } clamped each physics step (verified 60.0°/45.0° steady-state).
- M2S pitch/roll torque scale raised 2× → 4× (roll 2 s ≈ 75.4°, +50% faster than before; no attitude limit on M2S).

## M19 — M2S agility 8×, thick plastic frame, hard speed limit, attitude clamp fix

- M2S pitch/roll torque scale 4× → 8× (roll 2 s ≈ 108°, verified).
- M2S frame tubes thickened (r 0.022 → 0.038) and material switched to light-gray plastic (roughness 0.62 / metalness 0.08).
- Hard speed limit: thrust cut to zero beyond 2% over-limit band — M2S full throttle now holds exactly 3.00 kn (was overshooting ~4+).
- Attitude clamp now zeroes angular velocity on reached-limit axes — sustained pitch at ±60° no longer induces roll drift (verified pitch 60.0 / roll 0.0).

## M20 — M2S 16× agility, square side handles, hard speed cap

- M2S pitch/roll torque scale 8× → 16× (roll 2 s ≈ 103°, near agile limit).
- M2S adds square light-gray plastic carry handles on both sides of the frame (Box-bars vertical loops).
- Hard per-vehicle speed cap: `hardMaxSpeedKnots` — M2S clamps to 3 kn even if the UI speed slider is 4.5 (verified: slider 4.5 → actual 3.00 kn; generic ROV unaffected, 4.52 kn).

## M21 — M2S 32× agility, nested square handles, thinner frame

- M2S pitch/roll torque scale 16× → 32× (roll 2 s ≈ 108°, maxed by damping).
- M2S: removed top torus carry rings; replaced stand-alone side frames with **square plastic handles nested on the side upper/lower frame tubes** (4 blocks, slightly thicker than the tube, at ±X/±Y frame rails).
- M2S frame tubes slimmed r 0.038 → 0.02 (thin plastic skeleton).

## M21b — Angular velocity clamp (M2S 32× stability)

- 32× torque alone made the semi-implicit Euler diverge (roll read 0). Added a global angular-velocity clamp (MAX_ANGULAR_SPEED = 2.2 rad/s) after integration.
- M2S 32× roll 2 s now ≈ 182° (vs 103° at 16×) and numerically stable (no NaN over 5 s); generic ROV unaffected (its normal rates are far below the cap).

## M22 — M2S handle lengthened, top buoyancy block & antenna removed

- M2S side handles lengthened (0.20 → 0.34 along the frame rails).
- M2S top yellow buoyancy block removed (visual only; physics unchanged).
- M2S top antenna removed (slim line gone).

## M23 — Deep review round 2 (3 parallel sub-agents + parent audit), fixes

**Smoke test**: adapted to the motor-lock system — `resetSim()` unlocks motors after every reset (was running all thruster cases powerless → false-green).

**Core fixes**
- M2S gets `attitudeLimits { pitchDeg:75, rollDeg:75 }` — keeps full agility but avoids Euler decomposition flip (world mode / level / HUD rely on YXZ Euler).
- DVL hover only active when motors unlocked (lock semantics no longer masked by virtual PD hold).
- Speed limit smoothed: 10% band linear cut (no hard 0 cut, kills limit-cycle jitter); verified 3.00 kn on M2S.
- Level-attitude rejected while motors locked (no PD spin on dead thrusters; PhysicsWorld syncs lock to controller).
- `controllableAxes` cached as a Set (no per-step string includes).
- Sonar image rebuilt when `rangeM` changes (no stale-scale residue).

**Sonar perf**
- Noise rewritten from per-pixel `Math.sin` to integer LCG; distance fade precomputed as a `Float32Array` table per rangeBins (≈23万 special-func calls/s removed).
- `SonarSampler`: tilts cached per `verticalDeg`; removed redundant `filter` before sort/merge.

**UI fixes**
- `help_guide` newlines now render (`whiteSpace: pre-line`).
- Space tap no longer toggles motor lock while paused / on result dialogs (down & up guarded).
- Speed slider max follows the vehicle `hardMaxSpeedKnots` (M2S shows max 3.0 instead of 4.5).
- `setTaskState` only fires on structural change (phase / step / completed count / integer second) — kills 100 ms full-tree re-render of TrainingScreen.
- Removed dead `brightBuf` fill; cleared `grabMsgTimer` in cleanup; deduped duplicated top-bar info chips; `VIEW:` label i18n; removed dead i18n keys and unused `sceneNames.ts`.

**Scene collider alignment (no more pass-through)**
- PipelineExt supports ±2.2 (was ±4) & pipe collider y follows `seabedHeight(0,0)+1.1`; Ship bow extended to z≈-28 (bulbous bow); Bridge deck collider added; OilRig legs enlarged to r1.8/y-11.5..8.5; Salvage hull AABB widened.

**Render fixes**
- `UnderwaterEffects.setQuality` re-configures shadow camera (±60) & mapSize on low→high; `Engine.setQuality` rebuilds PMREM env map if missing; `Engine.quality` set in constructor; AttitudeIndicator nose cone direction fixed (now points -Z).

## M24 — Fluid simulation enhancement (real-water feel)

Added 5 physical/aquatic improvements (all tunable, no regressions):
- **Added mass**: effective mass `m_eff = m×(1+am)` per axis (heave largest, standard 0.8 / M2S 0.55) and effective inertia `I_eff = I×(1+ang)` — dive acceleration and turn feel heavier like real displaced water.
- **Thruster first-order response**: per-thruster low-pass τ=0.12 s — smooth start/stop instead of instant thrust.
- **Ground effect**: within 3 m of the seabed damping increases (vertical ×2.2, horizontal ×1.5) — near-bottom operations feel viscous.
- **Turbulence yaw torque**: vortex-induced yaw disturbance (scales with turbulence, fades with depth) plus light pitch/roll jitter.
- **Sea-state shallow swell**: turbulence boosted in the top 8 m when seaState > 0 (wave action near surface).

Verified: M2S full throttle 3.00 kn, roll 2 s hits 75° limit, hover holds 10.00 m, dive 4.54 kn in open water (slows near floor), thruster response ramps smoothly (2.65 kn at 0.5 s).

## M25 — Fluid deep-dive: wave orbit, thruster cross-flow coupling, Munk moment

- **Wave orbital flow** (Airy approximation): sea-state driven wave height/period, horizontal + vertical orbital velocities exponentially decay with depth; near-surface ROV rides/sways with the swell.
- **Thruster cross-flow coupling**: transverse relative flow reduces thruster efficiency (vertical thrusters affected by horizontal flow, horizontal by vertical) — real loss when strafing/diving.
- **Munk moment** (added-mass Coriolis term): yaw instability torque from body-axis u·w product with asymmetric added mass — negligible at low speed, adds realism in currents/lateral motion.
- Verified: seaState=3 shallow +0.3 m/s wave flow, 25 m deep fades to base current; cross-flow coupling active; no smoke regressions.
