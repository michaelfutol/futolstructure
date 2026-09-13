# FS Integrated Analysis and BlueQubit Optimization PRD

Version: 1.0 | Date: 2026-09-10 | Status: Proposed implementation specification

Owner: FutolStructure. Intended implementer: Luna or another coding agent, working one acceptance gate at a time.

## 1. Product objective

Reduce repetitive manual member sizing by providing one FS workflow that creates a study, evaluates candidate sections, learns from structural results, and returns traceable alternatives for engineering review. Bundle supported internal analysis runtimes with FS and offer BlueQubit circuit execution as an optimization backend.

FS remains the modeling and review application. Analysis and optimization execute in an isolated worker process launched by FS. ETABS and STAAD remain separately installed, licensed analysis/design authorities for the initial release. Internal solvers gain supported scope only through independently recorded benchmarks. This PRD does not claim ETABS/STAAD feature parity or quantum speed advantage.

Primary user story: Given a governed FS model and an allowed section catalog, the engineer starts a bounded sizing study and receives native-verified alternatives with governing failures, quantities, and comparison against the baseline, without manually repeating section assignments and result extraction.

## 2. Current baseline and evidence boundaries

- `v3/analysis-optimization.js` creates immutable requests and draft proposals; real optimization execution is not implemented.
- `v3/engine/pynite-adapter.js` and `v3/tools/run-pynite.py` implement a limited runner path. Current nonzero offset and sloped-member blockers must remain until supported mapping is proven.
- `v3/engine/analysis-inputs.js` governs common inputs. `v3/solver-roundtrip.js` compares available solver evidence.
- ETABS generation/readback and STAAD generation/native execution have dated fixture evidence. An export success is not evidence that arbitrary design results can be collected automatically.
- `v3/persistence/project-revisions.js` supplies revision patterns to reuse.
- `desktop/main.cjs` contains desktop bridges. `v3/index.html` contains existing model collection and UI; avoid adding a new monolithic optimizer here.
- Revit concrete import has user-observed success. Revit BOQ is installed but its first verified quantity run remains separate. Revit is not an analysis engine in this architecture.
- OpenSees, BlueQubit execution, complete RC design automation, and reviewed candidate application are unfinished capabilities.

Read these sources before coding: `ROADMAP.md`, `CANONICAL_ANALYTICAL_SOLVER_CONTRACT_2026-09-07.md`, `CANONICAL_ANALYTICAL_FIXTURE_ACCEPTANCE_2026-09-07.md`, `FUTOLSTRUCTURE_ASTRA_ULTRA_SUPER_IMPROVEMENT_AUDIT_V2.md`.

## 3. Delivery boundaries

### Initial useful release

One primary ETABS study lane; rectangular concrete beam/column groups; discrete approved section catalog; fixed materials and orientation; explicit alignment rules; automatic candidate assignment, analysis and supported design-result extraction; bounded classical search; auditable proposal report. BlueQubit uses the same candidate/evaluation contracts after the classical loop works.

The first internal analysis benchmark is a small elastic frame with explicitly supported features. A full Bacacay internal-solver run is prohibited while its required offsets or other mechanics remain unsupported.

### Following releases

STAAD primary evaluation lane, optional independent shortlist validation, packaged PyNite supported scope, OpenSees elastic/static then modal scope, BlueQubit comparative benchmark, approved candidate application to FS, and wider catalogs.

### Deferred

General seismic/nonlinear certification; automatic load-code generation; free-form topology optimization; arbitrary imported native-model reconciliation; automatic reinforcement detailing; foundation sizing; slab-thickness optimization; masonry, roof and stair structural integration beyond their accepted scope; Tekla integration; quantum structural equation solving.

Do not silently include deferred components in an optimization study. A required unsupported component blocks the study or requires an explicitly scoped model approved by the engineer.

## 4. System architecture

```text
FS UI + canonical revision
        |
Validated desktop IPC
        |
Local study worker / controller
        +-- immutable studies, candidate registry, cache, reports
        +-- ETABS evaluator (installed OAPI)
        +-- STAAD evaluator (installed OpenSTAAD/native execution)
        +-- PyNite adapter (bundled supported runtime)
        +-- OpenSees adapter (bundled supported runtime)
        +-- classical candidate search
        +-- QUBO builder -> QAOA circuit -> BlueQubit API
```

