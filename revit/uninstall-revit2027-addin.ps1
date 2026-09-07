$ErrorActionPreference = 'Stop'
$installRoot = Join-Path $env:LOCALAPPDATA 'FutolStructure\Revit2027'
$addinPath = Join-Path $env:APPDATA 'Autodesk\Revit\Addins\2027\FutolStructure.Revit2027.addin'

if (Test-Path -LiteralPath $addinPath) {
    Remove-Item -LiteralPath $addinPath -Force
}
if (Test-Path -LiteralPath $installRoot) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force
}

Write-Output 'FutolStructure Revit 2027 add-in removed.'
