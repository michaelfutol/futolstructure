<p align="center">
  <img src="v3/assets/futolstructure-icon.png" alt="FutolStructure logo" width="112">
</p>

# FutolStructure

FutolStructure is a browser-based structural engineering workbench for early reinforced-concrete building modeling, gravity load takeoff, tributary area visualization, 3D review, and solver handoff preparation.

It is designed around the workflow of a practicing engineer: define a grid, tune floor/cantilever geometry, review load paths, inspect the 3D frame, then export coordinated model data for documentation and solver validation.

![Version](https://img.shields.io/badge/build-v3.16.115-2563eb)
![Platform](https://img.shields.io/badge/platform-browser-0f766e)
![Stack](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20JavaScript-f59e0b)
![Validation](https://img.shields.io/badge/solver%20QA-ETABS%20%7C%20STAAD%20%7C%20IFC-16a34a)

## Screenshots

### Plan, tributary, and load review

![FutolStructure plan and tributary view](v3/assets/screenshots/futolstructure-plan.png)

### 3D structural model

![FutolStructure 3D structural model](v3/assets/screenshots/futolstructure-3d.png)

### Stair Builder

![FutolStructure Stair Builder](v3/assets/screenshots/futolstructure-stair-builder.png)

## Current Capabilities

- Grid-based reinforced-concrete framing model with columns, beams, slabs, cantilevers, corner slab patches, and per-floor controls.
- Tributary area and gravity load distribution from slabs to beams, columns, footings, and base reactions.
- Plan drafting aids including beam/slab tags, grid bubbles, dimensions, ortho measure mode, entity snapping, and member lock indicators.
- Professional 3D review with display schemes, member opacity/color controls, foundation visualization, slab transparency, and stair geometry.
- Persistent `.fstr` project save/load with autosave protection, hidden-geometry recovery, floor deletion guardrails, and lock persistence.
- Stair Builder for inter-storey stair geometry, destination slab openings, DXF footprint output, and 3D stair review.
- Reports and schedules for columns, beams, slabs, footings/base reactions, and design summaries.
- Export pathways for DXF, IFC2x3, STAAD.Pro, ETABS 22 OAPI, and SAFE handoff through ETABS.

## Solver And BIM Status

FutolStructure uses one shared active model payload for export parity. Current validation work has covered gravity-baseline export and model-count parity for ETABS, STAAD.Pro, and IFC.

| Target | Current status |
| --- | --- |
| DXF | Structural drafting layers and plan output are active. |
| IFC2x3 | Active columns, beams, slabs, and stair-related geometry are exported for BIM review. |
| STAAD.Pro | Gravity baseline, frame/plate geometry, beam insertion offsets, and statics checks have been validated against STAAD.Pro 2024. |
| ETABS 22 | OAPI builder creates a dated working model, assigns rigid diaphragm baseline, defines governed mass source, runs modal analysis, and exports audit artifacts. |
| SAFE | Handoff path is planned through ETABS story export and base reaction workflows. |

Important: this repository is an engineering decision-support and model-preparation tool. Final permit-ready design still requires project-specific wind/seismic inputs, diaphragm and drift checks, geotechnical data, detailing checks, and review/signing by the responsible licensed engineer.

## Quick Start

No build step is required for the app itself.

```bash
git clone https://github.com/michaelfutol/futolstructure.git
cd futolstructure
```

Open the app directly:

```text
v3/index.html
```

Or serve it locally:

```bash
python -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/v3/index.html
```

## Validation

Run the syntax and engine smoke check:

```bash
node v3/tools/check-fs.js --no-browser
```

Run the full browser smoke check with Chrome or Edge available:

```bash
node v3/tools/check-fs.js
```

The browser smoke covers app initialization, plan geometry, active slab truth, cantilever behavior, hidden/deleted geometry persistence, member locking, measurement tools, stair builder persistence, DXF stair output, 3D rendering coverage, export payload parity, and current UI cleanup checks.

## Repository Layout

```text
futolstructure/
|-- README.md
|-- index.html
|-- v3/
|   |-- index.html
|   |-- assets/
|   |   |-- futolstructure-icon.png
|   |   `-- screenshots/
|   |-- engine/
|   |-- tools/
|   |   `-- check-fs.js
|   `-- _logs/
`-- .gitignore
```

## Technical Notes

- Frontend: plain HTML, CSS, and JavaScript.
- 3D rendering: Three.js loaded by the app.
- Persistence: `.fstr` project files plus guarded browser autosave.
- Testing: Node-based syntax checks and Chrome/Edge CDP browser smoke tests.
- Deployment: static hosting is enough for the current app.

## Deployment

The intended public URL is:

```text
https://futolstructure.futoltech.com
```

See [docs/LAUNCH_PLAN.md](docs/LAUNCH_PLAN.md) for the GitHub, Vercel/cPanel, DNS, and release checklist.

For future authenticated cloud projects and user accounts, see [docs/AUTH_SECURITY_PLAN.md](docs/AUTH_SECURITY_PLAN.md).

## Portfolio Roadmap

- Add a public live demo link after deploying the static app.
- Add a formal `LICENSE` file before public release.
- Add a short demo video or GIF showing plan editing, 3D review, and solver export.
- Split long-term code into modules once feature stabilization is complete.
- Continue native solver validation for stairs, lateral loading, SAFE workflow, and Revit/IFC round-trip review.

## Author

FutolTech - Engineering & Project Systems
