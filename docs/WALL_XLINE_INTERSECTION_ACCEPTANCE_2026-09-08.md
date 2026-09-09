# Wall Xline Intersection Acceptance

**Candidate:** FS-125 working branch  
**Date:** 2026-09-08  
**Scope:** Wall-plan construction connectivity only

## Result

PASS. The wall plan editor now exposes `Xline intersection` as a governed endpoint snap mode. A horizontal and vertical manual Xline produce a stable target containing both source Xline IDs. The target is used by the same wall endpoint resolver as grid, column, and beam snaps.

## Verified behavior

| Check | Result |
| --- | --- |
| Xline snap increment | `0.05 m` |
| Horizontal source | `XL-2F-1` at `1.10 m` |
| Vertical source | `XL-2F-2` at `1.10 m` |
| Intersection target | `XINT-XL-2F-2-XL-2F-1` |
| Resolved coordinate | `(1.10, 1.10) m` |
| Snap metadata | `mode=xline-intersection`, target ID, vertical/horizontal source IDs |
| Opening target placement | PASS; intersection projects to the selected wall centerline and sets the first opening offset |
| Opening offset result | `0.35 m`, snapped to `0.05 m` for the acceptance wall |
| Save/load retention | PASS |
| Five-centimeter move | PASS |
| Delete behavior | PASS |
| Solver exclusion | PASS; Xlines remain construction aids only |

## Evidence

Focused command:

```text
node v3/tools/check-fs.js --wall-only --write-wall-model output/playwright/wall-xline-intersection-acceptance-v1.json
```

Evidence artifact:

```text
output/playwright/wall-xline-intersection-acceptance-v1.json
```

The test also retains the existing wall-to-beam line-load evidence: one explicit wall resolves to the canonical beam and the generated ETABS/STAAD model contains the beam-associated load, not wall shell geometry.

## Boundary

This slice does not automatically create beams or cut slabs. The first-opening placement path is now connected; repeated openings, opening-specific lintel design, and wall shell export remain separate scopes. Native solver acceptance is still required before any wall shell export is considered.
