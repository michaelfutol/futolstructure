# Wall Xline Construction Acceptance

**Candidate:** FS-125-RC3 working tree  
**Date:** 2026-09-07  
**Scope:** Temporary construction guides for accurate wall, opening, and beam placement in the Wall Elevations plan workspace

## Decision

Accepted as a drafting-aid slice. Xlines are per-floor construction references, not structural members. They are excluded from ETABS, STAAD, IFC, DXF, load, and analytical geometry generation.

## Implemented behavior

- Add horizontal or vertical Xlines from the Wall Elevations plan canvas.
- Snap the guide position to a governed `0.05 m` increment.
- Select a guide with the Select Xline tool.
- Move the selected guide with `-5 cm`, `+5 cm`, or the position field.
- Delete the selected guide with the button or the canvas Delete key.
- Clear all Xlines on the active floor without affecting walls or members.
- Persist Xlines through undo/redo, autosave, `.fstr` save/load, and protected project data.
- Draw selected guides with a distinct highlight and show the ID, orientation, and position.

## Browser acceptance evidence

The focused wall solver fixture exercised the construction state without changing the solver model:

| Check | Result |
| --- | ---: |
| Created guide | `XL-2F-1` |
| Input position | `1.03 m` |
| Snapped position | `1.05 m` |
| Position after `+5 cm` | `1.10 m` |
| Save/load retained position | Pass |
| Delete removed guide | Pass |
| Solver model contained Xline geometry | No |

The same fixture retained the controlled wall-to-beam line-load result and generated ETABS/STAAD artifacts successfully. The exports contain beam distributed loads only; no wall shell or wall frame is created. New wall records default line-load transfer on, while the user can explicitly keep a wall coordination-only.

## Wall segment presentation

The Wall Elevations tab now presents the wall inventory as a vertically scrollable list of full-width wall-segment cards instead of a compressed table. Each card includes:

- a dedicated elevation canvas sized for the available workspace width;
- wall ID, floor, solver status, dimensions, opening count, and lintel metadata;
- visible opening and lintel geometry with wall length, height, base, and top dimensions;
- the existing Edit and Remove actions for that wall segment.

This keeps each wall segment readable while allowing the user to scroll to the next segment. Xlines remain construction guides in the same Wall Elevations workspace and are still excluded from structural export.

## Opening placement and deduction

Door, window, and other openings now carry a persisted `offsetM` measured from the wall start. New openings are added from the wall card, and each opening exposes width, height, sill height, and left-offset controls. Width, height, sill, and horizontal placement use the governed `0.05 m` increment; the elevation canvas also supports pointer dragging with the same snap and clamps the opening inside the wall segment.

The existing area deduction remains the load source of truth: each opening contributes `widthM x heightM x count` to the wall opening area, reducing the masonry/plaster line load while retaining opening and lintel metadata. Opening shells are still coordination geometry; only the resulting enabled line load is folded into the resolved supporting beam's tributary line-load result. Slab-supported lines remain flagged until a support strip or beam is resolved.

## Layout and elevation connectivity

The main Layout plan and Wall Elevations workspace now read the same normalized `floor.wallLoads` records. A wall added, edited, moved, or removed through the Wall editor is therefore reflected in the wall plan editor, the main structural Layout overlay, the elevation card, calculated opening deduction, and the resolved beam load assignment on the next render cycle. The Layout overlay shows the wall ID, opening tick marks, and the net equivalent beam line load on the active floor.

Each elevation card now draws downward distributed arrows labelled with the net `kN/m` value. This is an equivalent uniform line-load visualization after the opening area deduction. It is intentionally not a claim that ETABS or STAAD receives localized jamb, lintel, or shell pressure; the current solver contract transfers the net line load to the resolved canonical beam and retains the opening/lintel data as coordination metadata.

The governed CHB default is also shared by the elevation and beam tributary paths. Legacy zero placeholders no longer suppress the 100/150/200 mm CHB weight, preventing a displayed arrow value from disagreeing with the beam line load used by analysis/export.

## Updated browser acceptance (2026-09-08)

| Check | Result |
| --- | ---: |
| Main Layout wall overlay count | `1` |
| Elevation load arrows | `6` distributed downward arrows |
| Elevation line-load value | `8.02 kN/m` |
| Solver-assigned wall line load | `8.0197 kN/m` |
| Runtime beam tributary transfer | `8.0197 kN/m` service; `9.6237 kN/m` factored wall component |
| Wall geometry in ETABS/STAAD | `0`; beam distributed load only |
| Opening deduction | `1.89 m²` |
| 5 cm opening snap | Pass |
| Plan/elevation/solver value parity | Pass |

## Validation commands

```text
node --check v3/tools/check-fs.js
node v3/tools/check-fs.js --no-browser
$env:FS_CDP_PORT='9236'; $env:FS_HEADLESS='1'; node v3/tools/check-fs.js --wall-only --write-wall-model output/playwright/wall-xline-acceptance.json
```

## Boundary

Xlines currently guide the Wall Elevations plan editor. They do not yet drive automatic beam creation, opening cutting, or wall endpoint reassignment. The next controlled slice should use a selected Xline intersection as an explicit placement target, then validate the resulting canonical wall/beam relationship before enabling automatic geometry edits.
