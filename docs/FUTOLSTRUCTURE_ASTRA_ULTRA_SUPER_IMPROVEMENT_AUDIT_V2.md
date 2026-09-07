# FutolStructure Engineering and Product Audit v2

**Prepared for:** Michael Futol and Lum  
**Date:** 2026-09-07, Asia/Singapore  
**Purpose:** Reassess the first audit and provide an executable improvement plan.  
**Authority:** Current local source and reproduced behavior take precedence over the v1 audit and historical acceptance prose.  
**Scope:** Inspection, non-destructive probes, and this report. No implementation or release authorization is implied.  
**Repository:** D:\projects\futolStructure 04-14-26\futolstructure-fs123-vertical-datum-foundation  
**Branch / HEAD:** feature/fs-125-shared-analytical-inputs / 146413fae3b991703945e59e45580840386169c2  
**Reviewed tree:** HEAD plus existing uncommitted work; findings are not necessarily present in the installed or public application.  
**Predecessor retained:** FUTOLSTRUCTURE_ASTRA_ULTRA_SUPER_IMPROVEMENT_AUDIT.md

Evidence labels: **OBSERVED** means source/configuration inspected; **REPRODUCED** means an audit probe executed; **ARTIFACT** means a previously generated file inspected; **INFERRED** means a consequence requiring further acceptance; **PROPOSED** means future work. File/line references are relative to the repository above and refer to this snapshot.

## 1. Executive Summary

FutolStructure has a useful working core: RC framing and column-segment intent, physical/analytical geometry, explicit datums, protected saves, coordinated exports, and native ETABS verification code. It already has versioned analysis-request and job contracts. Building another wholesale model framework before fixing concrete defects would be the wrong first move.

The first audit identified legitimate concerns but overstated several missing capabilities and understated numerical problems. This revision replaces those generalizations with reproduced cases and smaller delivery gates.

### Five highest-priority findings

1. **PyNite stiffness units are inconsistent at the adapter boundary.** The runner passes E = 21,538.1058 and G = 8,974.2107 for a 21 MPa concrete model whose coordinates, loads and section properties use m/kN. Corresponding kN/m2 values are 1,000 times larger. The stored Bacacay result contains a -1.740316 m nodal translation, so total-reaction agreement is inadequate acceptance. See A2-01.
2. **Analysis success can hide excluded geometry or loads.** Unmapped loads become warnings and execution continues; the runner does not implement the source beam offsets/cardinals, and its stair-frame endpoint reader ignores z1/z2. See A2-02 and A2-03.
3. **ETABS comparison can show green MATCH on an incomplete audit.** Reproduced with no member counts, level list, analysis return or solver provenance. This is the JSON importer, distinct from the stronger native ETABS export checks. See A2-04.
4. **The all-floor dashboard load summary is not a sum of floors.** A two-floor probe gives 58 or 115 kN for the same building depending on the active thickness; correct factored slab weight is 86.4 kN. Zero live load also becomes 2 kPa through a fallback. See A2-05.
5. **Readiness validation can manufacture a support from invalid coordinates.** A column with invalid X and z1 becomes a fixed support at X=0 and returns READY_FOR_ADAPTER. This is a reproduced module-boundary failure, not proof that normal UI input reaches it today. See A2-06.

The desktop script bridge also requires hardening before broader distribution. It is a conditional privilege-boundary risk, not a demonstrated remote exploit.

### Five highest-value improvements

1. Correct and benchmark PyNite's dimensional mapping before expanding its accepted scope.
2. Require complete accounting for every included element/load and every unsupported modeling feature.
3. Make evidence comparison reject missing/stale inputs, including zero-reference and signed-result cases.
4. Unify floor totals around the existing model/load projection and preserve explicit zero values.
5. Extend the existing frozen request with a semantic fingerprint, typed adapter capabilities and native readback; migrate consumers incrementally.

### First implementation phase

**Phase 0: Freeze and reproduce; Phase 1A: correctness repair.** Begin with units, omitted-load gates, incomplete-audit status, zero-reference comparison and floor-summary correctness. Do not make schema migration or a UI redesign a prerequisite to these repairs. Detailed tasks and exit criteria are in Sections 24-26.

### Fresh positive evidence

The existing Bacacay IFC passes the repository's strict validator using installed IfcOpenShell 0.8.5: **94 products tessellated, zero schema statements, errors or warnings, exact four-level set, and no duplicate foundation IDs/geometries**. This is materially stronger evidence than v1's parser-unavailable statement. It is acceptance of that artifact, not fresh browser generation or native Revit acceptance.

### Corrections to v1

| v1 assertion or implication | v2 correction | Evidence |
| --- | --- | --- |
| Canonical request/job/result structures need to be created from nothing | CSIExportModel.v1, AnalysisRequest.v1, job contracts and PyNiteResult.v1 already exist. Strengthen their semantics and consumers | analysis-optimization.js:createCanonicalRequest/createEngineJob; run-pynite.py |
| Revisions use only time/random identifiers | createId prefers crypto.randomUUID; time/random is fallback. The gap is semantic freshness and content identity | persistence/project-revisions.js:25; index.html:17445 |
| Desktop has a PyNite process bridge | It has ETABS and PDF IPC. PyNite preparation/download and a separate Python CLI exist; no PyNite IPC handler was found | desktop/main.cjs:527; index.html:7849 |
| Python unavailable prevents IFC validation | Python 3.11.9 with IfcOpenShell 0.8.5 exists; strict IFC passed. Bundled Python 3.12.14 also exists, without these solver packages | Runtime discovery and strict validation in this audit |
| Remove or rename a current Round-trip toolbar button | Current source already says Import; primary calculation already says Recalculate | index.html:2239-2252 |
| Root/desktop licenses disagree | Both package files say UNLICENSED; this is consistent with the proprietary LICENSE. Root entrypoint/build-script clarity remains a separate concern | package.json; desktop/package.json; LICENSE |
| PyNite is principally a reaction-output prototype | It also serializes nodal displacement and member scalar extrema. These are not validated force envelopes | run-pynite.py:396 |
| No native state verification | ETABS exporter verifies sections, axes, cardinals, offsets and geometry, and throws on failures. The JSON importer ignores much of this richer evidence | index.html:25379,25984,26040; solver-roundtrip.js |
| PDF test exercises desktop PDF delivery | check-pdf-report.cjs replaces the desktop API with a mock, then prints using Playwright. Electron printToPDF is a separate gate | check-pdf-report.cjs:29-63 |
| Broad reliability/coverage statements from one source smoke | Source smoke is useful but does not prove UI, solver mechanics, packaging or native BIM | Section 16 |
| Replace UUIDs with content-addressed IDs | Keep human/project/revision identities; add distinct semantic/artifact hashes. Identity and content equivalence serve different purposes | Sections 10 and 21 |
| Scope-wide progress claims from Git and documents | Remote refs are cached; installed app and Vercel were not reverified here | Section 2 |

V1 remains historical. Use this v2 for priorities and scope.

## 2. Current Product - What Actually Exists

### Repository and runtime baseline

The initial status contained **11 modified tracked files and 10 untracked entries**, including v1 and the untracked Revit directory. Tracked differences totaled 849 insertions and 94 deletions. Existing changes include wall/roof editors, PDF IPC, PyNite changes, tests and acceptance documents. They were preserved.

| Surface | Verified locally | Qualification |
| --- | --- | --- |
| Source HEAD | 146413fae3b991703945e59e45580840386169c2 | Dirty working tree reviewed |
| Source app/desktop version | 3.16.124-rc.1 / FS-124-RC1 | Same label covers newer uncommitted code |
| release-manifest commit | db13836f698cbd90d49ec5382f5fe193788e10b0 | Earlier checkpoint, not current HEAD |
| Electron / builder / updater pins | 44.1.1 / 26.15.3 / 6.8.9 | Package declarations, not fresh installer acceptance |
| CI | Node 22, Python 3.12, Ubuntu | Workflow configuration inspected |
| FSTR schema | 0.2.0 | Legacy fixtures and compatibility policy exist |
| Python discovered | System 3.11.9; bundled 3.12.14 | Neither discovery required installation |
| System PyNite | 1.6.2 | Runner intentionally requires 3.0.0 |
| System IfcOpenShell | 0.8.5 | Matches requirements-ifc.txt and executed successfully |
| ezdxf in checked interpreters | Not found | DXF parser not rerun |
| Installed Windows app | Roadmap records db13836 candidate | Not inspected/reinstalled here |
| GitHub / Vercel | Not live-queried | No claim of fresh synchronization |

Git emits a user-level ignore-file permission warning while completing status commands. No environment repair was attempted.

### Capability assessment

| Capability | Current implementation | Acceptance boundary |
| --- | --- | --- |
| Regular RC model, custom/terminated column intent | Active resolver, reconciler, per-floor overrides | Source regression; previous browser/native evidence |
| Physical/analytical geometry | Explicit axes, centroid joints, offsets, member-type cardinals | ETABS/native evidence stronger than PyNite |
| Walls/openings/lintels | Editor, inventory, line loads, solver opt-in | Receiving-member mapping and native export unfinished |
| Roof framing | Steel metadata, line loads, support suggestions, boolean end releases | No complete steel section/release/solver mapping |
| Stairs | Structural components, placement, openings, support/readiness records | Solver connectivity and representation choices remain gated |
| Internal Recalculate | Tributary/preliminary sizing and dashboard | Not an external FE solve |
| ETABS | Native builder, EDB, OAPI readback, audit/modal output | Accepted fixtures; not general design approval |
| STAAD | STD and shared offset geometry | Prior native fixture evidence; separate design warnings |
| SAFE | ETABS-to-SAFE handoff | Not a foundation-design engine implemented inside FS |
| SAP2000/Tekla SD | Future integration direction | No active verified adapter established |
| PyNite | Request preparation + pinned external CLI + structured results | Current acceptance must be narrowed after numerical findings |
| OpenSees/QUBO | Registry, frozen draft jobs/proposals | No execution/candidates |
| Solver import | ETABS audit JSON comparison | No general EDB/STD/Tekla model import |
| IFC | IFC2X3 with foundations and metadata | Fresh strict artifact validation passed |
| Native Revit | C# level/grid importer | Members and rebar not implemented |
| BBS/BOM | Preliminary formulas and quantities | Not fabrication-ready |
| A4 report | Arial HTML and PDF paths | Real Chromium PDF evidence; desktop delivery not rerun |
| Accounts/cloud storage | No production auth/project database found | Planned |

