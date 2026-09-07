# FutolStructure Deep Product, Engineering, Software, and Structural-Engineering Audit

**Audit mode:** Read-only inspection and architecture review  
**Audit date:** 2026-09-06  
**Audited repository:** futolstructure-fs123-vertical-datum-foundation  
**Branch:** feature/fs-125-shared-analytical-inputs  
**Audited commit:** 146413fae3b991703945e59e45580840386169c2  
**Scope:** Current FutolStructure product, structural data model, UI/workflows, solver handoff, BIM/CAD, reporting, testing, release, security, and roadmap  
**Out of scope:** Code implementation, migration, refactor, dependency installation, external-system changes, SolverLink, commit, push, deployment

## 1. Executive Summary

### Overall health

**OBSERVED:** FutolStructure is a credible structural-modeling workbench and solver-handoff prototype with a substantial amount of domain-specific work already implemented. The strongest assets are the shared model export path, explicit vertical datum work, persistent project files and revisions, RC framing generation, multi-format export, protected topology checks, and a growing acceptance-test discipline.

**OBSERVED:** It is not yet a single authoritative structural information system. The application still has a very large browser controller with global state, legacy compatibility paths, duplicated load and summary calculations, incomplete native BIM import, comparison-only open-source analysis, preliminary detailing, and several release/runtime claims that are broader than the proven acceptance envelope.

**INFERRED:** The greatest present risk is not lack of features. It is semantic drift: the same building can be represented differently by the dashboard, generated 3D model, solver export, report, IFC, DXF, and imported results because each path owns or derives part of the truth.

**RECOMMENDED:** The next major investment should be a canonical, versioned structural model contract with explicit physical geometry, analytical geometry, loads, releases, provenance, and result-set references. Every UI tab and every exporter should consume that contract. Do not add another solver or another large UI tab before the contract and acceptance gates are stronger.

### Top five findings

1. **P0:** ETABS round-trip comparison can return MATCH when critical audit fields are absent. The deterministic probe against v3/solver-roundtrip.js produced MATCH while columns, beams, slabs, levels, foundation geometry, and analysis return were not reported.
2. **P0:** The desktop ETABS bridge executes renderer-supplied PowerShell script text with ExecutionPolicy Bypass. This is a broad local code-execution boundary without a typed command contract, nonce, signature, or strict script policy.
3. **P1:** The product has no complete canonical semantic model boundary. Physical and analytical geometry are partially coordinated in collectCSIExportModelData, but nodes, releases, diaphragms, result sets, scenarios, approvals, and stable identities are not represented as a coherent persisted graph.
4. **P1:** Preliminary calculations, BBS, report quantities, and solver comparison results are exposed near final-looking workflows. The code and documentation state limitations, but the product can still be misunderstood as permit-ready or design-complete.
5. **P1:** Native BIM and solver acceptance is fragmented. Revit currently imports levels and grids only; PyNite is comparison-only; OpenSees and QUBO are registered/planned; native solver checks are stored evidence rather than a uniformly reproducible CI gate.

### Top five improvements

1. Establish a canonical StructuralModel schema and invariant validator.
2. Make round-trip comparison fail closed on missing or stale evidence.
3. Replace free-form desktop solver scripts with a typed, allow-listed command protocol.
4. Separate preliminary, solver-derived, and engineer-approved values in the result and report model.
5. Build one golden-model acceptance suite that validates the same model through browser, PyNite, ETABS, STAAD, IFC, DXF, PDF, and Revit paths.

### Recommended first implementation phase

**Phase 1: Canonical model and evidence integrity.** Freeze a small regular RC fixture, a Bacacay fixture, a terminated-column fixture, a wall/opening fixture, and a roof/stair fixture. Define stable IDs, physical/analytical node rules, load-case semantics, vertical datums, offsets/cardinals, releases, provenance, and result-set status. Then change validators and comparison logic to consume this contract. Do not start with a new visual tab or a new solver.

### Audit limitations

- This was a read-only repository and source inspection; no runtime behavior was changed.
- node v3/tools/check-fs.js --no-browser passed during the audit. The full browser gate was not rerun in this audit.
- Python 3.12 was not installed on the audit machine, so the pinned PyNite runner and strict IfcOpenShell/ezdxf runtime gates were not independently executed.
- Native ETABS, STAAD, Revit, AutoCAD, and Tekla evidence was reviewed from existing acceptance artifacts and source contracts; it was not rerun here.
- A source digest was captured before writing this report: 109 source files, digest 37835c8a29709a4d2ebcdb78110031f0cf190d544d36ad484cc45fcb78cc57c1. The audit report itself is the only intended new file.
- Git status reports a permission warning for the user-level Git ignore file; this was not repaired.

## 2. Current Product

### Product identity

**OBSERVED:** FutolStructure is a browser-first structural engineering workbench packaged for a Windows Electron shell. It models RC framing and related structural coordination data, produces preliminary calculations and schedules, and hands off geometry and load intent to external solvers and BIM/CAD tools.

Primary source surfaces:

- v3/index.html
- v3/engine/analysis-inputs.js
- v3/engine/vertical-datums.js
- v3/engine/stairs.js
- v3/engine/walls.js
- v3/engine/roof-frame.js
- v3/engine/pynite-adapter.js
- v3/dxf-export.js
- desktop/main.cjs
- revit/FutolStructureCommand.cs

### Product strengths

- Model-first plan and 3D workflow.
- Explicit per-floor framing and vertical datum work.
- Persistent .fstr project files, recent-file support, autosave, and revisions.
- Shared geometry collection for CSI-family exports.
- IFC, DXF, STAAD, ETABS, PDF, and Revit manifest pathways.
- Structural warnings and topology validation rather than silent guessing.
- Technical-preview boundary documented in LICENSE, SECURITY.md, README, and RAG.

### Product boundary

**OBSERVED:** The product documentation correctly says the product is not a substitute for final engineering judgment. The reliable current envelope is regular, orthogonal, low-rise RC gravity framing with cautious handling of irregularity, transfer conditions, planted/custom members, stairs, walls, roof frames, lateral design, rebar approval, and native BIM editability.

**RECOMMENDED:** The product should present this boundary in the application state itself, not only in documentation. Every report and export should carry a machine-readable readiness class such as:

- DRAFT_GEOMETRY
- PRELIMINARY_GRAVITY
- SOLVER_HANDOFF_READY
- SOLVER_RESULTS_IMPORTED
- ENGINEER_REVIEW_REQUIRED
- ENGINEER_APPROVED

## 3. Architecture Map

### Current architecture

