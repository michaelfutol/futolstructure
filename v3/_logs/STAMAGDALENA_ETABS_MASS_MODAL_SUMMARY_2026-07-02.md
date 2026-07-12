# Sta. Magdalena ETABS Mass Source and Modal Summary

Run date: 2026-07-02

## File control

- Original retained unchanged: `FutolStructure_ETABS_2026-07-01_221810.EDB`
- Dated working copy analyzed: `StaMagdalena_ETABS_DiaphragmMassBaselineV2_2026-07-02.EDB`
- ETABS analysis return: 0
- Negative stiffness eigenvalues reported: 0
- Corrected FutolStructure OAPI builder validation: native EDB/E2K generation succeeded with 32 columns, 80 beams, 42 slabs, and 42 rigid-diaphragm assignments.
- FutolStructure now performs this ETABS analysis and exports mass-source/diaphragm audit JSON plus modal participation CSV automatically from the generated builder.

## Mass source confirmation

| Source | Mass multiplier | Confirmation |
|---|---:|---|
| Element self-mass | 1.0 | Included once |
| FS_DEAD | 0.0 | Excluded to prevent duplicate member self-mass |
| FS_SDL | 1.0 | Superimposed slab dead load only; load-pattern self-weight = 0 |
| FS_WALL | 1.0 | Permanent wall/partition line load only; load-pattern self-weight = 0 |
| FS_LIVE | 0.0 | Excluded pending occupancy confirmation |

Assignment audit: 42 rigid-diaphragm slab areas, 42 SDL-loaded slab areas, and 23 wall-loaded 2F beams at 6.0 kN/m. The legacy global wall load still requires beam-by-beam reconciliation against the architectural wall plan before final design.

## Diaphragm mass summary

| Story | Diaphragm | Mass X (kN-s2/m) | Mass Y (kN-s2/m) | Mass moment of inertia | Center X (m) | Center Y (m) |
|---|---|---:|---:|---:|---:|---:|
| RF | D1 | 80.9175 | 80.9175 | 2215.3364 | 7.4180 | -4.4813 |
| 2F | D1 | 144.8057 | 144.8057 | 4150.9601 | 7.4453 | -4.5155 |
| Total | | 225.7232 | 225.7232 | | | |

Equivalent total seismic weight from the reported translational mass is 2213.59 kN using g = 9.80665 m/s2.

## Modal participation ratios

| Mode | Period (s) | UX | UY | RZ | Sum UX | Sum UY | Sum RZ |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.502894 | 0.000183 | 0.918062 | 0.025999 | 0.000183 | 0.918062 | 0.025999 |
| 2 | 0.387033 | 0.043107 | 0.025095 | 0.867077 | 0.043290 | 0.943157 | 0.893076 |
| 3 | 0.350882 | 0.881661 | 0.000438 | 0.043622 | 0.924951 | 0.943595 | 0.936697 |
| 4 | 0.197729 | 0.000023 | 0.054339 | 0.001414 | 0.924974 | 0.997934 | 0.938111 |
| 5 | 0.149099 | 0.002062 | 0.002046 | 0.060386 | 0.927035 | 0.999980 | 0.998497 |
| 6 | 0.132210 | 0.072965 | 0.000020 | 0.001503 | 1.000000 | 1.000000 | 1.000000 |

Modes 7-12 have approximately 0.0034 s periods and negligible additional UX, UY, or RZ participation.

## Interpretation and limitations

- Mode 1 is predominantly Y translation.
- Mode 2 is predominantly torsion.
- Mode 3 is predominantly X translation.
- More than 90% cumulative UX, UY, and RZ participation is reached by mode 3; effectively 100% is reached by mode 6.
- This is a diaphragm and mass-source baseline, not a completed wind/seismic design.
- Final lateral analysis still requires the confirmed occupancy/risk category, exact site, governing NSCP edition, site class/geotechnical basis, lateral-force-resisting system, accidental eccentricity, response-spectrum/base-shear scaling, P-Delta, drift, torsional-irregularity, overturning, and uplift checks.