## 3. Current Architecture Map

~~~text
User/model files
    |
    v
v3/index.html -- global state, commands, derived geometry, schedules/reports
    |
    +-- EngineLoads: columns, calculations, topology intent
    +-- EngineVerticalDatums / stairs / walls / roof-frame
    +-- collectCSIExportModelData -> CSIExportModel.v1
    |       +-- physical/analytical geometry, sections, provenance
    |       +-- FSAnalysisInputs -> cases, assignments, mass, supports
    |       +-- FSAnalysisOptimization -> frozen AnalysisRequest.v1 / jobs
    |               +-- PyNite preparation/download -> separate Python CLI
    |               +-- OpenSees/QUBO draft-only
    |
    +-- ETABS builder text -> Electron IPC -> PowerShell/OAPI -> EDB/audits
    +-- STAAD STD / IFC / DXF / Revit manifest / report
    +-- ETABS audit JSON -> comparison -> in-memory record/download
    +-- .fstr / localStorage / IndexedDB revisions

Electron: single instance, recent files, opening projects, ETABS, PDF, updater
Revit C#: separate manually invoked level/grid import transaction
Web: static Vercel configuration; no application backend or project database
~~~

**OBSERVED:** There is a modular core under a large inline controller. Versioned contracts already form useful boundaries. The problem is incomplete enforcement: duplicated request aliases and solver-specific readers can disagree despite sharing a payload.

**PROPOSED:** Evolve the existing CSI snapshot into a documented solver-neutral projection by adding explicit capabilities and validation. Keep a compatibility adapter for CSI field names. Do not create a second unrelated building graph.

## 4. Current User / Engineering Workflow

### Representative traced path: Bacacay to solver audit

| Step | Code/evidence | Where truth can change |
| --- | --- | --- |
| Open .fstr | applyLoadedProject / validateProjectData; desktop project bridge | Migration, defaults and hidden-geometry quarantine |
| Edit/recalculate | calculate; column-segment resolver; typical inheritance | Floor defaults versus overrides; recalculation regenerates derived members |
| Assemble export | index.html:24684 collectCSIExportModelData | Coordinate reflection, analytical joints, physical offsets, generated section IDs |
| Attach analysis inputs | index.html:25095; analysis-inputs.js | Some values still inferred or coerced; wall target identity unresolved |
| Prepare solver | ETABS PowerShell or frozen PyNite request | Adapter-specific coordinate/axis/load behavior |
| Execute | ETABS bridge; separate PyNite CLI | Native defaults; omitted geometry; dependency/version mismatch |
| Read results | ETABS native checks; PyNite collect_results | Counts versus actual geometry; units, signed extrema, exceptions |
| Import audit | index.html:18895; solver-roundtrip.js | Partial audit can MATCH; richer native evidence not enforced |
| Present | renderSolverRoundTrip / dashboard / report | Static QA badge and current-state totals can look authoritative |
| Persist evidence | lastSolverRoundTrip in memory + manual JSON download | Not a durable, automatically linked analysis-result history |

Protected model revisions exist. Imported audit persistence is a different feature and must be designed separately.

### Physical versus analytical arrangement

The Bacacay source snapshot already carries a beam whose analytical joints are (0,0) to (4.175,0), with physical-face offsets (+0.125,+0.075) and (-0.125,+0.075) in solver coordinates. Its beam cardinal is 8. A column record carries 250 x 400 mm, source orientation 0 and column cardinal 5. These are deliberate member-specific policies in current code.

Changing all members to cardinal 8 would undo the column-centroid policy. Likewise, copying a reflected FS angle directly to every solver is not a universal mapping. Preserve modeled solids, derive section-local axes per solver, and verify world-space geometry plus mechanical behavior.

## 5. What Is Good and Must Be Preserved

| Asset | Why it is valuable | Preserve through |
| --- | --- | --- |
| resolveColumnSegmentState and generateGrid reconciliation | Retains deletion/termination intent instead of regenerating unwanted columns | Legacy/terminated fixture regression |
| Existing column/beam physical and analytical fields | Addresses repeated real Bacacay orientation/connection defects | Exact member-level native comparisons |
| Explicit vertical datums | Supports elevated floors and nonzero base support | Elevated-GF fixture, not only Bacacay zero datums |
| Per-floor edge sizing/inheritance work | Supports independent exceptions and typical-floor initialization | Edit/detach/save/load tests |
| Frozen AnalysisRequest.v1 and job/proposal objects | Existing foundation for repeatable adapter jobs | Mutation tests and additive contracts |
| Protected revisions with UUID preference | Local recovery and identity already implemented | Recovery/write-failure fixtures |
| Dated ETABS output and native throw-on-mismatch | More than a file-download check | Preserve while replacing the transport |
| Strict IFC validator | Real schema and tessellation checks | Execute in pinned environment |
| Source/browser fixtures | Significant regression investment | Add adversarial cases, avoid replacing wholesale |
| Honest OpenSees/QUBO execution restrictions | Avoid fabricated analysis/optimization | Keep capability-specific availability |

Preserving these assets is a technical requirement, not merely a preference for less work.

## 6. Critical Findings

Priorities follow the director brief: **P0 = engineering correctness or acceptance integrity blocker**, **P1 = foundational hardening**, **P2 = bounded capability/workflow defect**. A P0 here does not mean a demonstrated internet exploit. Each finding is limited to the named path.

### A2-01 [P0] PyNite material scale is wrong for the declared solver units

**Where:** v3/tools/run-pynite.py:121-161, build_material_and_sections; analysis-optimization.js:createCanonicalRequest.

**REPRODUCED:** Calling the actual builder with a recording stand-in for the FE API captured:

~~~text
fc = 21 MPa
E passed = 21538.105766292447
G passed = 8974.210735955186
rho passed = 24 kN/m3
section A = 0.1 m2 for 250 x 400 mm
required E in kN/m2 = 21538105.766292445
~~~

The runner calculates E in MPa and forwards it without the MPa-to-kN/m2 conversion. The locally installed PyNite 1.6.2 Material constructor stores the passed value without conversion; this inspection is supplementary and is not acceptance of the required 3.0.0 runtime.

**ARTIFACT:** The recorded PyNite 3.0.0 Bacacay result contains maximum absolute nodal translation 1.740316405 m, DZ at N32 under ULS-1.2D+1.6L. This is a stored model result, not a prediction of the real building. It strengthens the need to withdraw displacement/design acceptance of that run. A globally scaled linear stiffness model can retain equilibrium reactions while displacement magnitudes are wrong.

**Action:** Convert solver properties to a coherent unit system at the boundary. Keep display fc/E in MPa separately. Audit G, density, stresses and any future steel properties. Do not simply rescale old JSON results.

**Acceptance:** Axial bar and bending cantilever with independent closed-form displacement checks; reaction equality alone is insufficient. Re-export/rerun the pinned version and compare signed member forces and displacements.

### A2-02 [P0] Unmapped loads and rejected geometry do not stop PyNite completion

**Where:** run-pynite.py:add_frame_members, add_quad_members, add_loads:321, run:491-526.

**REPRODUCED:** A positive FS_WALL assignment to W1 with only B1 mapped returns applied=[], unresolved=[member_not_mapped]. The load combination is still built. Source then continues to analyze_linear and returns COMPLETED if the solver does not fail.

Missing IDs, invalid/zero-length frames and non-four-point slabs are also warning-and-skip paths. A result collection exception is stored per member but does not change overall completion.

**Consequence:** COMPLETED describes process completion, not complete analysis of the requested building. Optional exclusion must be an explicit job policy before the solve.

**Action:** Reconcile requested/mapped/excluded counts and load totals. Required unsupported items block. Approved exclusions get source IDs, reason, engineer decision and a reduced-scope status. Never silently select nearby receivers.

**Acceptance:** A missing positive wall load, invalid slab, missing section, duplicate ID and unavailable member result must each fail the appropriate acceptance gate.

### A2-03 [P0 for equivalent-model claims] PyNite drops mechanical geometry present in the shared payload

**Where:** run-pynite.py:164-245; index.html:24828-24867.

**REPRODUCED:** Supplying nonzero jointOffsets and cardinal 8 produces only add_node and add_member calls with rotation=0. No offset/cardinal transformation is consumed. A stair frame with z1=0,z2=3 and no common z produces null elevations.

**OBSERVED:** section_dimensions uses J = b*h*(b*b+h*h)/12, equal to Iy+Iz: a polar area moment rather than a general rectangular torsional section constant. Iy/Iz mapping must also be checked against the actual member-local basis; do not presume a single B/H convention applies to vertical and horizontal members.

**Consequence:** ETABS/STAAD and PyNite can receive mechanically different models despite the same source revision. Offset count/readback in ETABS does not validate PyNite.

**Action:** Initially restrict PyNite acceptance to its supported zero-offset fixture envelope. Implement or explicitly reject eccentric members, sloped frames, diaphragm policy and unsupported slab topology. Use independently verified section properties/local bases.

**Acceptance:** Nonzero eccentricity must produce an implemented, tested transformation or an explicit unsupported-feature block. Sloped frame endpoints must retain z1/z2. Test bending in both local planes and torsion separately.

### A2-04 [P0] ETABS audit importer reports MATCH with incomplete or weak evidence

**Where:** solver-roundtrip.js:6-17,123-145,196-299; index.html:18846 renderSolverRoundTrip.

**REPRODUCED:** With matching stories=1 and foundation booleans but no member counts, levels, analysis return or solver provenance, the overall result is MATCH with ten NOT_REPORTED notes. The renderer colors MATCH green.

Number(null) and Number(false) also convert to zero, and integerCount rounds/clamps rather than requiring nonnegative integers. Rich native geometry checks in the export builder are not equivalent to this importer comparison.

**Action:** Define required evidence per operation. Geometry-only import need not contain modal analysis; a claimed modal run must. Missing evidence becomes INCOMPLETE, mismatching evidence REVIEW/DIFF, wrong identity STALE/FOREIGN. Preserve a read-only legacy viewer for old audits.

