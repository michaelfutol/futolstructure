# FutolStructure Agent RAG

Last updated: 2026-04-26

This file is the repo-local retrieval source for Codex/agents working on FutolStructure.
Read this before continuing refactor, debugging, report work, export work, or demo preparation.

## Retrieval Protocol

1. Read this file first.
2. Run `git status -sb`.
3. Preserve the current branch and dirty worktree.
4. Do not commit, push, or create a PR unless explicitly instructed.
5. Work narrowly from the current branch state.
6. Use `v3/_logs/PROGRESS.md` only for older historical context.
7. Prefer grounded fixes over broad rewrites.

## Current Agent Operating Mode

- Claude Code should no longer be treated as an active dependency or required collaborator.
- `v3/_logs/CLAUDE_CODE_SHARED.md` is historical handoff context only unless the user explicitly reactivates it.
- Codex should continue from the local repo state, this RAG file, and user-provided conversation summaries.
- Lum's guidance can be used as product/roadmap context, but code changes must still be grounded in the current FutolStructure implementation.

## Current Branch

- Repo: `michaelfutol/futolstructure`
- Local path: `D:\projects\futolStructure 04-14-26\tributary-pro-v2.0` for the current open workspace. Intended renamed path is `D:\projects\futolStructure 04-14-26\futolstructure` once VS Code/Codex releases the folder lock.
- Branch: `recovery/fs-clean-reapply-offsets`
- Last approved pushed checkpoint:
  - Commit: `f545cfa998625323e88f14132d6b33c4466388e8`
  - Message: `feat: add FSTR format and TAN report scaffold`

## Current Product Name

- Working shorthand: `FS`
- Current product: `FutolStructure`
- Possible future product name: `FutolRCStructures`
- File format: `.fstr`
- Manual calculation/report identity: `TAN` = `Technical Analysis Notes`
- Professional TAN title: `STRUCTURAL DESIGN AND ANALYSIS CALCULATIONS`
- TAN subtitle: `Technical Analysis Notes (TAN)`
- Do not use `Technical Analysis Notebook` in professional-facing report titles.

## Product Doctrine

FutolStructure is a geometry-first reinforced concrete structural modeling, tributary/load-intent, and solver-handoff program.

It is not primarily a holistic permit-pack app.

Core role:

- structural geometry modeling
- gravity load path intent
- tributary analysis visualization
- member/load governance
- schedules and preliminary quantities
- STAAD/ETABS/IFC/DXF/Revit-handoff direction
- standard report and TAN/manual calculation scaffold

Visualization doctrine:

- FutolStructure should become visually professional before chasing full finite element analysis.
- The existing 3D geometry/topology engine is valuable because it already has member coordinates, slab surfaces, structural hierarchy, and generated topology.
- Near-term visualization work should polish rendering and add engineering-grade overlays without pretending to be true ANSYS-level FEA.
- Pseudo stress/utilization overlays are acceptable when clearly labeled as load/reaction/utilization visualization, not finite element stress results.
- Full finite element meshing/contour/deformation is a later optional layer, not a live-test stabilization requirement.

Not the core role:

- raw messy plan cleanup
- raster tracing as analysis truth
- final compliance solver replacement
- all-discipline permit pack generator

Ecosystem separation:

- BOOM / Plan Cleaner owns dirty PDF/DWG/DXF cleanup and layer doctrine.
- FutolStructure consumes clean structural geometry and computes/governs structural intent.
- STAAD / ETABS / SAFE / STAAD Foundation remain recognized solver/compliance tools.
- Future holistic permit pack can be another app/version that combines disciplines.

## Engineering Discipline

Rules unless user explicitly overrides:

- Do not commit.
- Do not push.
- Do not create PR.
- Do not merge to main.
- Stop at diff/report unless explicitly instructed.
- Keep edits narrow.
- Avoid broad UI overhaul.
- Avoid fake solver truth.
- Clearly warn when a feature is scaffold/preliminary only.

## Current Reliable Envelope

FS is currently most suitable for:

- regular orthogonal RC residential buildings
- 2 to 3 storeys for validation/demo
- simple rectangular bay grids
- suspended upper floors and roof slab
- no-GF suspended baseline when ground floor slab is ground-bearing
- basic column/beam/slab/footing generation
- tributary gravity-load visualization
- preliminary member schedules
- `.fstr` save/load
- STAAD export as the preferred solver path
- standard report and TAN scaffold

Use caution for:

- 5 to 10 storey modeling-only demos
- irregular layouts
- transfer beams
- large cantilevers
- planted columns
- custom/stair beams
- non-regular solver exports

Do not claim as complete yet:

- final RC design
- final BBS/cut-bend
- full ACI 318/NSCP detailing
- final seismic/lateral/drift design
- final ETABS solver-result reconciliation and engineering acceptance
- full SAFE/STAAD Foundation handoff
- complete Revit model authoring

## Active Local Work Since Last Checkpoint

`v3/index.html` has uncommitted local changes after commit `f545cfa`.

Known local improvements already made:

- Plot button visible in toolbar.
- TAN button visible in toolbar.
- `.fstr` support exists from checkpoint.
- Plan/report paper sizes split:
  - Plans: `20x30`, `A3`, `A2`, `A1`
  - Reports/spreadsheets: `A4`, `Letter`, `Legal/Long`
- Tributary view presentation is being refined toward engineering-sheet style.
- Concrete strength display includes MPa and psi.
- Beam Loads panel table raw-HTML bug fixed.
- Beam Loads panel now displays:
  - slab/wall line load
  - actual BxH self-weight line load
  - total reaction including factored self-weight

Before committing any future checkpoint, verify these changes are intentional.

## One-Week Demo Target

Target period: 2026-04-26 to 2026-05-03

Goal: FS Demo-Ready RC Residential Modeler.

Demo workflow should show:

1. Create a regular 2 to 3 storey RC building.
2. Edit spans, floors, columns, beams, slabs, and footings.
3. Run tributary gravity analysis.
4. Show Layout, Tributary, Foundation, 3D, schedules.
5. Save/load as `.fstr`.
6. Export a usable STAAD model.
7. Generate standard report and TAN scaffold.
8. Plot current plan with title block.
9. Clearly show limitations/warnings.

Demo files to prepare later:

- `Demo_01_2Storey_Regular.fstr`
- `Demo_02_3Storey_Residential.fstr`
- `Demo_03_STAAD_Handoff.fstr`

Demo outputs to capture:

- Layout plan screenshot
- Tributary plan screenshot
- Foundation plan screenshot
- 3D screenshot
- Beam/column schedule screenshot
- Standard PDF report
- TAN report
- STAAD export file

## Lum Roadmap Context - Visualization and FEA Direction

Latest user-provided Lum guidance:

- Do not chase ANSYS-level finite element visuals immediately.
- First become reliable, stable, professional, visually clean, and export-correct.
- FutolStructure already has the important foundation for future FEA:
  - geometry generation
  - member topology
  - slab surfaces
  - beam/column coordinates
  - structural hierarchy
  - nodes/connectivity/topology concepts
- Phase 1: professional 3D visualization.
  - ambient lighting
  - edge highlighting
  - soft shadows
  - smooth transparency
  - proper slab edges
  - beam/column face shading
  - hover highlights
  - cleaner lineweights
  - stress-like visual overlays only when clearly labeled
  - animated load arrows
  - deformation amplification display only from valid result data
- Phase 2: pseudo structural visualization before true FEA.
  - beam utilization heatmap
  - footing pressure heatmap
  - tributary intensity color
  - column load gradient
  - slab load contour approximation
  - clear labels that these are tributary/load/utilization visualizations, not finite element stress results
- Phase 3: real finite element layer, later.
  - meshing
  - shell elements
  - node connectivity
  - stiffness matrix solving
  - interpolation
  - contour extraction
  - displacement fields
- Strong later feature: import STAAD reactions/displacements and display deformed shape in FutolStructure.

Recommended sequence:

- M0-M5: current stabilization and professionalization.
- M6: STAAD export truth.
- M7: visualization polish.
- M8: pseudo stress/utilization overlays.
- M9: optional FE slab meshing layer.
- M10: hybrid AI-assisted structural review.

## Milestone Schedule

### M0 - Current Live Testing Stabilization

- Fix visible test bugs immediately.
- Keep browser app usable.
- Ensure Beam Loads and Column Loads are readable.
- Ensure no raw HTML appears in side tables.
- Keep Foundation plan visible.
- Keep `.fstr` roundtrip stable.

### M1 - Member Size Truth

- Column `B/X` means plan X direction.
- Column `H/Y` means plan Y direction.
- Beam `B x H` means width x depth.
- Enforce actual member sizes in:
  - Layout
  - Tributary
  - Foundation
  - 3D
  - schedules
  - BOQ/BOM
  - reports
  - TAN
  - exports where supported

### M2 - Tributary Presentation

- Match Layout gridline style.
- Use restrained engineering palette.
- Light slab area fills.
- No heavy text masks.
- Labels must remain readable at zoom.
- Avoid overlap between `A` and `w` labels.
- Prefer beam/column detailed load values in side panel unless selected.

### M3 - 3D Professional View

- Keep stable non-twitchy render loop.
- Use wider ground plane/grid if helpful.
- Keep actual member dimensions visible.
- Add member click/hover info window later.
- Avoid eye-straining colors.

### M4 - Reports and TAN

- Standard report: model summary, load summary, schedules, warnings.
- TAN: old-school manual calculation notes style.
- TAN should include:
  - assumptions
  - formulas
  - substitutions
  - result lines
  - representative beam check
  - representative column load takedown
  - representative footing check
  - simple stress/force illustrations
  - warnings and solver handoff notes

### M5 - Plot and Paper Setup

- Plan sheets:
  - 20 x 30 inch
  - A3
  - A2
  - A1
- Reports/spreadsheets:
  - A4
  - Letter
  - Legal/Long
- Plot current:
  - Layout
  - Tributary
  - Foundation
- Include title block:
  - project name
  - sheet title
  - scale placeholder
  - date
  - revision
  - prepared by
  - checked by

### M6 - STAAD Handoff

- STAAD is the preferred current solver path.
- ETABS 22 OAPI model-builder baseline is validated for native E2K round-trip and gravity/modal analysis in ETABS 22.6.
- SAFE handoff uses CSI's supported ETABS `Story as SAFE V12 .f2k` export; direct browser-authored F2K remains out of scope until validated against SAFE.
- Do not silently export unsupported non-regular beams.
- Report export exclusions honestly.

### M7 - Load Governance

- Keep old global wall load for backward compatibility.
- Add explicit wall load objects.
- Add explicit point load objects.
- Wall loads should eventually include:
  - type: external/internal/parapet/partition
  - support mode
  - thickness
  - height
  - unit weight
  - finish allowance
  - opening deduction
  - lintel allowance
  - geometry reference
- Point loads should eventually include:
  - water tank
  - truss reaction
  - roof frame reaction
  - equipment
  - target: joint/beam/column/slab-warning-only

### M8 - RC Design and Detailing

Future goal:

- ACI 318 / NSCP aware beam design
- column axial/slenderness/interaction checks
- slab one-way/two-way design
- footing bearing, punching, one-way shear, flexure
- development length
- hooks and bends
- laps
- BBS
- cut and bend schedule
- structural shop drawing/detailing support
- practical construction detailing, not only code equations
- future Revit detailing handoff after FS produces trustworthy bar intent

