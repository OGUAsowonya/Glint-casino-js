$dirs = @('_welcome', '_ref', '_chunks', '_cf', '_fair', '_lava', '') | ForEach-Object { Join-Path $PSScriptRoot $_ }
$seen = @{}
foreach ($d in $dirs) {
  if (-not (Test-Path $d)) { continue }
  foreach ($f in Get-ChildItem -Path $d -Filter *.js -File -ErrorAction SilentlyContinue) {
    $c = Get-Content -Raw $f.FullName -ErrorAction SilentlyContinue
    if (-not $c) { continue }
    foreach ($pat in @('api/auth/[a-zA-Z\-]+','discord/oauth[a-zA-Z/\-]*','mojang[a-zA-Z/\-]*','minecraft[a-zA-Z/\-]*','/api/register[a-zA-Z/\-]*','/api/signup[a-zA-Z/\-]*','create-account','/api/accounts?[a-zA-Z/\-]*')) {
      foreach ($m in [regex]::Matches($c, $pat)) {
        $k = $m.Value
        if (-not $seen.ContainsKey($k)) { $seen[$k] = $f.Name }
      }
    }
  }
}
Write-Output "=== UNIQUE MATCHES ==="
foreach ($k in ($seen.Keys | Sort-Object)) { Write-Output ("$k   <- " + $seen[$k]) }

Write-Output "=== api/auth/ CONTEXT ==="
$p = Join-Path $PSScriptRoot '_chunks\48062-0e0247c4b3c1abe9.js'
if (-not (Test-Path $p)) { $p = Join-Path $PSScriptRoot '_welcome\48062-0e0247c4b3c1abe9.js' }
if (Test-Path $p) {
  $c = Get-Content -Raw $p
  $ms = [regex]::Matches($c, 'api/auth/')
  Write-Output ("hits: " + $ms.Count)
  $n = 0
  foreach ($m in $ms) {
    if ($n -ge 3) { break }
    $s = [Math]::Max(0, $m.Index - 700)
    Write-Output ("--- ctx " + $n)
    Write-Output $c.Substring($s, [Math]::Min(1400, $c.Length - $s))
    $n++
  }
}