~~~text
Browser UI
  v3/index.html
    global state
    inline UI/event/rendering logic
    calculation/dashboard/report logic
    export orchestration
        |
        +--> engine modules
        |      vertical datums
        |      loads / tributary
        |      stairs
        |      walls
        |      roof frame
        |      analysis inputs
        |      PyNite adapter
        |      revisions
        |      optimization registry
        |
        +--> exporters
        |      DXF
        |      IFC2x3
        |      STAAD STD
        |      ETABS OAPI / EDB and E2K
        |      SAFE handoff policy
        |      Revit JSON manifest
        |
        +--> persistence
        |      .fstr JSON
        |      localStorage autosave
        |      IndexedDB revisions
        |      Electron recent files
        |
        +--> Electron shell
               preload bridge
               PDF print bridge
               ETABS PowerShell bridge
               PyNite process bridge
               
External tools
  ETABS / STAAD / AutoCAD / Revit / Python-PyNite
~~~

### Assessment

**OBSERVED:** The architecture is a functional modular monolith, not yet a layered structural information system. Modules exist, but the application controller remains the primary owner of semantics.

**INFERRED:** The most important boundary is not browser versus desktop. It is authoritative model versus derived views and handoff packages.

**RECOMMENDED:** Introduce these logical layers without a broad rewrite:

1. schema: persisted model and compatibility versions.
2. domain: pure geometry, topology, load, datum, and readiness rules.
3. adapters: exporters, solver request builders, importers, and result normalizers.
4. presentation: tabs, plan/3D views, schedules, and reports.
5. runtime: browser persistence, Electron bridges, and external processes.

## 4. Current User/Engineering Workflow

### Current flow

1. User creates or opens a .fstr project.
2. User edits spans, floors, slabs, beams, columns, foundations, stairs, walls, and roof-frame records.
3. calculate() regenerates derived framing and preliminary reactions.
4. User inspects plan, tributary, foundation, schedules, design, and 3D views.
5. User saves a project and may obtain protected revision snapshots.
6. User exports DXF, IFC, STAAD, ETABS, SAFE, report PDF, or Revit JSON.
7. External solvers or BIM tools are used for further analysis/detailing.
8. Some audit JSON can be compared back through solver-roundtrip.js.

### Good workflow decisions

**OBSERVED:** The product has moved toward explicit save/recovery, protected revisions, dated exports, model readiness warnings, and shared export data. These are correct professional-workflow instincts.

### Workflow weaknesses

**OBSERVED:** The calculation button performs a client-side preliminary calculation. It is not the same as a finite-element analysis run. The UI is capable of making the distinction but does not yet enforce a strong workflow boundary between:

- geometry generation,
- preliminary design,
- solver export,
- solver execution,
- result import,
- engineer review,
- report issue.

**RECOMMENDED:** Make those workflow states visible and sequentially auditable. A report created before solver results exist should visibly say PRELIMINARY - NO SOLVER RESULTS. A report created after imported ETABS results should include the exact result-set ID, source file hash, solver version, run date, and import status.

## 5. Good Assets Preserve

### Domain assets

- v3/engine/vertical-datums.js: explicit project and per-floor elevation intent.
- v3/engine/analysis-inputs.js: named load cases, combinations, supports, mass policy, and validation.
- v3/engine/stairs.js: normalized stair components, loads, and support/readiness metadata.
- v3/engine/walls.js: wall inventory, opening net area, lintel metadata, and solver opt-in.
- v3/engine/roof-frame.js: support types and conservative automatic hinge/roller suggestion.
- collectCSIExportModelData: shared physical and analytical geometry, offsets, floor elevation, cardinal, and stable member naming direction.
- collectColumnTopologyValidation: explicit floating/planted/unsupported topology checks.
- persistence/project-revisions.js: immutable revision concept and retention cap.
- R12 DXF writer and acceptance tooling.
- IFC2x3 export plus lightweight validator and planned strict parser.
- A4 PDF report path with Arial acceptance check.
- Revit add-in project structure, even though the importer is currently limited.
- Native solver acceptance artifacts for Bacacay and the current feature branch.

### Product/process assets

**OBSERVED:** The repository has a healthy habit of recording acceptance evidence in docs/, rather than relying only on chat claims. Keep that practice.

**RECOMMENDED:** Treat acceptance documents as linked evidence records, not as the truth itself. Each document should identify the exact source revision, model fixture hash, tool version, command, output artifact, and reviewer.

## 6. Critical Findings P0/P1

### P0-01: Round-trip MATCH is not fail-closed

**OBSERVED:** v3/solver-roundtrip.js:196-299 constructs an ETABS comparison and sets MATCH when warnings are empty. Missing report fields are notes. A deterministic probe with omitted columns, beams, slabs, levels, foundation geometry, and analysis return produced MATCH.

**Impact:** A stale, partial, or weak audit can look like a successful round trip. This directly undermines the product's solver-result trust boundary.

**RECOMMENDATION:** Define required evidence by adapter and model scope. Missing counts, levels, offsets, analysis status, mass source, modal participation, and foundation policy must be errors or INCOMPLETE, never notes. MATCH must require complete evidence and exact identity/provenance match.

### P0-02: ETABS desktop bridge accepts executable script text

**OBSERVED:** desktop/main.cjs:562-610 accepts payload.script from the renderer, writes it to a user Documents directory, and invokes PowerShell with ExecutionPolicy Bypass. The script is only checked for minimum length and a few marker strings.

**Impact:** A compromised local renderer, malicious project payload, or future remote-content mistake could execute arbitrary PowerShell with the user's privileges. This is a high-impact security boundary even for a local technical-preview app.

**RECOMMENDATION:** Replace arbitrary script input with a typed request schema. The main process should generate the script from validated structured data, use a fixed script template, allow-list output directories, create a per-run nonce, validate expected output identity, and reject any renderer-provided command text. Keep the bridge local-only and auditable.

### P1-01: No complete authoritative structural information model

**OBSERVED:** Physical and analytical fields exist in the CSI export payload, but the persisted model is still dominated by floor arrays, global state, legacy active/floorActive/deletedColumns paths, overrides, and derived geometry. Nodes/joints, releases, diaphragms, member connectivity, result sets, approval states, and scenario identity are not first-class persisted entities.

**Impact:** UI, export, report, solver import, and round-trip behavior can diverge while each path appears internally consistent.

**RECOMMENDATION:** Introduce a versioned canonical graph with stable IDs and explicit derived-view boundaries. Migrate staged, starting with reads and validators before changing writes.

### P1-02: Preliminary outputs have a final-looking surface

**OBSERVED:** Dashboard design, BBS, BOM, A4 reports, stair reactions, PyNite results, and solver readiness are all available near the main modeling workflow. Source comments and docs identify several as preliminary or comparison-only, but the visual workflow does not always force that status into every downstream artifact.

**Impact:** Users or third parties may interpret preliminary values as final structural design, permit documentation, or fabrication information.

**RECOMMENDATION:** Attach readiness and evidence status to every result. Visually distinguish calculated estimates, imported solver results, and engineer-approved values. Block final report/export labels unless required evidence exists.

### P1-03: Native acceptance is not a uniform reproducible gate