Do not claim complete until implemented and validated.

## Naming Conventions

Preferred future conventions:

- Cantilever beam: `CB-{floor}-{gridColumn}`
  - Example: `CB-2F-D3`
  - Means cantilever beam on floor `2F` connected at column/grid `D3`.
- Edge beam: `EB-{floor}-{gridStart}{gridEnd}`
  - Example: `EB-2F-D3D4`
  - Means edge beam on floor `2F` spanning adjacent grid points `D3` to `D4`.

Existing legacy/internal IDs may still exist and must be migrated carefully:

- `BX-*`
- `BY-*`
- `BCX-*`
- `BCY-*`

Do not rename broadly without compatibility checks.

## Known Technical Gaps

### Loads

- Beam self-weight is calculated from actual BxH and added to column loads.
- Beam Loads panel now displays self-weight, but analysis path must avoid double-counting.
- Slab self-weight is based on slab thickness x concrete density.
- Explicit wall load objects are not yet fully mapped into analysis/export.
- Point loads are not yet fully mapped into analysis/export.

### Non-Regular Beams

Current classes:

- regular
- custom/added
- stair-ready
- cantilever
- cantilever_edge

Known truth gap:

- schedules/report can see more beams than exports can safely handle.
- custom column-to-column beams are the first plausible exportable subset.
- beam-to-beam custom beams need node insertion and host beam splitting.
- free-end beams need support doctrine.
- cantilever and cantilever_edge need endpoint/load/export contracts.

### ETABS

- The former hand-written E2K exporter was invalid and failed ETABS 22.6 import; it is superseded by the ETABS 22 OAPI builder.
- The OAPI builder creates a real `.edb`, asks ETABS to export its own native `.e2k`, and writes a model-count audit JSON.
- Olango baseline validation passed ETABS 22.6 native E2K round-trip and analysis with zero negative stiffness eigenvalues.
- Current validated scope is geometry, concrete/rebar materials, frame/slab sections, fixed base supports, gravity load patterns, area loads, wall line loads, and ULS combinations.
- Wind, seismic, diaphragms, detailed mass-source governance, solver-result reconciliation, and final member design remain engineer-review items.
- SAFE remains a supported handoff through ETABS `Story as SAFE V12 .f2k`; do not claim a direct SAFE writer until SAFE import is independently validated.

### Revit / IFC

- IFC2x3 Coordination View geometry handoff is implemented from the same corrected active-model payload used by ETABS and STAAD.
- Current IFC scope includes every active column, regular/cantilever/custom beam, and exact active slab polygon, organized by building storey with concrete material and `Pset_FutolStructure` source metadata.
- IFC schema validation and geometry creation passed independently in IfcOpenShell 0.8.5 for the corrected Olango model: 2 storeys, 32 columns, 80 beams, 42 slabs, and 154/154 products with valid geometry.
- Autodesk Revit `Open IFC` / `Link IFC` remains an explicit validation gate. Do not claim Revit import success until a full Revit executable is installed and the generated file is opened or linked there.
- Revit Structure can model concrete members and rebars, but realistic ACI/NSCP rebar detailing is difficult and time-consuming when done manually.
- FS should eventually become the RC detailing intent engine before trying to automate Revit rebar:
  - beam main bars
  - stirrups
  - column vertical bars
  - ties/confinement zones
  - footing mats and dowels
  - slab bars
  - hooks, laps, development lengths
  - BBS and cut/bend schedule
- Revit should later receive structured geometry/detailing data through IFC, schedules, Dynamo, or a Revit add-in/API bridge.
- Do not claim Revit-ready rebar automation until FS has validated detailing rules and export path.

### Permit Pack

FS can support structural/civil permit outputs.
It should not become the all-discipline permit pack app.
Future holistic permit pack should be separate or later integrated at ecosystem level.

## User Testing Mode

The user is testing real structures and will report bugs.
The active test set is three real residential projects needed for building-permit submission within the next week.

Current testing priority:

- Keep the latest local build open in browser when requested.
- Treat user-reported issues as highest priority.
- Fix small blockers quickly.
- Keep changes narrow and report clearly.
- Prefer structural/civil reliability over cosmetic polish.
- Do not overclaim permit/submission readiness.
- FS remains the structural program; broader all-discipline permit pack remains future ecosystem work.

## Active Live-Test Issues

- 2026-05-12 FS-038F scope: remaining cantilever problem is now treated as slab ownership and tributary source-of-truth correction, not export/report work. No commit, push, PR, feature expansion, STAAD/ETABS export edits, TAN edits, or report edits for this pass. Tributary regions must be generated from final active slab polygons/bounds only. Cantilever slabs must be independent closed regions, not parent-bay overlays. No tributary polygon should extend outside its owning slab polygon. Beam self-weight must remain separate from tributary slab area; tributary area represents slab load contribution, while beam DL/member self-weight is added separately to reactions.
- 2026-05-12 FS-038F implementation note: cantilever slab final render/analysis bounds now drive slab load area, tributary polygons, area-balance display, labels, and hit-testing. Cantilever slab ownership is conservative single-source for now: the final clipped cantilever slab polygon is owned once by its resolved main support beam. CB/EB members frame the cantilever edge but no longer receive hidden duplicate slab tributary area without visible slice polygons. Synthetic validation for Axis A/B3/Axis 4-style strips produced 100.0% area balance, zero slice-outside-owner violations, and no hidden cantilever beam area.
- 2026-05-12 FS-038G cantilever drafting doctrine: CB/cantilever beams inherit the resolved supporting main beam BxH. EB/edge beams default to 150 mm width, with depth tied to the adjacent main/support beam; narrower 130 mm is only a future engineer-reviewed minimum, not the default. If an EB is explicitly enlarged above 150 mm or carries direct wall/line load, treat it as a load-bearing/designed edge-beam candidate requiring explicit load intent review, not automatic tributary slab-area inflation. Cantilever slab hatch/tributary bounds must terminate at resolved physical faces, not raw centerlines. Where perpendicular cantilever strips meet, generate only the missing corner infill slab and split its tributary ownership between the two adjacent support beams so corners are filled without overlapping double area.
- 2026-05-12 FS-038H local L-corner patch: user screenshot showed remaining local/offset cantilever L-corner issues and `Area Balance = 80.0%`. Root causes were: global corner infill only handled building exterior corners, not local perpendicular cantilever patch overlaps; and `getSlabLoadArea()` still counted void/deleted slabs in area balance even though load distribution skipped them. Patch adds local perpendicular cantilever overlap resolution: parent strip rectangles are trimmed out of the shared corner and one `SC-C-<horizontal>-<vertical>` local corner slab owns that area. Void/deleted slabs now return zero load area. Validation: synthetic local L-corner overlap was converted from two overlapping rectangles into horizontal strip + vertical strip + corner infill with unchanged union area and zero overlap; void-slab test returned 100.0% area balance.
- 2026-05-12 FS-038I CB size inheritance: CB/cantilever side beams must inherit the same-axis main beam they extend, not the perpendicular perimeter support beam. Example right-edge `CB-2F-E3`/`BCX-R-3` extends `B-2F-D3E3`/`BX-3-4`; its `supportingBeamId` may still be the slab perimeter support `BY-5-3`, but its `supportingMainBeamId` must be `BX-3-4` for sizing/drafting. Patch adds same-axis main-beam resolution for top/bottom/left/right CB start/end roles, prioritizes `supportingMainBeamId` in CB size resolution, and re-normalizes CB sizes after regular beam sizing so display, schedule, self-weight, and 3D use the inherited main beam BxH. Validation forced `BX-3-4 = 350x650` and `BY-5-3 = 200x450`; `BCX-R-3` resolved to `350x650`, proving it follows the main beam, not the smaller perimeter support.
- 2026-05-12 FS-038J cantilever hatch/beam-body overlap: cantilever slab hatch/analysis bounds must stop at rendered physical beam faces everywhere, not at raw support centerlines. This matters when the cantilever support resolves inward to a beam such as `B-2F-D3E3` instead of the global exterior line; `columnAlignment = outer` is not enough to infer zero support trim. Patch adds `getCantileverSupportFaceCoord()` using the actual support beam rendered centerline offset and width, then uses that face coordinate for slab bounds and CB/EB support trims. Validation: inward bottom cantilever `SC-B4` supported by `BX-3-4` started exactly at the support beam face with support-beam overlap `0`; a broader sweep across support/side/tip cantilever beams checked 12 related slab-beam pairs and found overlap count `0`.
- 2026-05-12 FS-039 foundation tie-beam face alignment: Foundation plan tie beams should connect face-to-face between actual column stubs. Do not center perimeter tie beams blindly on the raw grid edge or use gridline-only alignment; this can make the tie beam miss the practical column-face band. Patch adds foundation column-rect helpers and draws tie beams from actual column face to column face, with the transverse tie-beam band centered inside the common column-face overlap. Validation intercepted foundation canvas rectangles for a 300 mm column / 200 mm tie beam edge case: top tie beam now runs from `x=0.30` to `x=3.70` and `y=0.05..0.25`, not old grid-edge `y=0.00..0.20`.
- Issue #1: Cantilever local patch display must keep the `CB-*` projection visibly equal to the entered cantilever length, with a dimension label where practical. If `EB` is checked, FS now creates the outside tip edge beam plus the closing/parallel edge beam for the local patch. EB plan rendering must honor `planStartTrim`/`planEndTrim` in both analysis-style and Layout/framing render paths so the EB starts/ends at the faces of CB/adjacent beams instead of visually passing through centerlines. EB tags must stay short (`EB-RF-E1-T`, `EB-RF-E1-C` style); offsets/runs such as `1.20m` belong in dimension text, not embedded in member names. EB default is a practical preliminary 150 mm width, with depth tied to the adjacent main beam; this is not a code-certification rule and still needs engineer/code review before submission detailing.
- Cantilever EB sizing must stay consistent through generation, schedule, and 3D. Do not allow stale `120 x 120` generated/override values to survive sizing. Current doctrine: cantilever edge beams use practical preliminary `150 mm` width and depth from the adjacent main beam, with `400 mm` fallback if no adjacent beam depth is resolvable.
- Cantilever slab void/delete behavior: cantilever slabs should be toggleable to VOID like regular slabs. Because small cantilever/landing panels overlap CB/EB hit zones, click handling should prioritize cantilever slab body hits before structural beam hits. Cantilever tributary labels should show actual `w`, not `w 0.0`, unless the slab is voided.
- Issue #2: One-storey/single-slab modeling must be possible. Removing `RF` should work when the user wants a single remaining floor/slab.
- Issue #3: Real framing plans need beam and column alignment adjustment by axis/gridline, not only one-off member nudges. Current per-column/per-beam offsets help, but axis-level batch alignment remains a needed workflow improvement.
- Issue #4: Cantilever slabs must not always force an outside edge beam. Short flat extensions or landing stubs around 1.0 m to 1.2 m may be slab-only with drip mold; the cantilever/support beam remains, but the outside `EB` should be optional per cantilever span.
- Issue #5: Rebar/BBS schedule tabs need an obvious return path to the active plan view. Browser refresh must restore the working drawing through local autosave instead of falling back to the default 2x2 starter model.
- Foundation/Layout/Tributary canvas tabs should regenerate from the current model state when opened, not only redraw whatever geometry happened to be in `state.beams`/`state.slabs` from the previous tab.
- Foundation linework should remain legible at zoomed-out permit-plan scales; avoid subpixel dashed footings/tie beams that make the plan look blank.
- Issue #6: Cantilever modeling contract: the cantilever value is always the outward projection depth. Along-edge run defaults to the full bay/span, matching the older regular cantilever behavior. Special local/landing patches use the separate `Run` input; `Run = 0` means full span, while `Run = 1.20` with projection `1.20` creates the `1.20 m x 1.20 m` local patch. `Off` only applies when `Run > 0`. The `EB` checkbox only controls whether outside edge/corbel beams are created; unchecked means slab-only outside edge. Visible labels should use `CB-*` for cantilever beams and `EB-*` for cantilever edge beams; legacy internal IDs may remain until migration is safe.
- Issue #7: CB/EB joint representation must stay centerline-true while visually trimming to member faces in plan views. Current pass creates one local CB at the cantilever start line and, if enabled, tip/closing EBs for the local projection. EB preliminary section is 150 mm wide with depth tied to the adjacent main beam where resolvable.
- CB visual length must not cancel normal column-face trimming. The rendered CB should run from support face to cantilever tip, while the stored `span` remains the entered cantilever projection for load/report purposes.
- Issue #8: Cantilever rows now have an `Off` field in meters. This moves the local projection start along the supporting edge span, allowing landing-like patches away from the grid start. Axis-level batch beam/column alignment is still not fully solved; current state has per-member column nudge and beam offset controls plus column flush.
- Hit testing for columns/beams should use the same rendered/flush/nudge geometry as the drawing path. Do not use raw `col.x`/`beam.x1` bounds for member selection after alignment controls are active.
- Bulk alignment control is intentionally type-specific: column context menu can nudge/reset all columns; beam context menu can offset/reset all generated regular beams on the active floor. Do not move beams and columns together from one command, and do not batch-offset cantilever/edge/custom beams until their joint topology is safer.
- Nudge/offset input must use the user-facing plan convention: `+X` moves right, `-X` moves left, `+Y` moves up, `-Y` moves down. Internally the canvas Y axis grows downward, so column Y inputs and horizontal/X-beam transverse offsets must be inverted before applying to model coordinates.
- Column adjustment is now individual by default, with Ctrl-click multi-select for case-by-case groups such as selected exterior columns. Selected columns get an amber outline and the column context menu moves/resets the selected group when opened from one of those selected columns.
- Layout plan labels use full schedule IDs for normal/CB beams, but cantilever edge beams use shorter plan labels without embedding the floor or projection length. Full EB IDs remain available in schedules/reports. Projection dimensions belong as dimension text, not inside member names.
- Cantilever edge beam sizing should not allow stale `120 x 120` values to override the current preliminary rule. EB width defaults to 150 mm, optional 130 mm should require engineer review, and EB depth follows the adjacent main beam where resolvable.
- Closing cantilever edge beams may be described as a cantilever corbel edge subtype for governance/report clarity, but they still remain under the `cantilever_edge`/`EB-*` member class until a solver-safe CCB class is explicitly designed.
- Cantilever tributary slice labels should use the local support run of the cantilever patch, not the full adjacent bay span, so a `1.20 m x 1.20 m` patch displays a realistic local line load instead of a diluted bay-wide value.
- Right-click hit testing must prioritize cantilever slabs before CB/EB members so the slab delete/restore context menu remains reachable even when the panel is small and surrounded by cantilever beams.
- In `Col: Flush`, cantilever closing/corbel edge beams start from the already-flushed outside support face. Do not add another main-beam half-width trim in that mode; otherwise the EB appears to gap away from the support beam.
- When an outside EB is enabled, the cantilever beam visual segment should stop at the inside face of the tip EB to reduce solid-model overlap in Layout/Tributary/3D views. Keep solver centerline metadata separate from this visual/member-face trimming.
- Current CB/EB joint stabilization uses explicit generated render endpoints (`renderX1/renderY1/renderX2/renderY2`) for cantilever beams and cantilever edge beams. Stored centerline geometry, IDs, spans, and support metadata remain unchanged, but Layout/Tributary/3D hit geometry can render CB/EB members face-to-face. Example bottom-edge contact rule: CB runs from support-beam outside face to tip-EB inside face, tip EB starts at CB side face, and closing EB starts at support-beam outside face and ends at tip-EB inside face.
- Future feature request: copy beam layout from the current/source floor to lower, upper, selected, or all typical floors. Options should eventually include custom beams, deleted regular beams, beam offsets, beam sizes, cantilevers, and possibly voids/openings, with warnings if target grids or column availability differ.
- Future feature request: add a dedicated BBS/Rebar Layout Plan view beside the existing BBS table. The plan should show assigned bar marks/bar numbers on the member layout, tied back to the BBS rows and later to ACI/NSCP development length, hooks, laps, bends, and cut-length logic. Do not add this during live-test stabilization unless explicitly prioritized over cantilever/foundation consistency.
- Future feature request: Manual Calculations/TAN tab should eventually show accurate beam analysis figures and data from the model, including representative beam geometry, clear span, tributary slab area, slab/wall/self-weight line loads, total factored line load, support reactions, and diagrams. This is not part of FS-038F; handle later under reports/TAN/manual calculation milestone.
- Future roadmap topic: Automated beam design/calculation sheets for OBO-friendly documentation are feasible and strategically important, but must be built in layers. Separate analysis from design:
  - Analysis data: geometry, clear span, support conditions, load combinations, shears, moments, reactions, deflections, and solver-imported results where available.
  - Design data: required bars, selected bars, stirrups/ties, spacing, cover, development length, hooks, laps, cut lengths, checks, schedules, and BBS linkage.
  - Preferred staged implementation: (M1) manual calculation notebook scaffold, (M2) single representative beam calculation sheet, (M3) single beam detail drawing/elevation/sections, (M4) beam schedule sync, (M5) BBS linkage, then columns, footings, and slab strips.
  - Strategic doctrine: do not try to replace STAAD/ETABS first; become the transparent engineering documentation layer above solver results. OBO value comes from readable assumptions, load path, traceable calculations, organized schedules, and professional beam details/shop-drawing-like sheets.
