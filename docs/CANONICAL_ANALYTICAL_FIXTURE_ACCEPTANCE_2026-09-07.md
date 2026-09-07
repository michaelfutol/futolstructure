# Canonical / Analytical Fixture Acceptance

**Candidate:** FS-125-RC3  
**Fixture:** `canonical-analytical-bacacay-v1`  
**Date:** 2026-09-07  
**Scope:** FutolStructure source and browser export payload only

## Result

The frozen 2F/RF fixture matches the live `collectCSIExportModelData()` payload.
This closes the local FS-side contract gate for canonical-versus-analytical
presentation. It does not replace the separate native ETABS, STAAD, or Revit
readback gates.

| Check | Result |
| --- | --- |
| Fixture contract | `FutolStructure.CanonicalAnalyticalFixture.v1` |
| Stories / columns / beams / slabs | 2 / 18 / 24 / 8 |
| Governed levels | 4: `BASE/FOUNDATION`, `GF`, `2F`, `RF` |
| Grid axes | 3 X lines and 3 Y lines, with bubble location and visibility |
| Unique analytical joints | 27 |
| Column analytical cardinal | 5, centroid / middle-center |
| Beam analytical cardinal | 8, top-center |
| Representative columns | `2F-A1`, `2F-B2`, `RF-C3` |
| Representative beams | `2F-BX-1-1`, `2F-BY-1-1`, `RF-BX-1-1` |
| Shared joint offsets | Plan face offsets plus vertical insertion offsets retained |
| Section-axis mapping | `C300x300`, `B250x300`, `B250x350` retained with ETABS T2/T3 mapping |
| Fixture status | **PASS** |

## Acceptance Commands

```text
node v3/tools/check-fs.js --no-browser
FS_HEADLESS=1 FS_CDP_TIMEOUT_MS=60000 node v3/tools/check-fs.js
```

The browser gate reports the fixture status as `PASS`. The full regression also
continues to exercise DXF, IFC, protected revisions, vertical datums, wall and
roof coordination boundaries, and responsive workspaces.

## Contract Meaning

- FSTR remains the canonical source for member IDs, plan coordinates, column
  orientation, section dimensions, floor elevations, and grid labels.
- Solver analytical columns use the FSTR column centroid and cardinal 5.
- Solver analytical beam joints use the FSTR support-centroid coordinates and
  cardinal 8 at the governed floor level.
- Physical drafting/3D face termination is preserved through shared joint
  offsets. ETABS uses global insertion offsets; STAAD uses global `MEMBER
  OFFSET` records.
- A future native readback must reproduce the same levels, grids, analytical
  nodes, orientations, cardinals, sections, and offset-adjusted physical axes.

## Remaining Gate

The next acceptance item is a dated native readback of this same fixture in
ETABS and STAAD, including every grid bubble/ordinate and representative
column orientation. Native solver evidence already exists for the prior Bacacay
candidate; this document does not claim a fresh native run for the new fixture.

