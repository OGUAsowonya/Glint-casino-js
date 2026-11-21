$root = $PSScriptRoot
$files = @()
$files += Get-ChildItem "$root\_welcome" -Filter *.js -File -ErrorAction SilentlyContinue
$files += Get-ChildItem "$root\_redeem" -Filter *.js -File -ErrorAction SilentlyContinue
$files += Get-ChildItem "$root\_chunks" -Filter *.js -File -ErrorAction SilentlyContinue
Write-Output ("files scanned: " + $files.Count)
$patSets = @('api/auth','api/referral','api/rewards','api/welcome','api/rain','api/wallet')
foreach ($p in $patSets) {
  $all = @()
  foreach ($f in $files) {
    $c = Get-Content -Raw $f.FullName -ErrorAction SilentlyContinue
    if (-not $c) { continue }
    $m = [regex]::Matches($c, [regex]::Escape($p) + '[A-Za-z0-9_/\-\.]*') | ForEach-Object { $_.Value } | Sort-Object -Unique
    if ($m) { $all += ($f.Name + ': ' + ($m -join ', ')) }
  }
  Write-Output ("=== " + $p)
  $all | Select-Object -First 6 | ForEach-Object { Write-Output $_ }
}
function Dump($file, $pat) {
  $c = Get-Content -Raw $file -ErrorAction SilentlyContinue
  if (-not $c) { return }
  $ms = [regex]::Matches($c, $pat)
  if ($ms.Count -eq 0) { return }
  $m = $ms[0]
  $s = [Math]::Max(0, $m.Index - 800)
  $len = [Math]::Min(1600, $c.Length - $s)
  Write-Output ("--- " + (Split-Path $file -Leaf) + " :: " + $pat + " x" + $ms.Count)
  Write-Output $c.Substring($s, $len)
}
$welcomePage = Get-ChildItem "$root\_welcome" -Filter 'page-*.js' -File -ErrorAction SilentlyContinue | Where-Object { (Get-Content -Raw $_.FullName) -match 'api/welcome' } | Select-Object -First 1
if ($welcomePage) { Dump $welcomePage.FullName 'api/welcome' }
$redeemPage = Get-ChildItem "$root\_redeem" -Filter 'redeem-page.js' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if ($redeemPage) { Dump $redeemPage.FullName 'discord-tag' }
