$files = @('chunk-66206.js', 'chunk-mines-page.js') | ForEach-Object { Join-Path $PSScriptRoot $_ }
$pats = @("Wager.{0,110}", "start.{0,110}", "cashout.{0,110}", "reveal.{0,110}", "bet.{0,110}", "data-bet-button.{0,40}")
foreach ($f in $files) {
  foreach ($p in $pats) {
    Select-String -Path $f -Pattern $p -AllMatches -CaseSensitive:$false | ForEach-Object { foreach ($m in $_.Matches) { "S>> $($m.Value)" } }
  }
}
$out2 = $null
"S>>" + "---END---"
