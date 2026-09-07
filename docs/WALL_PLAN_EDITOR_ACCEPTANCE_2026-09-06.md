# Wall Plan Editor Acceptance

**Date:** 2026-09-06  
**Scope:** WALL-01 plan-line editor slice  
**Branch:** `feature/fs-125-shared-analytical-inputs`

## Implemented

- Added a Wall Elevations plan workspace with a governed floor selector.
- Added endpoint snap modes for grid, column, beam, and free placement.
- Added persistent wall IDs per floor.
- Added editable wall properties for height, CHB thickness, inside plaster, outside plaster, wall type, and solver opt-in.
- Added explicit plan-line start/end snap metadata.
- Added wall line removal from the inventory table.
- Added per-wall opening controls for type, width, height, sill elevation, and count.
- Added optional preliminary RC lintel controls for width and depth.
- Added an Edit action that reloads an existing wall, opening, lintel, and solver-opt-in state into the editor.
- Extended the legacy-compatible wall normalizer so `.fstr` serialization retains plan coordinates, endpoint snaps, plaster properties, openings, lintels, IFC intent, source, and explicit solver intent.
- Preserved the existing `FutolStructure.WallInventory.v1` contract and solver opt-in default of `OFF`.
- Kept opening deduction and lintel records as explicit inventory fields; no final lintel design is implied.

## Browser evidence

Command:

```text
$env:FS_PLAYWRIGHT_MODULE='C:/Users/Futol/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright'
node v3/tools/check-workspaces.cjs
```

Result: passed.

| Check | Result |
| --- | --- |
| Wall plan canvas | Painted and interactive |
| Canvas event binding | Passed |
| Wall creation | `WL-2F-1` created and removed in the regression fixture |
| Test wall length | `2.000 m` |
| Start snap metadata | `grid` |
| Solver export default | `false` |
| Wall inventory count | Increased by one during test, then returned to baseline |
| Opening create/readback | `window`, `1.2 x 1.0 m`, sill `0.9 m`, count `2` |
| In-place wall edit | Passed; inventory remained at one wall instead of duplicating it |
| Opening edit/readback | Count changed from `2` to `1`; computed head elevation `4.9 m` |
| Lintel create/edit/readback | `150 x 250 mm` changed to `150 x 300 mm` |
| `.fstr` JSON/schema round trip | Preserved `WL-2F-1`, start coordinate `0`, grid end snap, 15 mm inside plaster, one opening, 300 mm lintel depth, IFC `true`, solver `false` |
| Editor state after update | Selected wall ID cleared and draft reset |
| Physical model geometry during workspace navigation | Preserved |
| Responsive workspaces | Passed at 1440, 768, and 390 px |
| Page errors | None for the recorded editor regression |

The opening/lintel controls are source-checked and covered by a focused browser create/edit/persist/readback regression. They are not yet included in the installed `3.16.124-rc.1` Windows candidate.

Evidence output:

```text
D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation\output\playwright\workspaces
```

## Acceptance boundary

This is a local/browser coordination acceptance only. Native ETABS/STAAD wall-member and wall-load readback remains pending. Openings, lintel design, masonry load review, and solver opt-in still require explicit engineering review before analytical use.
