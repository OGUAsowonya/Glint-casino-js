$ErrorActionPreference = 'Stop'
$p = Join-Path $PSScriptRoot 'glint-helper.user.js'
$t = [IO.File]::ReadAllText($p)
$nl = if ($t.Contains("`r`n")) { "`r`n" } else { "`n" }

function FixNl([string]$s) {
  $s = $s -replace "`r`n", "`n"
  $s = $s -replace "`n", $script:nl
  return $s
}
function ReplaceExact([string]$old, [string]$new) {
  $old = FixNl $old
  $new = FixNl $new
  $i = $script:t.IndexOf($old)
  if ($i -lt 0) { throw ("anchor missing: " + $old.Substring(0, [Math]::Min(60, $old.Length))) }
  $script:t = $script:t.Substring(0, $i) + $new + $script:t.Substring($i + $old.Length)
}
function InsertAfterField([string]$name, [string]$addition) {
  $i = $script:t.IndexOf($name)
  if ($i -lt 0) { throw ("field missing: " + $name) }
  $c = $script:t.IndexOf(',', $i)
  if ($c -lt 0) { throw ("no comma after: " + $name) }
  $addition = FixNl $addition
  $script:t = $script:t.Substring(0, $c + 1) + $addition + $script:t.Substring($c + 1)
}

# 1) interval + state flags -------------------------------------------------
InsertAfterField 'rake: 30000' ("bonus: 60000," + $nl)
InsertAfterField 'autoRakeback' ("autoDaily: true," + $nl + "    autoWeekly: true," + $nl + "    autoMonthly: true," + $nl + "    autoCase: true," + $nl + "    daily: null," + $nl + "    weekly: null," + $nl + "    monthly: null," + $nl + "    caseR: null," + $nl + "    bonusWarnAt: 0," + $nl + "    busyBonus: { daily: false, weekly: false, monthly: false, case: false },")

# 2) readBonuses() -----------------------------------------------------------
$readBonuses = @'
  function readBonuses(forceClaim, onlyKind) {
    const kinds = ['daily', 'weekly', 'monthly', 'case'];
    const auto = { daily: S.autoDaily, weekly: S.autoWeekly, monthly: S.autoMonthly, case: S.autoCase };
    return api('/api/rewards').then(function (res) {
      if (!res.ok || !res.data) { log('rewards read failed: ' + errText(res), 'bad'); return; }
      const src = res.data;
      S.daily = src.daily || {};
      S.weekly = src.weekly || {};
      S.monthly = src.monthly || {};
      S.caseR = src.case || {};
      let chain = Promise.resolve();
      kinds.forEach(function (kind) {
        if (onlyKind && onlyKind !== kind) return;
        const info = src[kind] || {};
        const wanted = onlyKind ? (kind === onlyKind) : (auto[kind] !== false && info.claimable === true);
        if (!wanted) return;
        if (S.busyBonus[kind]) return;
        S.busyBonus[kind] = true;
        chain = chain.then(function () {
          return api('/api/rewards/claim', 'POST', { kind: kind }).then(function (c) {
            S.busyBonus[kind] = false;
            if (c.ok) {
              const amt = c.data && (c.data.amount !== undefined ? c.data.amount : (info.amount || 0));
              log(kind + ' bonus claimed: ' + compact(amt), 'ok');
              pushEvent(Number(amt) || Number(info.amount) || 0, kind);
              info.claimable = false;
              if (kind === 'daily') S.daily = info;
              else if (kind === 'weekly') S.weekly = info;
              else if (kind === 'monthly') S.monthly = info;
              else S.caseR = info;
            } else if (c.status === 429) {
              log(kind + ' claim rate limited', 'warn');
            } else if (c.status === 409) {
              if (Date.now() - S.bonusWarnAt > 600000) {
                S.bonusWarnAt = Date.now();
                log(kind + ': ' + errText(c), 'warn');
              }
            } else {
              log(kind + ' claim failed: ' + errText(c), 'bad');
            }
          });
        });
      });
      return chain;
    });
  }

'@
ReplaceExact '  function readRakeback(forceClaim) {' ($readBonuses + '  function readRakeback(forceClaim) {')

