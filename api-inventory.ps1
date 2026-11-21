$base = $PSScriptRoot
$dirs = @('_chunks','_g','_wel','_cf','_fair','_lava','_redeem')
$all = @{}
foreach ($d in $dirs) {
  $p = Join-Path $base $d
  if (-not (Test-Path $p)) { continue }
  foreach ($f in Get-ChildItem -Path $p -Filter *.js -File -ErrorAction SilentlyContinue) {
    $c = Get-Content -Raw $f.FullName -ErrorAction SilentlyContinue
    if (-not $c) { continue }
    foreach ($m in [regex]::Matches($c, '/api/[A-Za-z0-9_/\-\.\$\{\}]{2,60}')) {
      $v = $m.Value
      if (-not $all.ContainsKey($v)) { $all[$v] = 0 }
      $all[$v] = $all[$v] + 1
    }
  }
}
$groups = @{
  'WALLET' = @(); 'RAIN' = @(); 'SLOTS' = @(); 'FAIRNESS' = @(); 'WELCOME' = @(); 'REWARD' = @(); 'WITHDRAW' = @()
}
foreach ($k in $all.Keys) {
  if ($k -match 'wallet') { $groups['WALLET'] += $k }
  if ($k -match 'rain') { $groups['RAIN'] += $k }
  if ($k -match 'slot') { $groups['SLOTS'] += $k }
  if ($k -match 'fairness') { $groups['FAIRNESS'] += $k }
  if ($k -match 'welcome') { $groups['WELCOME'] += $k }
  if ($k -match 'reward') { $groups['REWARD'] += $k }
  if ($k -match 'withdraw|deposit') { $groups['WITHDRAW'] += $k }
}
foreach ($g in $groups.Keys) {
  Write-Output ("=== " + $g)
  foreach ($v in ($groups[$g] | Sort-Object -Unique)) { Write-Output ("  " + $v + "  x" + $all[$v]) }
}
