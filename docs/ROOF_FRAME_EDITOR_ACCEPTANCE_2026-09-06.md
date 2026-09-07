# Roof Frame Editor Acceptance

**Date:** 2026-09-06  
**Scope:** ROOF-01 interactive member-placement and load-intent slice  
**Branch:** `feature/fs-125-shared-analytical-inputs`

## Implemented

- Dedicated 2D roof-plan member placement with grid, column, and free snap modes.
- Persistent stable member IDs with create, edit, and remove actions.
- Member type, steel section, start/end elevation, dead line load, and live line load controls.
- Explicit solver intent, defaulting to OFF until native connectivity and load acceptance exists.
- `.fstr` serialization through the existing governed `roofFrame` payload.
- `FS_ROOF_DL` and `FS_ROOF_LL` normalized load records in `FutolStructure.RoofFrameModel.v1`.
- Existing explainable AUTO hinge/roller support policy retained; fixed support is never guessed.

## Browser Evidence

The real-browser workspace regression passed at 1440, 768, and 390 px with no page errors.

| Check | Result |
| --- | --- |
| Canvas placement binding | Passed |
| Test member | `RF-1`, rafter, `RHS-100x50x3` |
| Start/end | `(0,0,6.0)` to `(2,0,6.6)` m |
| Snap metadata | Grid at both ends |
| Create/edit behavior | Updated in place; count remained one |
| Dead/live line loads | `0.35 / 0.30 kN/m` |
| Normalized load cases | `FS_ROOF_DL`, `FS_ROOF_LL` |
| Solver intent default | OFF |
| `.fstr` serialization | One member retained in generated project payload |
| AUTO supports | Eight hinge assignments and one terminal roller in the test grid |
| Existing physical RC model | Preserved across workspace navigation |

Evidence directory:

```text
output/playwright/workspaces
```

## Acceptance Boundary

This slice establishes persistent roof drafting geometry and explicit load intent. Roof members are not yet added to the canonical CSI frame arrays, ETABS/STAAD/PyNite payloads, IFC geometry, or DXF sheets. Solver intent must remain OFF until section parsing, node/support connectivity, releases, load combinations, and native solver readback are validated.