The controller owns orchestration, not structural truth. Each analysis adapter computes responses; design adapters apply verified checks; search backends propose assignments. A QUBO energy or successful analysis process cannot label a design as passing.

Use one primary solver per study. A second solver is optional for the shortlist, with independently aligned assumptions and checks. Do not require two full solver runs for every trial by default.

Tekla Structural Designer would require a future analysis adapter. Tekla Structures is a downstream detailing/model handoff. Do not treat them as interchangeable solvers.

## 5. Geometry invariants: prerequisite MODEL-03

The persisted FS geometry and alignment intent govern every candidate. Member IDs and floor IDs remain stable. Coordinates, local axes and offsets carry explicit coordinate systems and units.

For the supported rectangular-column convention, analytical joints use governed centroids and column cardinal 5. Supported horizontal beams use the floor top datum and top-center cardinal 8. Frame cardinal numbers must never be applied to slabs as if they were frames.

Every candidate must specify one of these geometric constraints:

| Constraint | Fixed data | Recomputed on section change |
| --- | --- | --- |
| Centroid locked | Column centroid and orientation | Faces, beam alignment offsets and clearance checks |
| Face locked | Explicit reference face/plane, anchor and orientation | Section centroid, connected analytical joints, physical-to-analytical offsets |
| Fully locked member | Geometry, section, orientation | No optimization mutation allowed |

For face locking, preserve a named geometric reference, not an ambiguous screen direction. Rotated columns need local-axis-aware face definitions. Never freeze numeric offsets when the dependent section geometry changes.

Mandatory candidate reconstruction order:

1. Apply allowed catalog assignments to a copy of the source revision.
2. Resolve physical geometry from alignment constraints.
3. Derive analytical joints and local axes.
4. Derive insertion/rigid offsets once for each adapter.
5. Recompute dependent self-weight, mass and applicable load distribution.
6. Check connectivity, slab boundary compatibility and clearances.
7. Audit physical section corners and top/bottom faces as well as centerline endpoints.

Preserve explicit user loads. Recompute only documented derived loads. Reject ambiguous load ownership. Structural self-weight must have one governing owner; the existing ETABS contract is FS_DEAD=1 and unused default Dead=0.

Visual offset fidelity and mechanical equivalence are separate gates. Prove force/moment transfer and displacement compatibility for offset members. Do not substitute a display offset for a rigid link, or add both a cardinal translation and the equivalent vertical shift twice. Record solver-specific stiffness transformation settings.

Orientation alternatives are disabled initially. Later studies may explicitly enumerate section-plus-angle options, including architectural constraints; geometry and mechanics must be reconstructed for every option.

## 6. User workflow and UI

Use the existing Analysis and Optimization workspaces. No separate desktop application is required.

1. Open a project and select its source revision.
2. Choose primary solver and review supported/blocked features.
3. Select disjoint member groups and assign allowed section catalogs.
4. Set alignment locks, objective, check limits and execution budget.
5. Run baseline. View governing failures and missing evidence.
6. Start study; monitor evaluated candidates and best verified result.
7. Compare shortlisted models and run optional second-solver checks.
8. Approve one proposal and create a new FS revision.

Controls: solver selector; group/member table; section catalog table; orientation lock; alignment constraint; max evaluations; wall-time limit; BlueQubit spending cap; Run, Pause, Resume, Cancel; candidate comparison table; geometry overlay; report export; Apply Approved Candidate.

Show counts, governing check/combination/member, known cost basis, verification state, elapsed time, and solver failures. Clearly distinguish Estimated, Analysis Verified, Design Checks Passed, Incomplete, Failed and Approved. No default green status for missing results. Optimization results become stale when the source revision changes.

Never expose tokens in project files, screenshots, reports or logs. Credential entry belongs in desktop settings using the platform credential store.

## 7. Study and result contracts

Reuse the existing immutable analysis request as the model payload. Add versioned wrappers rather than duplicating geometry schemas. Proposed contracts below must be formalized with schemas in milestone IO-01.

### Study.v1

