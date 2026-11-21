$dirs = @('_welcome', '_chunks') | ForEach-Object { Join-Path $PSScriptRoot $_ }
foreach ($d in $dirs) {
  if (-not (Test-Path $d)) { continue }
  foreach ($f in Get-ChildItem -Path $d -Filter *.js -File -ErrorAction SilentlyContinue) {
    $c = Get-Content -Raw $f.FullName -ErrorAction SilentlyContinue
    if (-not $c) { continue }
    $ms = [regex]::Matches($c, 'payCents|botName|apiWatch|purpose|existing')
    if ($ms.Count -eq 0) { continue }
    Write-Output ("##### " + $f.Name + " hits=" + $ms.Count)
    $n = 0
    foreach ($m in $ms) {
      if ($n -ge 3) { break }
      $s = [Math]::Max(0, $m.Index - 900)
      Write-Output ("--- ctx " + $n + " @ " + $m.Index)
      Write-Output $c.Substring($s, [Math]::Min(1800, $c.Length - $s))
      $n++
    }
    break
  }
}
