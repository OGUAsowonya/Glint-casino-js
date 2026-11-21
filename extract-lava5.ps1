$dir = Join-Path $PSScriptRoot '_lava'
$target = $null
foreach ($f in Get-ChildItem $dir -Filter *.js -File) {
  $c = Get-Content -Raw $f.FullName
  if ($c -and $c.Contains('/api/games/floor-is-lava/jump')) { $target = $f; break }
}
if (-not $target) { Write-Output 'NO LAVA CHUNK'; exit }
Write-Output ("FILE: " + $target.Name + " len=" + (Get-Item $target.FullName).Length)
$c = Get-Content -Raw $target.FullName
# module 15308 (difficulty tables / multiplier fn) and 15308 usages of mR / lL
$m = [regex]::Match($c, '15308:\(e,t,a\)=>\{')
if ($m.Success) {
  $s = $m.Index
  $len = [Math]::Min(2600, $c.Length - $s)
  Write-Output '--- module 15308 ---'
  Write-Output ($c.Substring($s, $len) -replace '\s+', ' ')
}
foreach ($p in @('mR','lL','od:')) {
  $ms = [regex]::Matches($c, [regex]::Escape($p))
  Write-Output ("=== " + $p + " x" + $ms.Count)
  $n = 0
  foreach ($x in $ms) {
    if ($n -ge 3) { break }
    $s2 = [Math]::Max(0, $x.Index - 200)
    $len2 = [Math]::Min(400, $c.Length - $s2)
    Write-Output ("-- @ " + $x.Index + ": " + ($c.Substring($s2, $len2) -replace '\s+', ' '))
    $n++
  }
}
