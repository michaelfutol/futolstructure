# FS-123 IFC Vertical Datum and Foundation Handoff

**Acceptance ID:** `FS-IFC-LEVELS-001`  
**Date:** 2026-07-30  
**Branch:** `feature/fs-123-vertical-datum-foundation`  
**Parent:** `a3eb9d885283c107d5c2cfa644896e08102c0ef6`  
**Release state:** Uncommitted local candidate; not pushed or deployed  
**Scope:** FutolStructure only. SolverLink was not touched.

## 1. Verdict

The code, browser, persistence, shared-export, IFC schema, and IFC geometry
gates pass. Revit 2025 is installed, but native Revit acceptance remains
blocked because the Computer Use native pipe was unavailable during this
session. No Revit screenshot or native-editability claim is made.

Do not commit this branch until the dated IFC has been opened and inspected
in Revit 2025.

## 2. Corrected Datum Contract

The previous implementation accumulated floor heights from a hardcoded
`0.00 m` origin and used that origin for the first column bottom. Foundation
objects were not exported.

FS-123 introduces `FutolStructure.VerticalDatums.v1` as the shared contract:

| Datum | Governing rule |
| --- | --- |
| Grade | Reference datum only; it does not replace the structural base |
| Ground floor | Exact user-supplied `groundFloorElevation` |
| Base support | Exact `baseSupportElevation`; first-column bottom |
| Below-GF column | `groundFloorElevation - baseSupportElevation` |
| Footing bottom | Explicit value or `gradeElevation - footingDepth` |
| Footing top | Explicit value or footing bottom plus governed thickness |
| Upper floors | Previous governed level plus actual storey height, unless an explicit absolute level is supplied |

The same resolved values now govern:

- 3D columns, beams, slabs, footings, pedestals, and tie beams;
- `.fstr` save/load and undo snapshots;
- IFC levels and object geometry;
- STAAD and ETABS shared model elevations;
- structural and A4 reports;
- DXF model-information and foundation-plan notes.

Only meaningful exported levels are created: `BASE/FOUNDATION`, `GF`, `2F`,
`RF`, and subsequent project floor IDs. FutolStructure does not create Revit
template levels such as `L1` or `L2`.

## 3. Foundation IFC Mapping

| FutolStructure object | IFC2X3 mapping | Key metadata |
| --- | --- | --- |
| Isolated footing | `IfcFooting` / `PAD_FOOTING` | Footing ID, supported column, B x L x T, top/bottom elevation, material, design status |
| Pedestal | `IfcColumn` with `Pedestal` object/type metadata | Pedestal ID, supported column, dimensions, top/bottom elevation, material, design status |
| Foundation tie beam | `IfcBeam` with `Foundation Tie Beam` metadata | Tie-beam ID, width/depth, top/bottom elevation, material, design status |

Every structural product also carries FutolStructure project, source
revision, build, schema, source member, floor, and export-contract metadata.
Project metadata is attached to `IfcBuilding`, which is valid in IFC2X3.

The existing columns, beams, slabs, storeys, and structural stair export were
preserved. A pre-existing stair-opening schema defect was corrected narrowly:
an opening is now exported only when its host slab resolves, and it is linked
using `IfcRelVoidsElement`.

## 4. Raised-GF Frozen Fixture

Fixture:
`v3/tools/fixtures/vertical-datum-foundation-baseline.json`

| Level/datum | Elevation |
| --- | ---: |
| Grade | 100.000 m |
| Footing bottom | 98.500 m |
| Footing top | 98.800 m |
| BASE/FOUNDATION | 99.500 m |
| GF | 101.200 m |
| 2F | 104.400 m |
| RF | 107.500 m |

Strict IFC result:

| Entity/result | Count/value |
| --- | ---: |
| Storeys/levels | 4 |
| Columns | 27 |
| Beams | 36 |
| Slabs | 12 |
| Footings | 9 |
| Pedestals | 9 |
| Foundation tie beams | 12 |
| Products with generated geometry | 105 / 105 |
| IFC schema statements | 0 |
| Duplicate GlobalIds | 0 |
| Duplicate foundation IDs/geometry | 0 / 0 |

Artifact:
`output/acceptance/fs123/synthetic/FS123_RaisedGF_Foundation_2026-07-30.ifc`

3D evidence:
`output/acceptance/fs123/synthetic/FS123_RaisedGF_Foundation_2026-07-30_3D.png`

Machine evidence:
`output/acceptance/fs123/synthetic/FS123_RaisedGF_Foundation_2026-07-30_evidence.json`

## 5. Olango Acceptance

Source:
`D:\Users\mfutol\Documents\FutolStructure Projects\Olango\01_CURRENT\Olango_2026-07-03_1330_2Floors_RECOVERED.fstr`

The legacy filename says two floors, but its payload contains `GF`, `2F`,
and `RF`. The legacy payload has no explicit vertical-datum fields. Its
governed, non-destructive migration is therefore:

