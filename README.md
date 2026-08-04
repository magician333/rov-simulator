# ROV Simulator — Underwater ROV Operation Trainer

A web-based 3D ROV (Remotely Operated Underwater Vehicle) operation training simulator.
Realistic 6-DOF physics, underwater environment, sonar imaging, manipulator arm, mission system and configurable vehicle models — all running in the browser.

Built with **Three.js + React 18 + TypeScript + Zustand + Vite**. No backend required; the whole app is a static site.

## Features

- **6-DOF physics**: surge / sway / heave / yaw / pitch / roll with realistic buoyancy, drag, thruster vector allocation (fixed 1/120s step, anti-spiral accumulator)
- **8 work scenes**: Salvage, Dam Survey, Ship Survey, Bridge Survey, Oil Platform, Pipeline External, Pipeline Internal, Aquaculture Cage (registry-extensible)
- **2 vehicle models**: Generic 6-DOF ROV (3 kn) and compact CHASING M2 (3 kn, 8 vector thrusters, micro-positive buoyancy)
- **Multi-beam fan sonar**: low freq 120°×120 m (vertical ±10°), high freq 80°×40 m (vertical ±6°), adjustable gain / range / noise / palette, DME sonar (5-point distance ranging)
- **Manipulator arm**: wheel-mode camera/gripper zoom, fine gripper with opening %, grab hints
- **Mission system**: navigate → approach → action (hold Space), score records + JSON export
- **Motor safety**: scenes start with motors **locked** (no thrust, ROV drifts up). Tap Space / gamepad A to unlock/lock; unlocked motors idle-hover to hold position.
- **Environment model**: sea state / river / custom modes — current speed & direction, turbulence, visibility, temperature, turbidity, lighting, DVL (Doppler velocity log, hover-hold)
- **Views**: chase cam, POV HUD (attitude / compass / depth / pitch-roll grids / radar-style sonar) + 2D fan sonar panel
- **i18n**: Simplified Chinese / English / Español — auto-detected from browser language, defaults to English; metric/imperial units, °C/°F
- **Gamepad**: full Xbox-style mapping with sensitivity presets
- **Settings**: display / environment / controls / misc tabs, persisted across sessions

## Deploy

### Requirements

- Node.js **>= 18** (developed on Node 23)
- npm (bundled with Node)

### Local development

```bash
npm install
npm run dev        # start dev server → http://localhost:5173
```

### Production build

```bash
npm run build      # outputs static files to dist/
npm run preview    # preview the production build locally
```

### Static hosting

The app is a **pure static site** — no server runtime needed. Deploy the contents of `dist/` to any static host:

- **Nginx**

```bash
# copy dist/* to your web root, e.g. /usr/share/nginx/html/rov-sim/
```

- **GitHub Pages**

```bash
npm run build
# push dist/ contents to the gh-pages branch (or use actions/upload-pages-artifact)
```

- **Object storage / CDN** (S3, OSS, Cloudflare R2, etc.): upload `dist/` and serve as a static website.

> Hint: this is a Vite SPA with a single `index.html` — no history-mode routing needed, so any static server works out of the box.

## Controls

### Keyboard

| Keys | Action |
|------|--------|
| `W` / `Z` | Forward / Backward |
| `A` / `D` | Strafe left / right |
| `Q` / `E` | Ascend / Descend |
| `↑` / `↓` | Pitch down / up |
| `←` / `→` | Turn left / right (yaw) |
| `R` / `F` | Roll left / right |
| `Space` (tap) | Unlock / Lock motors (locked by default on start) |
| `Space` (hold) | Action (grab / operate) |
| `X` | Grab / release |
| `S` | Sonar panel on / off |
| `V` / `1` / `2` | Switch view (chase / POV) |
| `B` | Level attitude (one-key horizontal) |
| `G` | Toggle control frame: body / world |
| `L` | Lights on / off |
| `P` | Power level |
| `Esc` | Pause / resume |

### Gamepad (Xbox-style)

| Control | Action |
|---------|--------|
| Left stick | Forward / back + turn |
| Right stick | Strafe + ascend / descend |
| `LB` / `RB` | Pitch |
| `LT` / `RT` | Roll |
| `A` (hold) | Action (grab) |
| `B` | Lights |
| `X` tap / hold | Switch view / HUD layout |
| `Y` tap / hold | Level attitude / control frame |
| `Start` | Open settings menu |
| `Back` tap / hold | Sonar on-off / HUD layout |
| D-pad | Menu navigation (LB/RB switch tabs) |

### Mission workflow

1. Pick a scene + vehicle in the main menu, press **START**.
2. Check the mission brief (top-left task panel) and sonar markers.
3. Navigate close to the target using the sonar / POV HUD.
4. Tap `Space` (or `A` on gamepad) to **unlock motors** (otherwise no thrust — the ROV drifts back up). When unlocked and idle, the vehicle hovers to hold position.
5. Hold `Space` (or `A`) to perform the action (e.g. grab the container, inspect the weld).
5. Finish to get a score — saved in the records page (JSON export available).

### Settings

Open with the ⚙ button (or gamepad `Start`), then pick a tab:

- **Display**: sonar first — frequency, gain, noise, palette, HUD layout, compass style, graphics quality
- **Environment**: sea state / river / custom modes — current speed, direction (≥359.9° = turbulence mode), turbulence, visibility, temperature, turbidity, lighting flicker
- **Controls**: DVL enable, control sensitivity (gamepad), power level
- **Misc**: language (zh / en / es), units (metric / imperial)

## Project layout

```
src/
  core/        physics, environment, sonar simulation, tasks, ROV configs
  render/      Three.js engine, scenes, models, camera rig, HUD renderers
  ui/          React UI: HUD, sonar panel, settings, menus
  state/       Zustand stores (persisted settings, training sessions)
  i18n/        zh / en / es dictionaries
docs/          architecture & design docs (Chinese)
scripts/       physics smoke tests
```

## Development

```bash
npm run build          # type-check + production build
npx esbuild scripts/physics-smoke.ts --bundle --platform=node --format=esm --outfile=.tmp/smoke.mjs && node .tmp/smoke.mjs
```

## License

Private / internal training tool.
