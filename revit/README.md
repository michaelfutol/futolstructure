# FutolStructure Native Revit Import

This directory defines the native-Revit handoff boundary for FutolStructure.

Revit 2027 was detected on the development PC at
`C:\Program Files\Autodesk\Revit 2027`. The first add-in slice targets
`net10.0-windows`, validates `FutolStructure.RevitNativeImport.v1`, and creates
or matches governed levels and grids. Name/elevation or name/coordinate
conflicts are blocked and reported instead of silently changing host data.
Build it with:

```powershell
dotnet build revit/FutolStructure.Revit2027.csproj -c Release
```

Copy `FutolStructure.Revit2027.addin.template` to the Revit 2027 add-in folder
after replacing `PATH_TO_BUILD_OUTPUT` with the absolute DLL path. This is a
development scaffold; geometry, parameters, rebar, and final deployment still
need native Revit acceptance.

For the isolated current-user development installation, run:

```powershell
powershell -ExecutionPolicy Bypass -File revit/install-revit2027-addin.ps1
```

The installer copies the compiled DLL under the user's local application data
and registers only `FutolStructure.Revit2027.addin`. It does not modify or
replace CSiXRevit. `uninstall-revit2027-addin.ps1` removes only those two
FutolStructure targets.

## Current status

FutolStructure exports a governed `FutolStructure.RevitNativeImport.v1` JSON
manifest from the same canonical CSI payload used by the ETABS and STAAD
exports. It is not a native `.rvt` generator by itself. A native `.rvt` must be
created by a Revit API add-in running inside the licensed Revit installation.

The manifest preserves:

- governed levels and absolute vertical datums;
- structural grids and coordinates;
- physical drafting axes and analytical axes;
- column and beam cardinal points, insertion points, and joint offsets;
- slabs, foundations, pedestals, tie beams, stairs, walls, and roof framing;
- FutolStructure element IDs, source provenance, and revision/build metadata.

## Import contract

The add-in must match or create elements by FutolStructure IDs, reject
unsupported source contracts, and never silently replace governed elevations or
member orientation. It must report created, matched, skipped, and blocked
elements in a dated JSON acceptance log written beside the source manifest.

Reinforcement is deliberately not synthesized from preliminary member sizes.
Rebar creation will consume an approved reinforcement schedule or approved
solver design result through `FutolStructure.RebarHandoff.v1`.

## Acceptance boundary

The importer is not release-ready until the installed Revit version is known
and a dated manifest has been opened by a Revit API add-in with evidence for
levels, grids, columns, beams, slabs, foundations, stairs, walls, roof framing,
IDs, and no unintended 0.00 column bottoms.
