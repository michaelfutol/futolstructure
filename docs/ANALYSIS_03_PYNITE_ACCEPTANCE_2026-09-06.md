# ANALYSIS-03 PyNite Baseline Acceptance

**Date:** 2026-09-06 (Asia/Singapore)
**Branch:** `feature/fs-125-shared-analytical-inputs`
**Scope:** Controlled gravity-runner execution from the shared `FutolStructure.AnalysisRequest.v1` contract

> Historical pre-Phase-1A evidence. This result was generated before the Audit v2 stiffness-unit correction and incomplete-mapping block. It remains preserved for traceability but is not a current post-fix acceptance result. Regenerate it in the pinned PyNite 3.0.0 environment before reopening ANALYSIS-03.

## 2026-09-07 Post-Fix Runtime Check

The bundled Python 3.12.14 runtime was used with the pinned `PyNiteFEA==3.0.0` dependency. A non-canonical zero-offset control request completed successfully with equilibrium checks passing and `applyResults: false`:

- Result: `output/acceptance/analysis-03/FutolStructure_PyNite_ANALYSIS03_zero_offset_control_result_2026-09-07.json`
- Execution log: `output/acceptance/analysis-03/FutolStructure_PyNite_ANALYSIS03_zero_offset_control_execution_2026-09-07.json`
- Solver status: `COMPLETED`
- Control policy: comparison-only; no canonical model mutation

The current Bacacay request was also rerun against the same pinned runtime, but correctly returned `BLOCKED` because its governed model contains physical joint offsets and vertical insertion offsets. This is the intended Phase 1B safety gate; the Bacacay result must not be classified as a completed PyNite analysis until equivalent offset mapping is implemented and benchmarked.

- Blocked result: `output/acceptance/analysis-03/Bacacay_FS125_PyNite_result_postfix_2026-09-07.json`
- Block reason: `physical_member_joint_offsets` and `vertical_member_insertion_offsets`

### 2026-09-07 Phase 1B scope-inventory refinement

The adapter and runner now consolidate repeated direct/nested offset records by
`feature + elementId` while retaining every originating source path in
`paths[]`. This makes the safety gate auditable without hiding duplicated source
representations. A source-only inventory over the same Bacacay request reports:

| Scope item | Unique count |
| --- | ---: |
| Members with physical joint offsets | 34 |
| Members with vertical insertion offsets | 34 |
| Unique feature/member blockers | 68 |
| Retained source paths | 158 |

This is a diagnostics improvement only. It does not permit the PyNite runner to
flatten, shift, or silently omit physical eccentricity. The current Bacacay
request remains blocked until a tested Phase 1B mechanical mapping preserves
physical member axes, analytical centroid joints, cardinal/insertion behavior,
and sloped-member elevations.

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

## Bacacay Native-Solver Comparison

The dated Bacacay source was reloaded through the FutolStructure browser model assembly and exported as an immutable `FutolStructure.PyNiteRunRequest.v1`. A canonical slab-contract defect was found during comparison: regular slab objects retained section `S100` but omitted `thicknessMm`, causing the PyNite runner to use its guarded 150 mm fallback while STAAD used the correct 100 mm plate thickness. The shared payload now retains explicit regular and stair slab thickness.

Corrected comparison against the licensed STAAD.Pro 2024 `.ANL` result:

| Primary vertical reaction | PyNite | STAAD | Difference |
| --- | ---: | ---: | ---: |
| Dead | `1124.655 kN` | `1134.890 kN` | `-10.235 kN` (`-0.902%`) |
| Live | `180.360 kN` | `180.360 kN` | effectively `0.000%` |

The comparison passes a declared `2%` dead-load tolerance and `0.01%` live-load tolerance. The dead-load tolerance accounts for documented frame overlap/end-length self-weight treatment differences; it is not permission for unexplained load drift.

Operational controls also pass:

- structured `FutolStructure.PyNiteExecutionLog.v1` events from request load through completion;
- cancellation marker support through `--cancel-file`;
- a pre-cancelled run returns status `CANCELLED`, exit code `130`, and `applyResults: false`;
- result application remains disabled.

Additional evidence:

- Request: `output/acceptance/analysis-03/Bacacay_FS125_PyNite_request_2026-09-06.json`
- Result: `output/acceptance/analysis-03/Bacacay_FS125_PyNite_result_2026-09-06.json`
- Execution log: `output/acceptance/analysis-03/Bacacay_FS125_PyNite_execution_2026-09-06.json`
- Comparison: `output/acceptance/analysis-03/Bacacay_FS125_PyNite_STAAD_comparison_2026-09-06.json`
- Cancellation result/log: `output/acceptance/analysis-03/Bacacay_FS125_PyNite_cancelled_result_2026-09-06.json`, `output/acceptance/analysis-03/Bacacay_FS125_PyNite_cancelled_execution_2026-09-06.json`
- Request exporter: `v3/tools/export-pynite-request.cjs`
- Comparison gate: `v3/tools/compare-gravity-results.js`

## Historical Gate Status

The pre-Phase-1A gravity reaction comparison was accepted under the old adapter mapping. After the Audit v2 correction, the remaining gate is a fresh pinned PyNite 3.0.0 run using the corrected kN/m2 E/G values, followed by the comparison and member-force envelope correlation against an accepted native solver. Final engineering review and packaging the pinned Python runtime for desktop execution remain open. No PyNite result may update the canonical FutolStructure model until a reviewed import/revision workflow exists.
