# Wall Modeling and Beam Line-Load Alignment Acceptance

**Date:** 2026-09-07  
**Build:** FS-125-RC3 candidate  
**Branch:** \`feature/fs-125-shared-analytical-inputs\`  
**Scope:** Real wall-property inventory, CHB/plaster normalization, plan alignment, eccentricity metadata, and beam-associated ETABS/STAAD line-load export.

## Decision

**Accepted for the controlled wall modeling slice.** FutolStructure now stores a wall as a governed plan/elevation object with CHB thickness, plaster faces, openings, lintel metadata, floor elevation, alignment mode, total wall thickness, and explicit solver opt-in.

The wall itself is **not exported as an ETABS/STAAD shell or frame** in this slice. When the user opts in and the wall endpoints resolve to a canonical beam, the calculated masonry/finish load is attached to that beam as \`FS_WALL\`. The wall alignment and eccentricity are retained in the canonical model and solver audit metadata for review; a separate torsional/eccentric-load action is not claimed yet.

## Wall Property Contract

| Property | Accepted behavior |
| --- | --- |
| CHB thickness | Governed options: 100, 150, 200 mm; legacy numeric values normalize to the nearest option |
| Plaster | Independent inside/outside controls; default 20 mm each side |
| Plaster unit weight | 23 kN/m3, represented as 0.023 kPa/mm |
| Wall total thickness | CHB + inside plaster + outside plaster |
| Alignment | \`center\`, \`flush-exterior\`, or \`flush-interior\` per wall record |
| Center | Wall reference line remains on the beam reference axis |
| Flush exterior/interior | Effective coordination geometry is shifted from the beam axis by the calculated eccentricity; the solver load remains associated with the canonical beam |
| Openings/lintels | Retained as wall elevation and coordination metadata; not exported as separate masonry solver geometry |
| Solver export | Explicit per-wall opt-in; unresolved walls remain coordination-only with a warning |

## Focused Fixture Result

| Check | Result |
| --- | ---: |
| Stories / columns / beams / slabs | 2 / 18 / 24 / 8 |
| Source footings / pedestals / tie beams | 9 / 9 / 12 |
| Wall records | 1 |
| Explicit solver-opt-in walls | 1 |
| Resolved wall-to-beam assignments | 1 |
| Unresolved assignments | 0 |
| Matched canonical beam | \`2F-BX-1-1\` from source \`BX-1-1\` |
| CHB / plaster | 150 mm / 20 mm inside + 20 mm outside |
| Total wall thickness | 190 mm |
| Alignment | Flush exterior face |
| Eccentricity | 0.030 m toward the exterior (\`dy = -0.030 m\` in the fixture) |
| Transferred line load | 8.0197 kN/m |
| Load case | \`WALL\` / \`FS_WALL\` |
| Wall shell geometry exported | 0 |

The explicit wall line load replaces the coarse floor-wide wall load on an opted-in floor. This prevents double counting while preserving the legacy floor wall-load path on floors without explicit wall records.

## Native ETABS Readback

The generated PowerShell bridge created a native EDB and E2K with an absolute output path. The native audit reports:

| Check | Result |
| --- | ---: |
| ETABS analysis return | 0 |
| Native audit status | \`PASS\` |
| Frame objects | 42 |
| Area objects | 8 |
| Named levels | 4 |
| Modal rows | 6 |
| Grid lines | A-C and 1-3, visible |
| Wall load pattern | \`FS_WALL\` present |
| E2K wall-load records | 8 occurrences of \`FS_WALL\`; generated beam line-load record present |

Artifacts:

~~~text
D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation\output\acceptance\fs125-wall-modeling-2026-09-07\native-etabs-absolute\FutolStructure_ETABS_Untitled-project_2026-09-07_194839.EDB
D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation\output\acceptance\fs125-wall-modeling-2026-09-07\native-etabs-absolute\FutolStructure_ETABS_Untitled-project_2026-09-07_194839.e2k
D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation\output\acceptance\fs125-wall-modeling-2026-09-07\native-etabs-absolute\FutolStructure_ETABS_Untitled-project_2026-09-07_194839_audit.json
D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation\output\acceptance\fs125-wall-modeling-2026-09-07\native-etabs-absolute\FutolStructure_ETABS_Untitled-project_2026-09-07_194839_modal_participation.csv
~~~

The first ETABS attempt used a relative output directory and stopped at \`Save EDB\`; the absolute-path rerun passed. This is an export-runner path requirement, not a wall modeling failure.

## Native STAAD Readback

The licensed STAAD.Pro 2024 engine completed the same dated \`.std\` input:

| Check | Result |
| --- | ---: |
| STAAD exit code | 100 |
| Warning count | 0 |
| Error count | 0 |
| Wall load in \`.ANL\` | \`MEMBER LOAD\` / \`UNI GY -8.020\` |

Artifacts:

~~~text
D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation\output\acceptance\fs125-wall-modeling-2026-09-07\wall-model.std
D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation\output\acceptance\fs125-wall-modeling-2026-09-07\wall-model.ANL
D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation\output\acceptance\fs125-wall-modeling-2026-09-07\wall-model.log
~~~

## Source and Browser Gates

Passed:

~~~text
node --check v3/tools/check-fs.js
node v3/tools/check-fs.js --no-browser
node v3/tools/check-fs.js --wall-only --write-wall-etabs-script ... --write-wall-staad ... --write-wall-model ...
~~~

The first focused browser attempt used the existing headed CDP endpoint and timed out while enabling the runtime. A separate headless CDP port completed the same fixture successfully. The full browser regression remains environment-blocked by the existing strict DXF gate because this machine does not currently have Python with \`ezdxf\` installed.

## Remaining Boundary

This acceptance does not yet claim:

- ETABS/STAAD torsional action generated from wall eccentricity;
- masonry shell export or masonry design;
- openings as solver voids;
- independent lintel members;
- final masonry detailing or permit-ready design.

The next safe extension is to expose the alignment/eccentricity metadata in the A4 report and add an explicit engineer-review warning whenever a non-zero wall eccentricity is present, before considering any solver torsion conversion.