**OBSERVED:** Existing docs contain ETABS, STAAD, AutoCAD, IFC, PDF, and Revit acceptance evidence, but CI does not build the Electron installer, compile the Revit add-in, run the PyNite process, open native ETABS/STAAD/Revit/AutoCAD, or run OpenSees/QUBO. The current audit machine lacked Python 3.12.

**Impact:** The repository can be green while the installed desktop/BIM path is stale or untested.

**RECOMMENDATION:** Separate source-only, browser, desktop, external-solver, and native-BIM gates. Publish a capability matrix for each commit and installer.

### P1-04: Result provenance is too weak for engineering traceability

**OBSERVED:** Project revisions use time/random identifiers in project-revisions.js; analysis inputs have only limited provenance; comparison logic accepts fields without requiring source file hashes or run IDs; the current release identity still has stale references relative to the current branch.

**Impact:** A result can be difficult to tie to the exact project, model state, solver settings, executable, and reviewer.

**RECOMMENDATION:** Use stable project ID, revision ID, model hash, export package ID, run ID, result-set ID, and source artifact hash. Preserve them across .fstr, IFC, DXF, ETABS audit JSON, STAAD metadata, and PDF.

## 7. Structural Domain Model

### Current domain coverage

| Entity or concept | Current state | Assessment |
| --- | --- | --- |
| Project/building | Project metadata and revision fields | Present but not a complete aggregate |
| Story/floor | Floor arrays plus vertical datum helpers | Good direction; needs canonical IDs |
| Vertical datum | Grade, support, floor absolute elevation, height | Strongest recent slice |
| Grid | X/Y spans and labels, export grids | Present; imported grid identity is weak |
| Column | Generated and custom columns, topology resolver | Good but legacy state paths remain |
| Beam | Generated/custom beams, per-floor overrides, offsets | Strong export path; persisted semantics need consolidation |
| Slab | Generated slabs, voids/cantilevers, thickness/load inputs | Present; summary paths can diverge |
| Foundation | Footing, pedestal, tie-beam geometry and IFC metadata | Present in coordination path; ETABS deliberately base-restraint-only |
| Stair | Placement and components | Draft/coordination ready; native analytical continuity incomplete |
| Wall/opening/lintel | Plan editor and persisted inventory | Present; solver exports opt-in and acceptance pending |
| Roof frame | 2D editor and support suggestions | Present; native solver/BIM acceptance pending |
| Node/joint | Derived from endpoints and analytical geometry | Not a persisted authoritative entity |
| Releases | Roof support concept only | Missing as a general member property |
| Local axes/cardinals | Export fields and policies | Present but needs invariant tests |
| Offsets/eccentricities | Physical/analytical fields and CSI offsets | Present in export path, not a complete core contract |
| Diaphragm | ETABS policy and generated assignments | Not fully modeled as a first-class domain entity |
| Load case | Named analysis-inputs cases plus legacy globals | Split truth |
| Load combination | Named combinations | Present; scenario identity needed |
| Mass source | Contract/policy and ETABS export | Needs cross-adapter verification |
| Analysis run | External JSON/process artifacts | No canonical run entity |
| Result set | Comparison artifacts | No first-class result storage/application model |
| Approval/issue | Documentation only | Missing workflow entity |
| Rebar | Preliminary BBS/BOM heuristics | No approved reinforcement model |

### Principal model decision

**RECOMMENDED:** Treat physical geometry and analytical geometry as two linked projections of one model, not as two competing models:

~~~text
Physical member
  stable memberId
  drafting centerline/solid
  section/material
  floor/story
  insertion/cardinal
  physical endpoints

Analytical member
  stable analyticalMemberId
  nodeI/nodeJ references
  centroid-line geometry
  section/material
  end offsets/joint offsets
  local axes
  releases
  diaphragm/support relationships
  solver mapping

Projection invariant
  physical geometry + insertion/cardinal + offsets
  must explain analytical geometry
  without mutating the user's modeled arrangement
~~~

## 8. Solver/ETABS/Analysis

### ETABS

**OBSERVED:** The ETABS path generates native OAPI PowerShell, dated .edb and .e2k artifacts, load patterns, combinations, geometry, offsets, and modal/analysis reads. Existing Bacacay evidence reports 52 frames, 12 areas, 34 beam offsets, and six modal rows.

**OBSERVED:** Foundation geometry is intentionally not exported to ETABS in the current policy; base support restraints are exported. Foundation geometry is separate IFC/SAFE/STAAD Foundation scope. This is a valid product decision if explicit and consistent.

**RECOMMENDED:** Make ETABS contract fields mandatory and auditable:

- story names and absolute elevations,
- grid coordinates and labels,
- node coordinates,
- frame endpoints,
- section dimensions,
- local axes/cardinal/insertion,
- end offsets,
- releases,
- diaphragm assignment,
- load patterns,
- mass source,
- combinations,
- support restraints,
- foundation policy,
- solver version,
- EDB and script hashes.

### PyNite

**OBSERVED:** v3/tools/run-pynite.py builds a gravity model with 33 nodes, 52 frames, 12 quads, and nine supports according to existing acceptance evidence. The result policy is comparison-only and does not apply forces or sizes back into the model.

**INFERRED HIGH-RISK CHECK:** The runner declares geometry and loads in m/kN and material strength in MPa, then passes E derived in MPa to the PyNite material API. If the model uses kN and m, elastic modulus must be represented in kN/m2, which is numerically 1,000 times MPa. The source and stored artifacts do not prove the dimensional convention is correct. This must be independently verified against the pinned PyNite API before using PyNite for engineering decisions.

**OBSERVED:** The runner applies frame self-weight through FS_DEAD and plate self-weight explicitly because plate self-weight is not included by the frame helper. This is a sensible intent, but it needs a load-balance test across all element types.

**RECOMMENDED:** Add a declared unit system to the solver request and a dimensional conversion layer. Test a one-member benchmark with an analytically known deflection/reaction.

### OpenSees and QUBO

**OBSERVED:** OpenSees and QUBO are roadmap/registry capabilities, not active execution engines. The analysis and optimization workspace preserves immutable drafts and intentionally does not pretend to run them.

**RECOMMENDED:** Keep them separate from the primary calculation button until each has:

- a version-pinned execution engine,
- request schema,
- deterministic fixture,
- result schema,
- failure policy,
- provenance,
- comparison/acceptance gate,
- clear engineer review boundary.

### Solver-neutral contract

The product needs one solver-neutral request envelope:

~~~text
AnalysisRequest
  projectId
  revisionId
  modelHash
  scenarioId
  unitSystem
  geometry
  materials
  sections
  nodes
  members
  slabs
  supports
  releases
  diaphragms
  loadCases
  combinations
  massSource
  solverPolicy
  readiness

