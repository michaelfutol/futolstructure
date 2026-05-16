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

- Repo: `ikel-eidra/tributary-pro-v2.0`
- Local path: `D:\projects\futolStructure 04-14-26\tributary-pro-v2.0`
- Branch: `claude/audit-repository-JyTBB`
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
- final ETABS import validity
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
- Keep ETABS marked experimental until import succeeds in ETABS 22.6+.
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

- ETABS export is experimental.
- ETABS 22.6 import has failed before.
- Keep warnings visible.
- Prefer STAAD for current baseline workflow.

### Revit / IFC

- Future goal is possible.
- Current priority remains RC structural model truth and solver handoff.
- Current IFC export should be treated as early/basic geometry handoff only until Revit import/link is validated.
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
