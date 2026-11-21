$ErrorActionPreference='Continue'
$out = Join-Path $PSScriptRoot '_allchunks'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$slugs=@('blackjack','live-blackjack','baccarat','keno','roulette','paper','upgrader','jackpot','rush-hour','moon-or-rug','pig-race','moon','double','duel','battles','cases','mines-duel','snakes','towers','chicken','video-poker','crash','coinflip','dice','limbo','plinko','slots','mines','hilo','rps','floor-is-lava','moles','airlift','originals','paper-game','pork','moon-or-rug','pvp-coinflip','coinflip-pvp')
$routes=@{}
foreach($s in $slugs){
  try{$html=(Invoke-WebRequest -Uri "https://donutglint.com/$s" -UseBasicParsing -TimeoutSec 25).Content}catch{continue}
  $ms=[regex]::Matches($html,'/_next/static/chunks/[^"''<> ]+?\.js')|ForEach-Object{$_.Value}|Sort-Object -Unique
  foreach($c in $ms){
    $name=($c -replace '.*/','')
    $p=Join-Path $out $name
    if(-not(Test-Path $p)){try{Invoke-WebRequest -Uri ("https://donutglint.com"+$c) -OutFile $p -TimeoutSec 25}catch{}}
    if(Test-Path $p){
      $txt=Get-Content $p -Raw -ErrorAction SilentlyContinue
      if($txt){
        foreach($m in [regex]::Matches($txt,'api/games/[a-z0-9\-/_]+')){
          $r=$m.Value
          if(-not $routes.ContainsKey($r)){$routes[$r]=New-Object System.Collections.ArrayList}
          if(-not $routes[$r].Contains($s)){[void]$routes[$r].Add($s)}
        }
      }
    }
  }
}
$lines=foreach($k in ($routes.Keys|Sort-Object)){ "$k`t$($routes[$k] -join ',')" }
$lines | Set-Content (Join-Path $PSScriptRoot 'game-routes.txt')
$lines
