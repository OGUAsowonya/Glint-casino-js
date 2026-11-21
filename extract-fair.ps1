$files = @('page-8e78d51e3c8cc312.js','67981-453ed2b004ad3e7a.js')
foreach ($f in $files) {
  $p = Join-Path (Join-Path $PSScriptRoot '_fair') $f
  Write-Output "##### $f"
  $c = Get-Content -Raw $p
  $paths = [regex]::Matches($c, '/api/[A-Za-z0-9_/\-\.]+') | ForEach-Object { $_.Value } | Sort-Object -Unique
  Write-Output ("API PATHS: " + ($paths -join ', '))
  $ms = [regex]::Matches($c, 'serverSeed')
  Write-Output ("serverSeed count: " + $ms.Count)
  $n = 0
  foreach ($m in $ms) {
    if ($n -ge 6) { break }
    $s = [Math]::Max(0, $m.Index - 300)
    $len = [Math]::Min(600, $c.Length - $s)
    Write-Output ("--- ctx " + $n + " @ " + $m.Index)
    Write-Output $c.Substring($s, $len)
    $n++
  }
}
