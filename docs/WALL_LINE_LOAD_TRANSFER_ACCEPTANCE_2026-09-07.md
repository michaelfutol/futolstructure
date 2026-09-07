# Wall Line-Load Transfer Acceptance

**Date:** 2026-09-07  
**Build:** FS-125-RC3 candidate  
**Branch:** `feature/fs-125-shared-analytical-inputs`  
**Scope:** Explicit wall line loads from the FutolStructure Wall Elevation workflow into the shared canonical CSI beam inventory, then into ETABS and STAAD.

## Decision

**Accepted for the controlled wall-line-load slice.** A wall must be explicitly opted in and its endpoints must resolve to the physical axis of a canonical beam on the same floor. Unresolved walls remain coordination-only and are reported as unresolved; they are not silently sent to a solver.

This acceptance does not claim that FutolStructure exports masonry wall shells, masonry material design, openings as solver voids, or lintels as independent solver members. Openings and lintel properties remain structured coordination metadata in this slice.

## Fixture Result

| Check | Result |
| --- | ---: |
| Stories / columns / beams / slabs | 2 / 18 / 24 / 8 |
| Source footings / pedestals / tie beams | 9 / 9 / 12 |
| Wall records | 1 |
| Explicit solver opt-in walls | 1 |
| Resolved wall-to-beam assignments | 1 |
| Unresolved assignments | 0 |
| Matched canonical beam | `2F-BX-1-1` from source `BX-1-1` |
| Endpoint match error | 0.000 m |
| Transferred line load | 7.2300845 kN/m |
| Load case | `WALL` / `FS_WALL` |

The explicit wall line load replaces the coarse floor-wide wall load on an opted-in floor to prevent double counting. Floors without opted-in wall lines retain the legacy governed floor wall-load path.

## Native ETABS Readback

The generated PowerShell bridge completed and created a native EDB. The native audit reports:

| Check | Result |
| --- | ---: |
| ETABS analysis return | 0 |
| Frame objects | 42 |
| Area objects | 8 |
| Named levels | 4 |
| Modal rows | 6 |
| Grid lines | A-C and 1-3, all visible |
| Wall load pattern | `FS_WALL` present |
| Wall line load in E2K | `LINELOAD "B1" "2F" ... FSTART 7.2300844 FEND 7.2300844` |

Native artifacts:

```text
D:\Users\mfutol\Documents\FutolStructure ETABS Exports\FutolStructure_ETABS_Untitled-project_2026-09-07_183653.EDB
D:\Users\mfutol\Documents\FutolStructure ETABS Exports\FutolStructure_ETABS_Untitled-project_2026-09-07_183653.e2k
D:\Users\mfutol\Documents\FutolStructure ETABS Exports\FutolStructure_ETABS_Untitled-project_2026-09-07_183653_audit.json
D:\Users\mfutol\Documents\FutolStructure ETABS Exports\FutolStructure_ETABS_Untitled-project_2026-09-07_183653_modal_participation.csv
```

## Native STAAD Readback

The licensed STAAD.Pro 2024 engine completed the same dated `.std` input:

| Check | Result |
| --- | ---: |
| STAAD exit code | 100 |
| Warning count | 0 |
| Error count | 0 |
| Joints | 43 |
| Members | 42 |
| Plates | 8 |
| Wall load in `.ANL` | `MEMBER LOAD` / `UNI GY -7.230` |

Native artifacts are in:

```text
D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation\output\acceptance\fs125-wall-transfer-2026-09-07\
```

## Source and Browser Gates

Passed:

```text
node --check v3/tools/check-fs.js
node v3/tools/check-fs.js --no-browser
node v3/tools/check-fs.js --wall-only --write-wall-etabs-script ... --write-wall-staad ... --write-wall-model ...
```

The isolated browser fixture passed after the canonical snap-reference correction. The full browser regression was not allowed to claim a pass on this machine because its pre-existing strict DXF acceptance gate requires Python with `ezdxf`, which is not currently installed. This is an environment blocker, not a wall-transfer failure.

## Implementation Contract

- Wall solver export is opt-in per wall through `exportToSolvers`.
- Endpoint snaps and explicit beam references resolve to the canonical physical beam axis.
- Analytical beam nodes remain governed by the canonical CSI model; the wall does not create duplicate solver geometry.
- ETABS receives the line load through `FS_WALL`.
- STAAD receives the equivalent downward `UNI GY` member load.
- Unresolved wall lines remain in coordination/report data with a warning and do not claim solver readiness.
- The generic warning path now also infers a beam reference from `BEAM-...-START/END` snap metadata, keeping UI governance and solver transfer aligned.

## Artifact Hashes

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `FutolStructure_Wall_Transfer_FS125_RC3_2026-09-07.model.json` | 114726 | `223B043A9C0AE72861B2000D3C4EE537518BEBB41406CAF512F68569C9EC0C5B` |
| `FutolStructure_Wall_Transfer_FS125_RC3_2026-09-07.std` | 6471 | `6B1D5403117FA55EB8E134D0EE49A9F6D8A506054624665F34A26D16255BDEBD` |
| `FutolStructure_Wall_Transfer_FS125_RC3_2026-09-07.ANL` | 123446 | `BC28C2F31967DD537B98EF2875EBC743B81CF7101A104FE8AE4B548D87DC28CE` |
| `FutolStructure_Wall_Transfer_FS125_RC3_2026-09-07.log` | 9384 | `156C17A7815AB4ED08F6A7207DD9C3EA0F9F7C159734BF3026936F566331F472` |
| `FutolStructure_Wall_Transfer_FS125_RC3_ETABS_2026-09-07.ps1` | 161381 | `CBE16A1445FEAB8AEAF5982E8B7B4C72CD1BEF9EABF56DC8B8CD29F200F3EA45` |
| `FutolStructure_ETABS_Untitled-project_2026-09-07_183653.EDB` | 205400 | `17F96355BC1D4D7C9E57FA3EC5018AD4500494AA7C7EC7D9FB5816DF0E37EE1F` |
| `FutolStructure_ETABS_Untitled-project_2026-09-07_183653.e2k` | 41051 | `4B54C2A1F55C1F1354E1F54FB25BA960207D0FBC580095DE3B3700566881FFD9` |
| `FutolStructure_ETABS_Untitled-project_2026-09-07_183653_audit.json` | 462103 | `0B5B073698FCD4B5ACF31CDBB59D9943487D882553290D14A96E7DD143326F27` |
| `FutolStructure_ETABS_Untitled-project_2026-09-07_183653_modal_participation.csv` | 589 | `A9C8A06A75C01E62119E316727A2CFF05D2E8F32533AAB604D47ECE42A3B5BE2` |

## Next Gate

Wall line-load transfer is now a verified controlled slice. The next roadmap priority is to reconnect one parked feature at a time, starting with roof-frame member connectivity or stair solver load/support handoff. Each must preserve canonical IDs and pass native ETABS/STAAD readback before being enabled as solver-ready.

This acceptance does not authorize final structural design or permit issuance.
