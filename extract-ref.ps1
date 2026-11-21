$root = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\_ref" | Out-Null
$h=(Invoke-WebRequest -Uri "https://donutglint.com/referrals" -UseBasicParsing).Content
$srcs=[regex]::Matches($h,'/_next/static/chunks/[A-Za-z0-9_./()\-]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
foreach($s in $srcs){ $f="$root\_ref\" + (($s -split '/')[-1] -replace '[^\w\.\-]','_'); if(-not(Test-Path $f)){ try{Invoke-WebRequest -Uri ("https://donutglint.com"+$s) -OutFile $f -UseBasicParsing}catch{} } }
Write-Output ("referrals chunks: " + $srcs.Count)
$files=@()
foreach($d in @('_ref','_welcome','_redeem','_chunks','_cf','_fair','_lava')){ $p=Join-Path $root $d; if(Test-Path $p){ $files += Get-ChildItem $p -Filter *.js -File -ErrorAction SilentlyContinue } }
$paths=@{}
foreach($f in $files){ $c=Get-Content -Raw $f.FullName -ErrorAction SilentlyContinue; if(-not $c){continue}
  foreach($m in [regex]::Matches($c,'/api/[A-Za-z0-9_\-]+(?:/[A-Za-z0-9_\-\.]+){0,3}')){ $paths[$m.Value]=1 } }
Write-Output "--- api paths (filtered):"
$paths.Keys | Where-Object { $_ -match 'referral|auth|account|login|register|otp|discord|wallet|rewards|promo|welcome|rain|fairness' } | Sort-Object | ForEach-Object { Write-Output $_ }
foreach($f in Get-ChildItem "$root\_ref" -Filter *.js -File -ErrorAction SilentlyContinue){
  $c=Get-Content -Raw $f.FullName
  $ms=[regex]::Matches($c,'api/referrals')
  if($ms.Count -gt 0){ $m=$ms[0]; $s=[Math]::Max(0,$m.Index-900); Write-Output ("--- ctx " + $f.Name + " x" + $ms.Count); Write-Output $c.Substring($s,[Math]::Min(1700,$c.Length-$s)) }
}
