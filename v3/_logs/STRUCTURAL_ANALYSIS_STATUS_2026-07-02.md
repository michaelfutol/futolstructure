# Sta. Magdalena Structural Analysis and Design Status

Status: GRAVITY BASELINE VERIFIED; LATERAL AND FINAL DESIGN PENDING

This record covers structural analysis, design, detailing, and solver reconciliation only. It does not cover administrative building-permit requirements.

## Project basis

- Jurisdiction/location known to date: Municipality of Santa Magdalena, Sorsogon
- Exact barangay, site address, and coordinates: pending
- Occupancy/use and risk category: pending
- Source model: `FutolStructure_2026-06-02 - Olango.fstr` (legacy filename; project metadata is not stored in this FSTR schema)
- Current STAAD baseline: `StaMagdalena_STAAD_GravityBaselineV5_2026-07-02.std`
- Current ETABS modal baseline: `StaMagdalena_ETABS_DiaphragmMassBaselineV2_2026-07-02.EDB`
- Materials: concrete fc' = 21 MPa; reinforcing steel fy = 415 MPa
- Stored allowable soil bearing pressure: 150 kPa, pending geotechnical confirmation

## Verified solver baseline

- STAAD.Pro Advanced 2024 completed analysis and ACI 318-14 concrete design with 0 errors and 0 warnings.
- Model inventory: 2 storeys, 146 joints, 32 column segments, 80 beams, and 42 slab plates.
- Active slabs: 21 on 2F and 21 on RF.
- Deleted slab IDs S5, S9, S10, and S12 remain excluded on both levels.
- All 42 slab plates have upward normals.
- Gravity load cases: dead/superimposed dead and live.
- Current strength combinations: 1.2D + 1.6L and 1.4D.
- Dead load/reaction equilibrium: 2314.37 kN.
- Live load/reaction equilibrium: 414.79 kN.
- Maximum primary dead-load vertical translation: 2.014 mm at node 65.
- Maximum primary live-load vertical translation: 0.440 mm at node 65.
- Linear superposition for combination 3 gives 3.121 mm vertical translation at node 65.
- Gravity-only longitudinal reinforcement demand: columns 600-1000 mm2; beams approximately 101-591 mm2.

The earlier V4 dead-load result of 2415.25 kN is superseded. V4 applied the already factored 7.2 kN/m wall load inside the dead load case. V5 correctly applies the unfactored 6.0 kN/m permanent wall load and leaves the 1.2 factor to the strength combination.

## ETABS mass source and modal baseline

- The dated V2 working copy was created without overwriting the original ETABS file.
- All 42 slab areas are assigned to rigid diaphragm `D1`.
- Element self-mass is included once through the element-mass option.
- `FS_SDL` is included at factor 1.0 and contains only superimposed area dead load.
- `FS_WALL` is included at factor 1.0 and contains only permanent wall line load.
- `FS_DEAD` is excluded from the mass source to avoid duplicating element self-mass.
- `FS_LIVE` is excluded pending confirmation that the final occupancy requires a live-load mass fraction.
- Total translational mass is 225.7232 kN-s2/m, equivalent to 2213.59 kN weight using standard gravity.
- Modal cumulative participation exceeds 90% in UX, UY, and RZ by mode 3 and reaches 100% by mode 6.
- Mode 1 is Y-translation dominant, mode 2 is torsion dominant, and mode 3 is X-translation dominant. Accidental torsion and torsional-irregularity checks remain mandatory in the final lateral model.

## Saved loading assumptions

- 2F: 3.2 m storey height, 100 mm slab, 2.0 kPa superimposed dead load, 2.0 kPa live load, and legacy 6.0 kN/m wall load.
- RF: 3.2 m storey height, 100 mm slab, 1.5 kPa superimposed dead load, 1.0 kPa live load, and no wall load.
- Global wall load assignment must be reconciled beam by beam before final design.
- No project-specific wind or seismic load is assigned yet.

## Preliminary gravity footing sizing

Square footing sides below use service D + L reactions, the stored 150 kPa allowable bearing pressure, a provisional 10% allowance for footing/soil weight, and 50 mm size increments. They are not final footing designs.

| Base node | D (kN) | L (kN) | Service (kN) | Preliminary square side (m) |
|---:|---:|---:|---:|---:|
| 1 | 77.56 | 12.77 | 90.33 | 0.85 |
| 3 | 142.21 | 24.44 | 166.65 | 1.15 |
| 5 | 187.34 | 35.92 | 223.26 | 1.30 |
| 7 | 156.69 | 28.76 | 185.45 | 1.20 |
| 9 | 103.22 | 17.14 | 120.36 | 0.95 |
| 11 | 77.27 | 12.11 | 89.38 | 0.85 |
| 13 | 185.68 | 32.12 | 217.80 | 1.30 |
| 15 | 249.78 | 50.76 | 300.54 | 1.50 |
| 17 | 216.74 | 41.65 | 258.39 | 1.40 |
| 19 | 116.40 | 17.47 | 133.87 | 1.00 |
| 21 | 119.80 | 20.99 | 140.79 | 1.05 |
| 23 | 213.45 | 39.58 | 253.03 | 1.40 |
| 25 | 188.14 | 33.63 | 221.77 | 1.30 |
| 27 | 78.72 | 12.33 | 91.05 | 0.85 |
| 29 | 101.38 | 17.73 | 119.11 | 0.95 |
| 31 | 99.99 | 17.39 | 117.38 | 0.95 |

Final footing design must include lateral moments, eccentricity, uplift, sliding, overturning, soil pressure distribution, punching shear, one-way shear, flexure, dowels, tie beams, settlement, and property-line constraints.

## Analysis and design sequence

1. Confirm the exact site and occupancy so the wind exposure, hazard basis, and risk category are defensible.
2. Confirm the lateral-force-resisting system and diaphragm assumption in both principal directions.
3. Reconcile all wall, stair, tank, equipment, and other imposed loads with the drawings.
4. Build ETABS lateral cases in both directions, accidental torsion, mass source, modal case, and code combinations.
5. Run P-Delta, drift, torsional-irregularity, stability, overturning, and uplift checks.
6. Reconcile ETABS and STAAD gravity reactions and frame demands.
7. Finalize beam and column reinforcement, shear reinforcement, joints, confinement, laps, and development lengths.
8. Complete slab flexure, shear, deflection, opening, cantilever, and edge-beam checks.
9. Complete isolated-footing and tie-beam analysis/design using final support forces.
10. Reconcile calculations with structural plans, schedules, notes, and details for engineer review and seal.

## Inputs required for the next solver run

- Exact barangay/address or site coordinates
- Building occupancy/use and risk category
- Governing NSCP edition
- Site class/geotechnical basis and groundwater condition
- Confirmed allowable bearing pressure
- Lateral system in X and Y
- Diaphragm assumption
- Wind exposure/topographic/enclosure conditions
- Actual wall locations and wall construction
- Concrete cover, preferred bar sizes, and detailing standards