AnalysisResult
  requestId
  solver
  solverVersion
  runId
  sourceArtifactHash
  status
  warnings
  reactions
  memberForces
  displacements
  modalResults
  designResults
  massSourceEcho
  unmappedItems
  reviewRequired
~~~

## 9. Engineering QA

### Existing QA assets

- Geometry and topology validation.
- Area-balance checks.
- Column segment and floating-column checks.
- Protected revision and historical .fstr checks.
- DXF R12 parser and round-trip checks.
- IFC lightweight validation.
- Stored ETABS/STAAD/PyNite acceptance evidence.
- A4 PDF Arial/content checks.

### QA gaps

**P1:** The test suite is more contract/source-oriented than end-to-end behavioral for several critical paths. check-fs.js is large and monolithic, and some checks prove source strings or markers rather than native behavior.

**P1:** Model counts are not enough. A model can have the expected number of beams and columns while endpoints, local axes, eccentricities, loads, releases, and elevations are wrong.

**P1:** Result comparison is not yet a complete engineering QA system. It needs tolerances by quantity, combination, element identity, and unit.

### Required invariant classes

1. Identity: every exported member and node maps to one stable source ID.
2. Topology: every beam endpoint resolves to an intended node or explicit physical offset.
3. Elevation: every story, member endpoint, footing, and slab uses the vertical datum contract.
4. Orientation: section local axes and cardinals remain invariant across physical and solver representations.
5. Load: no load case is duplicated, dropped, or silently guessed.
6. Mass: self-weight and mass source are echoed and independently reconciled.
7. Units: every adapter declares input/output units and conversions.
8. Readiness: unresolved geometry or support mapping blocks only the capabilities it invalidates.
9. Provenance: every result has a reproducible source revision and run identity.
10. Round trip: missing evidence cannot produce MATCH.

## 10. Data/Version/Scenario/Provenance

### Current state

**OBSERVED:** .fstr JSON includes schema/version/revision metadata, vertical datums, floors, overrides, and model features. IndexedDB revisions retain immutable records with a limit of 50. Electron stores ten recent projects.

**OBSERVED:** The revision service creates IDs using time/random values and summarizes portions of legacy state. It does not provide a content-addressed snapshot hash as the primary identity. It also returns null for some summary categories where the persisted model is not yet normalized.

**OBSERVED:** Current build identity is not fully synchronized across README, app constants, manifest fallback, branch, installed release, and public deployment. The RAG also contains older branch context.

### Recommended provenance chain

~~~text
Project
  projectId

Revision
  revisionId
  parentRevisionId
  schemaVersion
  modelHash
  createdAt
  createdBy
  sourceFileHash
  readiness

ExportPackage
  exportId
  revisionId
  format
  adapterVersion
  payloadHash
  generatedAt

SolverRun
  runId
  exportId
  solver
  solverVersion
  commandHash
  resultHash
  status

Review
  reviewId
  resultId
  reviewer
  decision
  notes
  timestamp
~~~

### Scenario requirement

**RECOMMENDED:** Add explicit scenario identity for design alternatives, not only revision identity. Examples:

- BASELINE_GRAVITY
- WALL_OPENING_OPTION_A
- ROOF_TRUSS_OPTION_B
- ETABS_SEISMIC_CASE
- PRELIMINARY_MEMBER_OPTIMIZATION

A user must be able to compare scenarios without overwriting the baseline project.

## 11. Results Intelligence

### Current result types

- Preliminary slab/beam/column/foundation summaries.
- Tributary area and line loads.
- Preliminary BBS/BOM estimates.
- PyNite gravity reactions.
- ETABS audit/modal/analysis return evidence.
- STAAD native acceptance evidence.
- IFC/DXF/PDF export audits.
- Revit level/grid audit.

### Main issue

**OBSERVED:** Results are currently a mixture of calculated values, warnings, external audit echoes, and documentation claims. They do not share a uniform result schema or confidence/readiness state.

### Recommended result taxonomy

| Result class | Meaning | Allowed use |
| --- | --- | --- |
| DERIVED_GEOMETRY | Deterministic geometry consequence | Coordination, drafting |
| PRELIMINARY_CHECK | In-app simplified calculation | Early sizing only |
| SOLVER_ECHO | Imported solver output without design approval | Review and comparison |
| SOLVER_COMPARISON | Difference between engines | QA and investigation |
| DESIGN_RESULT | Code-based design result with traceable inputs | Engineer review |
| FABRICATION_RESULT | Approved detailing and quantities | Shop/fabrication only after approval |
| ENGINEER_APPROVED | Explicit EOR acceptance record | Issue control |

### Result intelligence features to prioritize

1. Difference reports by element ID, not only total reaction.
2. Load-path tracing from slab/wall/stair to member/support.
3. Unmapped and excluded item ledger.
4. Model completeness score.
5. Unit and mass-source echo.
6. Solver-to-FS result import as immutable result set.
7. Engineer review queue with explicit dispositions.
8. Report statements generated from evidence status, not static prose.

## 12. UX/workflow

### Good current UX direction

- Plan, tributary, foundation, schedules, columns, beams, footings, slabs, design, and 3D workspaces.
- Member sizing fields and per-floor controls.
- Recent files and protected save/revision controls.
- Explicit solver and readiness warnings.
- Wall plan editor, stair placement, and roof-frame workspace growth.

### UX risks

**OBSERVED:** The application has a very large amount of functionality in one page and many tabs. This makes it possible for the user to operate on stale selection/floor state or miss a readiness warning.

**OBSERVED:** Some buttons and labels carry historically accumulated meanings, including calculation, round-trip, import/export, and solver handoff. A user can reasonably confuse model generation, analysis, import, and result comparison.

**RECOMMENDED:** Organize the product around workflow stages rather than every domain object:

1. Model
2. Loads
3. Analysis setup
4. Solver exchange
5. Results
6. Documentation
7. Coordination

Keep domain tabs within stages, with a persistent floor/story context and a visible model/revision ID.

### Specific UX changes

- Replace Round-trip as an ambiguous standalone action with Import solver evidence.
- Keep export actions under Solver exchange.
- Show a persistent status bar: Project / Revision / Scenario / Readiness / Unsaved changes.
- Make current floor and current scenario obvious in every plan/3D/schedule surface.
- Require explicit confirmation before changing a typical floor or global default that has per-floor overrides.
- Put wall elevations, stair elevation views, and roof-frame views into contextual editor workspaces, not additional top-level clutter.
- Use consistent iconography and tooltips, but preserve dense engineering information.

## 13. LumCAD/CAD/BIM interoperability

### DXF

**OBSERVED:** The R12 DXF path has strong parser/native-open evidence and coordinated plans/tables/BOQ work. It should remain a deterministic drawing-package exporter.

**GAP:** Visual full-sheet review and alignment with all current model types should be part of acceptance. DXF is not a semantic BIM exchange, so it cannot carry all structural relationships.

### IFC

