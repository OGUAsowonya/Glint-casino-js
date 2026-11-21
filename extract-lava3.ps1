$dir = Join-Path $PSScriptRoot '_lava'
foreach ($f in Get-ChildItem $dir -Filter *.js -File) {
  $c = Get-Content -Raw $f.FullName
  if (-not $c) { continue }
  $ms = [regex]::Matches($c, 'floor-is-lava/jump|floor-is-lava/start|floor-is-lava/cashout')
  if ($ms.Count -eq 0) { continue }
  Write-Output ("##### " + $f.Name + " hits=" + $ms.Count + " len=" + $c.Length)
  foreach ($m in $ms) {
    $s = [Math]::Max(0, $m.Index - 1800)
    $len = [Math]::Min(3600, $c.Length - $s)
    Write-Output ("--- @ " + $m.Index)
    Write-Output $c.Substring($s, $len)
  }
}
