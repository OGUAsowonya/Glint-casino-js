$root = $PSScriptRoot
$files = @()
foreach($d in @('_welcome','_redeem','_chunks','_cf','_fair','_lava')){ $p=Join-Path $root $d; if(Test-Path $p){ $files += Get-ChildItem $p -Filter *.js -File -ErrorAction SilentlyContinue } }
$files += Get-ChildItem $root -Filter *.js -File -ErrorAction SilentlyContinue
foreach ($pat in @('api/auth/','referral','api/session','register','api/link','api/account')) {
  $paths = @()
  foreach ($f in $files) {
    $c = Get-Content -Raw $f.FullName -ErrorAction SilentlyContinue
    if (-not $c) { continue }
    $m = [regex]::Matches($c, [regex]::Escape($pat) + '[A-Za-z0-9_/\-\.]*') | ForEach-Object { $_.Value } | Sort-Object -Unique
    if ($m) { $paths += ($f.Name + ': ' + (($m | Select-Object -First 6) -join ', ')) }
  }
  Write-Output ("=== " + $pat)
  $paths | Select-Object -First 5 | ForEach-Object { Write-Output $_ }
}
$c = Get-Content -Raw (Get-ChildItem "$root\_chunks" -Filter '48062*.js' -File -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
if ($c) {
  $ms = [regex]::Matches($c, 'api/auth/')
  Write-Output ("--- 48062 api/auth/ x" + $ms.Count)
  if ($ms.Count -gt 0) { $m=$ms[0]; $s=[Math]::Max(0,$m.Index-900); Write-Output $c.Substring($s,[Math]::Min(1800,$c.Length-$s)) }
}
