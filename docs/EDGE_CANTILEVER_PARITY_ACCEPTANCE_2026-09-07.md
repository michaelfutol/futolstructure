# Edge-Beam and Cantilever Parity Acceptance

**Date:** 2026-09-07  
**Branch:** `feature/fs-125-shared-analytical-inputs`  
**Scope:** Canonical edge-beam/cantilever endpoints, analytical centroid joints, physical face termination, ETABS and STAAD native handoff

## Result

**PASS for the focused edge/cantilever fixture.** The defect was in the shared canonical endpoint resolver, not in the ETABS or STAAD writers. Edge-beam analytical endpoints were previously falling back to raw grid-edge coordinates. The resolver now derives each terminating endpoint from the side cantilever beam's canonical analytical segment, applying the same supported-column centroid rule used by the rest of the solver model.

The physical/drafting axis remains face-terminated. The solver axis remains at analytical centroid joints, with governed rigid/joint offsets and cardinal point 8/top-center metadata.

## Fixture

| Input | Value |
| --- | --- |
| X spans | 2.05, 4.38, 4.58, 2.91 m |
| Y spans | 4.06, 4.00, 2.80 m |
| Floors | 2F, RF |
| Top/bottom cantilevers | 0.50 m per span |
| Left cantilevers | 0.50 m per span |
| Right cantilevers | 1.20, 0.00, 0.50 m |
| Roof slab thickness | 120 mm |

## Canonical endpoint checks

| Check | Result |
| --- | ---: |
| Edge beams | 26 |
| Side cantilever beams | 36 |
| Edge endpoints connected to side analytical joints | **52 / 52** |
| Edge beams with non-zero physical/analytical offsets | **26 / 26** |
| Edge beams with cardinal point 8/top-center | **26 / 26** |
| Floating edge endpoints | **0** |

Representative corrected mapping:

| Member | Previous analytical endpoint | Correct analytical endpoint |
| --- | ---: | ---: |
| `2F-BEX-T-1` start | `x=0.00` raw grid edge | `x=0.15` side-beam centroid joint |
| `2F-BEX-T-4` end | `x=13.92` raw grid edge | `x=13.77` side-beam centroid joint |
| `2F-BEY-L-1` start | `y=0.00` raw grid edge | `y=-0.15` side-beam centroid joint |
| `2F-BEY-R-1` start | `y=0.00` raw grid edge | `y=-0.15` side-beam centroid joint |

The edge beam drawing/physical axis remains trimmed to the member faces. The corrected analytical axis is the one consumed by ETABS/STAAD frame connectivity.

## Native ETABS 22.6

The generated PowerShell builder completed with exit code `0` and created a dated EDB, E2K, audit JSON, and modal participation CSV.

| Native check | Result |
| --- | ---: |
| ETABS analysis return | `0` |
| Frames | 164 |
| Areas | 50 |
| Source columns / beams / slabs | 40 / 124 / 50 |
| Governed levels | 4 (`BASE/FOUNDATION`, `GF`, `2F`, `RF`) |
| Modal participation rows | 6 |
| EDB native creation/regeneration | PASS |

The native frame count equals the source columns plus beams (`40 + 124 = 164`). Edge beams and side cantilever beams are included in that shared frame inventory; they are not emitted as a disconnected drafting-only layer.

## Native STAAD.Pro 2024

The installed STAAD engine completed the same dated `.std` input and produced native result artifacts.

| Native check | Result |
| --- | ---: |
| Joints | 140 |
| Members | 164 |
| Plates | 50 |
| Analysis result | `.ANL` produced |
| Exit code | `100` |
| Errors | `0` |
| Warnings | `26` non-fatal engine warnings |
| Member offset records | Present; centroid-to-physical offset contract retained |

Exit code `100` is recorded together with the engine's explicit `0 errors / 26 warnings` summary. It is not treated as a clean warning-free design acceptance. The warning inventory remains a solver/design follow-up, while the edge connectivity and native analysis artifact are accepted for this geometry milestone.

## Browser and source regression

Passed:

```text
node --check v3/tools/check-fs.js
node v3/tools/check-fs.js --no-browser
node v3/tools/check-fs.js
```

The full browser run returned `ok: true`, including the canonical analytical fixture, columnation parity, vertical datums, IFC foundation checks, workspace checks, and protected revision checks. Test-only PDF window stubs still emit `win.addEventListener is not a function`; this is an existing headless harness limitation and does not affect the real desktop PDF path.

## Dated artifacts

Directory:

```text
output/acceptance/fs125-edge-cantilever-2026-09-07/
```

| Artifact | SHA-256 | Bytes |
| --- | --- | ---: |
| `FutolStructure_Edge_Cantilever_FS125_RC3_2026-09-07.std` | `F75673B9F3C9F50A2A2FF943C8FBE03651B6633F678BE3B3CE8E4D08D7C5F306` | 24,218 |
| `FutolStructure_Edge_Cantilever_FS125_RC3_2026-09-07.ANL` | `3A7AA9A948F82B2BE417899CEF93B5B81C4E6747C301A0979DB16341EBB25DBF` | 478,986 |
| `FutolStructure_ETABS_Untitled-project_2026-09-07_180336.EDB` | `81412577C4A9DCD2415E724D6698825800406EDFDE166B39E4A35F993795112F` | 256,353 |
| `FutolStructure_ETABS_Untitled-project_2026-09-07_180336_audit.json` | `B3E12D73C8017A0BDC91126F2F7E2294519D671609D5297EB30245C8C986FCFA` | 360,316 |

## Remaining limitations

- This gate proves geometry and native solver handoff for edge/cantilever members; it does not approve the structural design.
- STAAD's 26 non-fatal warnings require review before a warning-free design release.
- A full human inspection in ETABS/STAAD is still useful for presentation, but native artifact generation and analytical endpoint parity are now reproducible and recorded.
- Parked wall, roof-frame, and stair solver features remain excluded from this acceptance until each has the same canonical connectivity and native readback gate.
