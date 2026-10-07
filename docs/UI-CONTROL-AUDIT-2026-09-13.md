# Workspace control audit

## Implemented

- Move the ten-file history from Input Parameters to the File > Open dialog. Native Ctrl+O and the application Open action share this flow; Browse files opens the native file picker. Startup does not display history.
- Remove the duplicate header Rebuild button. Keep its refresh function for existing internal callers; Recalculate remains the primary calculation action.
- Rename the header Import action to ETABS Audit because its actual behavior is read-only audit comparison, not a general model importer.
- Remove the obsolete sidebar history renderer and CSS.

## Retain

- Measure, object snap, grid snap and snap increments: distinct precision tools.
- Column alignment, column locking and beam locking: geometry-affecting controls; removing them would lose modeling control.
- ETABS, STAAD, IFC and Revit: separate export paths with different outputs.
- Undo/Redo: unavailable until an appropriate edit exists, not broken buttons.
- Analysis, Optimization, Wall, Roof and Stair workspaces: retain existing drafts and model data. Their incomplete capabilities must stay explicitly labeled; availability is not evidence of native solver acceptance.

## Next UI decisions

- Consolidate secondary exports into a compact export menu while retaining frequent ETABS/STAAD access.
- Put parked workflows behind an explicit Draft tools entry without deleting their persisted data.
- Consolidate Bubble controls into one numeric control and convert navigation actions to accessible icon buttons.
- Replace the static QA badge with validation status for the current model and export target. Baseline validation alone must not imply current-project acceptance.

These follow-ups are proposals, not completed functionality. No engineering geometry or export calculation changes are part of this cleanup.

## RC12 Review, 2026-10-07

The user requested suggestions for a more refined interface. These are proposals only; no runtime UI changes were made in this publication step.

1. Give the drawing more room: collapsible/resizable left inputs and right results, with remembered widths and a deliberate canvas-fit action. Keep the active floor/project visible when panels collapse.
2. Introduce a contextual member inspector: selection exposes dimensions, orientation, explicit move distance, beam alignment, lock status, and reset controls in one predictable place. Use the existing geometry mutation/undo helpers and never bypass the column authority lock.
3. Reduce toolbar noise: accessible icon buttons with tooltips for pan, zoom, fit, measure, save, undo, and redo; grouped drawing/export menus; proper snap/ortho toggles; a numeric bubble-distance control; a centered/exterior-flush segmented control. Retain every distinct export and precision function.
4. Improve drafting hierarchy: clearer text contrast, restrained borders, consistent spacing, stable tool dimensions, and visible selection/hover states. Preserve Paper and Dark CAD canvas choices, drawing legibility, and actual framing geometry; avoid decorative animation and marketing-style cards.
5. Replace baseline-only QA with current-project readiness: actionable member-linked warnings, per-target export status, visible unsaved changes and column-authority status. Prior fixture acceptance must not imply current-project validation.
6. Put unavailable analysis/optimization tools behind an explicit advanced/draft entry while retaining persisted data and clear capability boundaries.

Recommended first slice: canvas space, toolbar grouping, and the contextual inspector. Verify desktop/narrow viewports, keyboard access, context-menu placement, numeric entry, undo/redo, project persistence, and unchanged export geometry before shipping a UI candidate.