# 3) GUI section -------------------------------------------------------------
$gui = @'
      '  <div class="gh-sec">',
      '    <h4>Bonuses</h4>',
      '    <div class="gh-row"><span class="gh-k">daily</span><span class="gh-v" id="gh-daily-amt">-</span></div>',
      '    <div class="gh-row"><span class="gh-k">daily next</span><span class="gh-v" id="gh-daily-next">-</span></div>',
      '    <div class="gh-row"><span class="gh-k">weekly</span><span class="gh-v" id="gh-weekly-amt">-</span></div>',
      '    <div class="gh-row"><span class="gh-k">weekly next</span><span class="gh-v" id="gh-weekly-next">-</span></div>',
      '    <label><input type="checkbox" id="gh-autodaily" checked> auto-claim daily</label>',
      '    <label><input type="checkbox" id="gh-autoweekly" checked> auto-claim weekly</label>',
      '    <div class="gh-grid">',
      '      <button id="gh-daily-btn" class="gh-primary">Claim daily (Ctrl+Shift+6)</button>',
      '      <button id="gh-weekly-btn">Claim weekly (Ctrl+Shift+7)</button>',
      '    </div>',
      '  </div>',

'@
ReplaceExact @'
      '  <div class="gh-sec">',
      '    <h4>Rakeback</h4>',
'@ ($gui + @'
      '  <div class="gh-sec">',
      '    <h4>Rakeback</h4>',
'@)

# 4) listeners ---------------------------------------------------------------
ReplaceExact "    q('gh-rake-btn').addEventListener('click', function () { readRakeback(true); });" @'
    q('gh-rake-btn').addEventListener('click', function () { readRakeback(true); });
    q('gh-daily-btn').addEventListener('click', function () { readBonuses(true, 'daily'); });
    q('gh-weekly-btn').addEventListener('click', function () { readBonuses(true, 'weekly'); });
'@
ReplaceExact "    q('gh-autorake').addEventListener('change', function (e) { S.autoRakeback = e.target.checked; log('auto-rakeback ' + (S.autoRakeback ? 'ON' : 'OFF')); });" @'
    q('gh-autorake').addEventListener('change', function (e) { S.autoRakeback = e.target.checked; log('auto-rakeback ' + (S.autoRakeback ? 'ON' : 'OFF')); });
    q('gh-autodaily').addEventListener('change', function (e) { S.autoDaily = e.target.checked; log('auto-daily ' + (S.autoDaily ? 'ON' : 'OFF')); });
    q('gh-autoweekly').addEventListener('change', function (e) { S.autoWeekly = e.target.checked; log('auto-weekly ' + (S.autoWeekly ? 'ON' : 'OFF')); });
'@

# 5) footer ------------------------------------------------------------------
ReplaceExact "      '<div class=" + '"' + "gh-foot" + '"' + ">Ctrl+Shift+1 rain · 2 tag · 3 rakeback · 4 summary · 5 minimise</div>'" "      '<div class=" + '"' + "gh-foot" + '"' + ">Ctrl+Shift+1 rain · 2 tag · 3 rakeback · 4 summary · 5 minimise · 6 daily · 7 weekly</div>'"

# 6) render ------------------------------------------------------------------
ReplaceExact @'
    if (S.rake) {
      setText('gh-rake-acc', compact(S.rake.accrued || 0));
      setText('gh-rake-claim', S.rake.claimable ? 'YES' : 'no', S.rake.claimable ? 'gh-ok' : 'gh-dim');
    }
'@ @'
    if (S.rake) {
      setText('gh-rake-acc', compact(S.rake.accrued || 0));
      setText('gh-rake-claim', S.rake.claimable ? 'YES' : 'no', S.rake.claimable ? 'gh-ok' : 'gh-dim');
    }
    if (S.daily) {
      setText('gh-daily-amt', compact(S.daily.amount || 0));
      setText('gh-daily-next', S.daily.claimable ? 'CLAIMABLE' : (S.daily.nextAt ? String(S.daily.nextAt).replace('T', ' ').slice(0, 19) : '-'));
    }
    if (S.weekly) {
      setText('gh-weekly-amt', compact(S.weekly.amount || 0));
      setText('gh-weekly-next', S.weekly.claimable ? 'CLAIMABLE' : (S.weekly.nextAt ? String(S.weekly.nextAt).replace('T', ' ').slice(0, 19) : '-'));
    }
'@

# 7) hotkeys -----------------------------------------------------------------
ReplaceExact "    else if (k === '3') { e.preventDefault(); readRakeback(true); }" @'
    else if (k === '3') { e.preventDefault(); readRakeback(true); }
    else if (k === '6') { e.preventDefault(); readBonuses(true, 'daily'); }
    else if (k === '7') { e.preventDefault(); readBonuses(true, 'weekly'); }
'@

# 8) boot --------------------------------------------------------------------
ReplaceExact "    readRakeback(false);" @'
    readRakeback(false);
    readBonuses(false);
'@
ReplaceExact "    setInterval(readRakeback, T.rake);" @'
    setInterval(readRakeback, T.rake);
    setInterval(readBonuses, T.bonus);
'@

[IO.File]::WriteAllText($p, $t)
Write-Output ('patched userscript, bytes=' + $t.Length)
