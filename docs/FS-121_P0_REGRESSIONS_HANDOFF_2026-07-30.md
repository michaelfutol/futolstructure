# FS-121 P0 Regression and Member Geometry Truth Handoff

- **Candidate:** FS-121
- **Date:** 2026-07-30
- **Branch:** `fix/fs-121-p0-regressions`
- **Worktree:** `D:\projects\futolStructure 04-14-26\futolstructure-fs121-p0-regressions`
- **Stacked parent:** `b5e1496f8d071d7fc55ac6f340ac1f3a70acb0b8`
- **Parent candidate:** FS-119 / PR #10
- **Scope:** P0-A actual member dimensions and governance, plus P0-B Measure regression
**Status:** Automated candidate gates pass; consolidated human acceptance remains pending

## Executive Verdict

FS-121 is a narrow stacked candidate based on the exact FS-119 head. It:

- repairs Measure snapping against rendered geometry;
- removes the artificial 150/200 mm manual member-size floor;
- retains a 25 mm software geometry minimum;
- separates actual geometry from configurable project/code minimums;
- adds proposed/existing/assessment/retrofit/override member classes;
- preserves exact entered dimensions in plan, 3D, schedules, save/load,
  reports, DXF, IFC, STAAD, and ETABS;
- blocks STAAD and ETABS only when the selected project policy requires it;
- keeps IFC available for coordination with explicit size-governance metadata;
- preserves rotated rectangular column geometry and analytical orientation.

The source gate and full browser suite pass. The real Olango project also
passes the existing P0-C1A release gate, including `.fstr`, DXF, IFC, STAAD,
ETABS, report, screenshot, and parser evidence.

The unrestricted Olango smoke still records six cantilever-side-beam versus
regular-beam overlaps on each of `2F` and `RF`. This condition is already
classified by the FS-119 release gate as known pre-existing out-of-scope
geometry. FS-121 does not claim that condition is repaired.

## Release Identity

The application release manifest remains FS-119 intentionally. FS-121 is an
unreleased stacked candidate and must not advertise itself as a released
build before it is rebased or retargeted after PR #10. Candidate identity is
provided by this branch, worktree, parent SHA, and local commit history.

No commit was pushed, no PR was opened, and no deployment was made during
this implementation.

## P0-B Measure Repair

### Root cause

Measure selected a snap using:

```text
world-distance converted to pixels + priority * 0.25
```

Projected grid and member-face candidates could therefore win over a nearby
column center or grid intersection. The failure was visible at ordinary
zoom and became less predictable after pan, member offsets, and tab changes.

### Corrected contract

The snap resolver now:

- reads current rendered column positions, including saved manual offsets;
- reads rendered beam axes, including saved beam alignment offsets;
- snaps to rotated column footprint edges instead of axis-aligned estimates;
- uses deterministic weighted ranking with a 0.75 px priority interval;
- gives column centers the strongest point priority;
- distinguishes grid intersections, column faces, beam axes, beam faces,
  slab edges, custom beams, dimension endpoints, and grid lines;
- keeps Ortho independent from snap acquisition;
- creates drafting dimensions without moving structural members.

### Browser evidence

| Check | Result |
| --- | --- |
| Layout offset-column snap | `column-center` |
| Layout column-face snap | Exact rendered face |
| Tributary offset-beam snap | `beam-axis` |
| Ortho 3-4 input | Exact 4.000 m vertical result |
| Dimension after zoom/pan | 1 created |
| `.fstr` round-trip | Dimension and member offsets retained |
| Member movement during Measure | None |

## P0-A Member Geometry Truth

### Three separate concepts

| Concept | FS-121 behavior |
| --- | --- |
| Software geometry minimum | 25 mm for manual column, beam, planted-column, and tie-beam geometry |
| Project/code minimum | Configurable warning/block policy, separate from geometry |
| Member status | `proposed_new`, `existing`, `existing_for_assessment`, `existing_for_retrofit`, or `engineer_override` |

The technical floor prevents invalid or zero-size solids. It does not imply
structural adequacy. Auto-sized new members continue to use their existing
design/practical defaults.

### Governance behavior

- `Warn`: preserve exact geometry and report the actual versus configured
  minimum without blocking solver export.
- `Block Solvers`: proposed undersized members block STAAD and ETABS.
- Existing, assessment, retrofit, and engineer-override members remain
  modelable and are reported as warnings rather than silently enlarged.
- IFC coordination remains available and carries `FS_SizeGovernanceStatus`,
  actual section, configured minimum, and member status.
- DXF and reports document actual geometry without claiming solver readiness.

The policy and member classes survive `.fstr` save/load. Beam member class is
stored with the floor-scoped beam override and is not copied back into the
shared beam object, preventing cross-floor classification leakage.

### Exact-dimension acceptance fixture

| Member | Entered truth | Verified surfaces |
| --- | --- | --- |
| Existing rectangular column | 150 x 400 mm, rotated 90 degrees | Plan footprint, Measure face, 3D, schedule, `.fstr`, shared solver model, STAAD, ETABS, IFC, DXF, reports |
| Existing square column | 150 x 150 mm | 3D, schedule, `.fstr`, shared solver model, STAAD, IFC, reports |
| Proposed beam | 150 x 175 mm | 3D, schedule, `.fstr`, shared solver model, STAAD, ETABS, IFC, DXF, reports |

