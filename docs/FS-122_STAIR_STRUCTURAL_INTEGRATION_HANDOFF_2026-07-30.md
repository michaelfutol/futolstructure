# FS-122 Stair Structural Integration Handoff

- **Candidate:** FS-122
- **Date:** 2026-07-30
- **Branch:** `feature/fs-122-stair-structural`
- **Worktree:** `D:\projects\futolStructure 04-14-26\futolstructure-fs122-stair-structural`
- **Direct parent:** `3fc5ef2eb324cf8608c9cb278147b764dde42721`
- **Parent candidate:** FS-121 P0 regressions
- **Structural baseline:** FS-119 / PR #10 through the FS-121 stack
- **Scope:** Stair structural objects, alignment, elevations, loads, 3D parity,
  persistence, coordination exports, and analytical gates
- **Status:** Automated candidate gates pass; consolidated human and native
  solver acceptance remain pending

## Executive Verdict

FS-122 replaces the old footprint-only stair representation with one
governed structural stair model. A created stair now has:

- explicit flight slabs and a landing slab;
- stair beams and landing beams with real sections;
- a landing beam at the actual intermediate elevation;
- a destination slab opening;
- four mapped main-frame support reactions;
- preliminary dead, live, finish, railing/wall, and beam self-weight data;
- one persisted alignment and support-mapping contract;
- matching Stair Builder 3D and main-model 3D geometry;
- plan IDs and a DXF component schedule;
- A4 report integration;
- IFC2X3 coordination geometry and metadata;
- STAAD and ETABS blocking until analytical acceptance is complete.

The deterministic dogleg fixture contains 18 governed objects:

| Object | Count |
| --- | ---: |
| Stair flight slabs | 2 |
| Landing slabs | 1 |
| Stair beams | 6 |
| Landing beams | 4 |
| Stair openings | 1 |
| Support/reaction objects | 4 |
| Physical 3D meshes | 13 |

No SolverLink file or repository was touched. No GitHub push, pull request,
merge, deployment, or user project overwrite was performed.

## Canonical Model

The new pure engine is:

```text
v3/engine/stairs.js
```

Its schema is:

```text
FutolStructure.StairStructuralModel.v1
```

The stair input remains the editable source. The structural model is
deterministically reconciled from that input and the shared active building
geometry. It is persisted for traceability and regenerated on load so stale
derived geometry cannot silently become a competing source.

### Structural member types

```text
stair_flight_slab
landing_slab
stair_beam
landing_beam
stair_opening
stair_support_reaction
```

Each component has a stable ID derived from the stair ID. The accepted
dogleg pattern includes:

```text
ST-1-FS1
ST-1-FS2
ST-1-LS1
ST-1-SB-BOT
ST-1-SB-TOP
ST-1-SB-F1-L
ST-1-SB-F1-R
ST-1-SB-F2-L
ST-1-SB-F2-R
ST-1-LB-IN
ST-1-LB-OUT
ST-1-LB-L
ST-1-LB-R
ST-1-OPENING
ST-1-RXN-LOWER-1
ST-1-RXN-LOWER-2
ST-1-RXN-UPPER-1
ST-1-RXN-UPPER-2
```

## Alignment and Elevation Contract

The Stair Builder now records:

- source and destination floor IDs;
- bay X/Y;
- grid anchor;
- insertion anchor;
- rotation at 0, 90, 180, or 270 degrees;
- world-coordinate bounds;
- lower, landing, and upper absolute elevations;
- destination opening;
- support mappings;
- engineer approval and integration state.

The browser fixture connected `2F` to `RF` using:

| Datum | Elevation |
| --- | ---: |
| Lower level | 3.000 m |
| Intermediate landing | 4.500 m |
| Upper level | 6.000 m |

`ST-1-LB-IN` is a real `200 x 350 mm` frame member from
`(4.79, 0.00, 4.50)` to `(4.79, 4.06, 4.50)`. It is not projected onto
either main floor plane.

The preview validates:

- selected bay and level pair;
- footprint fit;
- destination opening;
- main-frame support availability;
- geometry clash status;
- load handoff;
- integration readiness.

