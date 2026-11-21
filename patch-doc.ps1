$main = Join-Path $PSScriptRoot 'GLINT-DonutSMP-Casino-Findings.md'
$addendum = Join-Path $PSScriptRoot 'GLINT-Findings-ADDENDUM10.md'
$t = [IO.File]::ReadAllText($main)

$note = @'
> **UNIT NOTE - READ FIRST:** every monetary value in this document that was copied from a GLINT API response is in **CENTS** - divide by 100 for USD (e.g. `500_000_000` = $5,000,000 = the $5M Discord-tag reward; `10_000` = the $100 minimum bet; `5_000_000` = the $50,000 withdrawal floor). Any `$` figure derived from a raw API number is 100x too high. See `GLINT-Findings-ADDENDUM10.md` for the full correction table plus the webhook and bonus findings (F42/F43).

'@

if ($t -notmatch 'UNIT NOTE') {
  $t = $note + $t
}

$add = [IO.File]::ReadAllText($addendum)
if ($t -notmatch 'Findings Addendum 10') {
  $t = $t + "`r`n`r`n---`r`n`r`n" + $add
}

[IO.File]::WriteAllText($main, $t, (New-Object Text.UTF8Encoding($false)))

$bad = ([regex]::Matches($t, [string][char]0xFFFD)).Count
Write-Output ("main doc bytes: " + (Get-Item $main).Length)
Write-Output ("replacement chars: " + $bad)
Write-Output ("has unit note: " + ($t -match 'UNIT NOTE'))
Write-Output ("has addendum 10: " + ($t -match 'Findings Addendum 10'))
