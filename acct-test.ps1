$base = 'https://donutglint.com'
$h = @{'Accept'='application/json';'X-Requested-With'='glint';'Content-Type'='application/json';'User-Agent'='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0'}
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$required = @('GLINT_TEST_EMAIL', 'GLINT_TEST_PASSWORD', 'GLINT_TEST_NAME', 'GLINT_REFERRAL_CODE', 'GLINT_RAIN_ID')
$missing = $required | Where-Object { -not [Environment]::GetEnvironmentVariable($_) }
if ($missing) {
  throw "Set the following environment variables before running this script: $($missing -join ', ')"
}
function Call($m,$u,$b) {
  try {
    if ($b) { $r = Invoke-WebRequest -Uri ($base+$u) -Method $m -Headers $h -Body (ConvertTo-Json $b -Compress) -WebSession $sess -UseBasicParsing }
    else    { $r = Invoke-WebRequest -Uri ($base+$u) -Method $m -Headers $h -WebSession $sess -UseBasicParsing }
    return @{s=[int]$r.StatusCode; b=[string]$r.Content}
  } catch {
    $resp = $_.Exception.Response
    if ($resp) { try { $sr = New-Object System.IO.StreamReader($resp.GetResponseStream()); return @{s=[int]$resp.StatusCode; b=$sr.ReadToEnd()} } catch {} }
    return @{s=0; b=$_.Exception.Message}
  }
}
function Show($tag,$r,$n) { $t=$r.b; if($t.Length -gt $n){$t=$t.Substring(0,$n)}; Write-Output ("$tag [" + $r.s + "] " + $t) }

Show 'SIGNUP' (Call POST '/api/auth/signup' @{
  email = $env:GLINT_TEST_EMAIL
  password = $env:GLINT_TEST_PASSWORD
  name = $env:GLINT_TEST_NAME
  ref = $env:GLINT_REFERRAL_CODE
}) 600
Show 'ME' (Call GET '/api/auth/me' $null) 400
Show 'WELCOME' (Call POST '/api/welcome/source' @{source='youtube'}) 500
Show 'LIMITS' (Call GET '/api/wallet/limits' $null) 500
Show 'REFS' (Call GET '/api/referrals' $null) 800
Show 'RAINJOIN' (Call POST '/api/rain/join' @{rainId=$env:GLINT_RAIN_ID}) 300
Show 'LIMITS2' (Call GET '/api/wallet/limits' $null) 500
Show 'TX' (Call GET '/api/wallet/transactions?limit=5' $null) 700
