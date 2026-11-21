$dir = Join-Path $PSScriptRoot '_fair'
$targets = @("dI","IE=","fg=")
foreach ($f in Get-ChildItem "$dir\*.js") {
  $c = Get-Content -Raw $f.FullName
  foreach ($t in $targets) {
    $ms = [regex]::Matches($c, [regex]::Escape($t))
    if ($ms.Count -gt 0 -and $ms.Count -lt 40) {
      Write-Output ("===== " + $f.Name + " :: '" + $t + "' x" + $ms.Count)
      $shown = 0
      foreach ($m in $ms) {
        if ($shown -ge 2) { break }
        $s = [Math]::Max(0, $m.Index - 350)
        $len = [Math]::Min(1100, $c.Length - $s)
        Write-Output $c.Substring($s, $len)
        Write-Output ""
        $shown++
      }
    }
  }
}
