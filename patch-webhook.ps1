$ErrorActionPreference = 'Stop'

function Rep([string]$text, [string]$old, [string]$new, [string]$tag) {
  if (-not $text.Contains($old)) { throw ("ANCHOR MISSING [" + $tag + "]: " + $old.Substring(0, [Math]::Min(70, $old.Length))) }
  return $text.Replace($old, $new)
}

# ---------------------------------------------------------------- HELPER ----
$hp = Join-Path $PSScriptRoot 'glint-helper.user.js'
$h = [IO.File]::ReadAllText($hp)
$hCrlf = $h.Contains("`r`n")
$h = $h.Replace("`r`n", "`n")

$h = Rep $h 'flush: 5000,' 'flush: 30000,' 'T.flush'

$h = Rep $h "    pending: []," "    pending: [],`n    claims: [],`n    activity: [],`n    lastPnlSent: 0," 'state'

$oldPush = @'
  function pushEvent(amount, label) {
    S.pending.push({ amount: Number(amount) || 0, label: label, ts: Date.now() });
  }

  function flushEvents() {
    if (!S.pending.length) return;
    if (S.mode === 'summary') return; // only periodic summaries in that mode

    const evs = S.pending.splice(0, 50);
    const net = evs.reduce(function (a, e) { return a + e.amount; }, 0);
    if (S.mode === 'profit' && net <= 0) return;
    if (S.mode === 'loss' && net >= 0) return;

    const lines = [];
    const shown = evs.slice(0, 8);
    for (let i = 0; i < shown.length; i++) {
      const e = shown[i];
      lines.push((e.amount >= 0 ? '\u{1F4B0} +' : '\u{1F4C9} ') + fmt(Math.abs(e.amount)) + '  ' + e.label);
    }
    if (evs.length > shown.length) lines.push('… +' + (evs.length - shown.length) + ' more transaction(s)');

    const head = (net >= 0 ? '\u{1F4B0} GLINT +' : '\u{1F4C9} GLINT ') + fmt(net);
    const foot = 'session ' + compact(S.sessionPnl) + '  |  balance ' + compact(S.balance);
    postWebhook(lines.join('\n') + '\n' + head + '  |  ' + foot);
  }
'@

$newPush = @'
  // Activity = bets / payouts. Tracked for the session P/L, never posted on its own.
  function pushEvent(amount, label) {
    S.activity.push({ amount: Number(amount) || 0, label: label, ts: Date.now() });
    if (S.activity.length > 500) S.activity.splice(0, S.activity.length - 500);
  }

  // Claims = money that was actually credited (rain entry, tag, bonus, rakeback, reward tx).
  function pushClaim(amount, label, text) {
    S.claims.push({ amount: Number(amount) || 0, label: label || 'claim', text: text || '', ts: Date.now() });
  }

  // ONE Discord message per flush window (30s) and ONLY when something was claimed.
  function flushEvents() {
    if (S.mode === 'summary') return;   // only periodic summaries in that mode
    if (!S.claims.length) return;        // nothing claimed -> stay quiet
    const pnl = Math.round(S.sessionPnl || 0);
    if (S.mode === 'profit' && pnl <= (S.lastPnlSent || 0)) return;
    if (S.mode === 'loss' && pnl >= (S.lastPnlSent || 0)) return;

    const claims = S.claims.splice(0, 50);
    S.lastPnlSent = pnl;

    const groups = {};
    const order = [];
    for (let i = 0; i < claims.length; i++) {
      const c = claims[i];
      const k = c.label || 'claim';
      if (!groups[k]) { groups[k] = { amount: 0, n: 0, text: '' }; order.push(k); }
      groups[k].amount += c.amount;
      groups[k].n++;
      if (!groups[k].text && c.text) groups[k].text = c.text;
    }

    const lines = [];
    for (let i = 0; i < order.length && lines.length < 8; i++) {
      const g = groups[order[i]];
      const extra = g.n > 1 ? '  x' + g.n : '';
      if (g.text) { lines.push(g.text + extra); continue; }
      const amt = g.amount;
      lines.push((amt >= 0 ? '+' : '') + fmt(amt) + '  ' + order[i] + extra);
    }
    const head = '\u{1F3AF} GLINT claims \u00B7 session ' + (pnl >= 0 ? '+' : '') + fmt(pnl);
    const foot = 'balance ' + compact(S.balance) + '  |  ' + claims.length + ' claim(s)';
    postWebhook(head + '\n' + lines.join('\n') + '\n' + foot);
  }
'@

$h = Rep $h $oldPush $newPush 'push/flush'