**OBSERVED:** IFC2x3 export contains active frame/slab geometry, stair/foundation coordination work, and metadata. The lightweight parser checks entities and metadata.

**GAP:** Strict IfcOpenShell geometry/schema acceptance is not currently reproducible on the audit machine. IFC category mapping and native Revit editability remain limited.

### Revit

**OBSERVED:** The current C# add-in creates/matches levels and grids and writes an audit. It does not create native columns, beams, slabs, footings, stairs, walls, roof members, or rebars. The Revit manifest includes policy/status fields that exceed what the importer consumes.

**RECOMMENDATION:** Treat the Revit path as staged:

- Stage R1: levels/grids.
- Stage R2: native structural members.
- Stage R3: foundations, stairs, walls, roof frame.
- Stage R4: rebar and approved detailing.
- Stage R5: update/diff existing model safely.

Do not call the manifest a complete Revit model import until member creation is implemented and accepted.

### LumCAD

**RECOMMENDED:** Define a stable neutral package that can be consumed by LumCAD and other drafting tools. It should include:

- geometry and stable IDs,
- display layers,
- levels/grids,
- physical/analytical relationship,
- annotations/tags,
- section/material catalogs,
- openings and lintels,
- export provenance,
- readiness/warnings.

## 14. BBS/BOQ/BOM readiness

### Current state

**OBSERVED:** BBS logic in v3/index.html generates preliminary bar assumptions from member dimensions, spans, cover, and simple formulas. The BOM estimates reinforcement weight from concrete volume and a fixed kg/m3 factor.

**Assessment**

This is useful as an early quantity signal, but it is not a fabrication-ready bar bending schedule. It lacks a governed reinforcement model, approved design results, bar mark identity, shape codes, exact hooks/bends, lap/splice rules, development length by code/material/diameter, congestion checks, anchorage, couplers, placing zones, and reviewer approval.

### Required rebar domain

~~~text
RebarSet
  rebarSetId
  hostMemberId
  designResultId
  barMark
  diameter
  grade
  quantity
  spacing
  shapeCode
  legs
  hooks
  bends
  lap/splice
  anchorage
  cover
  fabricationStatus
  approvalStatus
  quantity/provenance
~~~

### Recommendation

Keep current BBS/BOM marked PRELIMINARY_ESTIMATE. Do not use it for procurement or shop drawings until it is driven by approved design results and a governed rebar schema. The Revit/IFC rebar path should consume that same schema rather than inventing a second detail representation.

## 15. Code Architecture/quality

### Current quality

**OBSERVED:** The repository has valuable modules and clear domain intent, but v3/index.html is approximately 30,000 lines and remains a high-coupling controller. v3/tools/check-fs.js is approximately 7,000 lines and mixes multiple acceptance concerns.

### Main technical risks

- Global mutable state and derived state can diverge.
- Legacy compatibility fields remain in active paths.
- Exporters may derive their own semantics.
- Global dashboard summaries do not always use per-floor source values.
- Runtime tests, source-contract tests, and native tests are mixed conceptually.
- Build/version truth is distributed.
- Untracked Revit build output is visible in the worktree.
- Root and desktop package metadata disagree on license/build semantics.

### Refactor strategy

Do not split files merely by size. Extract by invariant ownership:

1. canonical model schema and normalizer,
2. structural topology/domain services,
3. load/mass case service,
4. export package service,
5. result/provenance service,
6. UI adapters,
7. acceptance fixtures.

Each extraction should preserve behavior and add a contract test before moving consumers.

## 16. Tests/CI/release/observability

### Existing CI

**OBSERVED:** .github/workflows/validate.yml runs Node and Python setup, source checks, DXF/IFC-related validation, and browser checks when configured. It does not build the Electron installer or Revit add-in, and it cannot generally run native ETABS/STAAD/Revit/AutoCAD.

### Release gaps

- No consistent desktop build/installer acceptance in CI.
- No Revit C# compile gate.
- No native BIM gate in a controlled Windows runner.
- No PyNite runtime gate in the current audit environment.
- No OpenSees/QUBO execution gate.
- No signed installer evidence.
- No public runtime health/build endpoint with exact source commit and capability matrix.
- Vercel static deployment and desktop installer may represent different builds.

### Observability recommendation

Create a machine-readable capability-manifest.json containing:

- app version/build,
- source commit,
- schema version,
- enabled modules,
- acceptance status by capability,
- solver adapter versions,
- native-test timestamps,
- known limitations.

Expose it in the desktop About screen, report footer, and export metadata. Do not infer capability from UI labels.

## 17. Security/bridge/runner

### Desktop

**P0:** The ETABS bridge must be narrowed as described in Section 6. The same principle applies to any future STAAD, Revit, Tekla, or Python bridge.

### Web/static app

**OBSERVED:** Vercel headers include useful clickjacking, permissions, origin, and cache controls. CSP still allows unsafe-inline script/style and third-party CDNs. Static app design is appropriate for local-first work, but remote content and future auth must be treated as a separate threat model.

### AI features

**OBSERVED:** Public AI assistant functionality is disabled. Source still contains experimental direct client-side API-key paths.

**RECOMMENDATION:** Remove or isolate disabled experimental code before any public activation. Never expose provider keys in the browser. Use a server-side authenticated broker with quotas, redaction, audit logs, and no direct model authority over structural geometry.

### File/project security

- Validate .fstr size, schema, numeric finiteness, and object depth before load.
- Treat project files as untrusted input.
- Do not execute scripts or commands from project payloads.
- Preserve quarantine autosave behavior.
- Use output-directory allow-lists.
- Add signed desktop artifacts before broad distribution.
- Keep SolverLink retired and outside this product boundary.

## 18. Performance

### Current risks

- A 30,000-line HTML controller and redraw-heavy plan/3D paths.
- Full-model recalculation on edits that may only affect one floor/member.
- Large DXF/table generation in the browser.
- Browser-to-Electron serialization of large scripts and payloads.
- IndexedDB revision snapshots duplicating large project JSON.
- Revit/solver exports potentially rebuilding the entire model repeatedly.

### Recommended performance model

- Maintain normalized model plus memoized derived projections.
- Recalculate only affected floors/members where deterministic.
- Cache geometry by revisionId + scenarioId + projection.
- Stream or chunk large drawing-package generation if needed.
- Store revision content hashes and deduplicate identical snapshots.
- Measure plan render, 3D render, calculate, save, export, and solver bridge times with fixture sizes.

### Performance acceptance targets

Define targets for:

- 2-floor regular fixture,
- 3-floor Bacacay fixture,
- 10-floor stress fixture,
- 500-member coordination fixture,
- 1,000-member import fixture.

Do not optimize before profiling these workflows.

## 19. Technical Debt register

