$dirs = @('_chunks', '_cf', '_fair', '') | ForEach-Object { Join-Path $PSScriptRoot $_ }
foreach ($d in $dirs) {
  if (-not (Test-Path $d)) { continue }
  foreach ($f in Get-ChildItem -Path $d -Filter *.js -File -ErrorAction SilentlyContinue) {
    $c = Get-Content -Raw $f.FullName -ErrorAction SilentlyContinue
    if (-not $c) { continue }
    $ms = [regex]::Matches($c, 'floor-is-lava')
    if ($ms.Count -eq 0) { continue }
    Write-Output ("##### " + $f.FullName + " :: " + $ms.Count + " hits")
    $n = 0
    foreach ($m in $ms) {
      if ($n -ge 3) { break }
      $s = [Math]::Max(0, $m.Index - 1200)
      $len = [Math]::Min(2600, $c.Length - $s)
      Write-Output ("--- ctx " + $n + " @ " + $m.Index)
      Write-Output $c.Substring($s, $len)
      $n++
    }
  }
}