**Acceptance:** Partial, null, boolean, fractional-count, stale-revision and native-parity-failed fixtures cannot display MATCH. Geometry-only complete audits can pass their explicitly limited scope.

### A2-05 [P0 for reported totals] All-floor dashboard totals depend on current-floor values

**Where:** index.html:8805 updateLoadSummary.

**REPRODUCED:** Two floors, each 10 m2, thicknesses 100 and 200 mm, density 24:
- current thickness 100 mm -> displayed slab DL 58 kN;
- current thickness 200 mm -> displayed slab DL 115 kN;
- actual sum using the function's 1.2 factor -> 86.4 kN.
Setting state.LL=0 produces 64 kN live load because state.LL || 2.0 replaces the zero. The function applies factors but calls the rows Slab Dead Load and Live Load.

**Scope:** This proves the dashboard function's defect. It does not prove that every solver load is wrong; CSI slabs use per-floor fields.

**Action:** Build a floor/element load ledger and derive displayed totals from it. Distinguish characteristic load, selected-combination load and mass. Represent unknown as unknown, legitimate zero as zero. Check column/beam/foundation contributions for mixed factors.

**Acceptance:** Floor switching does not change all-floor totals; independent floors, zero LL, suspended/ground-bearing GF, voids and deleted members reconcile with exported assignments.

### A2-06 [P0 boundary validation] Invalid coordinates can produce a fixed base support

**Where:** analysis-inputs.js:14,76-120.

**REPRODUCED:** Column x='bad', y=2, z1='bad', base=0 creates SUP-1 at (0,2,0) with six fixed restraints and validation.solverReady=true. NaN defeats the elevation comparison; default coercion moves X to zero.

**Scope:** Direct exported-module input. Upstream UI checks may reject some inputs; that is not a substitute for a public adapter-boundary validator.

**Action:** Validate finite coordinates/elevations before support matching. Validate support source membership, duplicate ownership and explicit restraint values. Keep ordinary input defaults in model creation, not in export repair.

**Acceptance:** null/boolean/string/NaN/infinite coordinates and missing base elevations cannot create valid supports. Valid zero coordinates remain accepted.

### A2-07 [P0 comparison integrity] Gravity comparison tests STAAD applied loads, and zero-reference logic can pass an error

**Where:** v3/tools/compare-gravity-results.js:18-33,48-68.

**OBSERVED:** staadPrimaryLoads parses TOTAL APPLIED LOAD, not the native support reaction table. The current comparison measures a PyNite reaction sum against a STAAD applied-load sum, despite the reactionsKN output label.

**REPRODUCED:** difference(100,0) yields percent=null; Math.abs(null)<=2 is true. A nonzero error against a zero reference can pass.

**Action:** Rename load-ledger comparison correctly and add actual support reaction comparison by support ID. Use absolute plus relative tolerances with a defined zero-reference rule. Verify source fingerprint, solver status, cases and units.

**Acceptance:** 100 kN versus 0 fails; 0 versus 0 passes; sign reversals remain visible. The documented 0.902% difference must have an element-by-element explanation, not an assumed tolerance justification.

### A2-08 [P1 security and output identity] Desktop execution trust is broader than needed

**Where:** desktop/main.cjs:242-262,305-373,562-604; desktop/preload.cjs.

**OBSERVED:** Context isolation, sandbox and disabled Node integration are present. However, run-etabs-export accepts renderer script text checked by length and marker strings, then executes it. Any file:// navigation is allowed; IPC does not validate a specific sender frame. A stdout EDB path may be absolute and outside the export folder; fallback discovery selects a recently modified EDB.

**Threat precondition:** Renderer compromise, attacker-controlled executable content reaching that renderer, or another trust-boundary error. No remote exploit or malicious-file chain was executed. ExecutionPolicy Bypass is not itself the root vulnerability; unrestricted renderer command authority is.

**Action:** Main process owns a packaged builder; renderer supplies bounded validated model data. Verify allowed sender/document, constrain paths, use a unique run directory/request ID, inspect the exact expected artifact. A nonce or signature alone does not make an untrusted arbitrary script safe.

**Acceptance:** Arbitrary script payload rejected; untrusted sender rejected; simultaneous exports isolated; unrelated recent EDB cannot count as success; bounded timeout/cancellation does not kill unrelated user solver sessions.

### A2-09 [P1 traceability] Revision identity does not prove current model equality

**Where:** index.html:4710 provenance,17612 buildProjectData,17805/18220 revision assignment; project-revisions.js:25,70,281.

**OBSERVED:** UUIDs, parent revision fields and project provenance exist. Current revision can remain the loaded/saved identity through working edits. Export provenance does not carry a deterministic semantic model hash. The persistence fallback summary has activeBeams=null and legacy column counting; collectCurrentProjectSummary:17473 is a richer canonical live summary, so the fallback is not the sole save-health path.

**Action:** Preserve IDs. Add source-file hash, normalized model fingerprint and dirty-from-revision status. Hash the resolved semantic model, not timestamps/camera state. Test fallback versus live recovery summaries rather than replacing all persistence.

**Acceptance:** Load -> edit without saving -> export cannot appear identical to the old result. Saving without a semantic edit does not falsely change model equality. Legacy revisions remain recoverable.

### A2-10 [P1 readiness before roof solver integration] Roof supports collapse vertically distinct points

**Where:** roof-frame.js:39-90.

**REPRODUCED:** Supports at the same XY but z=3 and z=6 collapse to one assignment. With that single hinge, solverReady is true.

**Action:** Match 3D support identity, level and host. Separate support suggestion from analysis readiness. Resolve six DOFs and release directions for each frame system; a count of supports cannot prove stability.

**Acceptance:** Same XY/different Z remains two nodes; disconnected roof frames evaluated independently; explicit hinge/roller direction retained; unbraced 3D mechanisms blocked or flagged for the appropriate stability test.

### A2-11 [P1 before native-member expansion] Revit partial/conflict handling is narrower than its milestone name

**Where:** revit/FutolStructureCommand.cs:70-96,102-197.

Only levels/grids are created. Conflicting levels/grids are skipped while other edits can commit and Execute returns Succeeded. A same-name grid matches if one endpoint's X or Y matches; a rotated/curved grid can satisfy that incomplete check. SetComments overwrites an existing matched element's Comments with FS text.

**Action:** Preview conflicts; use explicit partial-import status or whole-package rollback policy; verify grid curve type/direction and line locus. Use dedicated FS storage instead of overwriting human Comments. Preserve unrelated L1/L2 host levels.

**Acceptance:** A same-name diagonal/arc grid does not match an orthogonal source; repeat import is idempotent; conflicts and audit-write failures produce an honest outcome; user comments survive.

### A2-12 [P2 current quantities] BBS/BOM still mix actual geometry and heuristics

**Where:** index.html:19935 populateBBS;22995 populateBOM;23053-23074.

BBS uses the first floor height, member-size-based bar counts and fixed hook/lap assumptions. BOM uses averaged spans for tie-beam volume and total concrete volume * 80 for rebar weight. Several generated row strings contain '< tr >', which is invalid table-tag syntax; visual DOM impact was not tested in this audit.

**Action:** Separate measured concrete quantities from reinforcement estimates and approved fabrication quantities. Fix row rendering with a targeted browser check. Do not advertise heuristic bar estimates as approved schedules.

## 7. Structural-Engineering Domain Model Review

### Existing contract versus missing semantics

| Domain | Existing representation | Next missing rule |
| --- | --- | --- |
| Project/building | Project ID/info and FSTR revision | Explicit multi-building boundary only if a real workflow needs it |
| Stories/datum | VerticalDatums.v1; absolute elevations/heights | Validate consistency and import conflicts |
| Grids | Spans and solver gridDefinition | Persistent source IDs separate from display labels |
| Column lines/segments | Resolver, segment IDs/overrides, custom/planted metadata | Stable identity under grid/floor changes; supported transfer topology |
| Beams | Per-floor IDs/sections, physical/analytical axes and offsets | Explicit local basis and adapter-specific transformation contract |
| Slabs/shells | Polygon/section/thickness and load fields | Mesh rules, openings, diaphragm classification and ownership |
| Walls/openings/lintels | Wall inventory and derived line load | Host segment, loaded length, floor, load replacement/aggregation rule |
| Foundations/supports | Coordination solids; base-restraint policy | Differentiate footing contact, pedestal, analytical support and soil stiffness |
| Stairs/canopies | Stair structural components; cantilever beams/slabs | Sloped endpoints, representation exclusivity, explicit support transfer |
| Roof | Member IDs, section strings, boolean releases, loads | Real section properties/materials, DOF releases, bracing/connectivity |
| Cases/combinations/mass | AnalyticalInputs.v1 with six cases/three gravity combinations | User-approved policy parameters; all consumers honor one assignment set |
| Node/joint | Solver coordinate registries | Versioned node identity and connectivity in exported snapshot |
| Releases | Roof releaseStart/releaseEnd booleans | Six-DOF frame-end release definition with local coordinate basis |
| Diaphragm | Hardcoded rigid D1 in ETABS path | Per-story selection and capability validation |
| Analysis run/results | Frozen jobs; PyNite result contract; audit downloads | Durable association, complete evidence, stale status and result locations |
| Design/rebar | Preliminary checks and bar formulas | Design-result provenance and explicit reinforcement entities |
| Scenario/approval | Job options/proposals; some engineer flags | Reviewable scenario branch, approval scope, evidence and invalidation |

### Mechanical policy to retain and verify

Physical column coordinates, dimensions and orientation remain authoritative user intent. Analytical beams connect to the intended column-centroid joints. Physical clear-span trimming, eccentric offsets and vertical insertion are distinct concepts:

- **Physical trimming:** drawing/solid ends at a face.
- **Joint eccentricity:** mechanical transformation between node and member reference line.
- **Rigid end region:** stiffness/force-transfer assumption, not synonymous with face trimming.
- **Cardinal/insertion:** section reference position, mapped by member type.
- **Slab reference plane:** top, mid-surface and thickness must be separately defined.

Current ETABS SetInsertionPoint_1 passes a stiffness-transform flag and records it, but the inspected parity loop checks coordinates/cardinals/axes rather than a response benchmark for eccentricity. Treat mechanical equivalence as a required test. Do not infer it from a correct-looking extrusion.

## 8. Solver / ETABS / Analysis Integration Review