- studyId, schemaVersion, createdAt, sourceProjectId, sourceRevisionId, sourceContentHash.
- immutable model payload and geometry/input audit hashes.
- primary solver/version; optional verifier/version; analysis mode and feature requirements.
- design code/edition, supported check set, combinations, covers, material definitions and modifiers.
- groups: stable groupId, memberIds, allowedOptionIds; groups cannot overlap.
- catalog: stable optionId, section type, dimensions, units, material reference; orientation if explicitly enabled.
- per-member alignment constraints and invariant locks.
- objective with units and dated cost assumptions; constraints with explicit limits and evaluation source.
- budgets: maximum native evaluations, wall time, maximum cloud jobs, cloud spend and repeated-failure limit.
- search backend, seed, algorithm settings, surrogate settings and stopping criteria.

### Candidate.v1

- candidateId/contentHash, studyId/source hash, option assignment per group.
- reconstructed geometry/input hashes and delta against source.
- predicted objective/checks, prediction uncertainty if available, exact evaluation references.
- status and rejection reasons. Predicted values must never overwrite measured results.

### Evaluation.v1

- evaluationId, candidate hash, solver and adapter versions, effective settings hash.
- explicit units and sign conventions for each result family.
- start/end timestamps; process outcome; native analysis/design status; convergence status.
- mapping completeness, missing members/combinations, warnings, errors and raw artifact hashes.
- reactions, displacements, member forces and supported design results, each with member/station/combination provenance.
- individual checks: value, limit, normalized measure where meaningful, status PASS/FAIL/NOT_EVALUATED/UNSUPPORTED/ERROR.
- geometric parity and mechanical benchmark version.

Missing values are null with a reason. Reject booleans masquerading as numeric fields, NaN/infinity, duplicate IDs and unit ambiguity. Never convert missing demand or missing utilization to zero. A successful executable exit alone is insufficient evidence.

### Proposal.v1

- immutable baseline/candidate references, verified check scope and unresolved checks.
- ranked alternatives, quantities/cost basis, differences, and secondary-verifier outcomes if requested.
- approval identity/time and source hash at approval; new revision ID after application.

Cost screening with fixed demand is explicitly preliminary. RC required steel area is not automatically a capacity ratio or a complete reinforcement design. Unsupported drift, shear, hierarchy or detailing checks prevent a claim of complete design compliance.

## 8. Worker lifecycle and recovery

Study states: DRAFT -> PREFLIGHT -> BASELINE -> SEARCHING -> REVIEW_READY -> APPROVED -> APPLIED. Additional states: BLOCKED, PAUSED, CANCEL_REQUESTED, CANCELLED, FAILED, STALE. Persist reasons and transition timestamps.

Candidate states: PROPOSED -> GEOMETRY_CHECKED -> QUEUED -> RUNNING -> EVALUATED or REJECTED/FAILED/INCOMPLETE. Structural pass is separate from execution success.

Use structured IPC with request IDs and progress events. Keep the UI responsive. Write artifacts atomically under a study-specific output directory. Never overwrite the source .fstr or approved solver model during evaluation.

Cache only exact input-equivalent evaluations. Cache key includes source/candidate content, reconstructed geometry, loads, modifiers, units, code settings, solver/adapter versions and requested checks. A changed setting invalidates the cache. Do not reuse runs solely because section names match.

Allow one concurrent native job per controlled solver instance initially. Persist job IDs and ownership. On cancellation, request graceful stop; never terminate an unrelated user solver process. Resume completed jobs from receipts. Quarantine incomplete artifacts from interrupted jobs and rerun only after determining their status.

Native timeouts produce failed/incomplete evaluations, not high-cost feasible candidates. Duplicate candidates are deduplicated before submission. Stop after configured budgets, repeated identical infrastructure failures, catalog exhaustion, or no verified improvement within the declared patience window.

## 9. Native solver adapters

Each adapter implements preflight, buildCandidate, auditGeometry, runAnalysis, runSupportedDesign, collectResults, cancel and artifactReceipt. Method names here are interface requirements, not claims about vendor API method names.

