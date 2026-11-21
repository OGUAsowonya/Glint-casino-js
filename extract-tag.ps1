$root = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\_welcome" | Out-Null
$h=(Invoke-WebRequest -Uri "https://donutglint.com/welcome" -UseBasicParsing).Content
$srcs=[regex]::Matches($h,'/_next/static/chunks/[A-Za-z0-9_./()\-]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
foreach($s in $srcs){ $f="$root\_welcome\" + (($s -split '/')[-1] -replace '[^\w\.\-]','_'); if(-not (Test-Path $f)){ try{ Invoke-WebRequest -Uri ("https://donutglint.com"+$s) -OutFile $f -UseBasicParsing }catch{} } }
Write-Output ("welcome chunks: " + $srcs.Count)
$dirs=@('_welcome','_chunks','_cf','_fair','_redeem','_lava')
foreach($d in $dirs){ $p=Join-Path $root $d; if(-not(Test-Path $p)){continue}
  foreach($f in Get-ChildItem $p -Filter *.js -File -ErrorAction SilentlyContinue){ $c=Get-Content -Raw $f.FullName
    foreach($pat in @('discord-tag','wornTag','api/welcome','wearing')){ $ms=[regex]::Matches($c,[regex]::Escape($pat)); if($ms.Count -gt 0){ Write-Output ("=== " + $f.Name + " :: " + $pat + " x" + $ms.Count) } } } }
foreach($f in Get-ChildItem "$root\_welcome" -Filter *.js -File -ErrorAction SilentlyContinue){ $c=Get-Content -Raw $f.FullName
  $ms=[regex]::Matches($c,'discord-tag'); if($ms.Count -gt 0){ $n=0; foreach($m in $ms){ if($n -ge 2){break}; $s=[Math]::Max(0,$m.Index-900); $len=[Math]::Min(1700,$c.Length-$s); Write-Output ("--- " + $f.Name + " ctx " + $n + " @ " + $m.Index); Write-Output $c.Substring($s,$len); $n++ } } }
