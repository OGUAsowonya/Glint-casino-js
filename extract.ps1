$files = @('chunk-66206.js', 'chunk-mines-page.js') | ForEach-Object { Join-Path $PSScriptRoot $_ }
foreach ($f in $files) {
  Select-String -Path $f -Pattern "api/[a-zA-Z0-9?&=/-]+" -AllMatches | ForEach-Object { "API>> $($_.Matches.Value)" } | Sort-Object -Unique
  Select-String -Path $f -Pattern "fetch[^;,{}]{0,120}" -AllMatches | ForEach-Object { "F>> $($_.Matches.Value)" } | Sort-Object -Unique
}
