function Show($file, $needle, $before, $len) {
  $c = Get-Content -Raw $file
  $i = $c.IndexOf($needle)
  if ($i -lt 0) { Write-Output ("MISSING " + $needle + " in " + $file); return }
  $s = [Math]::Max(0, $i - $before)
  Write-Output ("##### " + (Split-Path $file -Leaf) + " :: '" + $needle + "' @" + $i)
  Write-Output $c.Substring($s, [Math]::Min($len, $c.Length - $s))
  Write-Output ""
}
$base = $PSScriptRoot
Show "$base\_chunks\17774-7d0b4dd6d159e76e.js" 'rewards/claim' 700 1200
Show "$base\_chunks\50346-b904acc309306004.js" 'welcome' 300 1400
Show "$base\_redeem\redeem-page.js" 'rewards/claim' 900 1500