- Deleted beam truth: `floor.deletedBeams` must affect the generated analysis model, not only drawing/3D visibility. Deleted beams are filtered from `state.beams` before tributary distribution, reactions, and column load accumulation. Cantilever slab/CB/EB generation must not attach to a deleted beam. If the original perimeter support beam is deleted, the cantilever support should resolve inward to the next available parallel beam on that floor. "Available" means the beam ID is not deleted and its two endpoint columns are active on that floor; only if no support beam remains should the cantilever generation be skipped. Restoring the perimeter beam may move the saved cantilever intent back to the original edge support because the cantilever inputs remain in the floor data.
- Cantilever slab delete semantics: deleting a cantilever slab is not the same as marking a regular slab void. It clears that cantilever intent (`cantilevers`, `Run`, `Off`) for the active floor/span, so the cantilever slab plus related CB/EB members disappear from Layout/Tributary/3D/load paths. Regular internal slab deletion still uses `voidSlabs` because those represent openings/void panels. Deleted beams should not be drawn as red ghost members in Layout/Tributary; they should disappear from generated display and calculations, with Undo or future restore controls used for recovery.
- Cantilever boundary occupancy: before creating any CB/EB, resolve whether an active beam already occupies the candidate boundary segment. Active means not deleted and support columns still active when applicable. Reuse existing occupied side/tip/free-edge beams instead of generating duplicate cantilever members. EB should connect between the two effective side supports, whether those supports are generated CBs or existing beams. This prevents overlapping plan lines/labels and keeps cantilever load/support metadata tied to actual framing geometry. Stale `SC-*` cantilever slab IDs must be purged from `floor.voidSlabs`; cantilever slabs are removed by clearing cantilever intent, while regular slab voids/openings remain in `voidSlabs`.
- CB/EB visual face truth: tip edge beams must start/end at the actual face of the effective side support, not the raw centerline. Face resolution must consider generated CB width, reused active side-beam width, beam alignment offsets, and the active column face when the side support lands on a grid column. Structural-plan columns should mask beam linework below their hatch so support joints read as clean column-beam intersections instead of overlapping dashed lines.
- Full-bay cantilever side members are CB continuations on both gridline sides. For example, a left-edge cantilever from gridline 1 to gridline 2 should create/reuse `CB-*A1` and `CB-*A2` as horizontal continuations of the main beams on those axes; only the outside free-edge member is an `EB`. Off-grid/local closing sides may still be represented as EB/corbel edges until a richer local framing class exists.
- Cantilever projection input is the outside slab limit. When EB is enabled, the EB section should sit inside that projection with its outside face at the slab edge, not with its centerline on the slab edge. CB visual segments should stop at the inside face of the EB while stored spans keep the entered projection depth.
- When EB is disabled for a cantilever, the side CB continuation(s) still exist where applicable and should render all the way to the free slab edge. The three exposed slab-only perimeter sides must be shown as clear solid slab edges while the supported side remains governed by the main support beam.
- When EB is enabled for a cantilever, the Layout/framing plan must still show the cantilever slab body under the EB/CB linework. EB is a boundary/member inside the slab projection, not a void that leaves an empty panel.
- 3D cantilever display may differ slightly from 2D drafting trim: CB members should render as full concrete members up to the cantilever slab edge in 3D, while 2D plans may trim CB/EB joints for readable drafting. Cantilever slab boxes should use their full projected panel without visual inset and with stronger opacity/edge outlines so they read as real slabs.
- Future delete architecture: preferred long-term behavior is hard delete from the live model with recovery through undo/redo snapshots. Until that refactor is safe, every renderer/calculation/export path should read active-only filtered geometry. Red deleted ghosts should not appear in normal engineering mode; if needed later, deleted/void debug overlays should live behind a debug mode.
- 2026-05-01 stabilization update: normal Layout/Tributary rendering no longer draws red void/deleted slab ghost panels. `SC-*` cantilever slab IDs are treated as cantilever intent, not regular void slabs; attempting to void a cantilever slab clears the cantilever intent instead of adding it to `voidSlabs`.
- 2026-05-01 3D update: 3D slab boxes now sit above beam tops with stronger opacity and separate cantilever slab color so slab solids read more clearly. 3D CB members trust explicit generated render endpoints; EB-on/EB-off behavior should come from generation instead of being re-extended blindly in the 3D renderer.
- 2026-05-01 corner cantilever update: when two exterior cantilever strips meet at a building corner, FS generates a small corner cantilever slab infill (`SC-C-TL`, `SC-C-TR`, `SC-C-BL`, `SC-C-BR`) only when both adjacent support beams remain on the exterior support lines. Corner load is conservatively shared to the two adjacent resolved support beams; do not treat this as final RC corner-cantilever design.
- 2026-05-02 Codex audit/stabilization update: removed the nested context-menu `toggleBeamDeleted` shadow so beam delete uses the global per-floor deletion path; removed duplicate `window.updateSlabParam` overwrite and kept the undo/clamp/floor-sync implementation; schedule bulk beam/slab deletes now route through `floor.deletedBeams`/`floor.voidSlabs` instead of transient `.deleted` flags; cantilever slab load sharing to side CBs now distributes across active generated side beams; 3D/export floor geometry collectors restore columns and aggregate sizing state after temporary regeneration; derived corner cantilever slabs no longer swallow left-click deletion when no adjacent intent can be cleared; 3D non-cantilever slabs now get a full-extents outline so visual inset does not read as missing slab. Checks passed: `node --check` for engine files, inline-script parse with Node `vm.Script`, `git diff --check` with line-ending warnings only, and Playwright screenshot load of `v3/index.html`.
- FS-040 foundation tie-beam offset extension: Foundation plan tie beams were temporarily wired to inherit the matching generated beam transverse offset (`BX-*` / `BY-*`) through `state.beamAlignmentOverrides`. This proved unsafe because Foundation and floor beam offsets became coupled. Superseded by FS-041.
- FS-041 foundation/beam offset decoupling correction: FS-040 coupling was unsafe because Foundation tie-beam offsets reused `beamAlignmentOverrides`, so Foundation edits moved 2F/RF beams and floor beam resets moved Foundation tie beams. Replaced this with independent `foundationTieBeamAlignmentOverrides` keyed by the foundation tie-beam geometry. Right-clicking a Foundation tie beam now opens a tie-beam offset action that writes only to the foundation store. Layout/Roof regular beam offsets no longer move Foundation tie beams. Cantilever side beams (CB) now ignore their own beam offset overrides and inherit the same-axis supporting regular main beam offset, so CB drafting follows the main beam instead of drifting independently. CB/EB offset controls are hidden; offset the supporting regular beam instead. Browser CDP isolated-profile probe verified: foundation tie offset shifts only Foundation, floor `BX-*` offset does not shift Foundation, Foundation right-click selects `foundationTieBeam`, and `BCY-T-1` inherits `BY-1-1` offset while ignoring its own stale override.
- FS-042 recovery note after workspace contamination/reset: local uncommitted `v3/index.html` changes were lost by a `reset: moving to HEAD` event on 2026-05-14, and no GitHub/stash copy contained the missing offset/cantilever fixes. Recovery restored the safety-critical pieces from RAG doctrine: Save/Undo/Redo controls, persisted `columnPositionOverrides`, per-floor `beamAlignmentOverrides`, independent `foundationTieBeamAlignmentOverrides`, column/beam context-menu nudge actions, foundation right-click tie-beam offset routing, hit testing based on rendered/nudged beam/column geometry, deleted regular beams filtered from generated analysis/display geometry, cantilever support fallback to the next available inward support beam when the exterior support is deleted, and CB sizing/offset inheritance from the same-axis supporting main beam. Keep SolverLink or other lean-modeler experiments outside this workspace unless work is intentionally branched/committed first.
- FS-046 clean reapply path: from clean checkpoint `f545cfa`, cherry-picked the pre-broken offset/cantilever recovery commit `2110b0a` and intentionally did not apply broken WIP `9f5cd6c`. Reapplied deleted-geometry hiding without the bad global `col.active === false` veto: void slabs are not drawn in normal Layout/Tributary, inactive/deleted columns are hidden instead of red/dashed ghosts, active slab area/status/material counts filter `!isVoid`, and display regeneration now happens before `updateResults()` so current-floor voids update `Total Slab Area`. Browser probe: default `80.0 m²` became `60.0 m²` after voiding `S1`; member count changed `9C / 12B / 4S` to `8C / 10B / 3S`; red canvas ghost pixel count stayed `0`; column/beam/foundation offset context-menu functions were present.
- FS-047 undo/rebar stabilization: toolbar Undo/Redo is the active recovery path. Beam add/delete, slab void, and planted-column placement must call `saveStateSnapshot()` before mutation; do not add new actions to the old `state.undoStack` path. Preliminary column rebar suggestions should use a balanced tied-column bar count: round required bars up to at least 4 and then to the next even number, so 5 required bars displays as 6 bars instead of an unbalanced 5-bar layout.
- FS-048 FSTR/refresh recovery: legacy FSTR files may store cantilevers only at root/project level. On load, migrate that root cantilever set into floors that do not have their own `floor.cantilevers`; then sync the visible cantilever inputs from the active floor. Save/load now includes `columnAlignment`. The browser also writes a local autosave snapshot after calculation and on pagehide, and restores it silently on startup so Refresh does not return to the starter model. Rebar and BBS tabs are hidden from the main plan toolbar for now; schedule/design panels get a `Back to Plan` escape button.
- FS-049 recovery/debugging mode: added a `Recovery` tab under Output as the first stop before more cantilever geometry work. It exposes active floor, grid size, local autosave metadata, per-floor `deletedBeams`, `voidSlabs`, `deletedColumns`, and cantilever length mismatches. Recovery actions: refresh inspector, sync left cantilever inputs from active floor, apply left cantilever inputs to active floor, restore active-floor deleted/void geometry, restore all floors deleted/void geometry, clear local autosave, and download a state snapshot. Model-changing recovery actions must call `saveStateSnapshot()` first so Undo can reverse accidental recovery.
- FS-050 explicit FSTR load safety: opening a project file now quarantines loaded `deletedBeams`, `voidSlabs`, and `deletedColumns` instead of applying them silently. This prevents old/broken hidden geometry from making slabs or columns disappear immediately on file open. The Recovery panel shows quarantined counts/raw data and has an explicit restore action if the hidden state was actually intentional. Direct file open also clears local autosave before applying the file so stale browser state cannot fight the loaded project. Cantilever inputs now sync from the active floor on floor switch/render so a 4x3 opened project shows 4 top/bottom and 3 left/right controls instead of default 2x2 controls.
- FS-051 stricter recovery defaults: browser autosave restore also quarantines hidden geometry so stale broken local state cannot keep re-hiding slabs on startup/refresh. Hidden-state quarantine now clears stale beam/slab locks together with deleted beams, void slabs, and deleted columns; restore-current/all-floor recovery actions also clear locks. Lock/unlock now records an undo snapshot.
- FS-052 product identity cleanup: repo-local branding strings were changed from Tributary Pro / tributary-pro naming to FutolStructure / futolstructure across active source, docs, logs, and legacy helper scripts. Remote already points to `michaelfutol/futolstructure`. Physical folder rename from `tributary-pro-v2.0` to `futolstructure` was attempted but Windows denied it because the current workspace folder is locked by an open process; perform after closing VS Code/Codex workspace or reopening from a renamed folder.
- FS-053 left-panel/void safety: undo/redo now refreshes span inputs, floor tabs, and cantilever inputs after restoring state so a 4x3 model cannot keep showing stale 2x2 cantilever controls. Plain left-click on slabs no longer voids/deletes slab panels; intentional slab deletion must use the right-click member menu, with undo snapshot support still handled by the void toggle path.
- FS-054 repeatable recovery smoke checks: added `v3/tools/check-fs.js`, a dependency-free Node check that parses inline scripts, runs engine syntax checks, opens the local app through Chrome/Edge CDP, verifies default 2x2 and 4x3 model column/slab counts, confirms cantilever input counts follow the active grid through undo/redo, legacy `.fstr` root-cantilever loads, and browser reload autosave restore, confirms column/beam/slab delete undo recovery, confirms void slabs are not drawn as red ghosts in normal canvas view, confirms plain slab left-click does not create voids, and confirms loaded hidden geometry (`deletedBeams`, `voidSlabs`, `deletedColumns`, stale locks) is quarantined instead of applied silently. Use `node v3/tools/check-fs.js` before/after geometry, load/save, undo/redo, or rendering fixes; use `--no-browser` for syntax-only checks. Undo/redo snapshot creation/restoration was centralized with `createStateSnapshot()` and `restoreStateSnapshot()` to reduce recovery drift. Column toggles, 3D beam/custom-beam deletion, and 3D box-selection deletion now enter the same snapshot path so accidental deletion can be recovered from the toolbar undo. Stale `lockedBeams`/`lockedSlabs` now count as quarantine payload even when no deleted/void geometry is present.
- FS-055 cantilever dashboard self-healing: `calculate()` now normalizes active/global and per-floor cantilever arrays against the current `xSpans/ySpans`, then repairs the left cantilever dashboard if the DOM input counts do not match the active grid. This prevents stale 2x2 controls from surviving after a 4x3 model is loaded/restored or after state changes bypass a direct `renderCantileverInputs()` call. `updateSpan()` also invokes the dashboard guard. Smoke coverage now intentionally corrupts the cantilever panel to stale controls and verifies `calculate()` rebuilds it to 4 top / 3 right / 4 bottom / 3 left.
- FS-056 cantilever local-patch restoration: cantilever span values are now normalized to object specs `{ projection, run, offset, eb }` while still accepting legacy numeric FSTR values. The left dashboard exposes Projection, Run, Off, and EB per span; `Run = 0` means full bay/span and positive `Run` creates a local patch such as `projection: 1.2, run: 1.2` for a stair support landing. Cantilever slab generation uses resolved run bounds, so local patches no longer force full-length slabs. CB/EB generation uses the same bounds and the EB checkbox suppresses only the free-end edge beam, not the slab itself. EB width defaults to 150 mm unless explicitly overridden, while EB depth inherits from its supporting main beam where resolvable. Cantilever edge beams render inward: the EB outside face is aligned to the free slab edge, so the beam sits inside the slab projection instead of straddling outside the slab. Layout now marks active slabs with small `1W`/`2W` symbols and cantilever slabs with `C`, making missing/deleted slabs visible even without Tributary hatch. Smoke coverage verifies legacy root cantilever migration into the new object form, the 4x3 dashboard counts, a right-edge `1.2 m x 1.2 m` local patch, EB on/off behavior, inherited EB depth, and free-edge EB face alignment.
- FS-057 drafting labels: Layout beam tags now append the resolved beam section size in parentheses (`(250x400)`, `(150x550)`, etc.) directly to the plan label, including CB/EB generated members. Layout slab notation follows the user-approved arrow guide: one-way slabs show a single directional slab arrow with one-sided/half arrowhead and a small tail tick in the primary short-span/load-transfer direction; two-way slabs show crossed single directional slab arrows in both directions; cantilever slab arrows follow the cantilever projection direction. Do not use normal two-sided/V arrowheads for slab symbols. The slab mark (`S1`, `S2`, `SC-*`, etc.) sits near the arrow symbol, and slab thickness is shown separately in a small slotted/oblong capsule below the symbol (`150`, etc.) with no `t=` prefix. Tags use current floor slab thickness unless an individual slab thickness is present. Keep this as drafting annotation, but its one-way orientation must stay aligned with the tributary calculation rule (`lx <= ly` means horizontal/X short-span load transfer; otherwise vertical/Y).
- FS-058 Olango real-project regression: `v3/tools/check-fs.js` now accepts `--project <path>` and loads a real `.fstr` through the browser `applyLoadedProject()` path. Current target: `D:\Users\mfutol\Documents\FutolStructure_2026-05-22 - Olango.fstr`. Latest pass confirms no Init error, 4x3 grid, cantilever controls restore to top 4 / right 3 / bottom 4 / left 3, saved inactive columns A3/A4/B4/E4 remain hidden as intended (16 visible from 20 generated), all 12 regular slabs remain active, and normal structural-plan canvas has zero red ghost pixels. The test now derives the expected quarantine count from the actual saved file payload; earlier copies had saved void slabs S5/S9/S10/S12, but the current on-disk Olango file has empty hidden/void arrays. Verification: `node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-05-22 - Olango.fstr"`. Screenshot: `C:\Users\Futol\AppData\Local\Temp\futolstructure-project-futolstructure_2026-05-22---olango.png`.
- FS-059 browser-session discipline: avoid opening fresh user-visible browser windows for every check. Manual app launches should open a tab in the existing Edge session and include a cache-busting query after UI edits, e.g. `Start-Process "msedge.exe" -ArgumentList "http://127.0.0.1:4173/v3/index.html?fsBust=<timestamp>"`. Browser smoke tests support `--keep-browser` or `FS_KEEP_BROWSER=1`; this leaves the CDP test browser alive on `FS_CDP_PORT` so later smoke runs add tabs to the same controlled instance instead of spawning/killing a new one. `check-fs.js` no longer passes `--new-window`, disables Network cache where CDP allows it, and opens `index.html` with a smoke cache-busting query.
- FS-060 cantilever EB depth inheritance: `getBeamSizeMm()` now prioritizes inherited support depth for `cantilever_edge` / EB members before generated EB fallback dimensions. Explicit beam-size overrides still win, but stale generated `400`/old EB dimensions should no longer block the EB from inheriting the supporting beam depth. Smoke check verifies a right local `1.2 m x 1.2 m` patch creates an inward 150 mm EB whose outside face aligns with the slab free edge and whose depth inherits `BY-5-1 = 550 mm`.
- FS-061 intentional deleted/void slab persistence: the earlier recovery quarantine was too broad and caused legitimate saved slab deletions to reappear after opening a file. New saves now include `hiddenGeometryPolicy: preserve-intentional-hidden-geometry`. `applyLoadedProject()` still quarantines legacy/untrusted hidden geometry when requested, but files/autosaves with this policy preserve intentional `voidSlabs`, `deletedBeams`, `deletedColumns`, and locks as model state. Smoke coverage now checks both paths: a legacy hidden payload is quarantined, while a policy-marked saved `voidSlabs: ['S1']` remains active after load and reduces active regular slab count to 11. Existing older saved files without the policy must be opened, edited/deleted as intended, and saved once with the updated build before intentional deletions persist across future loads.
- FS-062 CB/EB plan label and slab annotation pass: cantilever side beams now carry `nearestSupportColumnId`, and Layout plan labels route CB/EB members through `getBeamScheduleId()` instead of raw internal IDs. Visible CB convention is `CB-<floor>-<nearest attached column>` such as `CB-2F-E1`; internal `BCX/BCY` IDs may remain implementation details. CB sizing still follows the same-axis main beam it extends. EB members now explicitly store `supportingMainBeamId = supportingBeamId` for the adjacent parallel support beam, and `getBeamSizeMm()` uses that main/support beam depth for EB depth while keeping the 150 mm preliminary EB width unless overridden. Layout slab annotation keeps the approved one-sided arrow symbols, but chooses a horizontal row for wide/shallow panels and a vertical stack for deeper panels so the slab mark and oblong thickness tag are less likely to shrink or collide. Smoke coverage verifies the right local patch EB label/depth source and `CB-2F-E1` naming/250x400 inheritance. Verification: `node v3\tools\check-fs.js --keep-browser --project "D:\Users\mfutol\Documents\FutolStructure_2026-05-22 - Olango.fstr"`.
- FS-063 CB dimension drafting rule: standard CB labels should not append `(BxH)` in the structural plan because a CB is assumed to match the connected same-axis main beam. Keep the clean `CB-<floor>-<nearest column>` label for non-tapered CBs. If a future tapered CB is introduced, the plan label may show a compact tapered note with at least the end/tip depth, but do not add ordinary section dimensions to normal CB tags. Regular beams and EB members may still show section dimensions for now.
- FS-064 autosave hidden-geometry guard: browser autosave restore now force-quarantines hidden/deleted geometry even when the autosave payload contains `hiddenGeometryPolicy`. This prevents old browser state from silently reopening with stale `voidSlabs`, deleted beams, deleted columns, or locks and making slabs look persistently missing in Tributary/Layout. Explicit `.fstr` project load can still preserve intentional hidden geometry when saved with the policy, but autosave startup is treated as unsafe and pushes those items into the Recovery inspector instead. Smoke coverage writes a policy-marked autosave containing `S1` and `BX-1-1`; startup restore now returns 12 active regular slabs and zero active hidden arrays while recording the payload in quarantine.
- FS-065 CB alignment and cantilever slab edge visibility: CB/cantilever side beams now inherit the full resolved transverse plan offset from their same-axis supporting main beam, not only the manual nudge value. This keeps CB drafting aligned with main beams through column flush/edge alignment and manual beam offsets while retaining inherited main-beam width/depth. Layout and Tributary views now draw cantilever slab perimeters as solid visible lines instead of dashed/weak borders so the free slab edge is readable even when hatch/labels are congested. Smoke coverage sets `BX-1-4` to a nonzero transverse offset and verifies `BCX-R-1` reports the same rendered offset and inherited `250x400` size.
- FS-066 slab annotation uniformity: Layout/Tributary slab annotation text now uses the same black Arial plan-text style/scale as beam labels instead of larger bold blue/brown styling. Slab symbols and thickness capsule text are black for regular and cantilever slabs. Cantilever slabs keep internal `SC-*` IDs for generation/load logic, but plan display maps active cantilever slabs to `CS-1`, `CS-2`, etc. to avoid confusion with future `TS`/other slab classifications. The older brown cantilever `C:<area>` fill label was replaced by the same black `CS-*` mark.
- FS-067 active-only slab display numbering: visible slab marks in Layout/Tributary are now display marks, not raw generated IDs. Regular active slabs are renumbered `S1`, `S2`, ... by top-to-bottom rows and left-to-right within each row, skipping `isVoid`/deleted slabs so missing panels do not leave numbering holes. Active cantilever slabs are likewise sorted top-left and displayed as `CS-1`, `CS-2`, ... independent of internal `SC-*` IDs. Smoke helper now has a synthetic mark-ordering check where void `S1/S5` cause displayed active regular slabs `S2/S3/S4/S6` to become `S1/S2/S3/S4`.
- FS-068 cantilever L-corner ownership and CB support-side alignment: perpendicular cantilever slab rectangles now resolve L-corner overlaps by trimming the top/bottom strip where it overlaps an active left/right strip, so the shared corner is owned once and the area is not double-counted. This fixed real `0.25 m2` overlaps detected in Olango at bottom/left and bottom/right L-corners. Cantilever side-beam support lookup now prefers the same-axis main beam on the cantilever side of an interior support line, with inward fallback only when the outside-side beam does not exist. Example: right-side `CB-2F-D3` now inherits from `BX-3-4` (`D3-E3`) instead of `BX-3-3` (`C3-D3`), and RF inherits the `BX-3-4` offset. Off-grid local CB ends fallback to the resolved support beam for size inheritance. Standard cantilever slab arrow symbols were removed from Layout annotation; cantilever slabs keep black `CS-*` plus oblong thickness only. Smoke coverage now asserts, for the Olango `.fstr` on both `2F` and `RF`, zero cantilever side-beam size/alignment mismatches and zero active cantilever slab rectangle overlaps.
- FS-069 trusted autosave deleted-slab persistence: startup autosave restore no longer force-restores deleted slabs for current-build trusted autosaves. Autosaves written by this build include `autosaveMeta.stateRevision = FS-069-trusted-hidden-geometry-autosave`; those preserve intentional `voidSlabs`/deleted geometry just like an explicit `.fstr` file. Older/untrusted autosaves still quarantine hidden geometry to avoid stale broken-browser state. `generateSlabs()` now treats a saved parent slab ID as void for any generated sub-slab pieces, and orphan cleanup keeps parent IDs valid when sub-slabs exist. Olango disk payload was verified to contain `2F voidSlabs = S5,S9,S10,S12`; project smoke loads it with `activeRegularSlabs = 8`, `voidRegular = S5,S9,S10,S12`, and `21S` instead of `25S`. Smoke coverage now checks both paths: legacy autosave hidden geometry is quarantined, trusted autosave keeps `S1` void and active regular slabs remain 11.
- FS-070 active slab truth collector: persistent/reappearing slab diagnosis is now governed by one active-slab source. Added `getActiveSlabs()`, `getActiveRegularSlabs()`, `getActiveCantileverSlabs()`, `isActiveSlab()`, and browser audit `collectActiveSlabTruthAudit()`. Layout rendering, Tributary fill/slices, status member counts, area balance, hit testing, 3D floor geometry, and slab load summary now use the same active-only slab collector instead of separate `state.slabs.filter(!isVoid)` paths. Cantilever slab tributary area is owned once by the resolved main support beam; CB/EB members keep self-weight/member behavior but no longer receive hidden duplicate slab tributary area. Olango `.fstr` verification: `16C / 41B / 21S`, active regular slabs `S1,S2,S3,S4,S6,S7,S8,S11`, inactive/void regular slabs `S5,S9,S10,S12`, active cantilever slabs `13`, `Total Slab Area = 138.3 m2`, `Area Balance = 100.0%`, area delta `0`, zero red ghost pixels, and Layout/Tributary tab switching preserves identical active/rendered/accounted slab IDs.
- FS-071 deleted-before-save slab persistence guard: `buildProjectData()` now normalizes current-floor transient hidden slab flags (`slab.isVoid`, legacy `slab.deleted`, or `active === false`) into persisted `floor.voidSlabs` before writing `.fstr`/autosave. The Slab Schedule now reads from `getActiveSlabs()` instead of raw `state.slabs`, so a deleted/void slab cannot remain visible in schedules after disappearing from Layout/Tributary. Legacy schedule bulk slab delete, if surfaced later, now writes `floor.voidSlabs` and recalculates instead of setting transient `slab.deleted = true`. Smoke coverage simulates a slab already hidden by `slab.deleted` before save; the saved project carries it as `voidSlabs: ['S2']` and reloads with 11 active regular slabs.
- FS-072 recovery warning status: legacy `.fstr` files without `hiddenGeometryPolicy` still quarantine hidden/deleted geometry by design, but the app must not show a green complete state if that quarantine leaves active slab area and beam tributary area unbalanced. `updateStatusBar()` now keeps a persistent `Recovery Review Required`/`Area Balance Warning` state, the Recovery panel repeats the warning detail, and the area-balance row marks mismatches with a review hint. Smoke coverage accepts old untrusted Olango only when the warning is visible; current trusted Olango must still be balanced. Verification: `node v3\tools\check-fs.js`, `node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-05-22 - Olango.fstr" --keep-browser`, and `node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-04-26 - Olango.fstr" --keep-browser`.
- FS-073 Olango D3/E3 cantilever L-corner cleanup: user markup required no generated CB where an existing beam already occupies the segment, CB alignment to follow the same-axis main beam, no visible/internal duplicate line at same-elevation L-corner slab joins, and no cantilever slab perimeter line overlapping beam linework. Generation now checks active beam occupancy before creating CB/EB members, reuses the existing occupied beam ID, builds side metadata from the final overlap-trimmed cantilever slab bounds, and skips side CBs that would only represent an internal L-corner trim cut. Layout/Tributary cantilever slab perimeters now draw only exposed perimeter segments after subtracting the support edge, shared cantilever slab edges, and beam-coincident intervals. Olango verification: `BCX-R-3`/`CB-2F-D3` is no longer generated because `BX-3-4`/`B-2F-D3E3` owns that line; `SC-B4` keeps only `BCY-B-5`; `SC-R3` reuses `BX-3-4` plus generated `BCX-R-4`; member count is `16C / 40B / 21S`; active slab area balance remains `100.0%`; new smoke diagnostics assert zero side-CB-over-regular-beam overlaps on both 2F and RF. Verification: `node v3\tools\check-fs.js --no-browser` and `node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-05-22 - Olango.fstr" --keep-browser`.
- FS-074 main-beam/CB rendered-axis alignment: CB side beams must not merely inherit the main beam BxH and transverse offset; they must render on the exact same transverse axis as the same-axis main beam they extend. The structural-plan drift came from cantilever side beams with one column endpoint and one free endpoint averaging a nudged/flush column position with a raw free endpoint. `getRenderedBeamPlanSegment()` now locks a CB side beam's transverse rendered coordinate to its `supportingMainBeamId` segment before applying the inherited offset. Smoke diagnostics now include `renderedAxisMismatch`, not only size/offset mismatch. Olango verification: `BY-5-2`/`B-2F-E2E3` and `BCY-B-5`/`CB-2F-E3` both render on Y-beam axis `13.72`; `BX-4-3`/`B-2F-C4D4` and `BCX-R-4`/`CB-2F-D4` both render on X-beam axis `10.585`. Verification: `node v3\tools\check-fs.js --no-browser` and `node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-05-22 - Olango.fstr" --keep-browser`.
- FS-075 plan measure/dimension tool: Layout/Tributary/Structural plan views now have `Measure` and `Clear Dims` toolbar controls. Measure mode uses two canvas clicks to add a floor-scoped dimension annotation with extension lines, tick marks, and a meter label; it is saved under `floor.planDimensions`, preserved by `.fstr`/autosave serialization, and restored by undo after clear. Measure mode disables pan/add-beam conflicts, keeps a crosshair cursor, supports live preview, and Escape cancels the pending point or exits the mode. This is drafting annotation only and does not affect analysis, tributary area, loads, schedules, or solver export. Browser validation used the in-app Browser against `http://127.0.0.1:4173/v3/index.html`; direct `file://` navigation was blocked by Browser policy, so smoke now supports `FS_APP_URL` for local HTTP validation. Verification: `node v3\tools\check-fs.js --no-browser` and `$env:FS_APP_URL='http://127.0.0.1:4173/v3/index.html'; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-05-22 - Olango.fstr" --keep-browser`. Smoke confirms a 3-4-5 m dimension saves as length `5`, `Clear Dims` removes it, undo restores it, and Olango remains `16C / 40B / 21S` with `Area Balance = 100.0%`, zero red ghost pixels, and no cantilever alignment/overlap diagnostics.
- FS-076 column safety lock and Measure accuracy pass: added a global `Cols Free` / `Cols Locked` toolbar toggle. When locked, column toggle/delete, nudge/reset, all-column nudge/reset, planted-column creation, planted-floor edits, click-to-place columns, 3D column double-click delete, 3D box-selection column delete, and schedule bulk column delete are blocked. The flag persists through `.fstr`/autosave via `columnPositionLocked` and is intentionally treated as a safety setting, not analysis geometry. Locked beams/slabs now render as muted gray indicators instead of blue; globally locked columns also render gray in Layout/Tributary/Structural plan views. Measure now has an `Ortho` toggle and automatic entity snapping while measuring. Snap candidates include grid intersections/lines, active column centers/faces, beam axes/faces/endpoints, custom beams, active slab edges/corners, and existing dimension endpoints; a small amber marker shows the acquired snap point. Smoke coverage verifies the column lock blocks a column toggle and saves as locked, entity snap acquires a near column/grid intersection, Ortho constrains to the dominant axis, and Olango remains stable. Verification: `node v3\tools\check-fs.js --no-browser` and `$env:FS_APP_URL='http://127.0.0.1:4173/v3/index.html'; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-05-22 - Olango.fstr" --keep-browser`.
- FS-077 Tributary/Layout beam visual alignment repair: replaced the duplicated plan beam drawing math with shared `getBeamPlanDrawGeometry()`. Beam cross-axis drawing now uses the beam/grid axis plus beam offset instead of inheriting column face offsets, so Layout and Tributary read from the same beam center/face reference. Wireframe/drafted beams now trim only to a covered junction length based on the connected perpendicular beam and column size; this closes the small visible notch when a column is narrower than the beam without changing analysis geometry. Added smoke coverage that shrinks A1 to 200x200 against 250mm beams and verifies top edge face stays flush at the grid and the horizontal/vertical beam junction overlaps rather than gaps. Latest validation used `D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr`: `16C / 40B / 21S`, area balance `100.0%`, `redPixels: 0`, no cantilever alignment/overlap diagnostics, and `junctionGapM = -0.05`.
- FS-078 saved beam-offset interpretation correction: FS-077 initially over-corrected by ignoring column-position adjustments on the beam cross-axis, which made the same saved Olango `.fstr` appear with a different layout after reload even though `beamAlignmentOverrides` and `columnPositionOverrides` were still present. Correct rule: generated beams should ignore only the automatic `Col: Flush`/outer-column half-width display shift on the cross-axis, but must still honor user-saved manual column nudges (`columnPositionOverrides`) plus saved beam offsets (`beamAlignmentOverrides`). The June 2 Olango file contains 8 column-position overrides and 19 beam-alignment overrides; these are model intent, not transient renderer data. Validation after correction: `$env:FS_APP_URL='http://127.0.0.1:4173/v3/index.html'; $env:FS_CDP_PORT='9237'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr"` passed with `16C / 40B / 21S`, active regular slabs `8`, cantilever slabs `13`, `Area Balance = 100.0%`, `redPixels = 0`, no cantilever alignment/overlap diagnostics, and small-column junction `topEdgeTopFace = 0`, `junctionGapM = -0.05`.
- FS-079 beam lock enforcement and batch lock: `lockedBeams` must be a real edit lock, not only a gray/lock-icon display state. Added active-floor toolbar batch toggle `Beams Free` / `Beams Locked`, which locks/unlocks all active generated/custom floor beam IDs and persists through `floor.lockedBeams`. A locked beam now blocks direct context-menu offset/reset/delete, all-generated-beam offset/reset skips locked beams, schedule beam size edits are disabled and API-guarded, old bulk-delete paths skip locked beams, and 3D double-click/box-selection deletes skip locked beams. Because generated beam geometry follows support columns, column nudge/reset/toggle/planted-floor edits now also block when they would move a connected locked beam. Smoke coverage locks all active beams, then verifies locked `BX-1-1` cannot be offset, resized, deleted, or moved indirectly by toggling support column `A1`. Validation command: `$env:FS_APP_URL='http://127.0.0.1:4173/v3/index.html'; $env:FS_CDP_PORT='9243'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr" --keep-browser`; pass result includes `16C / 40B / 21S`, `Area Balance = 100.0%`, `redPixels = 0`, no cantilever diagnostics, and lock warnings for blocked offset/resize/delete/connected-column toggle.
- FS-080 optional external-foundation mode: added persisted `foundationMode` with `plan` and `baseReactionsOnly`. Plan mode keeps the existing footing/tie-beam design path. Base-reaction mode disables footing/tie-beam inputs, relabels Foundation/Footing tabs to `Base Rxn`, skips footing design, clears footing/tie-beam dead loads and quantities, preserves column self-weight in base reactions, makes foundation tie-beam hit testing return no members, draws a Base Reaction Plan with reaction arrows/labels and a reaction table, and exports `base_reactions.csv` for external SAFE/STAAD Foundation workflows. Smoke coverage verifies mode save/load, zero foundation tie-beam segments, zero footing/tie-beam DL, zero footing sizes, nonzero base reactions, and disabled tie-beam controls. Validation: `node v3\tools\check-fs.js --no-browser`; `$env:FS_APP_URL='http://127.0.0.1:4173/v3/index.html'; $env:FS_CDP_PORT='9243'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr" --keep-browser`; plus in-app Browser interaction confirmed `Foundation: Base Rxn`, disabled tie-beam width, and Base Rxn tab labels. Headless Chrome visual capture saved `C:\Users\Futol\AppData\Local\Temp\futolstructure-base-reaction-plan.png`.
- FS-081 beam line column-face termination: plan drawing now uses column-face trimming for generated beam rendered extents in Layout/Tributary and for Measure beam-axis/face snap candidates. The older junction trim remains available for diagnostics, but visible beam linework must stop at the connected column faces and not run under the column hatch. Smoke coverage now shrinks `A1` to `200x200` against `250 mm` beams and asserts the horizontal and vertical beam endpoints land exactly on the start/end column faces (`faceDeltaM = 0`) while the small-column beam-to-beam junction still overlaps by `50 mm` instead of gapping. Validation: `node v3\tools\check-fs.js --no-browser`; `$env:FS_APP_URL='http://127.0.0.1:4173/v3/index.html'; $env:FS_CDP_PORT='9366'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; $env:FS_KEEP_BROWSER='1'; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr"` passed with `16C / 40B / 21S`, `Area Balance = 100.0%`, `redPixels = 0`, and no cantilever diagnostics.
- FS-082 small-column beam junction mask: FS-081 over-trimmed visible beam linework to column faces, which made CB/beam terminations look like floating caps when a column is shallower than the connected beam. Correct drafting rule: Layout/Structural generated beam linework should extend into the perpendicular beam/column junction using `trimToJunction`, while the column hatch first paints an opaque white mask over the column footprint and then draws the hatch/outline. This hides the line inside the column but keeps the beam visually connected to the perpendicular beam. Measure snap candidates intentionally stay on `trimToColumnFaces` so the tool snaps to clean grid/column faces, not hidden masked overlap. Smoke now sets `A1 = 300x200`, checks generated beam caps fall inside the column-masked zone, and verifies `BCX-L-1`/`CB-2F-A1` extends `25 mm` past the A1 visible face into the hidden junction. Validation: `node v3\tools\check-fs.js --no-browser`; full browser smoke on `D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr` passed with `16C / 40B / 21S`, `Area Balance = 100.0%`, `redPixels = 0`, and Measure snap restored to `(0,0)`.
- FS-083 void-slab intent must not be garbage-collected: `generateSlabs()` must never silently splice `floor.voidSlabs` during ordinary `calculate()` after span/grid changes. Slab geometry is generated, but the saved deletion intent lives in `floor.voidSlabs`; when an ID no longer matches generated slabs, keep it as user intent, mirror it into `floor.orphanedVoidSlabs`, warn once in console, and surface it in Recovery as `orphan void: ...` for explicit cleanup. Smoke coverage now verifies multi-floor save preserves another floor's `voidSlabs`, and a span change from a model with `S4` void keeps `S4` in `floor.voidSlabs`, `orphanedVoidSlabs`, and saved project data while not applying it to the new smaller slab set. Validation: `node v3\tools\check-fs.js --no-browser`; `$env:FS_APP_URL='http://127.0.0.1:4173/v3/index.html'; $env:FS_CDP_PORT='9381'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr"` passed with `2F voidSlabs = S5,S9,S10,S12`, active regular slabs `8`, status `16C / 40B / 21S`, `Area Balance = 100.0%`, `redPixels = 0`, and no relevant project console errors.
- FS-084 plan label collision avoidance: beam labels in Layout/Structural plan now use a collision-aware placement registry instead of fixed above/left positions. The renderer reserves column footprints/column IDs and slab annotation boxes, then tries above/below/far/outside-span positions for horizontal beams and left/right/far/outside-span positions for vertical beams. Font reduction is last-resort and bounded; at very zoomed-out overview, labels that still cannot be placed cleanly are skipped until zoom-in rather than drawn overlapping. Smoke diagnostics expose `window.lastPlanLabelDiagnostics` and fail on forced overlaps. Validation: `node v3\tools\check-fs.js --no-browser`; `$env:FS_APP_URL='http://127.0.0.1:4173/v3/index.html'; $env:FS_CDP_PORT='9393'; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr"` passed. Visible Edge reload at 1920x1080 placed all 40 beam labels with `forcedOverlaps = 0`, `skippedLabels = 0`, `shrinkCount = 0`, and model status stayed `16C / 40B / 21S`, `Area Balance = 100.0%`.
- FS-085 beam tag clearance and grid bubble offset controls: beam-tag clearance from beam linework is now based on `0.75 * label font height`, with reduced far/outer candidate distances so cantilever tags do not jump deep into the grid-bubble zone. Added toolbar controls `Bubble -` and `Bubble +N` beside Grid; `state.gridBubbleOffsetPx` defaults to `20`, clamps from `-20` to `90`, persists in `.fstr`/autosave, and affects both Layout/Tributary and Structural/CAD grid bubbles. Dimension labels move partway with the bubbles so they remain between bubbles and the building. Validation: `node v3\tools\check-fs.js --no-browser`; `$env:FS_APP_URL='http://127.0.0.1:4173/v3/index.html'; $env:FS_CDP_PORT='9395'; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr"` passed. Visible Edge reload showed `gridBubbleOffsetPx = 20`, `Bubble +20`, all 40 labels placed, `forcedOverlaps = 0`, `skippedLabels = 0`, `shrinkCount = 0`; control test changed `+20 -> +30 -> +20` and preserved zero forced overlaps.
- FS-086 structural DXF layer map: AutoCAD DXF export now uses the structural rows from `D:\BOOM\BOOM\BOOM\FT_LayerMap.xlsx` instead of legacy ad hoc layers. The DXF table declares all structural layers (`S-CONC-FOUND`, `S-CONC-SLAB`, `S-CONC-BEAM`, `S-CONC-COL`, `S-CONC-SW`, `S-CONC-STAIR`, `S-REBAR-GEN`, `S-FORM-*`, `S-MAS-CHB`, `S-STEEL-*`, `S-WP-RAFT`, `S-SOIL-*`, `S-GRID`, `S-TEXT`) with spreadsheet color indexes and lineweights; `S-GRID` uses the `CENTER2` linetype. Current entity mapping: columns -> `S-CONC-COL`, generated beams -> `S-CONC-BEAM`, stair/custom beams -> `S-CONC-STAIR`, slabs -> `S-CONC-SLAB`, grid -> `S-GRID`, text/labels -> `S-TEXT`. Smoke coverage inspects generated DXF text and fails if legacy `GRID/COLUMNS/BEAMS/SLABS/TEXT/CUSTOM_BEAMS` layers return.
- FS-087 typical-from-lower floor layout: added a persisted `floor.typicalFromLower` flag and a left-panel checkbox shown for every floor above the first. When checked, the active floor inherits lower-floor layout/drafting intent before calculate/save/load: cantilevers, stair/custom beams, void slab IDs, slab openings, plan dimensions, deleted beams/columns, and locks. Load values remain floor-specific, so RF can follow 2F geometry while keeping roof DL/LL/thickness/wall-load values. Inherited cantilever inputs are read-only; edit the source lower floor or uncheck the box to make the floor independent. Column `activePerFloor` visibility is mirrored where available, but broader axis-level/batch member-copy workflows remain future work. Validation: `node v3\tools\check-fs.js --no-browser`; `$env:FS_CDP_PORT='9411'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js`; `$env:FS_CDP_PORT='9412'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr"` passed.
- FS-088 one-floor minimum and rebuild-up workflow: floor deletion now allows a minimum of one floor/slab. RF is directly removable; deleting RF from the default stack leaves a valid single `2F` floor and keeps that floor's corrected layout intent. `addFloor()` now creates a typical-from-lower copy by default: from one floor it adds an inherited `RF` with roof DL/LL/thickness defaults; from `2F + RF` it inserts an inherited `3F` before RF, and RF follows the new lower floor if it is typical. Floor reindexing now migrates floor-scoped column visibility, planted-floor flags, beam size overrides, and beam alignment override keys so layout state is not orphaned when `2F/3F/RF` IDs shift. Validation added smoke coverage for delete-RF -> one floor -> add RF -> add 3F before RF. Commands passed: `node v3\tools\check-fs.js --no-browser`; `$env:FS_CDP_PORT='9421'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js`; `$env:FS_CDP_PORT='9422'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr"`.
- FS-089 typical floor beam override cloning: investigation of the June 2 Olango file showed the file still preserved 2F hidden/layout intent (`voidSlabs = S5,S9,S10,S12`, 40 locked beams) while RF had independent empty `voidSlabs`/`lockedBeams`. The remaining rebuild/add-floor bug was that typical-from-lower copied floor-owned layout intent but did not clone floor-scoped `beamAlignmentOverrides` and `beamSizeOverrides` from source floor keys (`2F::beamId`) to target floor keys (`RF::beamId` / `3F::beamId`). Patch adds `copyFloorScopedModelOverrides()` during typical inheritance, replacing stale target-floor override keys with cloned source-floor values so rebuilt RF/3F floors keep manual beam offsets and sizes. Smoke coverage now seeds a manual beam offset/size on 2F, verifies RF inherits it before save and after reload, verifies RF deletion leaves the 2F override intact, then verifies add-RF and add-3F-before-RF clone the same override chain. Validation passed: `node v3\tools\check-fs.js --no-browser`; `$env:FS_CDP_PORT='9431'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js`; `$env:FS_CDP_PORT='9432'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr"`.
- FS-090 beam tag proximity and rebuilt RF slab thickness: user accepted near-beam labels even if they overlap drafting linework, because DXF annotation cleanup can be handled later. Beam labels now use only near candidates at `0.75 * text height` from the beam line/face (`above`/`below` for horizontal, `left`/`right` for vertical), do not try `far`/`outer` placements, and allow overlaps instead of skipping or scattering labels away from their members. Project smoke now asserts no skipped beam labels and no far/outer placements, while allowing forced overlaps. The June 2 Olango `.fstr` stores `slabThickness = 100` on both 2F and RF; add-floor rebuild now preserves the lower floor slab thickness for a newly recreated RF while still using roof DL/LL/wall-load defaults. Validation passed: `node v3\tools\check-fs.js --no-browser`; `$env:FS_CDP_PORT='9433'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js`; `$env:FS_CDP_PORT='9434'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr"`.
- FS-091 global beam lock and save-target investigation: user reported RF beams/locks reverted after saving. File audit showed `D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr` still has `columnPositionLocked = true`, 40 locked beams on 2F, but 0 locked beams on RF; the most recently modified `.fstr` was instead `D:\Users\mfutol\Documents\FutolStructure_2026-05-22 - Olango.fstr` at 2026-06-07 03:29 local, with no column lock, no beam locks, RF typical, and only one RF beam alignment override. Root cause for locks: toolbar `Beams Locked` was active-floor only, so locking on 2F did not save RF locks. Patch makes the same toolbar action a universal all-floor beam safety lock: it counts active beams across all floors, locks/unlocks active beam IDs on every floor, persists each floor's `lockedBeams`, and updates the button title/text accordingly. Smoke now fails unless both 2F and RF save full lock lists after the batch beam lock action. Validation passed: `node v3\tools\check-fs.js --no-browser`; `$env:FS_CDP_PORT='9435'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js`; `$env:FS_CDP_PORT='9436'; $env:FS_CDP_PROFILE_DIR=<fresh temp>; node v3\tools\check-fs.js --project "D:\Users\mfutol\Documents\FutolStructure_2026-06-02 - Olango.fstr"`.
- FS-092 ETABS 22 and SAFE handoff baseline: replaced the invalid hand-written E2K path with a self-contained PowerShell OAPI builder generated from active FutolStructure model truth. The builder creates ETABS stories, materials, unique frame/slab sections, active columns/beams/slabs, fixed base restraints, `FS_DEAD`/`FS_SDL`/`FS_LIVE`/`FS_WALL` patterns, slab and wall loads, and ULS combinations; then saves a real `.edb`, asks ETABS to export a native `.e2k`, and writes count audit JSON. The June 2 Olango payload produced 2 stories, 32 column segments, 93 beams, 46 slabs, 125 ETABS frame objects, and 46 ETABS area objects. ETABS 22.6 native E2K round-trip returned 0 with identical counts, and ETABS analysis returned 0: seven gravity cases completed, 12 modal modes converged, and the analysis log reported zero negative stiffness eigenvalues. Added a `SAFE` handoff action that generates the same validated ETABS model and instructs the user to use CSI's supported `File > Export > Story as SAFE V12 .f2k File` route; ordinary floors use Floor Loads, while transfer floors/foundation mats use Floor Loads and Loads from Above. Direct SAFE F2K generation is intentionally not claimed because SAFE is not installed locally for import validation.
- FS-093 solver orientation, roof ghost slabs, and ETABS/STAAD parity: FS-092's first validated import still exposed three model-truth defects during visual and cross-solver review. FutolStructure plan Y increases downward, while ETABS/STAAD plan axes increase upward; shared solver payloads now apply `Ysolver = -Yplan`, eliminating the vertical mirror. The June 2 Olango file had RF as an independent legacy floor with no `voidSlabs`, so its exported RF retained `S5/S9/S10/S12`; a dated backup was created and RF was corrected to `Typical from 2F`, copying layout intent, locks, column visibility, and floor-scoped beam overrides while preserving roof loads/elevation. Corrected export is 2 stories, 32 column segments, 80 beams, and 42 slabs, with exactly 21 active slabs on both 2F and RF. The old STAAD writer was not equivalent: it dropped cantilever/custom beams, omitted slab plates, ignored offsets, and used broad floor loads. STAAD now consumes the same solver payload as ETABS, exports all active frame objects plus exact active slab plates and plate loads, connects nearby slab/frame joints with short rigid control/dependent arms without changing slab geometry, uses support-centerline analytical beam axes while retaining drawing axes as metadata, and prints a statics check. Validation: full browser/project smoke passed; ETABS 22.6 created 112 frame objects/42 areas and analyzed with return 0 and zero negative stiffness eigenvalues; STAAD.Pro 2024 batch engine read 146 joints/112 frame members/42 plates and completed with `Warning Count: 0, Error Count: 0`, no disjoint/instability messages, and balanced applied loads/reactions. External live load matched exactly at 414.78 kN. STAAD total dead was 2415.25 kN versus ETABS 2371.49 kN (about 1.8%); this is retained as an explicit self-weight reconciliation item because STAAD uses gross element volumes while ETABS applies its own frame overlap/end-length treatment. Typical-floor regression now fails if upper-floor void IDs or active slab counts differ from the lower source floor.
- FS-094 IFC2x3 BIM geometry baseline: replaced the incomplete legacy IFC writer with a valid IFC2x3 Coordination View exporter driven by `collectCSIExportModelData()`, so IFC now shares the corrected solver orientation and active-model truth with ETABS/STAAD. Products use valid faceted BRep solids and include 32 `IfcColumn`, 80 `IfcBeam`, and 42 `IfcSlab` objects across 2F/RF, concrete material association, storey containment, and `Pset_FutolStructure` source/floor/type/section metadata. Project smoke asserts exact IFC parity with the shared solver payload and can write the generated model with `--write-ifc`. Independent IfcOpenShell 0.8.5 validation reported zero schema issues and generated geometry for all 154/154 products. RF plan inspection confirmed exactly 21 active slabs and absence of deleted `S5/S9/S10/S12`. Validation artifacts are under `D:\Users\mfutol\Documents\FutolStructure BIM Validation 2026-07-02`. Revit import/link is not yet claimed: no full `Revit.exe` or Autodesk Revit product registration was discoverable on C:/D:; only Revit helper components were present. In-app Browser invocation failed because `iab` was unavailable, and Computer Use invocation failed because its native pipe was unavailable, so the existing Chrome/CDP smoke harness was used for browser validation.
- FS-095 STAAD top-view orientation adapter: the shared ETABS/IFC payload correctly maps FutolStructure plan `Y-down` to Cartesian solver `Y-up`, but STAAD uses `X/Z` in plan with `Y` vertical and displays `+Z` downward in its top view. Copying shared solver Y directly to STAAD Z therefore mirrored the plan a second time. STAAD export now applies a target-specific adapter so `Zstaad = original FutolStructure plan Y` while retaining the shared analytical geometry. Slab winding was changed with the adapter so every plate keeps an upward `+Y` normal. Project smoke fails unless the STAAD orientation probe has `Zstaad = sourcePlanY` and every exported slab reports an upward plate normal. Corrected Olango validation passed with 146 joints, 112 frame members, 42 plates, all 42 plate normals upward, and unchanged 32-column/80-beam/42-slab parity. STAAD.Pro 2024 batch analysis completed with `Warning Count: 0, Error Count: 0`; dead load `-2415.25 kN` balanced reaction `+2415.25 kN`, and live load `-414.78 kN` balanced reaction `+414.78 kN`. Artifacts: `D:\Users\mfutol\Documents\FutolStructure Solver Validation 2026-07-02\FutolStructure_Olango_OrientationFixed.std`, its `.ANL`, and `FutolStructure_Olango_STAAD_TopView.png`.
- FS-096 STAAD remaining left/right mirror: user confirmed the actual STAAD-exported building was still mirrored after FS-095, proving the depth-axis correction alone was insufficient. STAAD's target adapter now also maps `Xstaad = -Xplan` while retaining `Zstaad = Yplan`; this is isolated to STAAD and does not change the shared ETABS/IFC Cartesian payload. Because the second axis reversal changes plate handedness, slab point order is reversed so plate normals remain upward. Regression asserts both STAAD target signs, a nonzero X/Y orientation probe, and upward normals for every plate. Corrected V2 artifact: `D:\Users\mfutol\Documents\FutolStructure Solver Validation 2026-07-02\FutolStructure_Olango_OrientationFixedV2.std`. Full saved-project smoke passed with 146 joints, 112 frame members, 42 plates, and 42 upward normals. STAAD.Pro 2024 batch analysis completed with `Warning Count: 0, Error Count: 0`; dead load/reaction balanced at `2415.25 kN` and live load/reaction at `414.78 kN`. The earlier `OrientationFixed.std` is superseded for visual orientation testing.
- FS-097 STAAD readable concrete-design output: live STAAD.Pro Computer Use verification opened V2, switched to Top View, ran Analysis and Design, and reached `Analysis Successfully Completed`, ACI 318-14 concrete design, and `0 Error(s), 0 Warning(s), 0 Note(s)`. Detailed `.ANL` inspection then showed every reinforcement value as `0.00` because design output inherited `kN-m` units and rounded practical steel areas in square metres to two decimals. STAAD export now selects ULS load combinations `3 4`, switches to `UNIT MMS NEWTON` before concrete design, and emits `FC`/`FYMAIN` directly in MPa so required reinforcement is reported in readable `mm2`-scale units. Regression asserts the explicit design load list and N-mm unit transition. This improves reporting only; the model remains a gravity baseline and is not OBO-ready until wind, seismic, drift, diaphragm/mass-source, geotechnical/foundation, and signed-engineer checks are complete.
- FS-098 STAAD displacement evidence: permit-baseline output now includes `PRINT JOINT DISPLACEMENTS` in addition to member forces, support reactions, element stresses, statics checks, and readable concrete design. Regression fails if the joint-displacement command is absent. Gravity displacement is baseline evidence only; lateral drift checks remain blocked on approved wind/seismic inputs and diaphragm/mass-source doctrine.
- FS-099 OBO gravity-baseline audit: Computer Use opened and ran `D:\Users\mfutol\Documents\FutolStructure Solver Validation 2026-07-02\FutolStructure_Olango_GravityBaselineV4.std` in STAAD.Pro Advanced 2024 QA&R. The final visible analysis dialog reported `Analysis Successfully Completed`, ACI 318-14 concrete design, and `0 Error(s), 0 Warning(s), 0 Note(s)`. V4 includes 146 joints, 112 frame members, 42 plates, exact 32-column/80-beam/42-slab parity, 42 upward plate normals, gravity statics balance, ULS design combinations 3/4, readable N-mm reinforcement demand, and joint displacements. Parsed gravity design demand: columns 600-1000 mm2 longitudinal steel; beams about 101-591 mm2. Maximum ULS gravity vertical translation was 3.166 mm at node 65 under combination 3. Created `D:\Users\mfutol\Documents\FutolStructure Solver Validation 2026-07-02\OBO_Permit_Readiness_2026-07-02.md`, explicitly marked not ready for submission. Blocking scope remains project-approved wind/seismic parameters, mass source/diaphragm, drift/P-Delta/stability, wall-load reconciliation, lateral-system/column-dimension and ductile detailing checks, slab/foundation design, plan/calculation reconciliation, and final signed/sealed engineer review.
- FS-100 Santa Magdalena structural-design scope correction: user confirmed the project jurisdiction is Santa Magdalena, Sorsogon and narrowed the requested work to structural analysis/design only, excluding administrative permit-document research. The saved FSTR schema contains no project address, occupancy, wind, seismic, or site-class metadata, so the legacy `Olango` filename is not treated as project-location truth. Added `v3/_logs/STRUCTURAL_ANALYSIS_STATUS_2026-07-02.md` as the structural-only working record. The verified gravity baseline remains unchanged. Preliminary isolated-footing sides based on service D+L, stored 150 kPa allowable bearing, and a provisional 10% footing/soil allowance range from 0.85 m to 1.55 m; peak service reaction is 311.01 kN at base node 15. These are not final designs and must be rerun with project-specific lateral forces, moments, uplift, and geotechnical confirmation. Next solver stage is ETABS lateral/mass/diaphragm/P-Delta/drift analysis after exact site and occupancy inputs are confirmed; STAAD remains the independent gravity/geometry cross-check.
- FS-101 governed ETABS mass/modal baseline and corrected STAAD wall load: dated ETABS working copy `StaMagdalena_ETABS_DiaphragmMassBaselineV2_2026-07-02.EDB` assigns rigid diaphragm D1 to all 42 slabs and uses a governed mass source with element self-mass once, `FS_SDL` at 1.0, `FS_WALL` at 1.0, and both `FS_DEAD` and `FS_LIVE` excluded. `FS_SDL` contains only zero-selfweight superimposed area dead load; `FS_WALL` contains 23 zero-selfweight permanent 2F line loads at the raw 6.0 kN/m source value. ETABS analysis returned 0 with zero negative stiffness eigenvalues. Total translational mass is 225.7232 kN-s2/m, equivalent to 2213.59 kN; cumulative UX/UY/RZ participation exceeds 90% by mode 3 and reaches 100% by mode 6. Mode 1 is Y translation, mode 2 is torsion, and mode 3 is X translation. Exported JSON, CSV, and readable Markdown summaries. FutolStructure export now passes raw wall load to ETABS/STAAD rather than the internal 1.2-factored beam design value, and saved-project smoke asserts this. Corrected STAAD V5 completed ACI analysis/design with 0 errors and 0 warnings: dead reaction 2314.37 kN, live reaction 414.79 kN, and combination-3 vertical translation 3.121 mm by linear superposition at node 65. V4's 2415.25 kN dead result is superseded because it used 7.2 kN/m wall load inside the dead case. Current global wall assignments still require beam-by-beam architectural reconciliation, and final lateral design remains blocked on exact site, occupancy/risk category, NSCP edition, site class, and lateral-system inputs.
- FS-102 ETABS default-diaphragm builder guard: native end-to-end execution of the generated OAPI builder showed that ETABS `NewBlank()` already contains diaphragm `D1`, so blindly calling `SetDiaphragm('D1', $false)` returns code 1. The builder now queries the diaphragm name list, verifies an existing D1 with `GetDiaphragm`, reuses it when rigid, and only deletes/recreates it when semi-rigid; if D1 is absent it creates a rigid D1. Smoke coverage now requires the existing-D1 audit path as well as slab assignments. Native rerun then succeeded, producing a new EDB/E2K with 32 columns, 80 beams, 42 slabs, 42 D1 assignments, and a mass source containing only element self-mass once plus `FS_SDL` and `FS_WALL`. This prevents a valid blank ETABS installation from rejecting the generated model before mass-source creation.
- FS-103 automatic ETABS analysis and modal audit export: the FutolStructure ETABS 22 OAPI builder now proceeds beyond model generation. It saves a dated working EDB, runs ETABS analysis, selects the default `Modal` case, retrieves modal participating mass ratios, exports `_modal_participation.csv`, and embeds the actual `Mass Source Definition`, `Mass Summary by Diaphragm`, and modal rows in `_audit.json`; the original source model is never overwritten. The builder numbers modes sequentially because ETABS returns zero-valued step numbers for this modal-result call. Native Olango validation created 32 columns, 80 beams, 42 slabs, and 42 D1 assignments; analysis returned 0, both mass tables were available with two rows each, all 12 modes exported as 1-12, cumulative UX/UY/RZ reached 1.0, and the ETABS log reported zero negative eigenvalues. Artifacts are under `D:\Users\mfutol\Documents\FutolStructure Solver Validation 2026-07-02\AutoAnalysisValidation`.
- FS-104 FutolStructure application identity mark: added a repo-owned square PNG icon at `v3/assets/futolstructure-icon.png`, using a compact structural-frame/FS monogram in the application's graphite, engineering-blue, concrete-white, and safety-orange palette. The same asset is now the browser favicon, the visible header mark, and the GitHub README identity/download target. It is intentionally text-free and high-contrast so it remains recognizable when scaled down for tabs and future desktop/mobile launchers.

When a bug is reported:

1. Reproduce/inspect locally when possible.
2. Fix smallest relevant code path.
3. Run syntax check.
4. Run `git diff --check`.
5. Open browser if requested.
6. Report changed files.
7. Do not commit/push unless explicitly instructed.

## Browser Launch

The local app can be opened directly:

`D:\projects\futolStructure 04-14-26\tributary-pro-v2.0\v3\index.html`

PowerShell:

`Start-Process -FilePath (Resolve-Path .\v3\index.html)`
