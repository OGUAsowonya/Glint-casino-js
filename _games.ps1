$base = 'https://donutglint.com'
$games = @('rps','hilo','crash','towers','chicken','floor-is-lava','pig-race','rush-hour','moon-or-rug','snakes','double','moles','airlift','baccarat','pool')
$gamesRoot = Join-Path $PSScriptRoot '_g'
New-Item -ItemType Directory -Force -Path $gamesRoot | Out-Null
foreach ($g in $games) {
  try {
    $h = (Invoke-WebRequest -Uri "$base/$g" -UseBasicParsing).Content
    $srcs = [regex]::Matches($h, '/_next/static/chunks/[A-Za-z0-9_./()\-]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
    $dir = Join-Path $gamesRoot $g
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    foreach ($s in $srcs) {
      $f = Join-Path $dir (($s -split '/')[-1] -replace '[^\w\.\-]', '_')
      if (-not (Test-Path $f)) {
        try { Invoke-WebRequest -Uri ($base + $s) -OutFile $f -UseBasicParsing } catch {}
      }
    }
    foreach ($f in Get-ChildItem "$dir\*.js") {
      $c = Get-Content -Raw $f.FullName
      $ms = [regex]::Matches($c, 'api/games/' + $g)
      if ($ms.Count -gt 0) {
        Write-Output "##### $g :: $($f.Name) :: hits=$($ms.Count)"
        $n = 0
        foreach ($m in $ms) {
          if ($n -ge 3) { break }
          $s = [Math]::Max(0, $m.Index - 700)
          $len = [Math]::Min(1400, $c.Length - $s)
          Write-Output $c.Substring($s, $len)
          Write-Output ''
          $n++
        }
      }
    }
  } catch { Write-Output "##### $g :: PAGE ERROR $($_.Exception.Message)" }
}