### Strengthen existing contracts

Keep CSIExportModel.v1 and AnalysisRequest.v1 as compatibility surfaces. Add validation of redundant aliases: canonicalModel, geometry, sections, loads and supports must agree. Use one normalized authoritative snapshot per request; prevent callers from changing copied aliases independently.

A proposed adapter interface:

~~~text
describeCapabilities(version) -> operations, supported features, limits
validate(request) -> blockers, warnings, exclusions, units, expected counts
prepare(request) -> immutable run package + source/model hashes
execute(package, cancellation) -> process outcome, logs, artifacts
readNativeState(run) -> native geometry/properties/loads/settings
verifyNative(request, nativeState) -> field-level comparison and coverage
extractResults(run, query) -> typed results + units/basis/location
verifyResults(request, results) -> completeness/equilibrium/benchmark status
~~~

Do not require every adapter to support every operation. SAFE can be handoff-only; QUBO can be proposal-only.

### Specific adapter assessment

- **ETABS:** Preserve native verification and dated working copies. Centralize cases/supports/assignments currently reconstructed in the PowerShell generator. Add numeric readback for self-mass, assigned mass, load contributions and participation; do not treat an analysis return code of zero as modal adequacy.
- **STAAD:** Preserve STD, coordinate transformation and MEMBER OFFSET. Independently compare native reactions, not only its applied-load table.
- **PyNite:** Correct A2-01/02/03 before calling the model mechanically equivalent. One quad per slab is not mesh convergence. Require a declared diaphragm/mesh policy and a small supported envelope.
- **OpenSees:** Retain planned status. Add static benchmarks before modal/nonlinear analysis. It does not require completed rebar fabrication features to begin an approved isolated benchmark.
- **QUBO:** Use a validated deterministic evaluator for every proposed section set. No optimization candidate is accepted solely because an objective improved.
- **SAFE/SAP2000/Tekla:** Distinct capabilities and lifecycle; avoid promising file-level round trip based on ETABS audit import.

Wall loads require receiver mapping before export. Current loadAssignments uses wall.id as elementId; PyNite maps beam IDs. ETABS's regular loop reads beam.wallLoad directly. Adding a wall inventory to JSON does not mean its load is applied by either solver. Decide how an explicit wall replaces a coarse floor wall allowance to prevent later double counting.

## 9. Engineering QA and Verification Review

Use capability-specific gates, not one global solverReady boolean.

| Check | Class | Existing basis | Required addition |
| --- | --- | --- | --- |
| Finite dimensions/coordinates, unique IDs | Deterministic | Partial normalizers | Reject invalid values at snapshot boundary |
| Column termination/continuity | Deterministic plus transfer judgment | Resolver/topology gates | Preserve all consumers and fixture counts |
| Node/member connectivity | Deterministic | CSI point registry | Interior intersections, duplicate members, source-host checks |
| Offsets/local axes/cardinals | Deterministic + mechanics benchmark | Native ETABS readback | World-space section basis and response tests |
| Story/datum equality | Deterministic | Vertical datum module, strict IFC | Nonzero elevated-GF native fixture |
| Every intended load accounted for | Deterministic | Assignment arrays | Applied/excluded/blocked ledger and unit conversion |
| Tributary reasonableness | Heuristic | Area-balance checks | Irregular bays/openings and manual benchmark |
| Diaphragm/release/support intent | Engineer judgment then deterministic mapping | Partial policies | Explicit DOFs, local axes, scenario assumptions |
| Stability | Solver diagnostic plus engineer judgment | PyNite stability option | Mechanism fixtures and lateral load path |
| Reactions/forces/displacements | Deterministic checks + engineering review | Scalars/native artifacts | Full signed/localized result evidence |
| Design approval/fabrication | EOR approval | Preliminary warnings | Explicit scope, revision and approval invalidation |

AI assistance may help identify a wall or explain an anomaly. It should output a reviewable proposal with source evidence. It must not convert uncertainty into a support fix, altered member or approved design.

Pipeline:

~~~text
Model projection -> geometry QA -> topology QA -> load accounting
 -> adapter capability gate -> native build/readback -> analysis
 -> result completeness/equilibrium -> design checks -> engineer review
 -> approved issue snapshot
~~~

Saving a recoverable draft is different from allowing analysis. An incomplete model should remain editable and recoverable.

## 10. Data / Version / Scenario / Provenance Review

### Identity model

Keep current project/revision UUIDs and domain IDs. Add:

- rawSourceHash: exact original FSTR/DWG/IFC bytes;
- semanticModelHash: stable normalized engineering inputs;
- adapterPackageHash: exact solver-bound package;
- artifactHash: exact EDB/STD/IFC/result file;
- runId: a unique execution attempt.

Exclude timestamps, camera, selection and transient cached results from semantic hashes. Include resolved member overrides, loads, releases, offsets, units and scenario assumptions. Freeze sorting/serialization rules; otherwise a harmless reorder can invalidate comparisons.

### Working-state semantics

A loaded revision plus unsaved changes is not that immutable revision. Use baseRevisionId + workingModelHash. Results become STALE when relevant semantic inputs change. A result may remain valid after camera/selection changes.

Protected revisions are useful recovery snapshots, not external backups or cryptographic proof. IndexedDB retention of 50 records must not be the only archive of approved evidence. Test full-disk/quota/storage-unavailable cases and pre-overwrite snapshot failure without damaging the user's original file.

### Scenarios

A scenario is a named alternative with a baseline revision, explicit change set and assumptions:

~~~text
Project P
  immutable baseline R1
    As Drawn: source drawing references
    As Built: measured changes + evidence
    Permit: adopted loads/materials/design assumptions
    Future/Ultimate: added floors or changed use
    Strengthened: strengthening details
    Grade 33 / Grade 40: material alternatives
~~~

Approval belongs to a scenario revision, run and stated scope. A cloned approval flag is not transferable approval. Cross-scenario comparisons should say which objects changed and the governing consequence, with stable IDs surviving tag changes.

## 11. Calculation and Result Intelligence Review

The primary source action is already Recalculate. Preserve that clarification.

| Result | Current reach | Missing for engineering interpretation |
| --- | --- | --- |
| Preliminary gravity/member checks | In-app functions | Explicit approximation and factor basis |
| PyNite reactions/displacements | Stored per node/combo | Correct units, missing-value errors, acceptance |
| PyNite member forces | Signed scalar maxima | Minima, absolute governing extrema, stations and local bases |
| ETABS modal rows | Exported audit | Numeric mass-source reconciliation and adequacy policy |
| Story drift/base shear/overturning/P-Delta | No complete reviewed result path established | Analysis mode, combinations, units and checks |
| Shell forces/stresses | Not in inspected PyNite result extraction | Mesh, sample locations, sign convention and extrema |
| Design ratios/reinforcement demand | Preliminary checks; no full imported design lifecycle | Governing combination and solver/design settings |
| Foundation reactions | Base supports and handoff | Six-component load vectors and combinations for foundation design |

A result datum should contain value, unit, quantity, sign convention, global/local basis, object ID, station/node/face, case/combo, run ID, model hash and validation status.

Do not derive governing design from max_moment alone: a larger negative value may govern. Do not convert missing reaction values to zero. A resultant moment about a reference point needs both nodal moments and force lever arms; summing RxnMX/MY/MZ alone is not an overturning moment.

Separate execution state (finished/failed/cancelled), evidence state (complete/partial/stale), engineering checks (pass/review/fail) and human approval. This prevents COMPLETED from implying structural acceptance.

## 12. UI / UX / Professional Workflow Review

This is a source/workflow review; no new usability session or screenshot acceptance was performed.

The current workspaces and responsive editor work should be retained. The most valuable UI changes clarify ownership and scope:

- Show a member property's effective value and origin: manual member override, independent floor default, inherited floor value or project default.
- On detaching typical framing, preserve current values and show the detached scope.
- Keep floor/selection visible across plan, 3D and schedules.
- Show physical and analytical views as linked projections, with offsets inspectable by member.
- Treat wall/stair/roof editors as contextual workspaces with plan/elevation and selected support relationships.
- Replace the static QA badge with evidence for the active project/run, or clearly identify it as product-baseline evidence.
- Results import should show complete, incomplete, stale and unsupported states without needing to read logs.

**Concrete redundancy candidate:** refreshView at index.html:18756 calls calculate, render3DFrame and draw; Recalculate also rebuilds model state. Measure the actual differences, then consolidate routine commands or keep a diagnostic redraw action. Do not simply remove recovery/rebuild behavior because two labels sound similar.

Avoid a top-level tab for every backend. Analysis setup can offer engine choices; each engine shows only supported modes. QUBO studies belong under optional optimization, linked to a validated baseline.

## 13. LumCAD / CAD / BIM Interoperability Readiness

### Fresh IFC acceptance

Command executed against the existing dated artifact:

~~~text
python -B v3/tools/validate-ifc.py output/acceptance/fs125-bacacay-2026-09-06/ifc/Bacacay_FS125_2026-09-06.ifc --expect-level BASE/FOUNDATION=0 --expect-level GF=0 --expect-level 2F=3.6 --expect-level RF=6.8 --exact-level-set
~~~

| Result | Value |
| --- | --- |
| Interpreter / IfcOpenShell | Python 3.11.9 / 0.8.5 |
| IFC schema | IFC2X3 |
| Native class counts | IfcColumn 27; IfcBeam 46; IfcSlab 12; IfcFooting 9 |
| Semantic split | Columns 18; pedestals 9; beams 34; tie beams 12; slabs 12; footings 9 |
| Products / tessellated | 94 / 94 |
| Storeys | BASE/FOUNDATION 0; GF 0; 2F 3.6; RF 6.8 m |
| Schema statements / errors / warnings | 0 / 0 / 0 |
| Duplicate foundation geometry/IDs | None detected |
| Build metadata | FS-124-RC1 |

**Boundary:** This fixture has grade, GF and support all at zero. It does not establish nonzero datum behavior. No stairs/openings were present. Tessellation/validator success is not a complete clash detector or native Revit acceptance.

### Revit delivery

Current importer requires an open Revit document and creates levels/grids only. It is not a standalone RVT writer. Deliver incrementally:

