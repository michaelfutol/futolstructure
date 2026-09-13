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
  <AddIn Type="Application">
    <Name>FutolStructure Revit automation</Name>
    <Assembly>$escapedAssembly</Assembly>
    <AddInId>3AE6BF52-A64D-4A0B-86E4-3D823C2D54F0</AddInId>
    <AddInVersion>1.0.0.0</AddInVersion>
    <FullClassName>FutolStructure.Revit2027.FutolStructureStartup</FullClassName>
    <VendorId>FutolTech</VendorId>
    <VendorDescription>FutolStructure one-click Revit import automation</VendorDescription>
  </AddIn>
  <AddIn Type="Command">
    <Name>FutolStructure Revit 2027</Name>
    <Assembly>$escapedAssembly</Assembly>
    <AddInId>7E17F4AF-6C55-4A17-A77C-B0CC0B2D7A27</AddInId>
    <AddInVersion>1.0.0.0</AddInVersion>
    <FullClassName>FutolStructure.Revit2027.FutolStructureCommand</FullClassName>
    <VendorId>FutolTech</VendorId>
    <VendorDescription>FutolStructure governed structural-model importer</VendorDescription>
  </AddIn>
  <AddIn Type="Command">
    <Name>FutolStructure Import Host</Name>
    <Assembly>$escapedAssembly</Assembly>
    <AddInId>36BE4E6E-46AB-4EF4-B4B7-2C15CB2A4BE1</AddInId>
    <AddInVersion>1.0.0.0</AddInVersion>
    <FullClassName>FutolStructure.Revit2027.FutolStructureHostCommand</FullClassName>
    <VendorId>FutolTech</VendorId>
    <VendorDescription>FutolStructure clean Revit import host creator</VendorDescription>
  </AddIn>
  <AddIn Type="Command">
    <Name>FutolStructure Automated Host Creator</Name>
    <Assembly>$escapedAssembly</Assembly>
    <AddInId>B458D5B5-A9D2-41B4-B8E7-1BFE5DE3A8F0</AddInId>
    <AddInVersion>1.0.0.0</AddInVersion>
    <FullClassName>FutolStructure.Revit2027.FutolStructureHostAutomationCommand</FullClassName>
    <VendorId>FutolTech</VendorId>
    <VendorDescription>FutolStructure valid .rvt host creator for queued imports</VendorDescription>
  </AddIn>
  <AddIn Type="Command">
    <Name>FutolStructure BOQ</Name>
    <Assembly>$escapedAssembly</Assembly>
    <AddInId>2D3B8E4A-1E0C-4CC5-8BFB-1DCF8EAF96B8</AddInId>
    <AddInVersion>1.0.0.0</AddInVersion>
    <FullClassName>FutolStructure.Revit2027.FutolStructureBoqCommand</FullClassName>
    <VendorId>FutolTech</VendorId>
    <VendorDescription>FutolStructure native Revit quantity schedules and CSV BOQ</VendorDescription>
  </AddIn>
</RevitAddIns>
"@
[System.IO.File]::WriteAllText($addinPath, $manifest, [System.Text.UTF8Encoding]::new($false))

Write-Output "Installed DLL: $installedDll"
Write-Output "Installed manifest: $addinPath"
Write-Output 'Restart Revit 2027 to load the FutolStructure external command.'
