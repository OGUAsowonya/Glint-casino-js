$files = @('chunk-66206.js', 'chunk-mines-page.js') | ForEach-Object { Join-Path $PSScriptRoot $_ }
$out = New-Object System.Collections.Generic.List[string]
$pats = @("api/games/mines/start.{0,190}", "api/games/mines/reveal.{0,120}", "api/games/mines/cashout.{0,120}")
foreach ($f in $files) {
  foreach ($p in $pats) {
    Select-String -Path $f -Pattern $p -AllMatches -CaseSensitive:$false | ForEach-Object { foreach ($m in $_.Matches) { $v=$m.Value; if($v.Length-gt 350){$v=$v.Substring(0,350)} $out.Add("S>> $v") } }
  }
}
$out | Sort-Object -Unique | Select-Object -First 40 | ForEach-Object { $_ }
