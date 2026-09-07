param(
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceDll = Join-Path $PSScriptRoot "bin\$Configuration\net10.0-windows\FutolStructure.Revit2027.dll"
$installRoot = Join-Path $env:LOCALAPPDATA 'FutolStructure\Revit2027'
$addinRoot = Join-Path $env:APPDATA 'Autodesk\Revit\Addins\2027'
$installedDll = Join-Path $installRoot 'FutolStructure.Revit2027.dll'
$addinPath = Join-Path $addinRoot 'FutolStructure.Revit2027.addin'

if (-not (Test-Path -LiteralPath $sourceDll)) {
    throw "Build output was not found: $sourceDll"
}

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
New-Item -ItemType Directory -Force -Path $addinRoot | Out-Null
Copy-Item -LiteralPath $sourceDll -Destination $installedDll -Force

$escapedAssembly = [System.Security.SecurityElement]::Escape($installedDll)
$manifest = @"
<?xml version="1.0" encoding="utf-8" standalone="no"?>
<RevitAddIns>
  <AddIn Type="Command">
    <Name>FutolStructure Revit 2027</Name>
    <Assembly>$escapedAssembly</Assembly>
    <AddInId>7E17F4AF-6C55-4A17-A77C-B0CC0B2D7A27</AddInId>
    <FullClassName>FutolStructure.Revit2027.FutolStructureCommand</FullClassName>
    <VendorId>FutolTech</VendorId>
    <VendorDescription>FutolStructure governed structural-model importer</VendorDescription>
  </AddIn>
</RevitAddIns>
"@
[System.IO.File]::WriteAllText($addinPath, $manifest, [System.Text.UTF8Encoding]::new($false))

Write-Output "Installed DLL: $installedDll"
Write-Output "Installed manifest: $addinPath"
Write-Output 'Restart Revit 2027 to load the FutolStructure external command.'
