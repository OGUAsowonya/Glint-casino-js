$base = $PSScriptRoot
$dir = "$base\_wel"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
try {
  $h = (Invoke-WebRequest -Uri 'https://donutglint.com/welcome' -UseBasicParsing).Content
} catch {
  Write-Output ("HTML FETCH FAILED: " + $_.Exception.Message); exit
}
$srcs = [regex]::Matches($h, '/_next/static/chunks/[A-Za-z0-9_./()\-]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
Write-Output ("chunks: " + $srcs.Count)
foreach ($s in $srcs) {
  $f = Join-Path $dir (($s -split '/')[-1] -replace '[^\w\.\-]', '_')
  if (-not (Test-Path $f)) {
    try { Invoke-WebRequest -Uri ('https://donutglint.com' + $s) -OutFile $f -UseBasicParsing } catch {}
  }
}
$apiPaths = @{}
$ctxOut = @()
foreach ($f in Get-ChildItem $dir -Filter *.js -File) {
  $c = Get-Content -Raw $f.FullName
  foreach ($m in [regex]::Matches($c, '/api/[A-Za-z0-9_/\-\.]+')) {
    $p = $m.Value
    if (-not $apiPaths.ContainsKey($p)) { $apiPaths[$p] = $f.Name }
  }
  foreach ($needle in @('heard','answer','question')) {
    $i = $c.IndexOf($needle)
    if ($i -ge 0 -and $ctxOut.Count -lt 6) {
      $s = [Math]::Max(0, $i - 500)
      $ctxOut += ("--- " + $f.Name + " '" + $needle + "' @" + $i + "`n" + $c.Substring($s, [Math]::Min(1200, $c.Length - $s)))
    }
  }
}
Write-Output "=== API PATHS ==="
foreach ($k in ($apiPaths.Keys | Sort-Object)) { Write-Output ($k + "   (" + $apiPaths[$k] + ")") }
Write-Output "=== CONTEXTS ==="
$ctxOut | ForEach-Object { Write-Output $_ }