1. Resolve grid/level matching and partial outcome semantics.
2. Add native columns/beams with suitable families, explicit parameters and stable FS-to-Revit ID mapping.
3. Add floors/openings/foundations.
4. Add supported stairs/walls/roof members.
5. Add approved reinforcement separately.

RVT creation/saving occurs inside licensed compatible Revit. A CSIxRevit route remains a separate pathway with its own mappings. Do not pretend exported IFC automatically becomes editable native rebar-ready structure.

### LumCAD boundary

LumCAD/CAD owns drawing representation and source references; FS owns adopted engineering intent; the solver owns run-specific FE objects/results. Exchange stable object IDs and explicit change proposals. Imported CAD geometry should be calibrated and reviewed before becoming load-bearing structure.

### DXF

Retain R12 and Arial style intent. Check drawing geometry, layers, tags, schedules and text/font availability in native CAD independently from parser success. Any future richer DXF format should be an isolated writer change after a justified capability need.

## 14. BBS / BOQ / BOM Future Readiness

Use three separate quantity classes:

1. **Measured geometry:** concrete volumes, member lengths, surface areas, openings.
2. **Estimated allowances:** preliminary rebar kg/m3, waste and conceptual sizing.
3. **Detailed fabrication:** approved bar shapes, cuts, bends, laps, hooks, quantities and marks.

Every row needs host ID, revision/scenario, quantity basis, unit and method. Distinguish gross solids from net joined volumes so beam/slab/column overlaps are not silently double-counted. Model-based tie-beam lengths should replace average-span approximations.

A future RebarHandoff should include bar/set ID, host, design-result reference, grade/diameter, centerline shape geometry, bend radii/hooks, development/lap decisions, cover, zone/spacing, quantity, stock/waste policy and approval scope. A bar mark is a display/fabrication grouping, not object identity.

Revit rebar and BBS should consume one approved reinforcement representation. Native BIM member delivery can proceed before this detailing phase; the first audit imposed unnecessarily broad sequential dependencies.

Procurement/cost/schedule integrations should reference quantity records and stable work-package IDs. Do not make FS an estimating system as a prerequisite to correct structural quantities.

## 15. Software Architecture and Code Quality Review

### What should change first

The largest file is not itself proof of a defect. Actual divergence is visible at updateLoadSummary, shared analytical inputs versus solver-specific load loops, and PyNite geometry/property mapping. Extract these tested responsibilities before generic file splitting.

Recommended incremental ownership:

- model projection: existing resolved CSI snapshot plus explicit validation;
- calculation ledger: per-element/per-floor load accounting;
- adapter translation: units, axes, offsets, supported features;
- result comparison: completeness, identity, tolerances, signs;
- presentation: formatted values and actions only.

Use runtime validators at untrusted/file/adapter boundaries. TypeScript migration is optional later; useful immediate measures are JSDoc definitions and independent contract tests for existing JavaScript/Python.

### Specific quality observations

- analysis-inputs.js coerces malformed values into defaults; creation-time convenience leaks into export validation.
- run-pynite.py uses default section sizes and skip paths inside translation.
- buildProjectData calls normalization and typical inheritance, so save/serialization is not a pure observation of state. Test repeated serialization invariance before changing it.
- File/property identity and display tags are mixed; normal grid/tag edits need stable source-to-export maps.
- Error handling often records a warning and continues. Each boundary needs an explicit partial-success policy.
- Revit generated bin/obj output appears in the untracked directory; future staging should exclude artifacts.
- Root package main.cjs points to an entrypoint owned by desktop; document the supported install/build directory rather than treating both manifests as interchangeable.

No circular-dependency defect was established in this audit. Performance and security findings should not be inferred merely from line counts.

## 16. Testing / CI / Release / Observability Review

### Checks executed for v2

| Check | Outcome | Meaning |
| --- | --- | --- |
| node v3/tools/check-fs.js --no-browser | PASS | Syntax and existing source/domain assertions |
| Direct ETABS importer probe | MATCH on incomplete evidence | Reproduced defect |
| Dashboard function in isolated Node VM | 58/115 instead of 86.4; zero LL -> 64 | Reproduced defect |
| Analysis-input support probe | Invalid coordinates accepted at origin | Reproduced defect |
| Python runner helper probes using recording API | Unconverted E/G; missing load; ignored offsets; lost sloped z | Translation behavior, not a native solve |
| Existing PyNite 3.0.0 JSON inspection | -1.740316 m stored translation | Historical result evidence |
| Roof support probe | z=3/z=6 collapse; solverReady=true | Reproduced defect |
| Comparison zero-reference probe | 100 versus 0 passes tolerance expression | Reproduced defect |
| Strict IfcOpenShell validator | PASS, 94 products | Existing artifact schema/tessellation acceptance |
| Full browser/native solvers/installer/Revit | Not rerun | No renewed acceptance claim |

Existing tests include substantive domain and browser cases, not only source strings. Nevertheless, they miss the adversarial cases above. Adding a string asserting that validation exists will not close these failures.

### CI and release

validate.yml provisions Node22/Python3.12 and DXF/IFC dependencies, runs source and browser checks, and uploads artifacts. It does not currently build the desktop or Revit artifacts or execute PyNite. Native tests belong in a controlled, licensed Windows environment with recorded versions; not every native program must be run on every PR.

Proposed tiered gate:

~~~text
PR: syntax/runtime schema -> domain regressions -> browser -> parser checks
Solver change: above + pinned numeric benchmarks + capability/rejection tests
Desktop change: packaged isolated-profile smoke + IPC/PDF/export tests
BIM change: strict IFC + Revit build + licensed native acceptance
Release: exact source/version/artifact hashes + installer smoke + rollback record
~~~

Full browser checks were not rerun here; lack of ezdxf in checked local interpreters remains a local gate limitation. Do not repair the environment during this audit.

Add structured run logs with run ID, stage, exit code, excluded items, output paths, tool version and source fingerprint. Cap log volume and redact secrets. Build metadata must be generated from the actual packaged source, including an honest dirty-candidate identifier.

Installed, source and web release truth must be checked separately. A version string alone cannot identify this dirty candidate.

## 17. Security / Local-Bridge / Runner Review

Treat A2-08 as a real architectural weakness with a stated precondition. Do not describe it as verified arbitrary execution from the internet.

Concrete boundaries to harden:

- IPC sender must be the approved app document/frame.
- Renderer submits data; main process chooses trusted executable/template.
- Validate sizes, nesting, numeric finiteness and output names.
- Restrict navigation to approved app resources, not any local HTML.
- Unique run directories and exact expected artifacts replace modification-time guessing.
- Cancellation/timeout tracks owned child processes and leaves unrelated solver sessions alone.
- Auto-updater release channels, artifact hashes and installer-signing policy need acceptance before public desktop rollout.

Vercel headers are not automatically applied to Electron file:// content. Review desktop document CSP separately. Current web CSP allows inline scripts/styles; migrating to strict CSP should follow extraction of known inline handlers, not break the working app in one change.

Public AI execution is disabled. Dormant client-key paths are not proof that a live secret is exposed; no secret scan or exploit chain was completed. Future activation needs a scoped threat model and server-held provider credentials.

Python run cancellation checks around solver execution are not proof of prompt mid-solve cancellation. Test cancellation during a long owned process before enabling a desktop Run button.

## 18. Performance and Large-Model Scalability Review

No timed full UI/large-model benchmark was performed. Proposed actions are profiling tasks, not claims of measured slowness.

Likely measurement points:

- calculate across floors and inherited geometry;
- collect3DFloorGeometry/collectCSIExportModelData;
- duplicate serialization of frozen requests and canonicalModel aliases;
- plan/3D rendering and large schedules;
- revision snapshot storage and quota behavior;
- IFC/DXF generation;
- solver IPC payload, stdout growth and exit settlement.

Measure reference regular and Bacacay fixtures first, then a synthetic 10-floor model. Record p50/p95 duration, memory and maximum interactive pause. Adopt numerical performance budgets after measurements on Michael's machine.

Only then consider memoized projections by semantic hash, dirty-floor recomputation or a worker for pure heavy calculations. Do not cache live mutable state by object identity and risk stale exports.

## 19. Technical Debt Register

| Debt | Evidence | Treatment | Tracking |
| --- | --- | --- | --- |
| Unit conversion missing in PyNite | A2-01 | Immediate correction and independent numeric tests | FS-SOLVER-001 |
| Geometry/load skip paths | A2-02 | Completeness and supported-envelope gate | FS-LOAD-002 |
| Offset/section/sloped-frame translation | A2-03 | Map or reject features | FS-SOLVER-003 |
| Partial audit green status | A2-04 | Fail incomplete by operation | FS-AUD-001 |
| Floor-dependent all-floor totals | A2-05 | Load ledger extraction | FS-LOAD-001 |
| Invalid support coercion | A2-06 | Strict adapter-boundary validation | FS-QA-002 |
| Applied-load/reaction comparison ambiguity | A2-07 | Separate comparisons and zero rule | FS-SOLVER-002 |
| Renderer command authority | A2-08 | Trusted main-process builder/data-only IPC | FS-AUD-002 |
| Revision/hash ambiguity | A2-09 | Keep IDs; add content identity | FS-RESULT-001 |
| Roof support readiness | A2-10 | 3D host/DOF/stability policy | FS-ROOF-002 |
| Revit matching/partial outcomes | A2-11 | Conflict preview and correct grid matching | FS-BIM-003 |
| BBS/BOM heuristics/render strings | A2-12 | Quantity classes and targeted rendering fix | FS-DETAIL-001 |
| Stale build metadata/docs | release-manifest/ROADMAP/RAG | One build record and evidence scope | FS-RELEASE-001 |
| PDF mock does not test Electron | check-pdf-report.cjs | Packaged PDF acceptance | FS-REPORT-002 |
| Static QA badge | index.html:2252 | Active model/run evidence presentation | FS-UI-001 |
| Broad canonical migration proposed in v1 | Existing frozen contracts | Staged validated projection, not wholesale rewrite | FS-MODEL-001 |

## 20. Keep / Harden / Refactor / Replace / Add / Defer / Remove Matrix

