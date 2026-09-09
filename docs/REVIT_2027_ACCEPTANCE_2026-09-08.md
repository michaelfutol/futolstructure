# FutolStructure Revit 2027 Acceptance Status

**Evidence date:** 2026-09-08 (Asia/Singapore)  
**Scope:** FS-125 vertical datum, foundation IFC, and Revit 2027 coordination handoff  
**Repository:** `feature/fs-125-shared-analytical-inputs`  
**Status:** IFC/parser gate passed; native Revit levels/grids slice passed; native member acceptance pending; Revit rebar intentionally deferred

## Concrete-Only Revit Scope Decision

For the current release train, Revit is a concrete BIM and coordination/documentation target. FutolStructure will not invent or require reinforcement inside Revit before ETABS or STAAD returns approved design results. The governing workflow and fabrication boundary are recorded in [Revit concrete-only and fabrication authority decision](REVIT_CONCRETE_ONLY_FABRICATION_AUTHORITY_2026-09-09.md).

ETABS and STAAD remain the analysis/design authorities for engineering submittals. Tekla Structures is the future fabrication/detailing target. RCDC is optional for the STAAD concrete-design route and is not required for ETABS projects.

## Executive Result

The current evidence is sufficient to say that FutolStructure produces a structurally populated IFC2X3 coordination package with governed vertical levels and foundation entities, and that the installed add-in successfully ran inside Revit 2027 for the levels/grids coordination slice. It is **not** sufficient to claim that FutolStructure already generates a native, editable `.rvt` structural model.

The current Revit 2027 add-in is installed and operational for the controlled coordination slice:

- governed native levels;
- governed grid lines;
- source/build/project/revision comments and IDs;
- conflict blocking when an existing level or grid would be silently overwritten;
- dated import audit JSON.

Native creation of columns, beams, slabs, footings, pedestals, tie beams, stairs, walls, roof members, and reinforcement remains a separate implementation gate.

## Environment

| Item | Verified value |
| --- | --- |
| Revit | Autodesk Revit 2027 installed |
| Revit executable | `C:\Program Files\Autodesk\Revit 2027\Revit.exe` |
| FS add-in DLL | `C:\Users\Futol\AppData\Local\FutolStructure\Revit2027\FutolStructure.Revit2027.dll` |
| Revit add-in manifest | `C:\Users\Futol\AppData\Roaming\Autodesk\Revit\Addins\2027\FutolStructure.Revit2027.addin` |
| Add-in source | `revit/FutolStructureCommand.cs` |
| Add-in installer | `revit/install-revit2027-addin.ps1` |

## Dated Acceptance Package

The package was created as a dated copy without overwriting the source artifacts:

```text
output/acceptance/fs125-revit-2026-09-08/Bacacay_FS125_2026-09-08.ifc
output/acceptance/fs125-revit-2026-09-08/FutolStructure_Revit_Import_FS125_2026-09-08.json
```

The import manifest uses contract `FutolStructure.RevitNativeImport.v1` and carries the governed grid definition, level list, analytical/physical geometry policy, foundation inventory, and provenance fields. The currently implemented Revit add-in consumes the level and grid portions of this contract and writes a dated audit beside the selected manifest.

## Native Revit Levels/Grids Run

The add-in was executed in Revit 2027 against the dated manifest. The generated audit is:

```text
output/acceptance/fs125-revit-2026-09-08/FutolStructure_Revit_Import_FS125_2026-09-08.revit-import-audit-20260908-225705.json
```

Result:

| Native Revit check | Result |
| --- | ---: |
| Revit API version reported | `2027` |
| Contract | `FutolStructure.RevitNativeImport.v1` |
| Levels created | 4 |
| Levels matched | 0 |
| Level conflicts | 0 |
| Grids created | 6 |
| Grids matched | 0 |
| Grid conflicts | 0 |
| Warnings | 0 |
| Errors | 0 |
| Rebar status | Pending approved design results |

