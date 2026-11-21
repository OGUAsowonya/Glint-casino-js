$base = $PSScriptRoot
$dir = Join-Path $base '_lava'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$h = (Invoke-WebRequest -Uri 'https://donutglint.com/floor-is-lava' -UseBasicParsing).Content
$srcs = [regex]::Matches($h, '/_next/static/chunks/[A-Za-z0-9_./()\-]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
Write-Output ("chunks: " + $srcs.Count)
foreach ($s in $srcs) {
  $name = (($s -split '/')[-1] -replace '[^\w\.\-]', '_')
  $f = Join-Path $dir $name
  if (-not (Test-Path $f)) {
    try { Invoke-WebRequest -Uri ('https://donutglint.com' + $s) -OutFile $f -UseBasicParsing } catch {}
  }
}
$out = Join-Path $base 'lava-dump2.txt'
Remove-Item $out -ErrorAction SilentlyContinue
foreach ($f in Get-ChildItem $dir -Filter *.js -File) {
  $c = Get-Content -Raw $f.FullName
  if (-not $c) { continue }
  $ms = [regex]::Matches($c, 'floor-is-lava')
  if ($ms.Count -eq 0) { continue }
  Add-Content $out ("##### " + $f.Name + " :: " + $ms.Count + " hits")
  $n = 0
  foreach ($m in $ms) {
    if ($n -ge 3) { break }
    $s = [Math]::Max(0, $m.Index - 1500)
    $len = [Math]::Min(3200, $c.Length - $s)
    Add-Content $out ("--- ctx " + $n + " @ " + $m.Index)
    Add-Content $out $c.Substring($s, $len)
    $n++
  }
}
Write-Output ("dump lines: " + (Get-Content $out | Measure-Object -Line).Lines)