| Decision | Concrete scope |
| --- | --- |
| KEEP | Column intent/resolver; per-floor overrides; datums; native ETABS checks; revisions; UUIDs; frozen request/jobs; IFC/DXF tooling |
| HARDEN | Numeric and topology boundary validation; omitted-load gates; comparison status; native result identity; IPC |
| REFACTOR | One duplicated domain responsibility per tested change, beginning with floor load totals and adapter translation |
| REPLACE | Arbitrary renderer script execution; modification-time EDB discovery; missing-as-zero evidence; heuristic quantities presented as measured |
| ADD | Semantic hashes; capability matrix; signed/location-aware results; stage-specific statuses; native Revit members after datum gate |
| DEFER | Full optimization; cloud collaboration; general Tekla model import; automatic fabrication approval |
| REMOVE | Already-obsolete recommendations to rename Import/Recalculate; duplicate Rebuild only after behavior comparison; dead experiments after usage verification |

Retain browser and desktop from one source tree. Their transport/delivery adapters differ; their engineering model should not.

## 21. Target Future Architecture

~~~text
                    Existing FSTR + revision storage
                                  |
                         model edit/resolve layer
                    column intent, floors, inheritance
                                  |
                     validated frozen ModelSnapshot
                     stable IDs + semantic fingerprint
                                  |
             +--------------------+--------------------+
             |                    |                    |
       Physical projection   Analytical projection   Load ledger
       solids/face trimming  nodes/axes/DOF/offsets  cases/ownership/mass
             |                    |                    |
        plan/3D/IFC          adapter capabilities + validation
        DXF/Revit                 |
             |           trusted execution transport
             |          ETABS | STAAD | PyNite | future
             |                    |
             |          native readback + result normalization
             |                    |
             +---------- evidence/result repository
                                  |
                    compare -> review -> issued report
                         -> approved reinforcement
~~~

**Migration:** Extend existing CSIExportModel.v1 through a validated projection/compatibility layer. Retain FSTR schema while changes are additive and read-only. A later persisted schema change requires migration fixtures and read/write compatibility rules. No new database is needed for the first repair batch.

## 22. Target Engineering Data Flow

Example: user edits a 2F edge-beam depth.

1. Record the explicit 2F member override and save an undo command.
2. Resolve effective dimensions without changing a detached RF.
3. Recompute physical solid, analytical section/offsets and self-weight.
4. Validate the changed projection and update its semantic fingerprint.
5. Mark prior results for that semantic state stale.
6. Prepare a capability-checked solver package with expected IDs/counts/loads.
7. Execute and verify native section, geometry, mass and settings.
8. Normalize results with units, stations, combination and run identity.
9. Compare and request review only for the affected engineering decisions.
10. Issue drawings/report from the reviewed snapshot, not arbitrary live UI state.

Export should be observational after model resolution. Saving/exporting twice must not secretly add/remove geometry. A supported exclusion should be visible in both solver request and report.

## 23. Golden Model / Regression Suite

Reuse existing fixtures; do not freeze new contradictory baselines from a failing candidate.

| ID | Fixture | Independent acceptance |
| --- | --- | --- |
| G01 | Axial member, pure compression/tension | PL/EA displacement, reaction and sign; validates units |
| G02 | Cantilever point load and UDL | Deflection, shear/moment signs, local planes; negative governing extrema |
| G03 | Simply supported beam | Supports/releases, reaction split and force stations |
| G04 | One-way slab strip | Plate/beam load transfer and mesh refinement, not only total load |
| G05 | Existing regular 3-floor fixture | Floors, sections, IDs, topology, round-trip save |
| G06 | Existing terminated fixture | No reactivation; correct blocked exports; unchanged retained geometry |
| G07 | Existing vertical-datum fixture | Grade100/GF101.2/base99.5 and cumulative floors |
| G08 | Frozen Bacacay | Native coordinates, orientation, cardinal, offsets, support reactions and displacements |
| G09 | Independent edge sizes | Typical, detach, member override, save/load, all consumers |
| G10 | Eccentric beam-column frame | Same physical solid; analytical offsets; mechanical response benchmark |
| G11 | Wall with door/window/lintel | Net load; explicit receiver/loaded length; coarse allowance replacement |
| G12 | Stair sloped flight + landing | z1/z2, connectivity and shell-versus-reaction exclusivity |
| G13 | Roof with vertical support separation | Preserve Z; per-frame DOFs; mechanism and bracing checks |
| G14 | Partial/stale/invalid solver audit | INCOMPLETE/STALE/FOREIGN; no green success |
| G15 | Zero reference and failed member result | Absolute/relative tolerances and missing-data behavior |
| G16 | Revit same-name rotated grid | Conflict, idempotence and preserved user metadata |
| G17 | PDF long table/multi-floor report | Arial, A4, repeated headers, pagination and actual desktop save |
| G18 | Scenario variant: material/add floor/tank/canopy | Change propagation, governing loads and stale result invalidation |

An acceptance record needs fixture bytes/hash, branch/source identity, adapter/tool version, exact command, expected values/tolerances, actual evidence and reviewer. Total counts alone are not a golden model.

## 24. Prioritized Improvement Backlog

Existing v1 task IDs are retained where the scope remains compatible. New findings use A2 IDs to avoid renumbering historical findings. Effort: S = isolated change; M = one module/integration; L = several consumers; XL = substantial staged work. Scores are planning judgments, not measured risk probabilities.

| Task | Priority | Scope / findings | Impact | Risk ignored | Effort | Depends on | Reversibility | User value | Engineering value |
| --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| FS-QA-001 | P0 | Freeze/reproduce G01-15 | 5 | 5 | M | None | Additive | Reliable regression | Independent evidence |
| FS-SOLVER-001 | P0 | Units/section basis; A2-01/03 | 5 | 5 | M | G01/G02 | Isolated adapter | Trustworthy internal solve | Correct stiffness |
| FS-LOAD-002 | P0 | Required geometry/load accounting; A2-02 | 5 | 5 | M | Adversarial fixtures | Isolated gate | No hidden omissions | Full load intent |
| FS-AUD-001 | P0 | Complete scoped ETABS comparison; A2-04 | 5 | 5 | S/M | G14 | Isolated importer | Honest status | Evidence integrity |
| FS-LOAD-001 | P0 | Floor load ledger; A2-05 | 5 | 5 | M | G09 | One UI consumer first | Stable totals | Load reconciliation |
| FS-QA-002 | P0 | Finite numeric/support validation; A2-06 | 5 | 5 | S/M | G14 numeric cases | Boundary adapter | No invented positions | Valid restraints |
| FS-SOLVER-002 | P0 | Correct reaction/zero comparison; A2-07 | 5 | 5 | M | Native fixture evidence | Isolated tool | Meaningful comparisons | Reaction sanity |
| FS-SOLVER-003 | P0 scope gate | Offset/sloped/local-axis mapping; A2-03 | 5 | 5 | L | Units + G10/G12 | Capability-gated | Exact modeled arrangement | Equivalent mechanics |
| FS-SOLVER-004 | P1 | Signed/stationed result envelopes | 5 | 4 | M | Result schema | Additive | Governing-demand view | No missed negative peak |
| FS-AUD-002 | P1 release gate | Typed desktop bridge; A2-08 | 5 | 5 | L | Frozen payload fixtures | Keep tested compatibility | Predictable EDB delivery | Trustworthy transport |
| FS-MODEL-001 | P1 | Validated existing snapshot, no rewrite | 5 | 4 | L | Correctness fixes | Staged/additive | Fewer inconsistent views | Single projection |
| FS-MODEL-002 | P1 | ID maps under grid/member edits | 4 | 4 | L | G05/G06 | Migration adapter | Stable tagging | Traceable objects |
| FS-RESULT-001 | P1 | Semantic hashes/result association | 5 | 5 | M/L | Snapshot rules | Additive | Know which result is current | Reproducibility |
| FS-RESULT-002 | P1 | Stale/partial/review state | 5 | 4 | M | Result association | Additive | Clear decisions | Correct result scope |
| FS-RELEASE-001 | P1 | Exact build/capability evidence | 4 | 4 | M | CI artifact identity | Additive | Know installed version | Traceable release |
| FS-BIM-003 | P1 | Revit grid/conflict correctness | 4 | 4 | M | G16 | Isolated add-in | Predictable import | Correct datums |
| FS-BIM-001 | P2 | Native Revit columns/beams/floors | 5 | 4 | XL staged | BIM-003 + geometry QA | Per-category transactions | Editable BIM | Model parity |
| FS-BIM-002 | P2 | Strict IFC in routine gates | 4 | 3 | S/M | Existing validator | Additive | Reliable handoff | Schema/solid checks |
| FS-WALL-001 | P2 | Host loads, openings/lintels | 4 | 4 | L | Load ledger + G11 | Opt-in | Masonry workflow | Accounted loads |
| FS-STAIR-001 | P2 | Stair support/solver integration | 4 | 4 | L | G12 + capability gate | Opt-in | Useful stair editor | Connected load path |
| FS-ROOF-002 | P1 before solver | 3D support/DOF gate; A2-10 | 4 | 4 | M | G13 | Isolated policy | Clear support suggestions | Stability boundary |
| FS-ROOF-001 | P2 | Steel sections/roof solver integration | 4 | 4 | L | ROOF-002 + material contract | Opt-in | Steel roof scope | Material/load correctness |
| FS-REPORT-002 | P1 delivery | Packaged PDF, table rendering | 4 | 3 | M | G17 | Isolated view/IPC | Usable PDF | No clipped evidence |
| FS-REPORT-001 | P2 | Evidence-driven report | 5 | 4 | L | Results/provenance | Additive | Reviewable report | Governing source |
| FS-UI-001 | P2/P3 | Property origins/status/redundancy | 4 | 3 | M | Effective-value rules | Small UI changes | Fewer scope mistakes | Transparent inputs |
| FS-DETAIL-001 | P2 | Quantity classes + rebar contract | 4 | 4 | L | Domain quantities | Additive | Honest BOM/BBS | Traceable estimates |
| FS-DETAIL-002 | P3 | Approved detailing/Revit rebar | 5 | 5 | XL | Approved design/rebar | Reviewed proposals | Shop drawing readiness | Fabrication traceability |
| FS-ANALYSIS-001 | P3 | OpenSees isolated static benchmarks | 4 | 3 | L | Validated adapter contract | Optional | Independent solver | Formulation cross-check |
| FS-OPT-001 | P4 | QUBO proposals + reanalysis | 3 | 3 | XL | Validated deterministic evaluator | Never auto-apply | Options | Constraint compliance |
| FS-IMPORT-001 | P3 | General EDB/STD/Tekla reconciliation | 4 | 4 | XL | ID/result contract | Candidate import only | Round-trip modeling | Change traceability |
| FS-CLOUD-001 | P4 | Auth/private cloud projects | 3 | 4 | XL | Explicit multi-user scope | Separate transport | Collaboration | Access/evidence control |

