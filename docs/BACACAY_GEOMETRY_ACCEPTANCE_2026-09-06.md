# Bacacay Geometry Acceptance

**Date:** 2026-09-06  
**Branch:** `feature/fs-125-shared-analytical-inputs`  
**Commit:** `775d2e1`  
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

The generated ETABS and STAAD artifacts contain the expected analytical/physical offset contract. This run validates source-to-export generation and internal parity only; it does **not** claim native ETABS or STAAD application acceptance.

## Native Acceptance Gate

Still required before `MODEL-02` can move beyond **Native Acceptance Pending**:

1. Open the dated ETABS export in ETABS and confirm column orientation, cardinal point 8/top-center insertion, centroid joints, and beam-to-column connectivity.
2. Inspect ETABS frame insertion offsets and compare them with the generated audit.
3. Open the dated STAAD `.std` in STAAD.Pro and confirm `MEMBER OFFSET`, member incidences, column orientation, and analytical connectivity.
4. Record screenshots and native readback counts without overwriting the source `.fstr` or original solver files.

The non-headless CDP run remains an environment issue (`Runtime.enable`, WebSocket 1006). The isolated headless runner was used for this acceptance and passed.
