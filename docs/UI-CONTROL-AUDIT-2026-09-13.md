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
