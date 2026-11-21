$c = Get-Content -Raw (Join-Path $PSScriptRoot 'lava-jump.txt')
$pats = @('sunk','orders','hazard','cashout','cap','goal','cleared','level','multiplier')
foreach ($p in $pats) {
  $ms = [regex]::Matches($c, [regex]::Escape($p))
  Write-Output ("=== " + $p + " x" + $ms.Count)
  $n = 0
  foreach ($m in $ms) {
    if ($n -ge 3) { break }
    $s = [Math]::Max(0, $m.Index - 220)
    $len = [Math]::Min(440, $c.Length - $s)
    Write-Output ("-- " + $p + " @ " + $m.Index)
    Write-Output ($c.Substring($s, $len) -replace '\s+', ' ')
    $n++
  }
}
