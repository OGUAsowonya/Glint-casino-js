$dirs = @('_fair', '_chunks', '_cf', '_redeem') | ForEach-Object { Join-Path $PSScriptRoot $_ }
foreach ($d in $dirs) {
  if (-not (Test-Path $d)) { continue }
  foreach ($f in Get-ChildItem "$d\*.js") {
    $c = Get-Content -Raw $f.FullName
    if ($c -notmatch "65139:") { continue }
    Write-Output ("===== " + $f.FullName)
    foreach ($pat in @('gR\s*[:=]\s*function','gR\s*[:=]\s*\(','IE\s*[:=]\s*function','IE\s*[:=]\s*\(','fg\s*[:=]\s*function')) {
      $ms = [regex]::Matches($c, $pat)
      if ($ms.Count -eq 0) { continue }
      $m = $ms[0]
      $s = [Math]::Max(0, $m.Index - 120)
      $len = [Math]::Min(1600, $c.Length - $s)
      Write-Output ("--- " + $pat)
      Write-Output $c.Substring($s, $len)
      Write-Output ""
    }
  }
}
