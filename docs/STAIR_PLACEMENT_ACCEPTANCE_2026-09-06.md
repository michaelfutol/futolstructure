# Stair Placement and Snap Acceptance

**Date:** 2026-09-06  
**Scope:** STAIR-01 placement slice only  
**Branch:** `feature/fs-125-shared-analytical-inputs`

## Implemented

- Added persisted stair placement metadata under `stair.placement`:
  - `offsetXM`
  - `offsetYM`
  - `snapMode`: `grid`, `column`, or `free`
  - `snapTargetId`
- Added Plan Offset X/Y controls to Stair Builder.
- Added `Snap center` and `Reset bay` controls.
- Added click-to-place behavior in the 2D plan preview.
- Added grid-intersection and active-column snap targets.
- Added a bay context frame so the stair footprint can be positioned relative to the selected structural bay.
- Preserved legacy stair payload compatibility through `EngineStairs.normalizeStair()`.
- Kept the existing stair structural model, slab opening, 3D preview, and solver export contracts unchanged apart from the governed placement values.

## Browser evidence

Command:

```text
$env:FS_PLAYWRIGHT_MODULE='C:/Users/Futol/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright'
node v3/tools/check-workspaces.cjs
```

Result: passed.

| Check | Result |
| --- | --- |
| 2D plan and elevation canvases | Painted |
| Placement event binding | Passed |
| Manual X offset | `+0.150 m` exact within tolerance |
| Manual Y offset | `-0.100 m` exact within tolerance |
| Plan-canvas placement | Passed; clicked placement updated footprint |
| Placement mode | `free` for the tested free-point click; grid/column modes are available through snap targets |
| Save/load normalization | Passed; placement metadata retained |
| Physical model geometry during workspace navigation | Preserved |
| Responsive workspaces | Passed at 1440, 768, and 390 px |
| Page errors | None |

Evidence output:

```text
D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation\output\playwright\workspaces
```

## Acceptance boundary

This is a local/browser modeling acceptance only. It does not yet establish native ETABS or STAAD stair-member readback, final stair support design, or permit-ready structural adequacy. Those remain the next native solver gate for STAIR-01.
