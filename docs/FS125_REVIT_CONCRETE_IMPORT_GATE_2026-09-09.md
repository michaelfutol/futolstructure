# FS-125 Revit Concrete Import Gate

**Evidence date:** 2026-09-09
**Scope:** FutolStructure to Revit 2027 concrete coordination import
**Branch:** `feature/fs-125-shared-analytical-inputs`

## Current result

The Revit import contract contains the complete governed concrete payload for the current FS-125 acceptance manifest:

| Category | Source count | Revit import path |
| --- | ---: | --- |
| Columns | 18 | Native structural column family when compatible; exact governed proxy fallback |
| Beams | 24 | Exact governed structural-framing DirectShape |
| Slabs | 8 | Exact governed floor DirectShape |
| Isolated footings | 9 | Exact governed structural-foundation DirectShape |
| Pedestals | 9 | Exact governed structural-foundation DirectShape with pedestal metadata |
| Tie beams | 12 | Exact governed structural-framing DirectShape |

The source manifest also carries four governed levels (`BASE/FOUNDATION`, `GF`, `2F`, `RF`) and the shared coordinate, canonical, and analytical model data.

## Change applied

The Revit add-in now writes inspectable provenance and concrete properties into each imported element's Revit Comments field. The trace includes:

- FutolStructure source ID and floor;
- section and source dimensions;
- top/bottom elevations or slab top elevation;
- material and design status when supplied;
- supported column ID for isolated footings;
- project ID, source revision ID, and build ID;
- native/proxy import mode.

The import audit also records the same source provenance and per-element geometry records. This keeps the Revit visible property surface and the JSON audit tied to the same source manifest.

## Verification completed

- Revit 2027 add-in build: passed, 0 errors.
- Existing MSBuild warnings: 2 `Microsoft.VisualBasic` version conflict warnings from the Revit/.NET reference graph.
- FutolStructure source smoke: passed with `node v3/tools/check-fs.js --no-browser`.
- Manifest preflight: passed with `node v3/tools/check-revit-manifest.cjs <manifest.json>`.
- Installed DLL: `C:\Users\Futol\AppData\Local\FutolStructure\Revit2027\FutolStructure.Revit2027.dll`.
- Installed add-in manifest: `C:\Users\Futol\AppData\Roaming\Autodesk\Revit\Addins\2027\FutolStructure.Revit2027.addin`.

## Remaining acceptance gate

Native Revit 2027 acceptance is still required. Open a clean metric host project, import the current FS-125 manifest, and verify:

1. all source counts are created or matched with zero blocked items;
2. levels retain the exact governed elevations;
3. columns retain FS coordinates and orientation;
4. beams, slabs, footings, pedestals, and tie beams are visible and aligned;
5. selecting each category exposes the source ID and provenance in Comments;
6. the generated `*.revit-import-audit-*.json` reports no errors and no unexpected warnings.

Concrete beams, slabs, and foundation items remain coordination solids rather than fully editable native Revit families. Rebar remains intentionally deferred until an approved solver/design result exists; the importer does not invent reinforcement.

No commit or push is authorized until browser and native Revit evidence are complete.
