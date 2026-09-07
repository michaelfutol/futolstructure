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

The acceptance runner can now materialize the exact fixture for native solver
readback without changing the runtime model:

```text
node v3/tools/check-fs.js --write-canonical-etabs-script <dated.ps1> --write-canonical-staad <dated.std> --write-canonical-model <dated.model.json>
```

The dated local artifacts generated on 2026-09-07 contain `18` columns, `24`
beams, `8` slabs, `4` levels, and `27` unique analytical joints:

```text
output/acceptance/fs125-canonical-analytical-2026-09-07/FutolStructure_Canonical_Analytical_FS125_RC3_ETABS_2026-09-07.ps1
output/acceptance/fs125-canonical-analytical-2026-09-07/FutolStructure_Canonical_Analytical_FS125_RC3_2026-09-07.std
output/acceptance/fs125-canonical-analytical-2026-09-07/FutolStructure_Canonical_Analytical_FS125_RC3_2026-09-07.model.json
```

Artifact SHA-256 values:

| Artifact | SHA-256 |
| --- | --- |
| ETABS builder script | `DEA61965C3FB9939604492D2FA2C7160A587F8FEC45171DD450B4AF3AE828323` |
| STAAD input | `FD71152937F5B1C24E90A04C085F9917EE3063D311250E29EA98C07149F8E65B` |
| Canonical model snapshot | `E766E6D0D41FB92000D2F34B7D0EC57DACB527BBB46935C06F8EBB3277073905` |

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

The next acceptance item is a dated native readback of these same artifacts in
ETABS and STAAD, including every grid bubble/ordinate and representative
column orientation. Native solver evidence already exists for the prior Bacacay
candidate; this document does not claim a fresh native run for the new fixture.