ETABS spike must verify the installed API's concrete beam/column result access, actual design code and settings, result freshness, local axis conventions and completion detection. STAAD spike must verify installed OpenSTAAD/native result access and distinguish built-in design from optional RCDC. RCDC is not an assumed dependency.

Use disposable dated working models. Check native section assignments and offsets after applying changes. Never import only forces from an older analyzed section into a newly sized candidate and claim reanalysis.

For independent verification, align element formulations, boundary conditions, load ownership, mesh, diaphragm assumptions and relevant design settings. Report each solver separately. Do not blindly combine utilization ratios from unlike check definitions or claim agreement from matching totals alone.

## 10. Internal solvers and design layer

Package supported PyNite and OpenSees distributions with pinned runtime dependencies after license and redistribution review. Record dependency versions, hashes and notices; do not redistribute ETABS, STAAD or their license components.

Each adapter publishes a machine-readable feature manifest: element formulations, offsets, releases, loads, diaphragms, analysis modes and result families. Required unsupported features block preflight before execution.

Initial PyNite milestone preserves its accepted zero-offset benchmark. Offset equivalence is an explicit subsequent milestone. Initial OpenSees milestone is elastic static; modal and second-order behaviour are independent extensions. Nonlinear/seismic claims are deferred.

OpenSees/PyNite responses alone do not provide the complete local concrete design workflow. Implement a separately versioned design-check layer with source references and independently verified examples. Until then, internal candidates are screening results and require the selected native design authority.

## 11. QUBO formulation and BlueQubit integration

Represent option selection using x[g,s] in {0,1}. Exactly one section option is selected for each group g. Begin with four groups and three options: 12 decision bits and 81 valid assignments. This is a test scale, not a production limit.

Proposed surrogate objective:

```text
E(x) = estimatedCost(x)
     + estimatedStructuralPenalty(x)
     + constructabilityPenalty(x)
     + A * sum_g (sum_s x[g,s] - 1)^2
```

All terms must be explicitly quadratic before submission. Non-quadratic constraints require a documented reduction with counted auxiliary bits, prefiltering, or exact candidate rejection. Do not assume an arbitrary building check can be expressed directly as a QUBO term. One-hot penalties enforce option validity, not structural feasibility.

Structural estimates originate from verified baseline and selected perturbation evaluations. Fit only supported terms with adequate data; cap model complexity for the small trial budget. Record training candidate IDs, fit diagnostics, validation error and model version. Refine around the current search region and use exact evaluations to reject false predictions.

Normalize coefficients and document penalty selection; verify the QUBO algebra by enumerating small instances. Preserve an exact candidate validity check after decoding. A sampled bitstring violating one-hot selection is rejected; any explicit repair is recorded as a new candidate, never presented as the raw quantum result.

Convert QUBO to Ising using x=(1-Z)/2, retaining the constant energy shift for reproducible comparisons. Compile a shallow QAOA circuit through a supported SDK. A classical parameter optimizer may invoke many BlueQubit jobs per search batch; account for these separately from native structural runs.

BlueQubit adapter requirements:

- Verify current SDK, supported circuit representation, backend, shots, output format, bit order and cost-estimation facilities before implementation.
- Distinguish classical simulation from quantum hardware in every run receipt.
- Start with a tiny test circuit and exact classical energy comparison.
- Submit circuits/coefficients and opaque study IDs; no structural model upload is needed for this architecture.
- Persist provider job IDs before polling. After network uncertainty, reconcile the job before retrying to avoid duplicate charges.
- Enforce user-approved cloud budget and explicit submission consent; unavailable cost estimates must not silently permit unlimited jobs.
- Store parameter history, circuit hash, backend/version, shots, counts/probabilities, elapsed time and reported cost.
- API failure pauses the BlueQubit lane. Classical fallback occurs only if enabled and is visibly labeled.

BlueQubit is a circuit-execution provider in this specification. It is not assumed to expose a direct structural QUBO solver, design checks or a guaranteed speed advantage.

## 12. Search strategy and economic claims

Build a deterministic classical baseline first using catalog enumeration for tiny studies and a bounded neighborhood search for larger initial studies. Both search backends use identical reconstruction and exact evaluator contracts.

