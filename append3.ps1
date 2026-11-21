$base = $PSScriptRoot
$main = Join-Path $base 'GLINT-DonutSMP-Casino-Findings.md'
$a3 = Join-Path $base 'GLINT-Findings-ADDENDUM3.md'
Add-Content -Path $main -Value (Get-Content -Raw $a3)
Write-Output ("main size = " + (Get-Item $main).Length)
