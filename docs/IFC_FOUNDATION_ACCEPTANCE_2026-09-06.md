# IFC Foundation Acceptance

**Date:** 2026-09-06  
**Candidate:** `feature/fs-125-shared-analytical-inputs`  
**Project:** Bacacay 2-Storey Mix-use, frozen source model  
**Scope:** IFC levels, vertical datum, foundation geometry, and metadata

## Result

The current local candidate generated a dated IFC coordination file from the frozen Bacacay `.fstr` source:

`output/acceptance/fs125-bacacay-2026-09-06/ifc/Bacacay_FS125_2026-09-06.ifc`

The dependency-free envelope gate passes. It confirms that the IFC contains the governed level sequence, active structural geometry, foundation entities, and FutolStructure provenance metadata. This gate is intentionally not a replacement for IfcOpenShell or Revit review.

Run:

```text
node v3/tools/validate-ifc-lite.js output/acceptance/fs125-bacacay-2026-09-06/ifc/Bacacay_FS125_2026-09-06.ifc --levels BASE/FOUNDATION,GF,2F,RF
```

## Exported Counts

| Entity / contract | Count | Result |
| --- | ---: | --- |
| IFC schema | IFC2X3 | PASS |
| `IfcProject` | 1 | PASS |
| `IfcBuildingStorey` | 4 | PASS |
| `IfcColumn` total | 27 | PASS |
| `IfcBeam` total | 46 | PASS |
| `IfcSlab` | 12 | PASS |
| `IfcFooting` | 9 | PASS |
| Pedestal columns with `MemberType = Pedestal` | 9 | PASS |
| Foundation tie beams with `MemberType = Foundation Tie Beam` | 12 | PASS |

The IFC also contains the shared project, revision, build, schema, and export-contract properties. The source vertical datum values are grade `0.0 m`, ground floor `0.0 m`, base support `0.0 m`, footing top `-0.9 m`, and footing bottom `-1.2 m` for this fixture.

## Level Contract

| IFC storey | Absolute elevation |
| --- | ---: |
| `BASE/FOUNDATION` | 0.0 m reference storey |
| `GF` | 0.0 m |
| `2F` | 3.6 m |
| `RF` | 6.8 m |

`BASE/FOUNDATION` is a coordination reference level. It does not replace the explicit footing top/bottom geometry or imply that the grade datum is the structural support elevation.

## Remaining Acceptance Gates

- **IfcOpenShell:** not run on this machine because the Python launcher and pinned `ifcopenshell` package are unavailable.
- **Revit:** native inspection is still pending. Revit 2027 is installed locally; the previous request referenced Revit 2025, so version-specific acceptance must be recorded against the installed version.
- **Visual/native review:** confirm no duplicate or floating footing, pedestal, or tie-beam geometry; inspect object properties and level assignments in Revit.
- **Native solver acceptance:** separate from IFC coordination. STAAD remains blocked by the local Bentley licensing/engine startup issue documented in `STAAD_NATIVE_ENGINE_BLOCK_2026-09-06.md`.

## Engineering Boundary

This file proves a coordination export contract, not permit-ready design approval. Foundation sizes, material assumptions, support conditions, loads, and final reinforcement remain subject to the responsible structural engineer's review and solver/design acceptance.
