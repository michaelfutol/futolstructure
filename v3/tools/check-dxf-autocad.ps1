param(
    [Parameter(Mandatory = $true)]
    [string]$DxfPath,

    [string]$AutoCadCorePath = 'C:\Program Files\Autodesk\AutoCAD 2025\accoreconsole.exe'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$resolvedDxf = (Resolve-Path -LiteralPath $DxfPath).Path
$resolvedCore = (Resolve-Path -LiteralPath $AutoCadCorePath).Path
$scriptPath = Join-Path ([IO.Path]::GetTempPath()) ("futolstructure-autocad-open-{0}.scr" -f [Guid]::NewGuid().ToString('N'))

try {
    [IO.File]::WriteAllText($scriptPath, "_.QUIT`r`n", [Text.Encoding]::ASCII)
    $output = & $resolvedCore /i $resolvedDxf /s $scriptPath /l en-US 2>&1
    $exitCode = $LASTEXITCODE
    $text = (($output -join [Environment]::NewLine) -replace "`0", '')
    $rejectionPattern = 'Invalid or incomplete DXF|Unknown group|drawing discarded|ErrorStatus='
    $rejected = $text -match $rejectionPattern

    if ($exitCode -ne 0 -or $rejected) {
        $tail = ($text -split "`r?`n" | Select-Object -Last 30) -join [Environment]::NewLine
        throw "AutoCAD Core Engine rejected the DXF (exit $exitCode).`n$tail"
    }

    [pscustomobject]@{
        ok = $true
        reader = 'AutoCAD 2025 Core Engine'
        path = $resolvedDxf
        exitCode = $exitCode
        regeneratedModel = $text -match 'Regenerating model'
        recoveryMessage = $text -match $rejectionPattern
    } | ConvertTo-Json
} finally {
    Remove-Item -LiteralPath $scriptPath -Force -ErrorAction SilentlyContinue
}
