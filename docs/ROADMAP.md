# FutolStructure Delivery Tracker

Updated: 2026-09-05. Update this file after each verified milestone; retain evidence links and unresolved blockers.

Governing direction: [Drive roadmap](https://docs.google.com/document/d/1l4THhH7AIRu_SW5WWB0ixpKqgR0jLG21cRenhR96Xc4/edit).
Detailed scope: [September delivery plan](FS_DELIVERY_ROADMAP_2026-09-05.md).

Statuses: Planned, In Progress, Locally Verified, Native Acceptance Pending, Released.
Locally Verified does not imply a published installer or a production deployment.

| ID | Milestone | Status | Evidence / Next Gate |
| --- | --- | --- | --- |
| UI-01 | Contextual workspaces, Stair Builder under Model, responsive draft panels | Locally Verified | check-workspaces.cjs; desktop/tablet/phone navigation, painted stair plan/elevation views, and unchanged model geometry |
| MODEL-01 | Independent floor edge defaults and manual member sizes | Locally Verified | check-fs.js partialCantilever.edgeSizing; independent, inherited and detached floors; native Bacacay readback still required |
| MODEL-02 | Persistent column segments, exact columnation and vertical datums | Native Acceptance Pending | Legacy/regular/terminated fixtures and vertical-datum baseline; compare current candidate in ETABS/STAAD/Revit |
| ROOF-01 | Steel roof-frame modeler and solver handoff | In Progress | `FutolStructure.RoofFrameModel.v1` now has explainable AUTO hinge/roller assignments and explicit fixed override; next gate is interactive member placement, roof loads, save/load, and native solver acceptance |
| SAVE-01 | Protected revisions, explicit project opening and last ten files | Locally Verified | Browser persistence; installed candidate bridge and isolated recent-project startup passed |
| STAIR-01 | Canonical stair frames/shells and load handoff | In Progress | 2D stair plan/elevation workspace now linked to the existing structural model and 3D preview; native support connectivity, solver load handoff, and editable node snapping remain pending |
| FND-01 | IFC footings, pedestals and tie beams | Native Acceptance Pending | Vertical datum/foundation fixtures and parser; native Revit acceptance pending |
| WALL-01 | Walls, openings, lintels and attached-element loads | In Progress | `v3/engine/walls.js` canonical inventory plus Wall Elevations workspace govern line IDs, CHB/plaster, openings, lintels, elevations, and solver opt-in; next gate is plan drawing/hover editor plus save/load regression |
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

1. Review [PR #11](https://github.com/michaelfutol/futolstructure/pull/11) and complete native acceptance before production promotion.
2. Record MODEL-01 regression evidence, then validate a dated Bacacay export against source coordinates and member sizes.
3. Compare the pinned PyNite baseline against an accepted ETABS/STAAD fixture, then add controlled cancellation/logging and a dated acceptance artifact; do not duplicate load or support assembly.
4. Complete the STAIR-01 editable centerline-node and floor-plan projection slice, then validate explicit stair frames/shells or equivalent reactions in native solvers.
5. Build the WALL-01 plan line editor and hover properties, then connect its explicit inventory to DXF/IFC and opt-in ETABS/STAAD export.

## Release Evidence

- Source checkpoint: db13836f698cbd90d49ec5382f5fe193788e10b0.
- Installed version: 3.16.124-rc.1 / FS-124-RC1, installer exit code 0.
- Installed smoke: passed with isolated profile, correct source revision and no page errors; output/playwright/desktop/desktop-smoke.json.
- Installer SHA256: DADD15B89B104306B327272BF8066E172AD96331C0146D107580444AB87671D7.
- Full release regression: passed; output/playwright/workspaces/fs124-full-regression.log. Independent edge defaults: 2F 225x475 mm, RF 330x620 mm. After detaching typical framing, changing 2F to 250x500 leaves RF 225x475. Manual overrides: 2F 210x360, RF 330x620.
- GitHub review: [draft PR #11](https://github.com/michaelfutol/futolstructure/pull/11), branch release/fs-124-desktop-workspaces-rc1. Source and release metadata pushed; production main has not been changed.
- ANALYSIS-02 source gate passed with `node v3/tools/check-fs.js --no-browser`; the browser run reached the new assertions but stopped at the existing strict-DXF gate because this machine has no Python interpreter with `ezdxf` installed. Native solver acceptance remains separate.
