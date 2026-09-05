# FutolStructure Delivery Roadmap and Local Build Handoff

Date: 2026-09-05 (Asia/Singapore)

## Source of Truth

- Active worktree: `D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation`.
- Branch: `feature/fs-125-shared-analytical-inputs`; parent release checkpoint: `db13836f698cbd90d49ec5382f5fe193788e10b0`.
- Candidate identity: `3.16.124-rc.1 / FS-124-RC1`. The manifest references the source checkpoint; a subsequent commit records release metadata and acceptance evidence.
- Governing [Drive roadmap](https://docs.google.com/document/d/1l4THhH7AIRu_SW5WWB0ixpKqgR0jLG21cRenhR96Xc4/edit) now includes P7, shared analysis and member optimization, and the current delivery sequence. Its append was read back successfully.
- The Windows candidate was rebuilt, installed, and tested on 2026-09-05. Production web deployment remains a separate acceptance step.
- Current progress and GitHub links are maintained in [the delivery tracker](ROADMAP.md).

## Delivered in This Continuation

### Workspace Navigation

Primary workspace buttons now open content, not just switch the visible subtab labels. Each workspace remembers its last selected view for the session. Stair Builder is under Model. Schedule panels are moved into the canvas workspace so they cannot cover the main navigation. Rapid navigation ignores outdated deferred panel updates. Entering 3D from a schedule returns to the model view.

Model editing tools are hidden in non-model views. Duplicate tab-name mappings and obsolete engine cards were consolidated; hidden separators no longer leave empty gaps. Existing modeling, schedules, checks, and exports were retained rather than deleted merely because their controls looked similar.

### Analysis and Optimization

- Analysis offers PyNite and OpenSees selections, draft preparation, dated JSON download, and the existing ETABS audit JSON import action.
- Optimization offers objective selection and dated study downloads.
- Requests preserve detached, deeply frozen canonical source snapshots, levels, coordinates, materials, geometry, source identity, and validation evidence.
- The canonical CSI export model now carries `FutolStructure.AnalyticalInputs.v1`: governed load cases/combinations, explicit base supports, and a mass-source policy with element self-mass exactly once and live load excluded pending an occupancy decision.
- `node v3/tools/check-fs.js --no-browser` passes the shared-input source and fixture gate. The browser rerun reached the new assertions, then stopped at the existing strict-DXF gate because this machine has no Python interpreter with `ezdxf` installed.

### Masonry and Wall Inventory - WALL-01

The first wall-modeling slice is now present in `v3/engine/walls.js` as `FutolStructure.WallInventory.v1`. It preserves the existing legacy floor wall-load path while adding a separate inventory for explicit line geometry, CHB thickness, wall height, inside/outside plaster thickness, openings, lintel metadata, net wall area, and derived line load. Solver participation is opt-in per wall (`exportToSolvers: true`); unresolved lines remain coordination-only with warnings. The source fixture gate passes for wall, opening, lintel, and line-load derivation. Plan drawing, hover editing, persistence UI, and native solver acceptance remain next.

### Stair Builder 2D Workspace - STAIR-01

The Stair Builder now has a linked 2D plan and elevation workspace beside the existing 3D preview. The plan view draws the governed stair footprint, landing/flight shells, actual flight centerlines derived from structural-model vertices, and green centerline node markers. The elevation view draws lower, landing, and upper governed elevations from the stair coordinate primer. Existing create/integrate behavior, 3D preview, save/load, schedules, IFC, and ETABS/STAAD payload paths remain the source of truth; this slice is a view and inspection layer, not a second stair geometry engine.

The local browser gate paints both canvases and reports no page errors at 1440, 768, and 390 pixel viewports. Editable node dragging/snapping, automatic projection into floor layouts, and native solver connectivity/load acceptance remain the next STAIR-01 gates.
- Invalid topology/member-size summaries block requests. Missing common load cases, combinations, mass source, and support assignments are explicit pending definitions.
- Planned adapters use neutral pending states. Null elevations are not converted to zero.
- Downloads collect fresh source state. QUBO studies contain zero candidates until an optimizer exists.
- Execution and result application remain disabled. These are preparation tools, not new analysis or design results.

## Delivery Sequence and Acceptance

| Stage | Deliverable | Required Gate |
| --- | --- | --- |
| 1. Model truth | Stable column segments/termination, exact column orientation and levels, per-floor and per-member edge-beam overrides, protected revisions | Frozen regular, terminated, legacy, and Bacacay fixtures; rebuild/save/reopen parity; no cross-floor override leakage |
| 2. Shared analytical inputs | Explicit loads, combinations, mass, support conditions, section axes, insertion/offset policy, connectivity | No duplicated self-weight; physical versus analytical geometry documented; unsupported topology blocks solver execution |
| 3. PyNite baseline | Desktop runner with pinned dependencies, cancellation, logs, reactions and member-force readback | Analytic gravity benchmarks and comparison with an accepted ETABS/STAAD fixture; never infer a pass from geometry alone |
| 4. Native handoffs | ETABS/STAAD readback, foundations, IFC/Revit acceptance | Exact coordinates/axes/levels; connected analytical nodes; native reopen and inspectable IDs; declare restraints versus modeled foundations |
| 5. Stairs and walls | Stair support connectivity; explicit stairs or equivalent reactions; wall/opening/lintel and attached-element loads | No double application of equivalent and explicit loads; traceable reactions, quantities, supports and diaphragm policy |
| 6. Import and reconciliation | PDF/CAD assisted entry, then ETABS/STAAD/Tekla SD adapters and result reconciliation | Calibration and user acceptance of inferred geometry; source-ID matching; stale/unrelated results rejected; reviewed candidate revisions |
| 7. OpenSees | Static parity first, modal next; nonlinear/seismic separately | Declared formulations, mass, convergence and result extraction; independent benchmarks for each capability |
| 8. QUBO | Section catalog, selected members, objective, constraints, classical baseline, candidate reanalysis | Feasibility and engineering checks outside the optimization objective; explicit approval before a new model revision |
| 9. Detailing and documentation | Accepted-model IFC/DXF/A4/BOQ regeneration, governed reinforcement and shop drawings | Arial reports/DXF where supported; parser and native visual acceptance; consistent tags; laps, anchorage, joints and constructability reviewed |
| 10. Release and access | Matching Windows/web build, safe updates, optional authenticated project storage | Unique build identity; staged release evidence; authorization and project isolation/security tests before cloud sync |

Stages overlap only where their input contracts are stable. The immediate next engineering task is the stage-1 override/geometry fixture audit followed by explicit analytical loads/supports. Adding more engine buttons before that would not make analysis reliable.

## Scope Boundaries

PyNite and OpenSees belong behind shared analysis adapters. QUBO is a proposal generator, not a solver or compliance certificate. A solver result may inform a reviewed new revision; it must not silently alter the source model.

Stair loads are practical to export, but the adapter must choose explicit frames/shells or equivalent support reactions, never both. Foundation geometry may exist for coordination while the analysis adapter exports base restraints. That distinction must remain visible and validated; neither ETABS nor another solver should be assumed to generate a final footing design automatically.

The ETABS audit action accepts the existing audit JSON workflow. It is not an implemented native EDB/STD/Tekla model importer. Automatic final shop drawings, native multi-solver import, engine execution, and optimization results remain pending.

## Verification Evidence

- `node v3/tools/check-workspaces.cjs`: passed at widths 1440, 768, and 390; real navigation, JSON download, objective retention, rapid-switch behavior, no page exceptions, and unchanged canonical geometry.
- Screenshot/download evidence: `output/playwright/workspaces/`, including `stair-builder-2d-desktop.png`.
- `git diff --check`: passed, with Git line-ending conversion warnings only.
- Full regression: passed (`ok: true`) with a 120-second browser evaluation timeout after exceeding the default 15-second CDP limit. Evidence: `output/playwright/workspaces/full-regression.log`. This includes source/fixture contracts and the general browser smoke; optional real-project and P0-C1A release-gate runs were not requested by this test invocation.
- No Revit, ETABS, STAAD, or Tekla native acceptance was performed for this UI/contract slice.

## Release Candidate Status - 2026-09-05

- [x] Local source and focused workspace regression passed.
- [x] Full source/browser regression passed with the 120-second CDP timeout.
- [x] Windows NSIS installer built: output/desktop/FutolStructure-Setup-3.16.124-rc.1-x64.exe.
- [x] Install the candidate on this PC. Installer exit code 0; installed manifest and isolated desktop smoke confirm FS-124-RC1, source db13836, working desktop bridge/workspaces, and no page errors.
- [x] Stage/commit the scoped candidate. Earlier usage-limit approval rejection resolved; source checkpoint db13836 now exists.
- [x] Push release/fs-124-desktop-workspaces-rc1 and open [draft PR #11](https://github.com/michaelfutol/futolstructure/pull/11).
- [ ] Run Vercel preview and native ETABS/IFC/Revit acceptance before any production merge.

Installer SHA256: DADD15B89B104306B327272BF8066E172AD96331C0146D107580444AB87671D7.
Installed executable: C:/Users/Futol/AppData/Local/Programs/FutolStructure/FutolStructure.exe.
Desktop evidence: output/playwright/desktop/desktop-smoke.json and installed-workspaces.png.

## Local Test Commands

```powershell
$env:FS_PLAYWRIGHT_MODULE='C:/Users/Futol/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright'
node v3/tools/check-workspaces.cjs
node v3/tools/check-fs.js --no-browser
$env:FS_HEADLESS='1'
$env:FS_CDP_PORT='9354'
$env:FS_CDP_TIMEOUT_MS='120000'
node v3/tools/check-fs.js
```

The focused script also accepts a normal installed `playwright` module; the environment override above is this machine's cached runtime. Tests use isolated browser storage, not the user's active project session.
