# FutolStructure Delivery Tracker

Updated: 2026-09-06. Update this file after each verified milestone; retain evidence links and unresolved blockers.

Governing direction: [Drive roadmap](https://docs.google.com/document/d/1l4THhH7AIRu_SW5WWB0ixpKqgR0jLG21cRenhR96Xc4/edit).
Detailed scope: [September delivery plan](FS_DELIVERY_ROADMAP_2026-09-05.md).

Statuses: Planned, In Progress, Locally Verified, Native Acceptance Pending, Released.
Locally Verified does not imply a published installer or a production deployment.

Current working candidate: `feature/fs-125-shared-analytical-inputs` at `e5c22b9`. The latest local Windows candidate is installed, and the branch is synchronized with its GitHub feature branch. `main` and Vercel production remain unchanged.

| ID | Milestone | Status | Evidence / Next Gate |
| --- | --- | --- | --- |
| UI-01 | Contextual workspaces, Stair Builder under Model, responsive draft panels | Locally Verified | check-workspaces.cjs; desktop/tablet/phone navigation, painted stair plan/elevation views, and unchanged model geometry |
| MODEL-01 | Independent floor edge defaults and manual member sizes | Locally Verified | check-fs.js partialCantilever.edgeSizing; independent, inherited and detached floors; native Bacacay readback still required |
| MODEL-02 | Persistent column segments, exact columnation and vertical datums | Native Acceptance Pending | [Bacacay geometry acceptance](BACACAY_GEOMETRY_ACCEPTANCE_2026-09-06.md) passes source/model parity and native ETABS 22.6 parity (52 frames, 12 areas, 34 beam offsets, 6 modal rows); [STAAD native gate](STAAD_NATIVE_ENGINE_BLOCK_2026-09-06.md) is blocked even for an independent minimal model; Revit inspection remains |
| ROOF-01 | Steel roof-frame modeler and solver handoff | In Progress | `FutolStructure.RoofFrameModel.v1` now has explainable AUTO hinge/roller assignments and explicit fixed override; next gate is interactive member placement, roof loads, save/load, and native solver acceptance |
| SAVE-01 | Protected revisions, explicit project opening and last ten files | Locally Verified | Browser persistence; installed candidate bridge and isolated recent-project startup passed |
| STAIR-01 | Canonical stair frames/shells and load handoff | In Progress | [Placement acceptance](STAIR_PLACEMENT_ACCEPTANCE_2026-09-06.md) verifies persisted X/Y offsets, 2D plan click placement, grid/column snap targets, legacy normalization, and responsive regression; native support connectivity and solver load handoff remain pending |
| FND-01 | IFC footings, pedestals and tie beams | Native Acceptance Pending | Vertical datum/foundation fixtures and parser; native Revit acceptance pending |
| WALL-01 | Walls, openings, lintels and attached-element loads | In Progress | [Wall plan editor acceptance](WALL_PLAN_EDITOR_ACCEPTANCE_2026-09-06.md) verifies governed floor plan drawing, grid/column/beam/free endpoint snaps, persistent IDs, CHB/plaster/height properties, solver opt-in default OFF, removal, and responsive regression; openings/lintels and native solver readback remain |
| ANALYSIS-01 | Immutable shared analysis request and QUBO study drafts | Locally Verified | AnalysisOptimization source contract; execution disabled, zero fabricated candidates |
| ANALYSIS-02 | Shared analytical loads, combinations, supports and mass | Locally Verified | `v3/engine/analysis-inputs.js`; canonical CSI model now carries governed cases, combinations, mass policy, explicit base supports, and validation; full browser rerun awaits local `ezdxf` dependency |
| ANALYSIS-03 | PyNite gravity runner and force/reaction readback | Locally Verified - baseline | Pinned PyNiteFEA 3.0.0 runner completed the canonical two-storey fixture with reactions/member readback and zero unresolved loads; native ETABS/STAAD comparison remains required |
| ANALYSIS-04 | OpenSees static and modal adapters | Planned | Depends on ANALYSIS-02; each formulation and analysis mode needs independent acceptance |
| OPT-01 | QUBO section candidates and reanalysis | Planned | Depends on validated baseline analysis, section catalogs and explicit constraints |
| IMPORT-01 | ETABS audit JSON comparison | Locally Verified | solver-roundtrip.js; match/difference/foreign-project cases; read-only |
| IMPORT-02 | Native EDB/STD/Tekla import and reviewed reconciliation | Planned | Stable member IDs, source revision checks and candidate approval |
| IMPORT-03 | PDF/CAD underlay and assisted model entry | Planned | Calibration, user-confirmed inference and preserved source drawing |
| DOC-01 | Coordinated DXF/IFC/A4 and quantities | Native Acceptance Pending | Parser/browser evidence; final CAD sheet and Revit inspection |
| DETAIL-01 | Approved reinforcement, schedules and shop drawings | Planned | Reviewed solver/design results plus anchorage, laps, joints and constructability |
| RELEASE-01 | FS-124-RC1 GitHub candidate and local Windows install | Locally Verified | Installed 3.16.124-rc.1; source checkpoint db13836; [draft PR #11](https://github.com/michaelfutol/futolstructure/pull/11); public release pending |
| RELEASE-02 | Production web and public Windows update | Planned | Merge/release after candidate acceptance; matching version/provenance across both |
| CLOUD-01 | Authentication and private project storage | Planned | Project ownership, access isolation, recovery and security tests before cloud sync |

## Immediate Sequence

1. Resolve the local STAAD analysis-engine/licensing startup issue, then rerun the dated Bacacay readback; do not mark MODEL-02 accepted from source text alone.
2. ~~Record MODEL-01 regression evidence, then validate a dated Bacacay export against source coordinates, member sizes, analytical centroid joints, and physical member offsets.~~ **Source/model parity and native ETABS 22.6 acceptance verified 2026-09-06; STAAD native readback and Revit inspection remain the gate.**
3. Compare the pinned PyNite baseline against an accepted ETABS/STAAD fixture, then add controlled cancellation/logging and a dated acceptance artifact; do not duplicate load or support assembly.
4. ~~Complete the STAIR-01 editable centerline-node and floor-plan projection slice, then validate explicit stair frames/shells or equivalent reactions in native solvers.~~ **Placement/snap slice verified 2026-09-06; next gate is native ETABS/STAAD stair connectivity and load readback.**
5. ~~Build the WALL-01 plan line editor and hover properties, then connect its explicit inventory to DXF/IFC and opt-in ETABS/STAAD export.~~ **Plan-line editor and governed snap/property slice verified 2026-09-06; next gate is openings/lintels, hover editing, DXF/IFC parity, and native solver readback.**

## Release Evidence

- Source checkpoint: db13836f698cbd90d49ec5382f5fe193788e10b0.
- Installed version: 3.16.124-rc.1 / FS-124-RC1, installer exit code 0.
- Installed smoke: passed with isolated profile, correct source revision and no page errors; output/playwright/desktop/desktop-smoke.json.
- Installer SHA256: DADD15B89B104306B327272BF8066E172AD96331C0146D107580444AB87671D7.
- Full release regression: passed; output/playwright/workspaces/fs124-full-regression.log. Independent edge defaults: 2F 225x475 mm, RF 330x620 mm. After detaching typical framing, changing 2F to 250x500 leaves RF 225x475. Manual overrides: 2F 210x360, RF 330x620.
- GitHub review: [draft PR #11](https://github.com/michaelfutol/futolstructure/pull/11), branch release/fs-124-desktop-workspaces-rc1. Source and release metadata pushed; production main has not been changed.
- ANALYSIS-02 source gate passed with `node v3/tools/check-fs.js --no-browser`; the browser run reached the new assertions but stopped at the existing strict-DXF gate because this machine has no Python interpreter with `ezdxf` installed. Native solver acceptance remains separate.
- Bacacay shared analytical/physical geometry evidence: [BACACAY_GEOMETRY_ACCEPTANCE_2026-09-06.md](BACACAY_GEOMETRY_ACCEPTANCE_2026-09-06.md). Native ETABS acceptance passed with analysis return `0`; STAAD engine invocation remains unresolved because no native readback artifact was produced.
- STAAD native diagnostic evidence: [STAAD_NATIVE_ENGINE_BLOCK_2026-09-06.md](STAAD_NATIVE_ENGINE_BLOCK_2026-09-06.md). Both the Bacacay export and an independent minimal model exit with code `8` without native output, so STAAD remains an environment gate.
- Stair placement evidence: [STAIR_PLACEMENT_ACCEPTANCE_2026-09-06.md](STAIR_PLACEMENT_ACCEPTANCE_2026-09-06.md). Browser placement, snap metadata, normalization, and responsive regression passed; native stair solver acceptance remains open.
- Wall plan editor evidence: [WALL_PLAN_EDITOR_ACCEPTANCE_2026-09-06.md](WALL_PLAN_EDITOR_ACCEPTANCE_2026-09-06.md). Plan-line creation/removal, endpoint snapping, explicit wall properties, solver opt-in guard, and responsive regression passed; native wall solver acceptance remains open.