| ID | Debt | Severity | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| TD-01 | No canonical structural graph | P1 | Global/floor arrays and derived export payload | Add schema/projection boundary |
| TD-02 | Round-trip incomplete evidence can MATCH | P0 | v3/solver-roundtrip.js | Fail closed |
| TD-03 | Free-form ETABS PowerShell bridge | P0 | desktop/main.cjs:562-610 | Typed allow-listed bridge |
| TD-04 | Global and per-floor load summaries can diverge | P1 | updateLoadSummary versus per-floor export | Single load service |
| TD-05 | PyNite unit convention unproven | P1 | run-pynite.py:121-161 | Benchmark and unit conversion |
| TD-06 | Revit importer only levels/grids | P1 | FutolStructureCommand.cs | Stage native member import |
| TD-07 | Rebar/BBS is heuristic | P1 | BBS/BOM functions | Governed rebar model |
| TD-08 | Result sets lack first-class storage | P1 | round-trip and analysis artifacts | Result/provenance service |
| TD-09 | Source/release identity drift | P1 | README, RAG, manifest, roadmap | One generated identity source |
| TD-10 | Browser acceptance gate is monolithic | P2 | check-fs.js | Split by contract/domain/runtime |
| TD-11 | Revit build outputs unignored | P2 | revit/bin, revit/obj | Ignore generated output |
| TD-12 | Root and desktop package metadata differ | P2 | package manifests | Define package authority |
| TD-13 | No deterministic scenario entity | P1 | revision-only persistence | Add scenario model |
| TD-14 | General releases not modeled | P1 | roof support only | Add member release schema |
| TD-15 | Native gates not reproducible in CI | P1 | workflow limitations | Controlled Windows gates |
| TD-16 | AI experiment code remains in source | P2 | disabled public flags | Isolate/delete before activation |
| TD-17 | IFC strict validation unavailable locally | P2 | Python dependency missing | Pin and run in acceptance environment |
| TD-18 | Project file is trusted too broadly | P1 | file load/bridge boundaries | Validate and sandbox input |
| TD-19 | UI labels blur export/import/analysis | P2 | current toolbar/workspaces | Workflow-centered IA |
| TD-20 | Report provenance is static/partial | P1 | report generation | Evidence-driven report service |

## 20. Keep/Harden/Refactor/Replace/Add/Defer/Remove

### Keep

- Geometry-first browser workflow.
- Explicit vertical datum contract.
- Shared CSI export model.
- Protected revisions and recent files.
- DXF R12 acceptance path.
- IFC coordination path.
- Structural readiness warnings.
- Local-first and technical-preview boundary.
- Native acceptance documentation.

### Harden

- Round-trip comparison.
- Desktop solver bridges.
- Load/mass semantics.
- Provenance and build identity.
- Native acceptance artifacts.
- Revit JSON manifest contracts.
- File validation and autosave recovery.
- PDF/report status language.

### Refactor

- Global model ownership in v3/index.html.
- Duplicate per-floor/global load calculations.
- Acceptance checks into separate domain/runtime gates.
- Export adapter logic around a canonical package.
- Report/BBS/BOM data access around result and design schemas.

### Replace

- Free-form ETABS script input.
- Time/random-only revision identity.
- Result comparison based on optional fields.
- Hardcoded report assumptions that resemble final design.

### Add

- Stable node/member/section/load/scenario/result IDs.
- Release/diaphragm/mass source entities.
- Typed solver request/result envelopes.
- Native Revit member import stages.
- Approved rebar domain.
- Capability manifest.
- Engineer review/issue control.

### Defer

- Full QUBO optimization.
- Automatic OpenSees execution.
- Fully automatic rebar detailing.
- Native .rvt generation.
- General Tekla SD round trip.
- Cloud multi-user collaboration/auth.

### Remove or retire

- Ambiguous standalone Round-trip label.
- Dead/duplicate legacy paths after migration evidence exists.
- Disabled client-side AI key code before public activation.
- Claims that a manifest represents full Revit import when only levels/grids are consumed.
- Any retired SolverLink references from active architecture.

## 21. Target Architecture ASCII

~~~text
                     +----------------------+
                     |  Project Repository  |
                     |  .fstr / revisions   |
                     +----------+-----------+
                                |
                         Canonical Model
                         schema + normalizer
                                |
       +------------------------+------------------------+
       |                        |                        |
  Domain services          Derived projections       Provenance
  geometry/topology        plan/3D/schedules         revision/hash
  loads/mass               report/BBS/BOQ             scenario/run
  datums/releases          export packages            approval
       |                        |                        |
       +-----------+------------+------------+-----------+
                   |                         |
          Solver-neutral request       Coordination package
                   |                         |
       +-----------+-----------+       +-----+----------------+
       |           |           |       |      |        |       |
     ETABS       STAAD      PyNite   IFC    DXF    Revit    LumCAD
       |           |           |       |      |        |       |
       +-----------+-----------+-------+------+--------+-------+
                   |
             Result normalizer
                   |
        Immutable AnalysisResult
                   |
       comparison / review / report
                   |
             Engineer approval
~~~

### Boundary rule

Views, exporters, and reports may derive from the canonical model. They may not silently become a second source of truth.

## 22. Target data flow

~~~text
User edit
  -> command
  -> normalized model
  -> invariant validation
  -> revision snapshot
  -> scenario selection
  -> derived geometry/load projections
  -> export package with modelHash
  -> solver/native tool
  -> result artifact
  -> result normalization
  -> comparison and warning ledger
  -> engineer review
  -> issued report/drawing
~~~

### Failure behavior

- Invalid model: save as draft is allowed; solver-ready export is blocked.
- Unresolved topology: IFC/DXF may carry warnings; ETABS/STAAD execution export is blocked.
- Missing solver evidence: report remains preliminary.
- Partial import: result is INCOMPLETE, never MATCH.
- Changed source revision: imported results become STALE.
- Changed scenario: results do not overwrite baseline.

## 23. Golden model suite

Create and freeze these fixtures before broad schema migration:

| Fixture | Purpose | Minimum acceptance |
| --- | --- | --- |
| GM-01 Regular 3-floor RC | Baseline generation | Exact counts, levels, loads, exports |
| GM-02 Bacacay | Current real project | FS/ETABS/STAAD geometry and orientation parity |
| GM-03 Terminated columns | P0-C1A topology | No reactivation/floating segments |
| GM-04 Elevated GF | Vertical datum | No hardcoded 0.00; exact story elevations |
| GM-05 Foundation geometry | IFC/STAAD Foundation | Footings/pedestals/tie beams and IDs |
| GM-06 Wall/opening/lintel | Masonry handoff | Net wall loads, openings, lintel metadata |
| GM-07 Stair | 2D/3D/solver | Elevation, supports, loads, connectivity |
| GM-08 Roof frame | Steel/RC roof | Supports, releases, loads, export policy |
| GM-09 Physical eccentricity | Analytical offset | Same physical placement, centroid analytical nodes, explicit offsets |
| GM-10 Legacy .fstr | Migration | Load/save preserves intent and counts |
| GM-11 Partial solver audit | Fail-closed comparison | INCOMPLETE, never MATCH |
| GM-12 Rebar preliminary | Status boundary | Preliminary only, no fabrication claim |