## Stair Builder and 3D Parity

The dedicated Stair Builder now includes:

- level pair, bay, stair type, and run axis;
- rotation and insertion anchor;
- clear width, landing, tread, rise, waist, and well gap;
- stair-beam and landing-beam sections;
- finishes, live load, railing load, and wall load;
- engineer review control;
- live metrics for elevations, components, supports, and integration;
- an independent Three.js preview with transparent main-frame context.

After integration, the same canonical components render in the main 3D
model. The accepted browser fixture produced:

| View | Result |
| --- | ---: |
| Governed objects | 18 |
| Main 3D stair meshes | 13 |
| Stair Builder preview meshes | 17, including context/support markers |
| Main supports mapped | 4 of 4 |
| Destination opening fragments | 4 |

The obsolete footprint-only 3D helper path was removed.

## Load Handoff

The engine computes preliminary:

- flight and landing self-weight;
- finish dead load;
- stair live load;
- railing and wall edge load;
- stair-beam and landing-beam self-weight;
- support reactions at lower and upper main-frame interfaces.

The browser fixture produced:

| Load | Result |
| --- | ---: |
| Stair dead load | 80.9994 kN |
| Stair live load | 25.4880 kN |
| Reactions | 4 preliminary support objects |

The governing no-double-count rule is:

```text
export_shells_and_frames_or_reactions_never_both
```

Preliminary reaction handoff is documented but is not applied when explicit
stair shells and frames are exported. Sloped flight shells use:

```text
excluded_from_horizontal_rigid_diaphragm
```

## Persistence and Views

The browser acceptance creates a stair, serializes the project, reloads it,
and verifies:

- same stair ID;
- same structural schema;
- same 18 stable component IDs;
- intermediate landing beam retained;
- rotation retained;
- four support mappings retained;
- destination opening retained;
- analytical export status retained.

Plan rendering now identifies stair and landing beams, including hidden
intermediate members. The schedule uses the same structural IDs as plan,
3D, report, DXF, and IFC.

## Export Behavior

### DXF

The strict R12/AC1009 package now includes:

- stair and landing beam linework;
- intermediate-elevation annotation;
- `STAIR STRUCTURAL COMPONENT SCHEDULE`;
- component IDs synchronized with the plan and canonical model;
- Arial through the existing validated `FS-ARIAL` text style.

The existing R12 writer, layers, CRLF output, and strict parser behavior are
preserved.

### A4 report

The report includes:

- stair integration summary;
- lower, landing, and upper elevations;
- structural component schedule;
- preliminary load handoff;
- mapped reaction schedule;
- no-double-count and solver-readiness disclosure.

### IFC

IFC2X3 coordination export now includes:

- flight and landing slabs as `IfcSlab`;
- stair and landing beams as `IfcBeam`;
- destination opening as `IfcOpeningElement`;
- stair/component IDs;
- source type and elevation metadata;
- support topology;
- load source and status;
- diaphragm and analytical-readiness metadata.

Browser fixture IFC evidence:

| IFC item | Result |
| --- | ---: |
| Schema | IFC2X3 |
| Stair/landing beams added | 10 |
| Stair/landing slabs added | 3 |
| Opening elements | 1 |
| IfcOpenShell parse | Pass |
| Total `IfcBeam` in fixture model | 133 |
| Total `IfcSlab` in fixture model | 56 |
| Total `IfcOpeningElement` | 1 |

### STAAD and ETABS

The shared CSI payload contains stair beams, slabs, opening, and reaction
objects. Native analytical emission remains blocked unless all of these are
true:

1. alignment passes;
2. all external supports are mapped;
3. load mapping exists;
4. engineer approval is recorded;
5. native solver connectivity has been validated.

The current accepted browser fixture is intentionally blocked:

```text
STAAD export blocked by 1 unresolved stair integration issue(s).
ETABS export blocked by 1 unresolved stair integration issue(s).
```

This is a safety boundary, not a missing silent export. FS-122 does not
claim validated stair shell/frame behavior in either solver.

## Automated Evidence

Required gates:

