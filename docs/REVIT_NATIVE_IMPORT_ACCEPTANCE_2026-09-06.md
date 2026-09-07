# Native Revit Import Acceptance

**Date:** 2026-09-06  
**Scope:** FutolStructure native-Revit workflow milestones 1-2  
**Status:** Manifest plus compiled level/grid importer implemented; native Revit acceptance pending

## Implemented

The Revit toolbar/menu action now exports a dated
`FutolStructure_Revit_Import_YYYY-MM-DD.json` manifest from
`buildRevitImportManifest()`.

The manifest is generated from `collectCSIExportModelData()`, the same governed
payload used by ETABS and STAAD. It therefore carries the source model's:

- absolute levels and vertical datum contract;
- grid definition and story records;
- physical and analytical member axes;
- column cardinal point 5, beam cardinal point 8, insertion points, and joint offsets;
- columns, beams, slabs, footings, pedestals, tie beams, stairs, walls, and roof frame;
- source project/revision/build provenance and element IDs.

## Important boundary

This is not yet an `.rvt` file. Autodesk Revit's native database must be written
through the Revit API from an add-in running inside the installed Revit version.
The `revit/README.md` file defines that importer boundary. IFC remains available
for coordination and conversion, but it does not guarantee native editable
Revit categories or governed round-trip identity.

Rebar is explicitly marked `PENDING_APPROVED_DESIGN_RESULTS`; no reinforcement
is invented from preliminary geometry.

## Revit 2027 add-in build evidence

- Revit 2027 detected at `C:\Program Files\Autodesk\Revit 2027`.
- `RevitAPI.dll` and `RevitAPIUI.dll` detected in that installation.
- .NET SDK `10.0.303` detected.
- `FutolStructure.Revit2027.csproj` targets `net10.0-windows`.
- Release build completed with zero compiler errors.
- Follow-up Release build rerun on 2026-09-07 completed with zero compiler errors
  and the same two non-fatal Autodesk reference-version warnings.
- The importer creates/matches native `Level` and `Grid` elements and writes a
  dated created/matched/blocked JSON audit beside the imported manifest.
- Same-name/different-elevation levels and same-name/different-coordinate grids
  are blocked and listed in a dated import audit; host objects are not silently
  moved or renamed.
- The compiled add-in is installed for the current user at
  `C:\Users\Futol\AppData\Local\FutolStructure\Revit2027` and registered by
  `C:\Users\Futol\AppData\Roaming\Autodesk\Revit\Addins\2027\FutolStructure.Revit2027.addin`.
- The running Revit process observed during installation was Revit 2026. The
  Revit 2027 add-in therefore still requires a fresh Revit 2027 launch and
  native execution evidence.

Build currently emits two `MSB3277` reference-version warnings from Autodesk's
Revit 2027 assembly dependency graph. These are retained for native runtime
acceptance rather than suppressed as proof of compatibility.

## Acceptance required before release

1. Export a dated manifest from the current Bacacay or approved fixture.
2. Run the importer in the installed Revit version.
3. Confirm BASE/FOUNDATION, GF, 2F, and RF absolute elevations and all governed grids.
4. Confirm columns start at `baseSupportElevation`, with no unintended 0.00 bottom.
5. Confirm column placement/orientation and beam cardinal/joint-offset behavior.
6. Confirm slabs, footings, pedestals, tie beams, stairs, walls, and roof frame.
7. Inspect FutolStructure IDs and provenance metadata.
8. Record created/matched/skipped/blocked counts and screenshots.

Until those checks pass, the native RVT milestone remains pending and no release
or push should be made for this feature.