## 25. Phased Execution Roadmap

These are dependency gates, not promises of calendar duration. Every phase is completed by evidence, not by the presence of a tab.

### Phase 0 - Freeze and reproduce

- **Goal/why now:** Prevent the improvement effort from treating current incorrect outputs as gold.
- **Dependencies:** Current source and existing fixtures only.
- **Modules:** Tests/fixtures and audit evidence; no production model migration.
- **Deliverables:** Source/model hashes, reproduced A2 cases, accepted vs invalidated evidence matrix.
- **Tests:** G01/02/05/06/09/14/15; source and existing fixture smoke.
- **Exit:** Each P0 has an executable failing case and a defined correct result/status.
- **Risks:** Freezing stale files; mixing historical and current source.
- **Roadmap alignment:** Protect MODEL-01/02 and SAVE-01; qualify ANALYSIS-03/IMPORT-01.

### Phase 1A - Numerical and status correctness

- **Goal/why now:** Repair incorrect values and acceptance states before expansion.
- **Dependencies:** Phase 0; existing pinned PyNite environment located/provisioned in a later implementation task.
- **Modules:** run-pynite.py, analysis-inputs.js, solver-roundtrip.js, compare-gravity-results.js, updateLoadSummary.
- **Deliverables:** Correct units, finite validation, omission block, incomplete audit state, floor totals and zero-reference rule.
- **Tests:** P0 cases now pass; complete supported requests remain accepted; save geometry unchanged.
- **Exit:** No unsupported/missing evidence can be called a complete validated run; numerical benchmarks within independently set tolerances.
- **Risks:** Earlier expected outputs were wrong; update baselines only after independent comparison.
- **Roadmap alignment:** Reopen ANALYSIS-03 and IMPORT-01 acceptance; improve ANALYSIS-02.

### Phase 1B - Mechanical equivalence

- **Goal/why now:** Preserve the real arrangement through each analytical adapter.
- **Dependencies:** Units/validation fixed.
- **Modules:** CSI projection, PyNite mapping, section/local-axis/offset utilities; ETABS/STAAD regression only where touched.
- **Deliverables:** Supported-feature manifest; beam/column/stair mappings; explicit rejected features.
- **Tests:** G07/G08/G10/G12; native geometry and mechanical response, not only extrusion.
- **Exit:** Each advertised adapter feature is mapped and verified or visibly blocked.
- **Risks:** Double-applied offsets; altered clear length/self-weight; incompatible diaphragm/mesh assumptions.
- **Roadmap alignment:** MODEL-02, STAIR-01, ANALYSIS-03.

### Phase 2 - Provenance, bridge and release evidence

- **Goal/why now:** Tie every delivered result to the exact model and trusted execution.
- **Dependencies:** Stable snapshot semantics; can proceed alongside 1B for isolated transport work.
- **Modules:** Existing request/jobs, revisions, Electron main/preload, release manifest, CI.
- **Deliverables:** Semantic fingerprint, typed EDB transport, run directories, stale detection, artifact manifest.
- **Tests:** Unsaved edit invalidation, no-op save equality, unrelated EDB rejection, packaged PDF/export, cancellation.
- **Exit:** Installed/source/web candidates are individually identifiable; model and result identities survive exchange.
- **Risks:** Hash normalization errors; transport regression; accidentally shipping dirty/untracked artifacts.
- **Roadmap alignment:** SAVE-01, RELEASE-01/02, DOC-01, IMPORT-01.

### Phase 3 - Finish practical modeling integrations

- **Goal/why now:** Complete useful wall/stair/roof editors through loads and solver handoff.
- **Dependencies:** Load ledger, capability/geometry gates.
- **Modules:** walls, stairs, roof-frame, plan/3D UI, solver adapters.
- **Deliverables:** Wall receiver and opening/lintel mapping; stair representation choice; steel properties and six-DOF roof supports/releases.
- **Tests:** G11/G12/G13; opt-in/off; .fstr persistence; native load/geometry readback.
- **Exit:** Every opted-in member/load either reaches a verified receiver or blocks with a specific reason.
- **Risks:** Coarse and explicit wall double counting; roof mechanisms; duplicated stair self-weight.
- **Roadmap alignment:** WALL-01, STAIR-01, ROOF-01.

### Phase 4 - Results, scenarios and reports

- **Goal/why now:** Turn solver evidence into engineer-reviewable comparisons.
- **Dependencies:** Phase 2 result identity and validated adapter scope.
- **Modules:** Result schema/store, import UI, scenarios, report.
- **Deliverables:** Signed/stationed results, governing combinations, immutable scenario branches, current/stale report sources.
- **Tests:** G15/G17/G18; negative extrema, missing data, scenario isolation, PDF pagination and font.
- **Exit:** A displayed demand can be traced to member/location/combo/run and source assumptions.
- **Risks:** Applying results as geometry; carrying approval to a changed scenario.
- **Roadmap alignment:** IMPORT-02, DOC-01; staged design integration.

### Phase 5 - Native BIM delivery

- **Goal/why now:** Produce useful editable Revit structure from governed geometry.
- **Dependencies:** Existing strict IFC gate, fixed Revit matching; not dependent on full optimization/rebar.
- **Modules:** Revit manifest/add-in, ID mapping, IFC/DXF.
- **Deliverables:** Native columns/beams first, then floors/openings/foundations; per-category audit.
- **Tests:** Revit 2027 licensed fixture, repeat import, conflict/rollback, exact levels and solids, preserved host data.
- **Exit:** Supported native categories editable and traceable; unsupported categories disclosed.
- **Risks:** Family availability, coordinate origin, duplicate geometry, Revit-version compatibility.
- **Roadmap alignment:** REVIT-01, FND-01, DOC-01.

### Phase 6 - Approved reinforcement and quantities

- **Goal/why now:** Build fabrication outputs from approved reinforcement intent.
- **Dependencies:** Design-result source and EOR-approved detailing rules.
- **Modules:** RebarHandoff, BBS/BOM, report/drawing, Revit rebar.
- **Deliverables:** Explicit bar geometry, hooks/bends/laps, quantities and source marks; measured-versus-estimated ledger.
- **Tests:** Independent cut-length examples, host/cover/shape checks, openings and reinforcement changes, native rebar acceptance.
- **Exit:** Every issued BBS row maps to approved bar/set and host revision.
- **Risks:** Code/detailing interpretation, congestion and anchorage beyond automated checks.
- **Roadmap alignment:** DETAIL-01 and later DETAIL-02.

### Phase 7 - Optional analysis/optimization/cloud growth

- **Goal/why now:** Add requested engines and collaboration after their prerequisites, with independent delivery tracks.
- **Dependencies:** Validated adapter/results for OpenSees; deterministic evaluator/catalogs for QUBO; separate access-control design for cloud.
- **Modules:** Optional adapters, proposal evaluation; backend only for approved cloud scope.
- **Deliverables:** Isolated static/modal benchmarks; non-applying optimization proposals; secured project ownership if approved.
- **Tests:** Engine/version benchmarks, constraint/reanalysis checks, access isolation/recovery.
- **Exit:** Each optional capability has its own acceptance envelope and does not weaken core modeling.
- **Risks:** Scope expansion, unsupported analysis formulations, multi-user conflicts.
- **Roadmap alignment:** ANALYSIS-04, OPT-01, CLOUD-01, later Tekla import.

## 26. First 10 Implementation Tasks

These tasks are proposed for the next authorized coding run; they were not implemented by this audit.

| Order | Task / small boundary | Definition of done |
| --- | --- | --- |
| 1 | Add unit and displacement regression using runner property translation | Test fails on current E/G, with independent expected kN/m2 and axial/bending displacement |
| 2 | Correct E/G and verified section-property basis | G01/G02 pass on required PyNite; no old result rescaling |
| 3 | Block required missing geometry/load mapping | Missing W1 and rejected slab/section produce BLOCKED/INCOMPLETE with IDs before accepted results |
| 4 | Fix incomplete ETABS comparison and numeric parsing | Missing/null/boolean/fractional evidence never green; existing complete fixtures still work |
| 5 | Fix zero-reference comparison and rename load comparison | 100 vs0 fails; actual support reactions tested separately |
| 6 | Fix finite support construction | Invalid x/z cannot produce SUP-1; legitimate zeros accepted |
| 7 | Replace current-floor-times-floor-count dashboard calculation | Independent floors total correctly; zero live, GF exclusion, voids and deleted members tested |
| 8 | Reject unsupported PyNite offsets/slopes until implemented | Source feature produces explicit unsupported status; valid zero-offset baseline runs |
| 9 | Connect model fingerprint to export/import evidence | Unsaved edit makes old result STALE; display-only edits do not |
| 10 | Replace renderer ETABS script transport with trusted builder request | Isolated packaged smoke creates exact expected dated EDB; arbitrary script/unrelated output rejected |

Task 8 is an immediate scope guard, not the final offset implementation. Follow with the Phase 1B equivalence tests and support the feature deliberately.

Recommended review checkpoints: tasks 1-3 numerical integrity; tasks 4-7 validation/totals; tasks 8-10 adapter scope/traceability. Keep code changes and acceptance evidence focused enough to review independently.

## 27. What Not to Do

- Do not replace current IDs or frozen contracts because v1 overlooked them.
- Do not fix column orientation by globally rotating every section or applying beam cardinal 8 to columns.
- Do not treat face trimming, eccentricity and rigid end regions as interchangeable.
- Do not accept an FE model solely because vertical reactions balance.
- Do not use a percent comparison against zero without an absolute rule.
- Do not infer support fixity, wall load transfer or diaphragm behavior from appearance alone.
- Do not release PyNite force/displacement acceptance from the current stored run.
- Do not imply this audit reinstalled FS, checked live GitHub/Vercel or opened Revit.
- Do not label a manifest as an RVT file or native rebar model.
- Do not delete unrelated Revit template levels or overwrite user comments.
- Do not combine all dirty working-tree changes into one release.
- Do not start cloud/auth or a general database migration as a prerequisite to fixing local numerical defects.
- Do not reopen SolverLink. It remains retired and outside scope.