$h = Rep $h "            pushEvent(Number(amt) || Number(S.tag.daily) || 0, 'discord tag reward');" "            pushClaim(Number(amt) || Number(S.tag.daily) || 0, 'discord tag reward', '\u2705 Discord server-tag reward claimed: ' + fmt(Number(amt) || Number(S.tag.daily) || 0));" 'tag claim'

$h = Rep $h "              pushEvent(Number(amt) || Number(info.amount) || 0, kind);" "              pushClaim(Number(amt) || Number(info.amount) || 0, kind + ' bonus', '\u2705 ' + kind.charAt(0).toUpperCase() + kind.slice(1) + ' bonus claimed: ' + fmt(Number(amt) || Number(info.amount) || 0));" 'bonus claim'

$h = Rep $h "            pushEvent(Number(amt) || Number(rk.accrued) || 0, 'rakeback');" "            pushClaim(Number(amt) || Number(rk.accrued) || 0, 'rakeback', '\u2705 Rakeback claimed: ' + fmt(Number(amt) || Number(rk.accrued) || 0));" 'rakeback claim'

$oldJoin = @'
        log('joined rain ' + String(id).slice(0, 8) + ' (added=' + compact(added || 0) + ', myEntries=' + ((res.data && res.data.myEntries) || (S.rain && S.rain.myEntries) || '?') + ')', 'ok');
'@
$newJoin = @'
        log('joined rain ' + String(id).slice(0, 8) + ' (added=' + compact(added || 0) + ', myEntries=' + ((res.data && res.data.myEntries) || (S.rain && S.rain.myEntries) || '?') + ')', 'ok');
        pushClaim(0, 'rain entry', '\u{1F327} rain entry \u00B7 pot ' + compact((S.rain && S.rain.amount) || 0) + ' \u00B7 ' + ((S.rain && S.rain.entryCount) || 0) + ' entries \u00B7 mine ' + ((res.data && res.data.myEntries) || (S.rain && S.rain.myEntries) || 1));
'@
$h = Rep $h $oldJoin $newJoin 'join rain'

$h = Rep $h "          pushEvent(amt, labelFor(t));" "          if (t.kind === 'rain' || t.kind === 'reward') pushClaim(amt, labelFor(t), (t.kind === 'rain' ? '\u{1F327} rain payout credited: ' : '\u2705 reward credited: ') + fmt(amt));`n          else pushEvent(amt, labelFor(t));" 'tracker'

$oldModes = @'
      '        <option value="flush">post every event batch (profit + loss)</option>',
      '        <option value="profit">post profits only</option>',
      '        <option value="loss">post losses only</option>',
      '        <option value="summary">post 10-min summaries only</option>',
'@
$newModes = @'
      '        <option value="flush">one message per 30s when something was claimed</option>',
      '        <option value="profit">one message per 30s, only when session P/L went up</option>',
      '        <option value="loss">one message per 30s, only when session P/L went down</option>',
      '        <option value="summary">10-min summaries only</option>',
'@
$h = Rep $h $oldModes $newModes 'mode options'

$h = Rep $h 'events queued</span>' 'claims queued</span>' 'queue label'
$h = Rep $h "    setText('gh-queue', String(S.pending.length));" "    setText('gh-queue', String(S.claims.length));" 'queue render'

if ($hCrlf) { $h = $h.Replace("`n", "`r`n") }
[IO.File]::WriteAllText($hp, $h)
Write-Output ('helper patched: ' + (Get-Item $hp).Length + ' bytes')

# --------------------------------------------------------------- CLAIMER ----
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

$c = Rep $c "        await webhook('\u2705 Discord server-tag reward claimed: ' + fmt(amt));" "        queueClaim(amt, 'discord tag reward', '\u2705 Discord server-tag reward claimed: ' + fmt(amt));" 'claimer tag'

$c = Rep $c "        await webhook('\u2705 ' + kind.charAt(0).toUpperCase() + kind.slice(1) + ' bonus claimed: ' + fmt(amt));" "        queueClaim(amt, kind + ' bonus', '\u2705 ' + kind.charAt(0).toUpperCase() + kind.slice(1) + ' bonus claimed: ' + fmt(amt));" 'claimer bonus'

$c = Rep $c "        await webhook('\u2705 Rakeback claimed: ' + fmt(amt));" "        queueClaim(amt, 'rakeback', '\u2705 Rakeback claimed: ' + fmt(amt));" 'claimer rakeback'

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
        queueClaim(delta, String(label), '\u{1F327} ' + label + ': ' + fmt(delta));
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

$c = Rep $c "    checkBonuses," "    checkBonuses,`n    flushClaims," 'claimer exports'

if ($cCrlf) { $c = $c.Replace("`n", "`r`n") }
[IO.File]::WriteAllText($cp, $c)
Write-Output ('claimer patched: ' + (Get-Item $cp).Length + ' bytes')
