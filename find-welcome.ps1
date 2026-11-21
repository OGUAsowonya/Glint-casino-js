$dirs = @('_chunks', '_redeem', '_fair', '_cf', '') | ForEach-Object { Join-Path $PSScriptRoot $_ }
$pats = @('how you heard','heard about','welcome','rewards/claim','rewards/promo','candy')
foreach ($d in $dirs) {
  if (-not (Test-Path $d)) { continue }
  foreach ($f in Get-ChildItem -Path $d -Filter *.js -File -ErrorAction SilentlyContinue) {
    $c = Get-Content -Raw $f.FullName -ErrorAction SilentlyContinue
    if (-not $c) { continue }
    $hits = @()
    foreach ($p in $pats) { if ($c.Contains($p)) { $hits += $p } }
    if ($hits.Count -eq 0) { continue }
    Write-Output ("##### " + $f.FullName + " :: " + ($hits -join ','))
    foreach ($p in $hits) {
      $ms = [regex]::Matches($c, [regex]::Escape($p))
      $n = 0
      foreach ($m in $ms) {
        if ($n -ge 2) { break }
        $s = [Math]::Max(0, $m.Index - 700)
        $len = [Math]::Min(1600, $c.Length - $s)
        Write-Output ("--- '" + $p + "' ctx " + $n + " @ " + $m.Index)
        Write-Output $c.Substring($s, $len)
        $n++
      }
    }
  }
}