For each fixture record:

- model hash,
- source schema version,
- revision/scenario,
- expected entity counts,
- expected level elevations,
- expected load/mass summary,
- expected warnings,
- expected export counts,
- expected native acceptance status.

## 24. Backlog stable IDs, priority, value, and reversibility

Scales: Impact 1-5, Risk if ignored 1-5, Effort S/M/L/XL. Priority is product safety/engineering risk, not implementation order alone.

| ID | Priority | Work item | Impact | Risk ignored | Effort | Dependencies | Reversible | Value |
| --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| FS-AUD-001 | P0 | Fail-closed round-trip evidence | 5 | 5 | S | Golden partial-audit fixture | Yes | Prevent false success |
| FS-AUD-002 | P0 | Typed ETABS desktop bridge | 5 | 5 | M | Bridge contract | Yes | Reduce code-execution risk |
| FS-MODEL-001 | P1 | Canonical model schema and normalizer | 5 | 5 | XL | Fixture freeze | Yes, staged | One source of truth |
| FS-MODEL-002 | P1 | Stable node/member/section IDs | 5 | 5 | L | Canonical schema | Yes, staged | Cross-tool traceability |
| FS-MODEL-003 | P1 | Physical/analytical invariant validator | 5 | 5 | L | Stable IDs | Yes | Preserve eccentricity/orientation |
| FS-LOAD-001 | P1 | Unified load/mass service | 5 | 5 | L | Canonical schema | Yes | Prevent load drift |
| FS-RESULT-001 | P1 | Immutable result/provenance model | 5 | 5 | L | Revision/scenario IDs | Yes | Safe solver import |
| FS-RESULT-002 | P1 | Result status and stale detection | 5 | 5 | M | Result model | Yes | Avoid stale design |
| FS-BIM-001 | P1 | Revit native member import | 4 | 4 | XL | IFC/manifest contract | Yes | Useful BIM output |
| FS-BIM-002 | P1 | Strict IFC schema/geometry gate | 4 | 4 | M | Python environment | Yes | Reliable coordination |
| FS-SOLVER-001 | P1 | PyNite unit benchmark | 5 | 5 | S | Python/PyNite | Yes | Validate open-source analysis |
| FS-SOLVER-002 | P1 | Member-force comparison | 5 | 4 | L | PyNite units/results | Yes | Engineering QA |
| FS-REPORT-001 | P1 | Evidence-driven A4 report | 4 | 4 | M | Result/provenance model | Yes | Professional issue control |
| FS-DETAIL-001 | P1 | Governed rebar schema | 5 | 5 | XL | Design results | Yes | BBS/Revit/rebar foundation |
| FS-QA-001 | P1 | Golden model harness | 5 | 5 | L | Fixtures | Yes | Regression confidence |
| FS-RELEASE-001 | P1 | Capability manifest | 4 | 4 | S | Build identity | Yes | Honest release status |
| FS-UI-001 | P2 | Workflow-centered navigation | 3 | 3 | L | Stable statuses | Yes | Reduce user confusion |
| FS-WALL-001 | P2 | Wall/opening/lintel solver adapter | 4 | 4 | L | Load service | Yes | Masonry coordination |
| FS-STAIR-001 | P2 | Stair solver connectivity | 4 | 4 | L | Node/release schema | Yes | Safer stair handoff |
| FS-ROOF-001 | P2 | Roof-frame solver acceptance | 4 | 3 | L | Release schema | Yes | Steel/roof scope |
| FS-ANALYSIS-001 | P2 | OpenSees execution adapter | 4 | 3 | XL | Solver contract | Yes | Independent analysis |
| FS-OPT-001 | P3 | QUBO optimization execution | 3 | 3 | XL | Results/design constraints | Yes | Optimization |
| FS-CLOUD-001 | P4 | Auth/cloud collaboration | 3 | 4 | XL | Security architecture | Yes | Multi-user product |
| FS-DETAIL-002 | P3 | Native Revit rebar and BBS | 5 | 5 | XL | Approved rebar model | Yes | Fabrication coordination |
| FS-IMPORT-001 | P3 | General ETABS/STAAD/Tekla import | 4 | 4 | XL | Result/model contract | Yes | Round-trip workflows |

## 25. Phases

### Phase 1: Model and evidence integrity

**Goal:** Make the canonical model, provenance, topology, load, and round-trip statuses trustworthy.

**Why now:** Existing geometry/export work is broad enough that semantic drift is now the limiting risk.

**Dependencies:** Freeze GM-01 through GM-05 and the partial-audit fixture.

**Modules:** New schema/normalizer/domain services; analysis-inputs.js; solver-roundtrip.js; project-revisions.js; collectCSIExportModelData; desktop bridge.

**Deliverables:**

- Canonical model envelope.
- Stable IDs and hashes.
- Fail-closed comparison.
- Typed ETABS bridge.
- Physical/analytical invariant report.
- Capability manifest.

**Tests:**

- Legacy migration.
- Exact fixture counts/elevations.
- Missing audit must be INCOMPLETE.
- Script injection/bridge rejection.
- Offset/cardinal/node correspondence.
- Mass/load echo.

**Exit criteria:**

- No critical path uses newly written legacy state fields.
- Every export has model hash and readiness.
- Partial solver evidence cannot report MATCH.
- ETABS bridge receives structured data only.
- Baseline fixture is stable across browser and export.

**Risks:** Migration complexity; temporary compatibility adapters required.

### Phase 2: Solver result system

**Goal:** Establish reproducible solver request/result adapters.

**Why now:** PyNite and native ETABS/STAAD evidence exists but is not unified.

**Dependencies:** Phase 1.

**Modules:** PyNite adapter/runner, ETABS/STAAD exporters, result normalizer, comparison tools.

**Deliverables:**

- Unit benchmark.
- Request/result schema.
- Reactions/member forces/displacements/modal/mass echo.
- Stale result detection.
- Unmapped item ledger.

**Tests:**

- Known one-member benchmarks.
- Bacacay reaction and member-force comparisons.
- Native EDB/STD audit.
- Failure and partial-result cases.

**Exit criteria:** Results can be imported without overwriting geometry and can be traced to a source hash.

**Risks:** Solver-specific semantics and unit conventions.

### Phase 3: BIM/CAD coordination

**Goal:** Turn coordination export into reliable native BIM exchange.

**Why now:** IFC and Revit exist, but native member import is incomplete.

**Dependencies:** Phases 1-2.

**Modules:** IFC exporter/validator, Revit add-in, DXF package, LumCAD package.

**Deliverables:**

- Strict IFC gate.
- Native Revit members/foundations/stairs/walls/roof.
- Update/diff audit.
- CAD/BIM metadata parity.