Optimize the declared objective subject to required exact checks. Offer alternatives for material quantity, priced cost and fewer distinct section types. Concrete-volume-only studies are labeled volume optimization; they cannot claim minimum installed RC cost without a reinforcement/formwork/labor basis.

For every study report baseline and best verified objective, percent change where meaningful, native evaluation count, cloud job count/cost, total wall time, cache hits and invalid/failed candidate counts. Keep incomplete candidates out of the passing ranking.

Compare BlueQubit and classical runs under equal evaluation budgets and matched objectives, using recorded seeds and multiple repetitions. Report any overhead and cases where classical search wins. No pre-declared quantum advantage, guaranteed global optimum or guaranteed percentage savings.

## 13. Verification matrix

Tolerances are fixture-specific, declared before acceptance and justified by formulation/units. Use absolute plus relative tolerances; near-zero values require absolute tolerances. Do not widen tolerances after seeing a failure without documenting and reviewing the reason.

| Fixture | Required evidence |
| --- | --- |
| One elastic cantilever | Independent displacement/reaction/moment reference; units and sign checks |
| Symmetric portal | Equilibrium, symmetry, displacement and force mapping |
| Rotated rectangular column | Local axis/B-H mapping at 0, 90 and an oblique angle such as 80 degrees |
| Offset connection | Equilibrium including moments; rigid-offset compatibility; no double translation |
| Face-locked resize | Fixed face retained; centroid/joints/offsets regenerated |
| Centroid-locked resize | Fixed centroid retained; changed faces/clearances audited |
| Beam top-center | Top datum and section corners preserved for different depths and reversed endpoints |
| Edge/cantilever slab | Boundary parity and intended analytical connectivity |
| Self-weight | Single ownership and correct candidate-dependent change |
| Missing native design result | Candidate INCOMPLETE; cannot pass or apply as fully verified |
| Tiny QUBO | Classical enumeration matches computed energy and bit decoding |
| 81-option study | Classical complete reference set; BlueQubit candidates re-evaluated exactly |
| Worker interruption | Resume/cancel without unrelated process termination or source mutation |
| Source changed during run | Existing study retained; proposal STALE and application blocked |
| Clean Windows install | No developer Python required; supported offline analyses work; optional cloud setup separate |

Tests must inspect behaviour or numeric evidence. String-presence tests may verify registration but do not prove solver mechanics, feasibility, quantity accuracy or optimizer correctness.

## 14. Reports and approved application

Produce a study JSON, candidate comparison CSV and PDF report using existing document/report patterns. Include the source revision, model image, section assignments, alignment/orientation constraints, reconstructed offsets, governing checks, assumptions, failures, cost basis, native artifacts and optional BlueQubit receipt.

Approval creates a new FS revision through the existing persistence layer. Check that the live revision hash matches the study source; otherwise require explicit reconciliation. Apply only the recorded approved assignment and regenerate the exact candidate geometry. Verify that its content hash matches the evaluated candidate before marking applied. Retain the previous revision and reviewable delta.

Revit receives approved physical geometry through the concrete coordination path. No Revit analytical model or reinforcement automation is required by this PRD.

## 15. Ordered implementation milestones

All milestones below are planned unless existing evidence explicitly closes their exact scope. The PRD is not implementation evidence.