No tested surface enlarged these members to 200 mm.

### Orientation parity

Rotated rectangular columns now use one footprint/orientation contract for:

- outer-face column alignment;
- beam trimming at column faces;
- simple and detailed plan rendering;
- Foundation and Base Reaction plan stubs;
- Measure column-face snaps;
- 3D column and pedestal meshes;
- coordinated DXF polygon edges and extents;
- IFC BRep footprint and metadata;
- STAAD `BETA` assignment;
- ETABS `FrameObj.SetLocalAxes`.

## Automated Evidence

### Required gates

```text
node v3/tools/check-fs.js --no-browser
node v3/tools/check-fs.js
git diff --check
```

Results:

| Gate | Result |
| --- | --- |
| Inline/source syntax | Pass |
| Engine source checks | Pass |
| No-browser regression | Pass |
| Full browser regression | Pass |
| Legacy `.fstr` fixture | Pass |
| Regular 3-floor P0-C fixture | Pass |
| Terminated-column P0-C fixture | Pass |
| Measure browser regression | Pass |
| Exact member-size browser regression | Pass |
| `git diff --check` | Pass, subject only to repository line-ending notices |

Member-size browser result:

| Policy | Warnings | Blocked |
| --- | ---: | ---: |
| Warn | 7 | 0 |
| Block Solvers | 2 | 5 |

The two existing columns remain warnings in block mode. The proposed test
beam and related proposed floor members are blocked. STAAD and ETABS both
reject the blocked model; IFC exports it with explicit blocked metadata.

### Real Olango evidence

Source file, read without overwrite:

```text
D:\Users\mfutol\Documents\FutolStructure Projects\Olango\01_CURRENT\Olango_2026-07-03_1330_2Floors_RECOVERED.fstr
```

The filename is stale: the payload contains `GF`, `2F`, and `RF`.

Accepted command:

```text
node v3/tools/check-fs.js --project <Olango.fstr> \
  --p0-c1a-release-gate \
  --p0-c1a-output-dir <temporary acceptance directory>
```

| Check | Result |
| --- | --- |
| Storeys | 3 |
| Shared export columns | 48 |
| Shared export beams | 127 |
| Shared export slabs | 62 |
| Area balance | 100.0% |
| Column/cantilever alignment mismatches | 0 |
| Cantilever slab overlaps | 0 |
| DXF parser entities | 5,561 |
| DXF audit errors/fixes | 0 / 0 |
| IFC parser | IFC2X3 |
| IFC products | 241 |
| P0-C1A acceptance | Pass |

Unrestricted project-smoke disclosure:

| Floor | Side-beam/regular-beam overlaps |
| --- | ---: |
| GF | 0 |
| 2F | 6 |
| RF | 6 |

The specialized release gate deliberately records this as
`knownPreExistingOutOfScope.cantileverSideBeamRegularOverlaps`. It is not an
FS-121 acceptance claim and should receive its own focused geometry repair.

## Exact File Scope

### `v3/index.html`

- Member-size constants, status normalization, and policy controls.
- Canonical exact size getters and setters using a 25 mm technical floor.
- Size-governance collection, readiness reporting, and solver gates.
- Rotated column plan footprints and shared half-extents.
- Measure snap priorities and rendered-footprint snapping.
- Exact `.fstr` persistence for policy, status, orientation, and dimensions.
- Schedule, CSV, A4 report, TAN report, 3D, STAAD, ETABS, and IFC parity.
- Planted-column and tie-beam manual size inputs no longer clamp to 200 mm.

### `v3/engine/loads.js`

- Manual column and beam overrides preserve actual values down to the
  technical geometry minimum.
- Auto-sizing retains code/practical minimum behavior.

### `v3/dxf-export.js`

- Rotated column extents and polygon linework.
- Exact section labels continue to use canonical dimensions.

### `v3/tools/check-fs.js`

- Expanded Measure browser regression.
- Exact sub-200 member fixture.
- Rotated column and face-snap checks.
- `.fstr`, schedule, 3D, report, DXF, IFC, STAAD, and ETABS parity checks.
- Warning/block and coordination-disclosure checks.

## Deliberate Exclusions

FS-121 does not:

- change canonical column termination or migration logic from FS-119;
- repair the known Olango cantilever-side-beam overlap condition;
- implement stair structural integration;
- change foundation vertical datums;
- add grade-beam schema;
- add command registry or keyboard command architecture;
- add PDF underlay or assisted import;
- change SolverLink;
- update GitHub, open a PR, deploy Vercel, or overwrite a project file.

## Rollback and Next Action

Rollback point:

```text
b5e1496f8d071d7fc55ac6f340ac1f3a70acb0b8
```

Safest next action:

1. Keep FS-121 isolated until PR #10 / FS-119 is resolved.
2. Retarget or rebase this branch onto the accepted FS-119 commit.
3. Rerun the same no-browser, browser, fixture, Olango, and diff gates.
4. Perform the consolidated human sequence for Measure and true member sizes.
5. Address the Olango cantilever overlap in a separate focused candidate.
6. Continue next with stair structural integration only after the P0 truth
   branches remain green.