**Tests:** Revit 2027 fixture, IFC strict parser, DXF visual review, stable ID inspection.

**Exit criteria:** Existing structural members remain unchanged across export/import acceptance; no duplicate/floating objects.

**Risks:** Revit API/version, category/editability limitations.

### Phase 4: Engineering design/detailing

**Goal:** Separate preliminary design from approved design and support governed detailing.

**Why now:** BBS/BOM and reports are currently heuristic/preliminary.

**Dependencies:** Phases 1-2; engineer-approved design contract.

**Modules:** design result model, rebar model, BBS/BOM, PDF report, Revit rebar.

**Deliverables:**

- Approved design-result envelope.
- Rebar sets with shapes/hooks/bends/laps.
- Traceable BBS/BOM.
- Evidence-driven A4 report.
- Review/approval record.

**Exit criteria:** No fabrication claim without approved results; all quantities trace to rebar entities.

**Risks:** Code provisions and engineer/EOR decisions cannot be automated generically.

### Phase 5: Advanced analysis and optimization

**Goal:** Add OpenSees and QUBO as controlled, optional capabilities.

**Why now:** Only after the primary model/result contract is stable.

**Dependencies:** Phases 1-4.

**Deliverables:** version-pinned engines, deterministic fixtures, constraints, review workflow.

**Exit criteria:** No draft optimization can silently modify the baseline model.

**Risks:** Misuse as automatic design authority; computational and licensing complexity.

### Phase 6: Cloud/product operations

**Goal:** Secure accounts, project sharing, and team workflows.

**Why now:** Only after local-first semantics and security boundaries are mature.

**Dependencies:** Security model, provenance, review/approval, backend.

**Deliverables:** server auth, row-level authorization, audit logs, encrypted storage, background jobs.

**Exit criteria:** No client-side secrets; project access and revision lineage auditable.

**Risks:** Larger attack surface and operational cost.

## 26. First 10 small correct tasks

1. FS-AUD-001: Change round-trip status rules so missing required fields produce INCOMPLETE.
2. Add GM-11 partial ETABS audit fixture and regression test.
3. Publish a capability manifest generated from the current commit and acceptance results.
4. Add a typed ETABSExportRequest schema and reject renderer script text.
5. Add a desktop bridge test proving unexpected PowerShell tokens are rejected.
6. Add a model hash to buildProjectData() and export metadata.
7. Add a physical/analytical correspondence report for every frame.
8. Add a two-floor slab-thickness test for dashboard versus export load totals.
9. Add a PyNite one-column/one-beam unit benchmark before trusting Bacacay comparison.
10. Add a report footer that states revision, scenario, readiness, solver-result status, and engineer-review status.

These tasks are small, reversible, and improve trust before adding feature surface.

## 27. What not to do

- Do not rewrite v3/index.html wholesale.
- Do not add OpenSees, QUBO, Tekla, or cloud auth before the canonical model/result contract.
- Do not call the Revit manifest a native .rvt model until members are imported and accepted.
- Do not let preliminary BBS/BOM become procurement or fabrication output.
- Do not let a missing/partial solver audit return MATCH.
- Do not accept arbitrary PowerShell or solver scripts from renderer input.
- Do not silently re-center physical columns to analytical centroids.
- Do not change user-modeled cardinal/insertion/eccentricity without an explicit projection rule.
- Do not use total counts as the only geometry acceptance criterion.
- Do not merge all existing dirty files into a release branch.
- Do not install dependencies or modify external programs as part of a source audit.
- Do not reintroduce SolverLink into the active architecture.

## 28. Michael/EOR decisions

The following decisions require Michael and/or the Engineer of Record, not autonomous code:

1. Whether an elevated GF is grade-referenced or suspended and how foundation/base support is defined.
2. Whether physical column eccentricities are intentional construction geometry and how analytical offsets should be represented.
3. Whether slabs are rigid diaphragms, semi-rigid shells, or not diaphragms by floor.
4. Whether a wall is structural, nonstructural, partition, cladding, or load-bearing for each scenario.
5. Whether stairs participate in the lateral/gravity analytical model or are coordination-only.
6. Roof-frame support releases and whether automatic hinge/roller suggestions are acceptable.
7. Applicable code editions, load factors, importance factors, wind/seismic parameters, and material design values.
8. Whether foundation geometry is solver-designed externally or preliminary FS geometry must be included in a solver model.
9. Whether imported solver results are trusted for design decisions and under what review conditions.
10. Whether any BBS/rebar result is approved for fabrication.
11. What constitutes an issue-ready report and required signatures/seals.
12. Which model changes are allowed during solver import and which must be blocked.
13. Whether scenarios are alternatives, revisions, or separate design options.
14. Whether cloud collaboration is allowed for project data and what retention/security rules apply.

## 29. Future external research only

No external research was performed for this audit. The following should be researched later, only when the corresponding phase is approved:

- Current ETABS 22/25 OAPI and EDB automation limitations.
- STAAD.Pro and STAAD Foundation interchange/API behavior.
- Tekla Structural Designer import/export and analytical/physical mapping.
- Revit 2027 structural API, analytical model, rebar, and update/diff behavior.
- IFC4/IFC4x3 structural analysis and reinforcement entities versus IFC2x3 limitations.
- PyNite 3.0.0 unit conventions and stability/plate semantics.
- OpenSeesPy supported elements, recorders, and reproducibility.
- QUBO/optimization solver suitability and constraint/verification strategy.
- NSCP/ACI/ASCE provisions applicable to the intended Philippine projects.
- AISC/Eurocode/NSCP provisions for steel roof framing where applicable.
- PDF/A, CAD plotting, and archival engineering-document requirements.
- Secure Electron application signing, update channels, and Windows code integrity.
- Revit/AutoCAD/ETABS licensing constraints for CI or remote automation.

Research must produce versioned decision records, not silently change the product contract.

## 30. Principal architect recommendation

FutolStructure should become a canonical structural model and evidence system with coordinated views and adapters, not a collection of increasingly capable tabs.

The correct order is:

1. Make one model authoritative.
2. Make physical and analytical geometry explicitly related.
3. Make load, mass, release, datum, and topology semantics portable.
4. Make exports typed and traceable.
5. Make imported solver results immutable, comparable, and stale-aware.
6. Make reports reflect evidence status.
7. Then expand Revit/native BIM, rebar/BBS, OpenSees, QUBO, Tekla, and cloud workflows.

The current codebase is strong enough to support that evolution without a destructive rewrite. The immediate architectural mandate is to narrow ambiguity and strengthen evidence. A smaller number of trustworthy capabilities will create more professional value than a larger number of partially integrated features.

**Audit conclusion:** proceed with Phase 1 only after freezing the golden fixtures and accepting the fail-closed/provenance/bridge-security decisions above. No production or permit-ready claim should be made from the current branch solely because source smoke or a stored native acceptance document is green.

