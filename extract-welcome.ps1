$dirs = @('_chunks', '_cf', '_fair', '_redeem', '_lava', '') | ForEach-Object { Join-Path $PSScriptRoot $_ }
foreach ($d in $dirs) {
  if (-not (Test-Path $d)) { continue }
  foreach ($f in Get-ChildItem -Path $d -Filter *.js -File -ErrorAction SilentlyContinue) {
    $c = Get-Content -Raw $f.FullName -ErrorAction SilentlyContinue
    if (-not $c) { continue }
    $ms = [regex]::Matches($c, 'api/welcome')
    if ($ms.Count -eq 0) { continue }
    $paths = [regex]::Matches($c, 'api/welcome[A-Za-z0-9_/\-\.]*') | ForEach-Object { $_.Value } | Sort-Object -Unique
    Write-Output ("##### " + $f.Name + " :: " + ($paths -join ', '))
    $n = 0
    foreach ($m in $ms) {
      if ($n -ge 3) { break }
      $s = [Math]::Max(0, $m.Index - 700)
      $len = [Math]::Min(1400, $c.Length - $s)
      Write-Output ("--- ctx " + $n + " @ " + $m.Index)
      Write-Output $c.Substring($s, $len)
      $n++
    }
  }
}
