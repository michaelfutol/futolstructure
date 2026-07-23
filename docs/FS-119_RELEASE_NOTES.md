# FutolStructure FS-119 Release Notes

**Version:** 3.16.119

**Build:** FS-119

**Release:** Canonical Column Segment Truth

**FSTR schema:** 0.2.0

**Minimum compatible app:** 3.16.119

## Purpose

FS-119 makes one canonical resolver govern whether each physical column
segment exists on each storey. Recalculation and grid regeneration no longer
replace intentional segment removal or termination with a newly generated
all-active column array.

## Included

- Canonical `segmentOverrides[floorId]` state and stable segment IDs.
- Grid reconciliation that preserves regular-line intent and custom/planted
  column records, including newly inserted floors above a termination.
- Separate commands for terminating above a level, removing one segment, and
  removing an entire line.
- Dependency preview while retaining connected beams, slabs, loads, and
  foundation geometry for review.
- Floating/unsupported topology validation across plan, 3D, schedules,
  report, DXF, IFC, STAAD, and ETABS paths.
- STAAD/ETABS blocking for unresolved new topology.
- Coordination-only IFC/DXF/report output with explicit warnings.
- Legacy `.fstr` migration into schema 0.2.0 without new writes to competing
  `activePerFloor`, `floorActive`, or `floors[].deletedColumns` fields.
- Hard refusal to open and silently downgrade a project from a newer schema or
  minimum application version.

## Olango Acceptance

The original source was never overwritten. Its SHA-256 remained:

```text
ff6c8cf873d6fa8d8ab3dea9d7d5bc2420cccefe84559d58203faeed0bd8eba4
```

| Check | Result |
| --- | --- |
| Floors | GF, 2F, RF |
| Active columns | 16 per floor / 48 segments |
| Baseline framing | 127 beams / 62 slabs |
| Legacy omissions | A3, A4, B4, E4 retained as four non-blocking warnings |
| Unchanged schema save/reopen | Exact structural fingerprint retained |
| Test termination | C2 retained at GF/2F and removed at RF |
| Persistence | Passed calculate, floor switch, Typical inheritance, save/reopen, and browser reload |
| Undo | Exact former fingerprint and export readiness restored |
| Terminated framing | 47 column segments / 127 beams / 62 slabs |
| STAAD / ETABS | Correctly blocked for unresolved C2 beam endpoints |
| IFC / DXF / report | Geometry retained with warnings |
| DXF | AC1009 strict parse and round-trip passed |
| IFC | IfcOpenShell IFC2X3 parse passed |
| Browser errors | None |

Evidence is stored outside the repository under the dated Olango acceptance
directory. Existing cantilever/regular-beam overlap diagnostics in the legacy
source were recorded but not modified because cantilever repair is outside
P0-C1A.

## Not Included

- Planted-column analytical load transfer (P0-C2).
- Host-beam analytical splitting.
- Stair analytical connectivity changes.
- Measure, member-size-limit, FTB/grade-beam, PDF/OCR, report redesign, or
  SolverLink work.

See [FS-119_COLUMN_SEGMENT_MIGRATION.md](FS-119_COLUMN_SEGMENT_MIGRATION.md)
for the persistence and compatibility contract.
