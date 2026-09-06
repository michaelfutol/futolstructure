# Analytical and Physical Member Geometry

**Scope:** FutolStructure only. No SolverLink changes.

## Contract

FutolStructure now keeps two deliberate representations for horizontal frame members:

- **Analytical axis:** beam joints remain at the governed column-centroid coordinates. ETABS keeps column cardinal point 5 and beam cardinal point 8, with the source column orientation and section-axis mapping preserved.
- **Physical axis:** 3D and drafting geometry use the face-terminated, alignment-aware beam axis. Edge beams terminate at the cantilever side-beam faces; regular beams terminate at column faces.
- **Joint offsets:** each beam carries the source-plan and shared-solver-plan delta from its analytical endpoint to its physical endpoint. The same delta is consumed by both solver writers.

## Export behavior

- **ETABS:** `FrameObj.AddByPoint` still receives the analytical centroid joints. `SetInsertionPoint_1` receives the beam start/end shared-solver-plan offsets, while cardinal point 8 governs the top-center vertical insertion. A native frame audit now reads those offsets back.
- **STAAD.Pro:** `JOINT COORDINATES` and `MEMBER INCIDENCES` remain analytical centroid geometry. `MEMBER OFFSET` emits the same physical start/end offsets in STAAD global X/Y/Z, including the existing top-of-slab vertical insertion offset.
- **3D:** beam boxes are now oriented from the physical start/end vector instead of being rebuilt as X/Y-only boxes. The member inspection data retains both axes and the joint offsets.

## Additional correction

The 3D renderer now passes the active `floorId` into beam alignment resolution. Per-floor alignment and edge-beam geometry therefore do not fall back to the global/current-floor scope during regeneration.

## Verification

Passed locally:

```text
node v3/tools/check-fs.js --no-browser
$env:FS_PLAYWRIGHT_MODULE='C:/Users/Futol/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright'
node v3/tools/check-workspaces.cjs
git diff --check
node --check v3/tools/check-fs.js
```

The workspace regression reported preserved geometry, all target viewports, and zero page errors. The full CDP-driven regression was not used as acceptance for this change because its browser attach step timed out at `Runtime.enable`; this is an environment-runner issue, not a passed product gate.

A fresh Windows installer was built from this worktree and verified to contain the geometry contract, ETABS joint-offset writer, and STAAD `MEMBER OFFSET` writer:

```text
D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation\output\desktop\FutolStructure-Setup-3.16.124-rc.1-x64.exe
```

The installed copy was not overwritten because Windows still reports FutolStructure processes running. No process was terminated.

## Remaining acceptance

1. Build the desktop candidate from this source.
2. Open a fresh Bacacay `.fstr` and export ETABS and STAAD.
3. In ETABS, inspect column orientation, cardinal points, beam insertion offsets, and analytical connectivity.
4. In STAAD.Pro, inspect `MEMBER INCIDENCES` and `MEMBER OFFSET`, then run the model read/analysis gate.
5. Compare the solver views with the FutolStructure physical 3D view before release.

No commit or push is authorized by this evidence note.
