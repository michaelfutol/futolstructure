# Luna Implementation Guide: Integrated Analysis and Optimization

Date: 2026-09-10. Status: Planning only; no new analysis or optimizer runtime is delivered by these documents.

Governing specification: [PRD v1](FS_INTEGRATED_ANALYSIS_OPTIMIZATION_PRD_V1.md).
Project tracker: [Roadmap](ROADMAP.md).

## Start here

First task is IO-00A below. Do not begin by adding an enabled Optimize button or installing a quantum package. The existing QUBO tab remains draft-only until a tested execution path exists.

Before each slice, inspect git status, applicable local instructions, current roadmap and relevant implementation. Existing anchors are `v3/analysis-optimization.js`, `v3/engine/analysis-inputs.js`, `v3/engine/pynite-adapter.js`, `v3/tools/run-pynite.py`, `v3/solver-roundtrip.js`, `v3/persistence/project-revisions.js`, `desktop/main.cjs`, and the geometry/export functions in `v3/index.html`.

Suggested new ownership boundaries, subject to inspection of current repo conventions:

- Versioned study schemas in `v3/schemas/` or the existing schema directory.
- Small JS study/candidate helpers alongside `v3/analysis-optimization.js`.
- Python controller and evaluator adapters alongside existing runner tools, split by ownership.
- Focused fixtures and tests under `v3/tools/` using the existing harness.
- Evidence under `output/acceptance/<dated-study>/`; explanatory acceptance notes in `docs/`.

Do not duplicate the canonical model collector, introduce a second revision store, or move large existing modules as part of this feature.

## Work units

All boxes start unchecked. Tick only when the evidence named in the final column exists.

| Done | Task | Concrete output | Required verification |
| --- | --- | --- | --- |
| [ ] | IO-00A Inspect runtime | Capability inventory of actual FS adapters and unfinished paths | File/function references; current blockers retained |
| [ ] | IO-00B Probe ETABS | Installed API methods, result fields, settings and completion behavior | Read-only probe or disposable model; no changes to approved project |
| [ ] | IO-00C Probe STAAD and package feasibility | Native result access, optional RCDC boundary, internal-runtime license/version inventory | Actual installed capabilities distinguished from proposed capabilities |
| [ ] | IO-01A Define schemas | Study/Candidate/Evaluation/Proposal wrappers | Valid fixture and explicit invalid examples |
| [ ] | IO-01B Add semantic validation | Disjoint groups, allowed options, hashes, units and completeness | Reject duplicate membership, missing results, unknown options and stale source |
| [ ] | IO-02A Reconstruct centroid-locked candidate | Pure candidate transform using canonical model functions | Original unchanged; changed faces/derived loads captured |
| [ ] | IO-02B Reconstruct face-locked candidate | Explicit face reference and rotated-section support | Fixed plane retained; centroid and connected joints recomputed |
| [ ] | IO-02C Audit adapter geometry and mechanics | Physical corners/axes, cardinal/offset mapping and mechanical fixture | No double offsets; equilibrium and displacement compatibility |
| [ ] | IO-03A Build worker protocol | Launch, progress events, persisted receipts | Mock job lifecycle; TEST_ONLY cannot be treated as native evidence |
| [ ] | IO-03B Add recovery/cache | Content keys, pause/resume/cancel and owned processes | Interrupted run, duplicate candidate and setting-change cache tests |
| [ ] | IO-04A Evaluate ETABS baseline | Immutable source copy -> fresh analysis/design result | Geometry parity, requested member/combination coverage and artifact hashes |
| [ ] | IO-04B Evaluate changed sections | Two candidates using same evaluator | Fresh stiffness/self-weight/offsets; prior result reuse rejected |
| [ ] | IO-05A Enumerate tiny catalog | Four groups x three options reference harness | 81 valid assignments generated; bounded exact runs tracked |
| [ ] | IO-05B Rank/report | Feasible ranking and baseline comparison | Missing-check candidate excluded; native evaluation basis disclosed |
| [ ] | IO-06A Build QUBO | One-hot energy and explicit coefficient convention | Exact enumeration matches energy; invalid assignment penalty tests |
| [ ] | IO-06B Fit structural approximation | Versioned training set and quadratic surrogate | Held-out error recorded; predictions cannot become design passes |
| [ ] | IO-07A Compile circuit offline | QUBO-to-Ising and shallow QAOA | Constant shift and bit-order tests against exact energy |
| [ ] | IO-07B Connect BlueQubit | Secure token reference, budget, submit/poll/receipt | Authorized tiny job; network uncertainty does not duplicate paid submission |
| [ ] | IO-08 Compare searches | Classical versus BlueQubit benchmark | Matched budgets, seeds, native checks, timing and costs |
| [ ] | IO-09 Add STAAD lane | Equivalent evaluator contract | Independent native results and explicit comparison scope |
| [ ] | IO-10 Package PyNite baseline | Pinned supported runtime | Clean-machine zero-offset test; required unsupported features blocked |
| [ ] | IO-11 Expand PyNite offsets | Documented mechanical mapping | Independent offset benchmarks before enabling Bacacay |
| [ ] | IO-12 Package OpenSees static | Elastic adapter and feature manifest | Independent static benchmarks and cancellation tests |
| [ ] | IO-13 Add modes separately | Modal then supported second-order mode | Per-mode numeric acceptance; no inferred nonlinear certification |
| [ ] | IO-14A Connect FS workspace | Setup, progress, comparison, cancel and reports | Desktop UI workflow with real evaluator; blocked/missing states visible |
| [ ] | IO-14B Reviewed apply | New revision from approved candidate | Source hash matches; reconstructed candidate hash matches evaluated model |
| [ ] | IO-15 Release | Installer, dependency notices, versions and evidence | Clean install and saved-model end-to-end smoke |

