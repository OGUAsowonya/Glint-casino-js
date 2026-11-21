$root = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\_login" | Out-Null
foreach($page in @('login','register','signup')){
  try{
    $h=(Invoke-WebRequest -Uri ("https://donutglint.com/" + $page) -UseBasicParsing).Content
    $srcs=[regex]::Matches($h,'/_next/static/chunks/[A-Za-z0-9_./()\-]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
    foreach($s in $srcs){ $f="$root\_login\" + ($page + "_" + (($s -split '/')[-1] -replace '[^\w\.\-]','_')); if(-not(Test-Path $f)){ try{Invoke-WebRequest -Uri ("https://donutglint.com"+$s) -OutFile $f -UseBasicParsing}catch{} } }
    Write-Output ($page + " chunks: " + $srcs.Count)
  } catch { Write-Output ($page + " -> " + $_.Exception.Message.Substring(0,[Math]::Min(60,$_.Exception.Message.Length))) }
}
$files = Get-ChildItem "$root\_login" -Filter *.js -File -ErrorAction SilentlyContinue
foreach($f in $files){
  $c=Get-Content -Raw $f.FullName
  $ms=[regex]::Matches($c,'/api/auth[A-Za-z0-9_/\-\.]*')
  if($ms.Count -eq 0){ continue }
  $paths=$ms | ForEach-Object { $_.Value } | Sort-Object -Unique
  Write-Output ("=== " + $f.Name + " :: " + ($paths -join ', '))
  $m=$ms[0]; $s=[Math]::Max(0,$m.Index-900); Write-Output $c.Substring($s,[Math]::Min(1700,$c.Length-$s))
}
