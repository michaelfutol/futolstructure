# ETABS and SAFE Demo Runbook

## Validated Baseline

- Source model: `FutolStructure_2026-06-02 - Olango.fstr`
- ETABS version: 22.6.0
- Exported model: 2 stories, 112 frame objects, 42 area objects
- Native E2K round-trip: passed with identical object counts
- ETABS analysis: completed with zero negative stiffness eigenvalues
- STAAD.Pro 2024 batch analysis: completed with zero warnings and zero errors
- Cross-solver external live load: 414.78 kN in both ETABS and STAAD
- Self-weight reconciliation: STAAD dead total 2415.25 kN versus ETABS 2371.49 kN (about 1.8%); review gross-member versus ETABS overlap/end-length treatment before permit issue.
- Gravity cases: `FS_DEAD`, `FS_SDL`, `FS_LIVE`, and `FS_WALL`
- ULS combinations are included; wind, seismic, diaphragm, and final RC design review are not yet automated.

## ETABS Demo

1. Open the Olango `.fstr` and click `Run Analysis`.
2. Click `ETABS` and run the downloaded PowerShell builder.
3. In ETABS, show the unmirrored plan, matching 2F/RF slab openings, story definitions, concrete frame/slab sections, fixed supports, load patterns, slab loads, wall line loads, and ULS combinations.
4. Run ETABS analysis and show the analysis log or deformed shape.
5. Explain that the builder saves both a real `.edb` and an ETABS-native `.e2k`, plus an audit JSON with exported object counts.

## SAFE Demo

1. Click `SAFE` and run the downloaded handoff builder.
2. In ETABS, use `File > Export > Story as SAFE V12 .f2k File`.
3. Use `Floor Loads` for an ordinary gravity floor.
4. Use `Floor Loads and Loads from Above` for a transfer floor or foundation mat.
5. Open the `.f2k` in SAFE and review units, supports, loads, meshing, and design preferences before analysis.

## Accurate Claims

- Say: FutolStructure creates an ETABS 22 gravity-model baseline through CSI OAPI, with native E2K round-trip and ETABS analysis validation.
- Say: SAFE handoff follows CSI's supported ETABS-to-SAFE V12 route.
- Do not claim: completed seismic design, final code-compliant RC member design, or independently validated direct SAFE F2K generation.
