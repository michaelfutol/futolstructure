# Bacacay Geometry Acceptance

**Date:** 2026-09-06  
**Branch:** `feature/fs-125-shared-analytical-inputs`  
**Commit:** feature-branch acceptance checkpoint (ETABS native pass; STAAD pending)
**Source model:** `D:\Users\mfutol\Documents\FutolStructure Projects\Bacacay\Bacacay 2-Storey Mix-use_2026-09-03_COLUMNATION-FROZEN.fstr`

## Result

The isolated headless project runner passed against the current branch. The run loaded the dated Bacacay source without initialization errors and preserved the source geometry:

| Check | Result |
| --- | ---: |
| Current model status | `Analysis Complete` |
| Active model | `9C / 17B / 6S` |
| Visible columns | 9 |
| Active beams | 17 |
| Active slabs | 6 total, 4 regular and 2 cantilever |
| Area balance | 100.0% |
| Quarantined or unexpected hidden geometry | 0 |
| Cantilever alignment/overlap diagnostics | 0 failures |
| Project smoke runner | PASS |

## Shared Geometry Export Audit

The current writer generated the solver handoff from analytical joints at column centroids and physical member axes at column faces:

| Export surface | Result |
| --- | ---: |
| ETABS stories / columns / beams / slabs | 2 / 18 / 34 / 12 |
| ETABS levels including foundation datum | 4 |
| ETABS beam joint-offset members | 34 |
| STAAD nodes / frame members | 33 / 52 |
| STAAD centroid-to-physical member offsets | 34 |
| Footings / pedestals / tie beams in shared model | 9 / 9 / 12 |
| IFC foundation counts | 9 / 9 / 12 |

The generated ETABS and STAAD artifacts contain the expected analytical/physical offset contract. The ETABS artifact was then opened, regenerated, and audited through the installed ETABS 22.6 OAPI workflow. The STAAD artifact was submitted to the installed STAAD.Pro 2024 analysis engine using its documented `SProStaad.exe STAAD <input_file> /s` syntax, but the engine left resident analysis windows and produced no native readback artifact; STAAD is therefore not marked as accepted.

## Native Acceptance Gate

### ETABS 22.6 native acceptance: PASS

The dated ETABS EDB was created and regenerated without a native failure. Its audit recorded:

| Native check | Result |
| --- | ---: |
| ETABS analysis return | `0` |
| Frame / area objects | `52 / 12` |
| Column placement parity | `PASS` |
| Columnation and local-axis parity | `PASS` |
| FSTR level and beam/slab elevation parity | `PASS` |
| Native frame geometry parity | `PASS` |
| Beam joint-offset readback | `34` members |
| Modal participation rows | `6` |
| Cardinal-point policy | columns `5`, beams `8` |

Audit artifact:

```text
output/acceptance/fs125-bacacay-2026-09-06/etabs/FutolStructure_ETABS_Bacacay-2-Storey-Mix-use_2026-09-03_COLUMNATION-FROZEN_2026-09-06_115015_audit.json
```

The ETABS acceptance confirms the intended split: analytical beam joints remain at column centroids, while physical beam geometry is represented through the governed insertion offsets and cardinal-point policy. It does not constitute permit or design approval.

### STAAD.Pro 2024 native acceptance: PENDING / BLOCKED

The generated `.std` contains `JOINT COORDINATES`, `MEMBER INCIDENCES`, and `MEMBER OFFSET` records, and the internal export gate confirms `33` nodes, `52` frame members, and `34` centroid-to-physical offsets. The installed STAAD Analysis & Design engine was invoked using the vendor-documented form:

```text
SProStaad.exe STAAD Bacacay_FS125_2026-09-06.std /s
```

The invocation did not produce a dated native `.ANL`, `.OUT`, or `.LOG` readback artifact and left resident analysis windows. Those windows were closed normally after the unsuccessful gate. No native STAAD pass is claimed. The next STAAD gate is to resolve the local engine/licensing or input-read condition, then record native member counts, offsets, column orientation, and connectivity without overwriting the source `.fstr` or original solver files.

The non-headless CDP run remains an environment issue (`Runtime.enable`, WebSocket 1006). The isolated headless runner was used for this acceptance and passed.
