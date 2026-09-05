# FutolStructure Round-Trip Phase 1: ETABS Audit Comparison

**Date:** 2026-09-02  
**Scope:** FutolStructure only  
**Status:** Implemented locally; not committed, pushed, or deployed

## Purpose

Round-trip work starts with a controlled read-only audit path. FutolStructure can now read the dated JSON audit produced by the ETABS builder and compare it with the current in-memory model before any future result-import or geometry-reconciliation work is attempted.

This phase intentionally does not write to the model. Importing an audit cannot move, delete, resize, relabel, or unlock members, and it cannot overwrite an `.fstr`, `.edb`, or `.e2k` file.

## Contract

The shared package contract is:

```text
FutolStructure.SolverRoundTrip.v1
```

The comparison record contains:

- source audit filename and import timestamp;
- FS and solver provenance;
- FS model summary and governed vertical datums;
- count comparisons for stories, columns, beams, slabs, frame objects, area objects, footings, pedestals, and tie beams;
- exact named-level elevation comparisons when the audit reports levels;
- analysis return code and modal participation summary;
- foundation handoff policy comparison;
- warnings and informational notes;
- `MATCH` or `REVIEW` status.

## User workflow

1. Run the ETABS builder and complete the analysis/audit output.
2. In FutolStructure choose **Round-trip** or **Import ETABS Audit**.
3. Select the dated `_audit.json` file from the ETABS export folder.
4. Review the comparison dialog and download the comparison JSON if required for the project record.
5. Treat `REVIEW` as a stop for engineering review. There is no automatic apply operation in this phase.

## ETABS audit additions

New builder audit fields expose the export-side context needed for a meaningful comparison:

- `roundTripContract`;
- `verticalDatums`;
- named `levels` with IDs, names, elevations, and kinds;
- `provenance` with project, source revision, build, app, schema, and export contract identifiers.

The existing ETABS structural export remains unchanged: columns, beams, slabs, loads, mass source, modal analysis, and governed base restraints continue to use the established path. Foundation geometry remains a separate IFC/SAFE/STAAD Foundation handoff and is reported as such.

## Deliberate limitations

Phase 1 does not parse `.edb` or `.e2k` geometry back into FutolStructure. It does not import solver forces, reactions, modal shapes, design ratios, section changes, or revised member sizes. It also does not write solver results into the `.fstr` model.

Those operations require a separate controlled mapping layer with stable object IDs, source-revision matching, unit checks, tolerance rules, conflict previews, and an explicit engineer-approved apply step.

## Next controlled phases

1. Add read-only adapters for STAAD audit/output records using the same provenance and comparison shape.
2. Add ETABS result-table import for reactions and selected analysis results, still read-only.
3. Add a conflict preview with per-member mapping and units/tolerance evidence.
4. Add an explicit, revisioned apply operation only after the preview and regression gates are stable.
5. Regenerate final coordination DXF/IFC/report packages from the approved FS revision, with solver-origin metadata preserved.

## Verification target

The local regression must prove:

- matching synthetic ETABS audit returns `MATCH`;
- changed counts return `REVIEW`;
- level elevation differences return `REVIEW`;
- project provenance mismatches return `REVIEW`;
- the UI importer is present;
- no automatic model-apply function exists in this phase;
- existing ETABS export and foundation-policy gates remain green.
