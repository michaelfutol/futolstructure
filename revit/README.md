# FutolStructure Native Revit Import

This directory defines the native-Revit handoff boundary for FutolStructure.

Revit 2027 was detected on the development PC at
`C:\Program Files\Autodesk\Revit 2027`. The add-in targets
`net10.0-windows`, validates `FutolStructure.RevitNativeImport.v1`, and creates
or matches governed levels and grids. Name/elevation or name/coordinate
conflicts are blocked and reported instead of silently changing host data.
The current follow-up slice also reads governed columns using exact FS
coordinates, base/top datums, orientation, and section dimensions. It uses a
compatible loaded structural-column family when possible; otherwise it creates
an exact `OST_StructuralColumns` DirectShape proxy and records that mode in the
audit.
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

After installation, fully close every `Revit.exe` process and start Revit
2027 again. Revit scans the per-user add-in folder at startup; an already-open
session will not necessarily refresh the External Tools list. The manual
command remains available under **Add-Ins > External Tools** as
`FutolStructure Revit 2027`, but it is now a fallback rather than the normal
workflow.

For a clean, repeatable manual import workflow, `FutolStructure Import Host`
creates a metric blank `.rvt` in:

```text
%USERPROFILE%\Documents\FutolStructure\Revit Hosts\FutolStructure_Revit_Import_Host.rvt
```

The host is only a neutral Revit container. It is not a project model and does not
replace the FS manifest. This fallback keeps imports independent from an unrelated
architectural RVT and gives every FS model the same clean starting point.

The Windows desktop build is the normal one-click route. From FS, choose the
Revit import action once. The desktop bridge:

1. validates and writes the dated FS manifest;
2. writes a validated local job under:

```text
%USERPROFILE%\Documents\FutolStructure\Revit Jobs\pending-revit-import.json
```

3. launches Revit 2027 with the neutral host when it already exists, or with no
   model argument when a host must be created; and
4. lets the startup entry post the host-creation command, create a valid metric
   `.rvt` through the Revit API, open it, and post the registered import command. If
   a stale managed host cannot be opened, the add-in quarantines it with an
   `.invalid-*.bak` suffix and creates a fresh native host instead.

The command imports the queued manifest into the active neutral host, saves the
`.rvt`, and writes a completion receipt beside the pending job. No host creation,
manifest file browsing, or External Tools selection is required for normal use.
The manual commands remain available as a controlled fallback.

On the first load of an unsigned development add-in, Revit may show its native
publisher-verification dialog. Accepting that one-time Revit trust prompt is a
host security requirement; FutolStructure does not suppress or automate it.

The automation contract is intentionally local and deterministic:

```text
FutolStructure.RevitImportJob.v1
  pending: %USERPROFILE%\Documents\FutolStructure\Revit Jobs\pending-revit-import.json
  host:    %USERPROFILE%\Documents\FutolStructure\Revit Hosts\FutolStructure_Revit_Import_Host.rvt
  output:  %USERPROFILE%\Documents\FutolStructure Revit Imports\*.json
```

If Revit is already running, the queued job is consumed by the installed startup
add-in on the next idle cycle. If the active document is not the queued neutral
host, the job is rejected with a receipt instead of importing into an unrelated
architectural project.

If the command is still absent, verify these two files exist for the current
Windows user:

```text
%APPDATA%\Autodesk\Revit\Addins\2027\FutolStructure.Revit2027.addin
%LOCALAPPDATA%\FutolStructure\Revit2027\FutolStructure.Revit2027.dll
```

The add-in is built for Revit 2027 (`net10.0-windows`) and should be tested
against the installed Revit 2027.x API, including 2027.2. Do not replace the
DLL while Revit is running; close Revit first, rebuild, reinstall, then restart
Revit before drawing conclusions from the menu.

If Revit reports `WrongAssembly` or says the DLL does not exist even though the
file is visible, compare the installed DLL with the latest build output. This
usually means an older binary is still registered or a Revit session scanned
the add-in before the replacement completed. Close every Revit process, run the
installer again, and verify the SHA-256 hash before restarting Revit.

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
and dated manifests have been opened by a Revit API add-in with evidence for
levels, grids, columns, beams, slabs, foundations, stairs, walls, roof framing,
IDs, and no unintended 0.00 column bottoms. The current column implementation
is built but still requires native Revit acceptance and visual readback; its
proxy mode must not be described as editable native structural-column content.
