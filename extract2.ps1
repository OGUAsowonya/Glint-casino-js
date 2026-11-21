$files = @('chunk-66206.js', 'chunk-mines-page.js') | ForEach-Object { Join-Path $PSScriptRoot $_ }
$out = New-Object System.Collections.Generic.List[string]
$pats = @("start","cashout","reveal","JSON.stringify","bet","wager","nonce","seed")
foreach ($f in $files) {
  foreach ($p in $pats) {
    Select-String -Path $f -Pattern $p -AllMatches -CaseSensitive:$false | ForEach-Object { foreach ($m in $_.Matches) { $out.Add("P>> $($m.Value.Substring(0, [Math]::Min(150, $m.Value.Length)))") } }
  }
}
$out | Sort-Object -Unique | Select-Object -First 60 | ForEach-Object { $_ }
