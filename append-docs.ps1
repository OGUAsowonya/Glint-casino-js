$base = $PSScriptRoot
$main = Join-Path $base 'GLINT-DonutSMP-Casino-Findings.md'
$a1 = Join-Path $base 'GLINT-Findings-ADDENDUM.md'
$a2 = Join-Path $base 'GLINT-Findings-ADDENDUM2.md'
if (Test-Path $main) {
  Add-Content -Path $main -Value (Get-Content -Raw $a1)
  Add-Content -Path $main -Value (Get-Content -Raw $a2)
  Write-Output ("merged, main size = " + (Get-Item $main).Length)
} else {
  Write-Output "main doc missing"
}