This proves the add-in registration and execution path. A later Revit session produced a startup dialog saying that the same DLL “does not exist”; its current journal entry is classified as `WrongAssembly`. The successful execution is recorded in `journal.0003.txt`, while the later failed scan is in `journal.0004.txt`. Investigation also found that the installed DLL was an older binary (`86F1130847A7DB6D3DF30790EDA5FC5266A2CA3A5FFD41FFD161F376489E38BC`) and did not match the latest Revit 2027.2 build (`043A5DE898936D729A62AB55CD925389F55E841D43B00C2005B94EEB1D0675C2`). The prescribed recovery is therefore: close every Revit process, reinstall the current build, verify the installed hash, then restart Revit.

## Post-Recovery Installation Check

The recovery was executed on 2026-09-09:

- Revit and RevitWorker background processes were closed before replacement.
- The add-in was rebuilt with `dotnet build revit/FutolStructure.Revit2027.csproj -c Release` and completed with 0 errors.
- The installed DLL now matches the build exactly:

```text
SHA-256: 16F4B55D80287DB1D61AFC2A2FC01C8368F9077D837A114AB9E202E924A62612
```

- The installed manifest contains both `FutolStructureStartup` and `FutolStructureHostAutomationCommand`.
- The installed application now queues the versioned `FutolStructure_Revit_Import_Host_FS125.rvt` workflow instead of reusing the invalid legacy host.

The previous wrong-assembly condition is therefore corrected at the installed-file level. A fresh native Revit 2027 launch and one complete import remain required before the overall member-import gate can be marked passed.

## Corrected Vertical Datum Mapping

The earlier strict-check invocation expected `2F=3.0 m` and `RF=6.0 m`. That expectation did not match the actual Bacacay governed model. It was a test-harness expectation mismatch, not an IFC parse failure.

The actual dated IFC contains:

| Level | Absolute elevation |
| --- | ---: |
| `BASE/FOUNDATION` | `0.00 m` |
| `GF` | `0.00 m` |
| `2F` | `3.60 m` |
| `RF` | `6.80 m` |

The same artifact reports:

- base support elevation: `0.00 m`;
- footing bottom: `-1.20 m`;
- footing top: `-0.90 m`;
- lowest column bottom: `0.00 m`.

This is the governing mapping for the dated IFC acceptance command. Grade is a reference datum; it must not be substituted for the column support elevation.

## IFC Strict Validation

Validator command:

```text
python v3/tools/validate-ifc.py output/acceptance/fs125-bacacay-2026-09-06/ifc/Bacacay_FS125_2026-09-06.ifc --expect-level "BASE/FOUNDATION=0" --expect-level "GF=0" --expect-level "2F=3.6" --expect-level "RF=6.8" --exact-level-set
```

Validator environment:

- Python `3.11.9`;
- IfcOpenShell `0.8.5`.

Result: **PASS**.

| IFC check | Result |
| --- | ---: |
| Schema | IFC2X3 |
| Storeys | 4 |
| Beams | 34 |
| Columns | 18 |
| Slabs | 12 |
| Footings | 9 |
| Pedestal records | 9 |
| Tie beams | 12 |
| Products | 94 |
| Products with geometry | 94 |
| Schema validation statements | 0 |
| Duplicate IDs/geometries | 0 |
| Expected level set | Exact |

The strict validator also confirmed project/revision/build metadata and the foundation vertical-datum fields. This is IFC evidence from the dated Bacacay foundation artifact; it is not yet native Revit visual evidence.

## Follow-up Column Import Implementation

On 2026-09-09 the Revit command was extended with a controlled column-only
slice. It reads `model.columns` from the same import manifest and preserves:

- source X/Y coordinates after the FS-to-Revit axis transform;
- `z1`/`z2` absolute elevations and governed start/end level names;
- source orientation and section B/H dimensions;
- stable FutolStructure column IDs and segment IDs in Revit comments;
- duplicate-safe matching on the FutolStructure column ID.

