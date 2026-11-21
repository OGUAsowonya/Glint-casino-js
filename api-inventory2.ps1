$base = $PSScriptRoot
$dirs = @('_chunks','_g','_wel','_cf','_fair','_lava','_redeem')
$all = @{}
foreach ($d in $dirs) {
  $p = Join-Path $base $d
  if (-not (Test-Path $p)) { continue }
  foreach ($f in Get-ChildItem -Path $p -Filter *.js -File -ErrorAction SilentlyContinue) {
    $c = Get-Content -Raw $f.FullName -ErrorAction SilentlyContinue
    if (-not $c) { continue }
    foreach ($m in [regex]::Matches($c, '(?<![A-Za-z0-9_/\-])api/[A-Za-z0-9_/\-\.\$]{2,60}')) {
      $v = $m.Value
      if (-not $all.ContainsKey($v)) { $all[$v] = 0 }
      $all[$v] = $all[$v] + 1
    }
  }
}
$keep = @()
foreach ($k in $all.Keys) {
  if ($k -match 'wallet|rain|slot|withdraw|bonus|play|deposit|first|bonus') { $keep += $k }
}
foreach ($v in ($keep | Sort-Object -Unique)) { Write-Output ("  " + $v + "  x" + $all[$v]) }
