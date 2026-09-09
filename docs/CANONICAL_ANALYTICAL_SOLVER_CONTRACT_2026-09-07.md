# Canonical / Analytical Solver Contract

**Date:** 2026-09-07  
**Scope:** ETABS and STAAD model generation from the FutolStructure canonical model

## Decision

FutolStructure is being treated first as a canonical structural modeler and solver handoff tool. The active export path is:

```text
FutolStructure canonical model
  -> governed CSI export model
  -> analytical centroid joints and member sections
  -> physical member offsets / insertion offsets
  -> ETABS or STAAD builder
  -> native solver readback audit
```

The canonical model remains the source of truth for floor IDs, absolute elevations, grid coordinates, member IDs, columnation, column orientation, section dimensions, cardinal points, and physical-versus-analytical member geometry.

## Required analytical rules

- Column analytical nodes remain at the governed column centroid and use cardinal point 5.
- Beam analytical joints meet the governed column-centroid nodes and use top-center cardinal point 8 at the FutolStructure floor elevation.
- Physical drafting/3D axes may terminate at member faces and retain the actual member arrangement.
- The physical-to-analytical difference is represented explicitly as shared joint/member offsets, with ETABS insertion offsets and STAAD `MEMBER OFFSET` generated from the same payload.
- Slabs remain canonical area geometry: their FSTR boundary points, regular/cantilever role, and cantilever edge are retained as metadata while the solver area polygon uses the same boundary after the governed coordinate transform. Slabs do not receive a frame-style centroid/cardinal rewrite.
- Storey levels and grids are exported from the same canonical coordinates; no solver adapter may reconstruct them independently.
- ETABS and STAAD exports remain blocked when canonical topology, member sizes, levels, or supports are unresolved.

## Current UI behavior

The Analysis Workbench now displays a read-only Canonical / analytical audit with inventory counts, unique joint count, offset-member count, cardinal-point rules, levels, grids, and topology blockers.

Wall, roof-frame, stair, tank, blockwall, and preliminary design panels remain available as coordination/draft tools, but their native solver opt-in is parked until their connectivity and load-transfer contracts are implemented and accepted in ETABS/STAAD. Their internal inventory normalization remains available for future work; it is not evidence of native solver integration.

## Current verified control

The browser workspace regression reports for the default fixture:

- 18 canonical columns
- 24 canonical beams
- 8 canonical slabs
- 4 governed levels
- 27 unique analytical joints
- 24 beams with physical-to-analytical offsets
- column cardinal 5: PASS
- beam cardinal 8: PASS
- centroid-joint policy: PASS
- topology blockers: 0
- physical geometry preserved: PASS

This is a contract/readiness audit, not a replacement for opening the generated model in ETABS/STAAD and reviewing native geometry, loads, supports, analysis results, and design results.

## Next implementation gates

1. Add a dated canonical-vs-analytical fixture with expected node coordinates, member endpoints, cardinal points, section axes, and offset vectors.
2. Compare the same fixture in ETABS and STAAD native readback, including column orientation and all grid bubbles/ordinates.
3. Add focused edge-beam/cantilever endpoint acceptance for physical face termination versus analytical centroid joints.
4. Only after these pass, reconnect one parked feature at a time, starting with wall line loads and roof-frame members.
