$lines = Get-Content (Join-Path $PSScriptRoot 'lava-mod.txt')
Write-Output ("lines: " + $lines.Count)
$n = 0
foreach ($l in $lines) {
  if ($n -ge 3) { break }
  if ($l.Length -gt 2200) { $l = $l.Substring(0,2200) }
  Write-Output ("LINE " + $n + ": " + $l)
  $n++
}