| Level/datum | Previous implicit behavior | Corrected governed value |
| --- | --- | ---: |
| Grade | Implicit `0.00` | 0.000 m |
| BASE/FOUNDATION | First-column hardcoded origin | 0.000 m |
| GF | Legacy suspended-GF height | 1.200 m |
| 2F | Accumulated legacy height | 4.400 m |
| RF | Accumulated legacy height | 7.600 m |
| Footing bottom/top | Not present in IFC | -1.500 / -1.200 m |

The source SHA-256 remained unchanged before and after acceptance:

```text
ff6c8cf873d6fa8d8ab3dea9d7d5bc2420cccefe84559d58203faeed0bd8eba4
```

Olango IFC result:

| Entity/result | Count/value |
| --- | ---: |
| Storeys/levels | 4 |
| Columns | 48 |
| Beams | 127 |
| Slabs | 62 |
| Footings | 16 |
| Pedestals | 16 |
| Foundation tie beams | 23 |
| Products with generated geometry | 292 / 292 |
| IFC schema statements | 0 |
| Parser errors/warnings | 0 / 0 |
| Duplicate levels/GlobalIds/foundations | 0 / 0 / 0 |

IFC:
`output/acceptance/fs123/olango/Olango_2026-07-30_FS123_DatumFoundation.ifc`

IFC SHA-256:

```text
52109c45eaca85df1faa5a0e4e44c55432084998247cbd9cd9974c09c9125233
```

Browser 3D:
`output/acceptance/fs123/olango/Olango_2026-07-30_FS123_3D.png`

Concise evidence:
`output/acceptance/fs123/olango/Olango_2026-07-30_FS123_evidence.json`

Full browser audit:
`output/acceptance/fs123/olango/Olango_2026-07-30_FS123_browser-audit.json`

## 6. Automated Gates

Passed:

```text
node v3/tools/check-fs.js --no-browser
node v3/tools/check-fs.js --fs123-output-dir output/acceptance/fs123/synthetic
node v3/tools/check-fs.js --project <Olango source> --write-ifc <dated IFC>
py -3.12 v3/tools/validate-ifc.py <dated IFC> \
  --expect-level BASE/FOUNDATION=0 \
  --expect-level GF=1.2 \
  --expect-level 2F=4.4 \
  --expect-level RF=7.6 \
  --exact-level-set
git diff --check
```

The browser gate includes raised-GF save/load round trip, 3D elevation and
centerline diagnostics, shared STAAD/ETABS model parity, DXF/report datum
parity, IFC generation, strict schema validation, and exact entity retention.

## 7. Revit Acceptance Status

Revit 2025 exists at:

```text
C:\Program Files\Autodesk\Revit 2025\Revit.exe
```

The native Windows-control connection failed twice, including after a clean
session reset:

```text
Computer Use native pipe is unavailable:
failed to connect native pipe; the system cannot find the file specified
(os error 2)
```

Therefore these checks remain pending:

1. Open the dated IFC as a new Revit model, not inside a template that already
   contains `L1`/`L2`.
2. Verify `BASE/FOUNDATION`, `GF`, `2F`, and `RF` at exact elevations.
3. Verify first-column bottoms at `BASE/FOUNDATION`.
4. Verify footings below the structure and pedestal/tie-beam alignment.
5. Check for floating or duplicate foundation geometry.
6. Inspect one footing, pedestal, tie beam, column, beam, and slab property set.
7. Capture a level/elevation screenshot, 3D foundation screenshot, and
   properties screenshot.

Machine-readable blocker record:
`output/acceptance/fs123/olango/Olango_2026-07-30_FS123_Revit-status.json`

## 8. Known Limitations

- IFC is a coordination handoff, not a fully native Revit structural model.
  Imported BRep objects may require categorization or remapping for native
  family editing, analytical connectivity, schedules, and reinforcement.
- Pedestals use `IfcColumn` because IFC2X3 has no dedicated pedestal entity;
  `Pedestal` is retained in object/type properties.
- Tie beams use `IfcBeam` with explicit foundation metadata.
- Revit templates may display their own `L1`/`L2` levels in addition to IFC
  levels. Open as a new IFC model or remove template-only levels during the
  Revit workflow; FutolStructure does not export `L1`/`L2`.
- The legacy Olango source has no embedded revision ID, so the IFC identifies
  the source revision as `unsaved-working-state`.
- Six pre-existing 2F cantilever-side beam records overlap retained regular
  beams. They are recorded in the Olango evidence and were intentionally not
  changed by this datum/foundation task.
- Grade-beam-versus-tie-beam semantics remain a separate product decision.

## 9. Release Decision

Current decision: **hold uncommitted**.

Resume the Revit acceptance after the Windows-control helper is available.
Commit only after the three native screenshots and inspected object metadata
confirm the machine-validated IFC result.