The importer first tries a compatible loaded structural-column family. If the
host project does not contain a compatible family, it creates an exact
`OST_StructuralColumns` DirectShape proxy and records `governed-proxy` in the
dated audit. This fallback is deliberately visible and traceable, but it is
not being claimed as an editable native Revit family instance. The source
build compiles with 0 errors; installation and native column readback remain
the next acceptance gate.

## Native Revit Acceptance Procedure

The remaining manual gate is to open Revit 2027 with a project document, then run:

1. **Add-Ins > External Tools > FutolStructure Revit 2027**.
2. Select `FutolStructure_Revit_Import_FS125_2026-09-08.json`.
3. Confirm the native level list is exactly `BASE/FOUNDATION`, `GF`, `2F`, `RF` at `0.00`, `0.00`, `3.60`, and `6.80 m`.
4. Confirm no host/template level such as `L1` or `L2` is being treated as a FutolStructure export level.
5. Confirm grid bubbles and coordinates match the source manifest.
6. Open the dated import audit JSON and confirm zero blocked conflicts and the expected source provenance.
7. Separately inspect the IFC in Revit using **Insert > Link IFC** or **Open IFC** and verify that columns, beams, slabs, footings, pedestals, and tie beams appear under the expected levels.
8. Capture screenshots of the level/elevation view, 3D foundation view, and one property/metadata view.

The add-in currently does not create native Revit structural members. IFC linking may display coordination geometry, but that geometry is not equivalent to native Revit family instances or approved reinforcement objects.

## Acceptance Matrix

| Requirement | Status | Evidence |
| --- | --- | --- |
| Exact governed elevations | **PASS, parser-level** | IfcOpenShell strict validation |
| No hardcoded column bottom at 0 when base support differs | **PASS in dated artifact contract** | Vertical-datum fields and lowest-column check |
| `BASE/FOUNDATION`, `GF`, `2F`, `RF` level naming | **PASS, parser-level** | Exact level-set check |
| Existing frame/slab inventory retained | **PASS, parser-level** | 34 beams, 18 columns, 12 slabs |
| Footings present | **PASS, parser-level** | 9 `IfcFooting` entities |
| Pedestals present | **PASS, metadata/entity inventory** | 9 pedestal records |
| Tie beams present | **PASS, parser-level** | 12 tie beams |
| Revit 2027 add-in installed | **PASS** | DLL and `.addin` discovered |
| Revit native levels/grids import | **PASS** | Dated audit: 4 levels, 6 grids, 0 warnings, 0 errors |
| Native Revit columns | **IMPLEMENTED, ACCEPTANCE PENDING** | Column-only source slice; native-family vs governed-proxy mode is audited |
| Native Revit beams/slabs/footings | **NOT IMPLEMENTED in current add-in** | Separate controlled member/foundation slices |
| Native Revit rebar/shop drawings | **INTENTIONALLY DEFERRED** | Rebar requires approved ETABS/STAAD design results and the governed `RebarHandoff.v1`; current Revit scope is concrete-only |

## Limitations and Next Gate

1. The IFC artifact used for strict validation is the existing dated Bacacay foundation artifact from the FS-124 acceptance package. The dated FS-125 Revit package is staged, but a fresh FS-125 generator run and native Revit screenshots are still required before calling this a full FS-125 Revit acceptance.
2. Revit IFC link/open is a coordination path. It does not automatically produce fully editable native Revit structural families.
3. Pedestal classification and metadata must be reviewed in Revit because the coordination export intentionally preserves `Pedestal` type metadata while using the most appropriate IFC structural classification.
4. No commit, push, Vercel deployment, or Windows installer replacement is authorized by this acceptance note.

**Next controlled milestone:** execute the Revit 2027 native inspection, preserve the generated audit and screenshots, then extend the add-in from levels/grids to the concrete member/foundation slices. Do not broaden into rebar until approved ETABS/STAAD results and the solver-to-FS `RebarHandoff.v1` are available; send fabrication/detailing output to Tekla Structures when that gate is reached.
