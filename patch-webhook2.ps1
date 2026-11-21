$ErrorActionPreference = 'Stop'

function Rep([string]$text, [string]$old, [string]$new, [string]$tag) {
  if (-not $text.Contains($old)) { throw ("ANCHOR MISSING [" + $tag + "]: " + $old.Substring(0, [Math]::Min(70, $old.Length))) }
  return $text.Replace($old, $new)
}

$cp = Join-Path $PSScriptRoot 'glint-claimer.js'
$c = [IO.File]::ReadAllText($cp)
$cCrlf = $c.Contains("`r`n")
$c = $c.Replace("`r`n", "`n")

$c = Rep $c "  webhookMode: 'flush',    // flush | profit | loss | summary" "  webhookMode: 'flush',    // flush | profit | loss | summary`n  claimFlushMs: 30000,    // one webhook message per 30s (claims only)" 'claimer cfg'

$newFns = @'
  function queueClaim(amount, label, text) {
    if (!state.claimQueue) state.claimQueue = [];
    state.claimQueue.push({
      amount: Number(amount) || 0,
      label: String(label || 'claim'),
      text: String(text || ''),
      ts: Date.now()
    });
  }

  // ONE Discord message per window (30s) and ONLY when something was claimed.
  async function flushClaims() {
    if (!state.claimQueue || !state.claimQueue.length) return;
    const mode = String(cfg.webhookMode || 'flush');
    if (mode === 'summary') return;
    const net = state.sessionProfit - state.sessionLoss;
    if (mode === 'profit' && net <= (state.lastPnlSent || 0)) return;
    if (mode === 'loss' && net >= (state.lastPnlSent || 0)) return;
    const items = state.claimQueue.splice(0, 50);
    state.lastPnlSent = net;
    const lines = items.map(function (c) {
      return c.text || ('\u{1F381} ' + fmt(c.amount) + '  ' + c.label);
    });
    const head = '\u{1F3AF} GLINT claims \u00B7 session ' + (net >= 0 ? '+' : '') + fmt(net);
    await webhook(head + '\n' + lines.join('\n'));
  }

'@
$c = Rep $c "  async function checkWallet() {" ($newFns + "  async function checkWallet() {") 'claimer fns'

$c = Rep $c "        await webhook('✅ Discord server-tag reward claimed: ' + fmt(amt));" "        queueClaim(amt, 'discord tag reward', '✅ Discord server-tag reward claimed: ' + fmt(amt));" 'claimer tag'

$c = Rep $c "        await webhook('✅ ' + kind.charAt(0).toUpperCase() + kind.slice(1) + ' bonus claimed: ' + fmt(amt));" "        queueClaim(amt, kind + ' bonus', '✅ ' + kind.charAt(0).toUpperCase() + kind.slice(1) + ' bonus claimed: ' + fmt(amt));" 'claimer bonus'

$c = Rep $c "        await webhook('✅ Rakeback claimed: ' + fmt(amt));" "        queueClaim(amt, 'rakeback', '✅ Rakeback claimed: ' + fmt(amt));" 'claimer rakeback'

$oldDelta = @'
      const mode = String(cfg.webhookMode || 'flush');
      const worth = Math.abs(delta) >= Number(cfg.minWebhookAmount || 1);
      const wanted = mode === 'flush' || (mode === 'profit' && delta > 0) || (mode === 'loss' && delta < 0);
      if (worth && wanted) {
        await webhook((delta > 0 ? '📈 ' : '📉 ') + label + ' | ' + (delta > 0 ? '+' : '') + fmt(delta) +
                      ' | balance ' + fmt(avail));
      }
'@
$newDelta = @'
      // No per-bet webhook spam: only real credits are queued (one message per 30s).
      if (delta > 0 && /rain|reward|rakeback|daily|weekly|monthly|case|tag|bonus/i.test(String(label))) {
        queueClaim(delta, String(label), '🌧 ' + label + ': ' + fmt(delta));
      }
'@
$c = Rep $c $oldDelta $newDelta 'claimer delta'

$oldInt = @'
    setInterval(function () { checkWallet().catch(function (e) { log('wallet error: ' + e.message, 'warn'); }); },
      Number(cfg.walletPollMs || 10000));
'@
$newInt = @'
    setInterval(function () { checkWallet().catch(function (e) { log('wallet error: ' + e.message, 'warn'); }); },
      Number(cfg.walletPollMs || 10000));
    setInterval(function () { flushClaims().catch(function (e) { log('claim flush error: ' + e.message, 'warn'); }); },
      Number(cfg.claimFlushMs || 30000));
'@
$c = Rep $c $oldInt $newInt 'claimer interval'

# state: add claimQueue + lastPnlSent right after the claims counter line
$clines = $c -split "`n"
for ($i = 0; $i -lt $clines.Count; $i++) {
  if ($clines[$i] -match '^\s*claims: \{') {
    $ind = ($clines[$i] -replace '^([ \t]*).*$', '$1')
    $clines = $clines[0..($i - 1)] + @($clines[$i], ($ind + 'claimQueue: [],'), ($ind + 'lastPnlSent: 0,')) + $clines[($i + 1)..($clines.Count - 1)]
    break
  }
}
$c = $clines -join "`n"

# runOnce: flush queued claims right after the wallet check
$clines = $c -split "`n"
for ($i = 0; $i -lt $clines.Count; $i++) {
  if ($clines[$i] -match 'await checkWallet\(') {
    $ind = ($clines[$i] -replace '^([ \t]*).*$', '$1')
    $clines = $clines[0..($i - 1)] + @($clines[$i], ($ind + 'await flushClaims();')) + $clines[($i + 1)..($clines.Count - 1)]
    break
  }
}
$c = $clines -join "`n"

try { $c = Rep $c "    checkBonuses," "    checkBonuses,`n    flushClaims," 'claimer exports' } catch { Write-Output 'note: exports anchor skipped' }

if ($cCrlf) { $c = $c.Replace("`n", "`r`n") }
[IO.File]::WriteAllText($cp, $c)
Write-Output ('claimer patched: ' + (Get-Item $cp).Length + ' bytes')
