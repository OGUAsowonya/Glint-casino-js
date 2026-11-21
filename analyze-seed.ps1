$ErrorActionPreference = "Continue"
$s0 = "3110b4f809cf1310ffd28c1bf13bfd9c4a8f34b0a0aea661e44e8f2c379b9a06"
$h0 = "d9a3649ce0d44f25617520d62a69a94fe2cd23399c994d48e2483d64c569f6d6"
$h1 = "ee5382af603d99dc6905e5d3e98e69d972655799c7b47e12d663835f4fe1d4cd"

function Sha256Hex([string]$msg) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $b = [System.Text.Encoding]::UTF8.GetBytes($msg)
  ($sha.ComputeHash($b) | ForEach-Object { $_.ToString("x2") }) -join ""
}
function HmacHex([string]$key, [string]$msg) {
  $h = New-Object System.Security.Cryptography.HMACSHA256
  $h.Key = [System.Text.Encoding]::UTF8.GetBytes($key)
  $b = [System.Text.Encoding]::UTF8.GetBytes($msg)
  ($h.ComputeHash($b) | ForEach-Object { $_.ToString("x2") }) -join ""
}
function Sha256HexBytes([byte[]]$bytes) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
}

Write-Output ("sha256(ascii s0)      = " + (Sha256Hex $s0))
Write-Output ("sha256(rawbytes s0)   = " + (Sha256HexBytes ([System.Text.Encoding]::UTF8.GetBytes($s0))))
Write-Output ("target hash h0        = " + $h0)
Write-Output ("target next hash h1   = " + $h1)
Write-Output "--- chain derivation attempts (looking for h1) ---"
$cands = @{}
$cands["sha256(s0)"] = Sha256Hex $s0
$cands["sha256(s0+0)"] = Sha256Hex ($s0 + "0")
$cands["sha256(s0+1)"] = Sha256Hex ($s0 + "1")
$cands["sha256(s0+2)"] = Sha256Hex ($s0 + "2")
$cands["sha256(0+s0)"] = Sha256Hex ("0" + $s0)
$cands["sha256(s0:0)"] = Sha256Hex ($s0 + ":0")
$cands["sha256(s0|1)"] = Sha256Hex ($s0 + "|1")
$cands["hmac(s0,'')"] = HmacHex $s0 ""
$cands["hmac(s0,'rotate')"] = HmacHex $s0 "rotate"
$cands["hmac(s0,'0')"] = HmacHex $s0 "0"
$cands["hmac(s0,'1')"] = HmacHex $s0 "1"
$cands["sha256(hexdecode(s0))"] = Sha256HexBytes ([byte[]]($s0 -split '(..)' | Where-Object { $_ } | ForEach-Object { [Convert]::ToByte($_,16) }))
$cands["sha256(sha256(s0))"] = Sha256Hex (Sha256Hex $s0)
$cands["sha256(h0)"] = Sha256Hex $h0
foreach ($k in $cands.Keys) {
  $mark = ""
  if ($cands[$k] -eq $h0) { $mark = "  <== MATCHES h0" }
  if ($cands[$k] -eq $h1) { $mark = "  <== MATCHES h1 (CHAIN DERIVABLE!)" }
  Write-Output ("{0,-24} = {1}{2}" -f $k, $cands[$k], $mark)
}
Write-Output "--- node availability ---"
try { $v = & node -v 2>&1; Write-Output ("node: " + $v) } catch { Write-Output "node: MISSING" }