## 28. Open Questions for Michael / Engineer Decision

Only these engineering/product choices need decisions; ordinary code corrections above do not require choosing a new architecture first.

1. **Support/soil model:** Which scenario uses fixed bases, springs or foundation-designed supports? Current auto-fixed base policy is not a geotechnical conclusion.
2. **Physical/analytical connection assumptions:** Which offsets transmit eccentric moments, and what rigid end-region policy is intended? Keep physical coordinates unchanged.
3. **Diaphragms:** For each floor, rigid/semi-rigid/none; openings and disconnected floor portions need explicit treatment.
4. **Walls:** Should explicit drawn walls replace coarse floor wall load, and how should partly supported wall length distribute?
5. **Stairs:** Shell/frame participation or equivalent reactions for the first supported workflow; avoid duplicate representations.
6. **Roof:** Separate trusses/frames, bracing and support/release directions; automatic suggestions remain reviewable.
7. **Mass and lateral design:** Occupancy-specific live-mass inclusion, lateral cases and relevant design assumptions; no automatic final-code assertion.
8. **Revit scope:** Native columns/beams first is proposed; required family library and treatment of existing host objects need agreement.
9. **Rebar issuance:** What design evidence and review are required before a bar schedule is approved?
10. **Comparison tolerances:** Define by quantity and engineering purpose, with an absolute tolerance near zero. Require an explanation for systematic self-weight differences.
11. **Scenario approval:** Which outputs are for as-drawn/as-built/permit/future/strengthened states, and who may issue each?
12. **Public release:** Confirm the intended desktop/web candidate only after exact build and native acceptance evidence is assembled.

## 29. External Research Needed Later

No web/competitor or code-standard research was conducted. This audit inspected local source, installed library code, tests and saved artifacts.

Later focused research:
- pinned PyNite 3.0.0 local axes, J, offsets/rigid links, quad mesh and cancellation behavior;
- CSI insertion-point stiffness transformation versus display offsets and end-length offsets;
- ETABS native load/mass/diaphragm and result-table version compatibility;
- STAAD local-axis/offset/support reaction readback and foundation handoff;
- Revit 2027 native structural family, analytical member and rebar APIs;
- Tekla SD and SAP2000 supported APIs/interchange, licensed automation scope;
- applicable structural load/design/detailing provisions selected by the EOR;
- reinforcement shape, bend/lap/development and quantity conventions;
- OpenSees formulation-specific benchmarks;
- constrained section optimization with deterministic reanalysis;
- Electron signing/update distribution and a separate cloud security design.

Research should resolve a named implementation decision or acceptance test, not restart a broad competitor survey.

## 30. Principal-Architect Recommendation and Evidence Record

The best route is to preserve the existing modeling and native export investment while repairing the specific numerical and acceptance failures found here. Start with the ten bounded tasks, extend the current snapshot contracts, and finish wall/stair/roof and native Revit features through verified adapters.

Do not put months of schema migration ahead of a missing factor of 1,000 or an incorrect green MATCH. Equally, do not rush those fixes into an installer without regression of the columnation, offsets, independent floors and save/recovery work that users already depend on.

### What this report supersedes

Use v2 for priorities, runtime availability and acceptance scope. V1 remains an archived assessment. The working roadmap should later link to v2 and reopen the named ANALYSIS/IMPORT gates; it was not edited in this report-only task.

### Evidence identity

Selected SHA256 values captured during this audit:

~~~text
v3/index.html
4783a5a3c3e2db51da0fb21911f5212d1ed77224e208f8fb26425f3b85dcac04

v3/tools/run-pynite.py
a58d7a2293a0f69e57d1e32f6de7f0e56a4b4b48d46c123b605ceee0bd0f9ee1

v3/solver-roundtrip.js
9b8f9f433d1256b642f3226576552dd1c1d276eec642757366c20f293c88c73b

desktop/main.cjs
7bbd994fe4d26e608185df98506a1bc22bf764c510a6ad14d1360229098003a7

Predecessor v1 report
9c6188ad96a5dc9450b49dd50063e328509f75a3f220ca72697ea00f4d35f439
~~~

V1's aggregate hash has no reproducible algorithm/file-list record in that document; this audit does not rely on it.

### Reproduction anchors

- Source regression: node v3/tools/check-fs.js --no-browser.
- IFC command and numerical result: Section 13.
- Round-trip probe: call FSSolverRoundTrip.buildETABSAuditRecord with one matching story and matching foundation policy, while omitting counts/levels/analysis/provenance. Actual MATCH is recorded in A2-04.
- Dashboard probe: execute the actual updateLoadSummary in an isolated Node VM with two floors, netArea=10, slabThickness 100 then 200, LL=0, density=24, no column/beam weights. A2-05 contains actual and expected outputs.
- Runner probe: Python -B with runpy.run_path, invoking build_material_and_sections/add_loads/frame_endpoints/add_frame_members against a recording object. No PyNite solve or version-gate bypass is needed to reproduce call arguments.
- Invalid support probe: FSAnalysisInputs.build with invalid x/z1, valid y/base; A2-06 records the returned support/readiness.
- Roof probe: deriveSupportAssignments with same XY and distinct Z; A2-10 records collapse.
- Comparison probe: difference(100,0), then current percent-tolerance expression; A2-07 records the false pass.

### Limits and completed scope

This report provides a source-based audit plus explicit behavioral probes and strict validation of an existing IFC. It does not claim a fresh full browser, packaged desktop, native ETABS/STAAD/Revit, signed installer, security exploit, performance benchmark or pinned PyNite 3.0.0 execution.

Python is available; the checked system PyNite is 1.6.2, and the required 3.0.0 isolated environment was not located or installed during this audit. The runner version gate remains intact. Existing generated artifacts were read, not overwritten.

**Deliverable:** this new v2 report. Existing source, v1, project models and acceptance artifacts remain preserved. No commit, push, installation, deployment or external solver modification was performed.

## 31. Post-Audit Phase 1A Implementation Status

This section records work performed after the audit was issued. It does not replace the findings above or convert historical solver artifacts into new acceptance evidence.

### Implemented in the local candidate

- `v3/tools/run-pynite.py` now converts concrete E/G from MPa to the governed kN/m2 unit system before passing stiffness to PyNite, and reports both source and solver-unit values.
- PyNite now blocks before analysis when frame/slab/support geometry is skipped or when a load assignment cannot be mapped. The source IDs and reasons are retained in the blocked message; no nearby-member guessing is performed.
- `v3/engine/analysis-inputs.js` now rejects invalid base-column coordinates instead of coercing them to zero and exposes the affected column IDs as validation blockers.
- `v3/solver-roundtrip.js` now rejects booleans and fractional counts, distinguishes `INCOMPLETE` evidence from `MATCH`, and requires analysis, modal, foundation and provenance evidence for a complete green comparison.
- The dashboard load summary now sums each governed floor's actual slab thickness, slab area, live-load intensity and generated beam self-weight. It no longer multiplies the currently displayed thickness by the floor count or replaces an explicit zero live load with a default.
- `v3/tools/compare-gravity-results.js` preserves signed STAAD values, compares explicit magnitudes, and applies an explicit absolute tolerance when the reference is zero.
- `v3/tools/check-super-improvement.cjs` freezes focused regression cases and is included in GitHub Actions source validation.

### Evidence after implementation

- `node v3/tools/check-super-improvement.cjs`: PASS.
- `node v3/tools/check-fs.js --no-browser`: PASS.
- Python syntax compilation of `v3/tools/run-pynite.py`: PASS.
- `git diff --check`: no whitespace errors; Git emitted only the existing LF/CRLF normalization warnings.
- The broader browser regression did not reach app assertions in this environment: CDP stopped at `Runtime.enable` after the browser frame closed. This remains an environment gate, not a passed browser acceptance.

### Acceptance state change

The stored Bacacay PyNite result dated before this implementation remains historical and must not be reused as a post-fix result. `ANALYSIS-03` is therefore reopened until the pinned PyNiteFEA 3.0.0 run is regenerated, then compared against an independently accepted reference with member-force and displacement checks. `IMPORT-01` is locally verified for complete/partial status semantics, while native EDB readback remains a separate acceptance gate.

No commit, push, installer update, Vercel deployment, or native solver/Revit run was performed in this implementation slice.

### Phase 1B boundary added after the Phase 1A repair

The local candidate now carries `FutolStructure.AdapterFeatureManifest.v1` for the PyNite adapter. The supported baseline is limited to horizontal frame members, horizontal quad slabs, explicit base restraints, and governed gravity loads. Nonzero physical member joint offsets, vertical insertion offsets, and sloped members are reported with source IDs and block the run before analysis in both the JavaScript adapter and the direct Python runner. This prevents a mechanically incomplete PyNite result from being presented as equivalent to the FutolStructure physical model.

Focused regression result:

- zero-offset baseline: `SUPPORTED_BASELINE` / `READY_FOR_RUN`;
- physical joint plus vertical insertion offset: `BLOCKED`;
- sloped member: `BLOCKED`;
- source and Python runner contracts: passed.

This is a scope guard, not the final offset implementation. The next Phase 1B gate is a dedicated equivalent-model fixture proving that analytical centroid joints, physical face geometry, local axes, clear length, and self-weight remain consistent when the supported offset mapping is added.

### ETABS return-path improvement

The existing ETABS audit JSON already contained native geometry and columnation evidence, but the FS importer previously reduced it to counts, levels, analysis, modal, foundation, and provenance checks. The importer now compares the builder's `analyticalGeometry.nativeGeometryAudit` against the current FS column and beam analytical payload when that evidence is present. It reports missing members, endpoint deltas, native geometry failures, and native frame/columnation parity failures in a read-only UI section. This makes the canonical-versus-analytical mismatch visible in the FS>ETABS>FS evidence cycle.

This still is not a general `.edb` parser or automatic model rewrite. The controlled ETABS return artifact is the dated `_audit.json` produced by the governed OAPI builder; direct EDB/E2K geometry import and STAAD `.std` import remain separate adapter work.
