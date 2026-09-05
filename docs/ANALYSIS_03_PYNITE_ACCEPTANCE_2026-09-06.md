# ANALYSIS-03 PyNite Baseline Acceptance

**Date:** 2026-09-06 (Asia/Singapore)
**Branch:** `feature/fs-125-shared-analytical-inputs`
**Scope:** Controlled gravity-runner execution from the shared `FutolStructure.AnalysisRequest.v1` contract

## Result

The pinned runner completed the canonical two-storey fixture using an isolated Python environment with `PyNiteFEA==3.0.0`.

| Check | Result |
| --- | --- |
| Runner | `v3/tools/run-pynite.py` |
| Result contract | `FutolStructure.PyNiteResult.v1` |
| Solver version | `3.0.0` |
| Analysis mode | Linear static gravity |
| Result application | Disabled; comparison-only |
| Foundation treatment | Base restraints only; foundation geometry is not analyzed by this runner |
| Nodes / frame members / slab quads | `43 / 42 / 8` |
| Supports / combinations | `9 / 3` |
| Applied loads / unresolved loads | `36 / 0` |
| Equilibrium | Passed for all reported combinations |

Reported total vertical reactions were:

| Combination | FZ reaction (kN) |
| --- | ---: |
| `ULS-1.4D` | `2087.7080` |
| `ULS-1.2D+1.6L` | `2173.4640` |
| `SLS-D+L` | `1731.2200` |

The PyNite statics residuals were below `1.1e-13` in the reported force and moment checks. Slab self-weight was applied explicitly as `FS_DEAD` quad surface pressure because PyNite member self-weight does not include plates/quads. The system Python installation at PyNiteFEA `1.6.2` is intentionally rejected by the runner; only the pinned version is accepted.

## Evidence Artifacts

- Request: `output/acceptance/analysis-03/FutolStructure_PyNite_ANALYSIS03_fixture_request.json`
- Result: `output/acceptance/analysis-03/FutolStructure_PyNite_ANALYSIS03_fixture_result_pynite300.json`
- Runner: `v3/tools/run-pynite.py`
- Dependency contract: `v3/tools/requirements-pynite.txt`

## Remaining Gate

This is a baseline runner acceptance, not native-solver validation. The next ANALYSIS-03 gate is a controlled comparison against an accepted ETABS or STAAD fixture with matched geometry, load cases, combinations, support restraints, and section assumptions. No PyNite result may update the canonical FutolStructure model until that comparison and engineer review are complete.