| ID | Deliverable | Dependency | Acceptance gate |
| --- | --- | --- | --- |
| IO-00 | Capability inventory and installed API probes | Existing roadmap | Actual supported methods/result fields and runtime/license boundaries recorded |
| IO-01 | Study/candidate/evaluation schemas and semantic validation | IO-00 | Invalid units, duplicate groups, missing evidence and stale hashes rejected |
| IO-02 | Candidate geometry reconstruction and offset audit | MODEL-03, IO-01 | Rotated, face/centroid locked, reversed beam and cantilever fixtures pass |
| IO-03 | Worker IPC, receipts, cache, cancellation/resume | IO-01 | Deterministic fake evaluator tests recovery; fake output labeled TEST_ONLY |
| IO-04 | ETABS exact baseline/candidate evaluator | IO-02, IO-03 | Two materially different candidates receive fresh complete native evidence |
| IO-05 | Small classical sizing study | IO-04 | Catalog enumeration yields ranked verified alternatives and reproducible report |
| IO-06 | QUBO algebra and surrogate module | IO-05 | Exact small-instance energy/validity tests; held-out prediction diagnostics |
| IO-07 | BlueQubit circuit adapter | IO-06 | Authorized tiny circuit run; decoded energies/receipts/budget controls verified |
| IO-08 | BlueQubit versus classical benchmark | IO-07 | Same-budget comparison with exact structural rechecks and honest timing/cost |
| IO-09 | STAAD evaluator and shortlist verification | IO-02, IO-03, IO-05 | Installed native result mapping and independently comparable checks verified |
| IO-10 | Packaged PyNite supported baseline | IO-03 | Existing benchmark reproduced on clean install; unsupported features blocked |
| IO-11 | PyNite eccentric/offset equivalence | IO-02, IO-10 | Mechanical offset fixtures pass; expand supported manifest only afterward |
| IO-12 | Packaged OpenSees elastic static adapter | IO-03 | Independent elastic benchmarks and installed/native comparison pass |
| IO-13 | OpenSees modal/second-order extensions | IO-12 | Separate formulation-specific evidence for each enabled mode |
| IO-14 | FS study UI, PDF report and reviewed apply | IO-05, revision checks | Complete user journey including stale source, cancel, report and new revision |
| IO-15 | Release packaging and end-to-end acceptance | Released scope of above | Clean install, version manifest, notices, hashes and smoke evidence |

Critical initial sequence: IO-00 -> IO-01 -> IO-02/IO-03 -> IO-04 -> IO-05. BlueQubit follows a working exact evaluator. Internal solvers do not block the initial ETABS sizing product and are separate supported lanes.

## 16. Luna execution rules

Use `FS_ANALYSIS_OPTIMIZATION_LUNA_TASKS.md` for small work units. At each turn read the tracker, inspect the actual code and choose the earliest unblocked task. Complete one coherent slice with relevant tests and evidence; do not reopen unrelated UI or geometry work.

Preserve existing user changes. Never remove a solver blocker to make a demonstration run. Never invent code-check limits, native result fields, API signatures, material properties or successful solver results. If an assumption affects mechanics, record the unresolved decision and continue independent tasks.

Escalate for engineering review when physical and analytical invariants conflict, a formulation change is necessary, a native check is unavailable, or benchmark evidence disagrees. A more expensive language model is not a substitute for missing engineering evidence. Routine schemas, UI wiring, worker state handling and tests can be implemented by Luna against this specification.

For every completed task record: changed files, exact test command, outcome, artifact paths, versions, limitations and next task. Commit/deploy only coherent verified checkpoints under the user's release instructions. Documentation-only changes do not require rebuilding the installed desktop app.

## 17. Decisions still to resolve during IO-00

- Exact supported design code/edition and RC result/check coverage in installed ETABS/STAAD.
- Required first-study checks and their engineer-approved limits.
- Approved Bacacay section groups/catalog, alignment constraints and cost basis.
- Internal engine distribution/version/redistribution license and Windows packaging feasibility.
- BlueQubit backend, SDK pin, account entitlement, allowed cloud spend and data handling.
- Whether the first release is volume screening with native design verification or priced RC cost optimization.

These are implementation gates, not permission to assume defaults. Contracts and offline tests can proceed before account access or paid runs.

## 18. Reference entry points

These vendor links were identified during the design conversation. Recheck current vendor documentation and installed API references at implementation; do not infer current signatures or entitlements from this PRD.

- BlueQubit SDK: https://app.bluequbit.io/sdk-docs/index.html
- BlueQubit API reference: https://app.bluequbit.io/sdk-docs/bluequbit.sdk.html
- CSI developer API: https://www.csiamerica.com/developer
- Bentley OpenSTAAD Python: https://github.com/BentleySystems/openstaadpy

## 19. Release acceptance

A released feature must demonstrate a saved source -> bounded study -> native-verified candidate -> reviewed new FS revision cycle with unchanged source history, complete result provenance and a usable report. A BlueQubit badge is displayed only for a real provider-backed execution, with simulator/hardware clearly identified. An internal solver badge lists the accepted analysis scope. Any remaining design checks are visible and prevent an unqualified design-pass claim.