```text
node v3/tools/check-fs.js --no-browser
node v3/tools/check-fs.js
node v3/tools/check-fs.js --project <Olango.fstr> \
  --p0-c1a-release-gate \
  --p0-c1a-output-dir output/playwright/fs122-p0-c1a-regression
git diff --check
```

| Gate | Result |
| --- | --- |
| Inline/source syntax | Pass |
| Pure stair-engine fixture | Pass |
| No-browser regression | Pass |
| Full browser regression | Pass |
| Dynamic `.fstr` stair round-trip | Pass |
| Legacy `.fstr` migration suite | Pass |
| Regular/terminated P0-C fixtures | Pass |
| Main/Stair 3D parity | Pass |
| DXF stair schedule and IDs | Pass |
| IFC IfcOpenShell parser | Pass |
| STAAD/ETABS unresolved-stair gates | Pass |
| Olango P0-C1A release gate | Pass |
| `git diff --check` | Pass, subject only to repository line-ending notices |

Frozen stair fixture:

```text
v3/tools/fixtures/stair-dogleg-structural-baseline.json
```

Visual artifacts:

```text
output/playwright/fs122-stair-structural/01_FS122_StairBuilder.png
output/playwright/fs122-stair-structural/02_FS122_Main3D_StairIntegration.png
```

Olango parity artifacts:

```text
output/playwright/fs122-p0-c1a-regression
```

## Inherited Olango Disclosure

The ordinary current-project smoke still reports six cantilever-side-beam
versus regular-beam overlaps on `2F`. The same result reproduces on the
clean FS-121 parent. The specialized P0-C1A release gate records this as:

```text
knownPreExistingOutOfScope.cantileverSideBeamRegularOverlaps
```

FS-122 does not modify or claim to repair that cantilever geometry.

## Exact File Scope

### `v3/engine/stairs.js`

- Pure stair normalization and structural component generation.
- Coordinate primer and actual intermediate elevations.
- Support resolution, preliminary loads, reactions, and solver readiness.
- Summary helpers and no-double-count/diaphragm policy.

### `v3/index.html`

- Stair Builder alignment, section, load, approval, and preview controls.
- Shared structural reconciliation and persistence.
- Plan, main 3D, Stair 3D, schedules, report, IFC, and CSI payload parity.
- STAAD/ETABS stair topology gates.

### `v3/dxf-export.js`

- Stair/landing beam linework and elevation annotations.
- Structural stair component schedule with canonical IDs.
- Drawing index integration.

### `v3/tools/check-fs.js`

- Source contract and deterministic fixture checks.
- Stair creation, support, load, 3D, save/load, DXF, IFC, and gate tests.
- Independent IfcOpenShell parsing with `IfcOpeningElement` count.

### `v3/tools/fixtures/stair-dogleg-structural-baseline.json`

- Frozen dogleg geometry, elevations, sections, loads, supports, counts,
  and analytical governance baseline.

## Deliberate Exclusions

FS-122 does not:

- certify stair structural adequacy or reinforcement;
- emit stair shells/frames into STAAD or ETABS before native acceptance;
- automatically join sloped flights to a horizontal rigid diaphragm;
- model architectural finishes as physical BIM layers;
- model detailed treads, risers, handrails, or reinforcement;
- implement foundation vertical datum or grade-beam governance;
- repair the inherited Olango cantilever overlap;
- modify SolverLink;
- update the FS-119 release manifest;
- push, open a PR, merge, deploy, or overwrite a user project.

## Rollback and Next Action

Rollback point:

```text
3fc5ef2eb324cf8608c9cb278147b764dde42721
```

Safest next sequence:

1. Keep FS-122 isolated while FS-119 and the FS-121 stack are reviewed.
2. Run consolidated human Stair Builder and main-3D alignment checks.
3. Validate one generated stair IFC in Revit.
4. Validate actual stair frame/shell connectivity and loads in STAAD/ETABS
   before enabling analytical emission.
5. Retarget or rebase the stack after its parent candidates are accepted.
6. Continue the approved queue with vertical datum/foundation governance in
   a new child branch without changing FS-122.
