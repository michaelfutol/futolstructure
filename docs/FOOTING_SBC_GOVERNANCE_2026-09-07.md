# Footing SBC Governance

**Date:** 2026-09-07  
**Scope:** FutolStructure preliminary isolated-footing sizing and user-facing footing parameters

## Decision

FutolStructure now exposes two distinct soil-bearing inputs in the Footing Parameters panel:

| Field | Meaning | Governing behavior |
| --- | --- | --- |
| Assumed SBC | Preliminary effective allowable soil bearing pressure, in kPa | Used when no verified/final SBC is entered |
| Final / Verified SBC | Geotechnical or engineer-confirmed allowable value, in kPa | Governs footing sizing when populated |

The UI also shows the effective value and its basis. The legacy `soilBearing` state remains as a derived compatibility field; new user input is governed by the assumed/final pair.

## Current calculation behavior

The preliminary footing sizing engine uses the effective allowable SBC `q` and a service-load approximation:

```text
P_service = P_factored / 1.4
A_required = P_service / q
side = max(0.600 m, round_up_to_0.100 m(sqrt(A_required)))
```

The current default effective SBC is **150 kPa, assumed/preliminary**. It is a software fallback for early modeling only, not a site-specific geotechnical conclusion.

## What 600 x 600 means

The 600 x 600 mm plan dimension is the **minimum footing plan-size clamp** in the current preliminary sizing engine. It is not a universal gravity-loading assumption and it is not the final footing size for every column.

If the calculated required side is below 0.600 m, the engine returns 0.600 m. If the required side is larger, the engine rounds upward in 100 mm increments. Column load, beam/tie-beam dead load, the effective SBC, and subsequent preliminary checks therefore remain relevant.

The 600 mm minimum is also retained in the editable footing schedule controls. Any final footing dimensions must be checked against actual reactions, eccentricity, one-way shear, punching shear, flexure, settlement, detailing, and the governing geotechnical report.

## Engineering boundary

Allowable bearing pressure cannot be selected from gravity load alone. A geotechnical basis should address bearing failure and settlement, and should identify the recommended bearing pressure, bearing elevation/depth, and minimum embedment/width. See the [FHWA shallow-foundation guidance](https://www.fhwa.dot.gov/engineering/geotech/pubs/010943.pdf) and [USACE geotechnical design guidance](https://www.nan.usace.army.mil/Portals/37/docs/EngDiv/ManStdsProc2009.pdf).

Therefore, a footing marked `Preliminary` in FutolStructure must not be presented as a permit-ready final design. The final/verified SBC field is a traceability and sizing-governance input; it does not replace full geotechnical or structural foundation checks.

## Verification

- Source contract: `node v3/tools/check-super-improvement.cjs` passes `footingSbcGovernance: true`.
- Browser contract: `node v3/tools/check-workspaces.cjs` checks the default assumed value, blank final value, effective read-only value, and preliminary status label.
- Non-browser engine smoke: `node v3/tools/check-fs.js --no-browser` passes.

## Next gate

Before native solver or permit-oriented foundation claims, add a dated footing-design acceptance fixture with a verified SBC basis and explicit checks for bearing pressure, eccentricity, sliding/overturning where applicable, one-way shear, punching shear, flexure, thickness, reinforcement, settlement status, and engineer approval metadata.