## Task closure template

Append an evidence entry to a dated acceptance document and link it from the roadmap:

```text
Task ID:
Status: Locally Verified / Native Acceptance Pending / Accepted / Blocked
Changed files:
Behavior delivered:
Command(s) and exit/result:
Numeric acceptance and tolerance basis:
Source revision / candidate / solver versions:
Artifact paths and hashes:
Remaining limitation:
Next unblocked task:
```

Source-string assertions alone never close a numerical milestone. If native execution is unavailable, complete offline work and leave the native gate explicitly open. Do not claim installed-PC or GitHub updates from a local source change.

## Failure handling guide

| Situation | Required response |
| --- | --- |
| Required mechanics unsupported | Block preflight; retain the offending member IDs and features |
| API documentation and installed methods disagree | Use verified installed signatures; record compatibility boundary |
| Analysis succeeds but design results are absent | Mark incomplete; do not accept candidate |
| Quantum samples contain invalid assignments | Reject or explicitly record repair before exact evaluation |
| Surrogate predicts pass but native solver fails | Record failure, update training data and search; never suppress the native result |
| Cloud submit times out | Reconcile provider job before retrying |
| No feasible candidate within budget | Return best diagnostic alternatives, labeled infeasible/incomplete, and the governing reasons |
| Source model edited during run | Finish against snapshot; prevent stale application |
| Need a new structural assumption | Record decision required; continue independent tasks |

## Copyable continuation prompt

Continue FutolStructure using docs/FS_INTEGRATED_ANALYSIS_OPTIMIZATION_PRD_V1.md and docs/FS_ANALYSIS_OPTIMIZATION_LUNA_TASKS.md. Inspect the current code, changes and roadmap first. Implement the earliest unblocked unchecked work unit, beginning with IO-00A if no evidence exists. Preserve canonical geometry and existing solver blockers. Use exact installed API evidence, immutable study snapshots, fresh native evaluation and explicit missing-result states. Complete the relevant tests, record evidence and update the task status. Do not enable unsupported analysis, claim quantum advantage, silently rotate/move columns, or publish unverified changes. End with the delivered behavior, verification, limitations and next task.
