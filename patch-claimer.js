// Adds daily/weekly/monthly/case bonus claiming to the headless claimer.
const fs = require('fs');
const p = 'glint-claimer.js';
let s = fs.readFileSync(p, 'utf8');

function rep(a, b) {
  if (!s.includes(a)) throw new Error('anchor missing: ' + a.slice(0, 70));
  s = s.replace(a, b);
}

// 1) config
rep(`  rakebackPollMs: 30000,   // rakeback poll`,
`  rakebackPollMs: 30000,   // rakeback poll
  bonusPollMs: 60000,      // daily / weekly / monthly / case poll`);

rep(`  autoRakeback: true,`,
`  autoRakeback: true,
  autoDaily: true,
  autoWeekly: true,
  autoMonthly: true,
  autoCase: true,`);

// 2) claim counters (state + state reload)
rep(`    claims: { rainCount: 0, tagCount: 0, tagTotal: 0, rakebackCount: 0, rakebackTotal: 0 },`,
`    claims: { rainCount: 0, tagCount: 0, tagTotal: 0, rakebackCount: 0, rakebackTotal: 0, dailyCount: 0, dailyTotal: 0, weeklyCount: 0, weeklyTotal: 0, monthlyCount: 0, monthlyTotal: 0, caseCount: 0, caseTotal: 0 },`);

rep(`        state.claims = Object.assign({ rainCount: 0, tagCount: 0, tagTotal: 0, rakebackCount: 0, rakebackTotal: 0 }, parsed.claims || {});`,
`        state.claims = Object.assign({ rainCount: 0, tagCount: 0, tagTotal: 0, rakebackCount: 0, rakebackTotal: 0, dailyCount: 0, dailyTotal: 0, weeklyCount: 0, weeklyTotal: 0, monthlyCount: 0, monthlyTotal: 0, caseCount: 0, caseTotal: 0 }, parsed.claims || {});`);

// 3) new checkBonuses function (inserted before checkRakeback)
const fn = `  async function checkBonuses(force, onlyKind) {
    const r = await api('/api/rewards');
    if (r.status === 401) { handleAuthFail(r); return null; }
    if (r.status !== 200 || !r.json) { log('rewards fetch HTTP ' + r.status, 'warn'); return null; }
    const kinds = ['daily', 'weekly', 'monthly', 'case'];
    const out = {};
    for (const kind of kinds) {
      if (onlyKind && onlyKind !== kind) continue;
      const b = r.json[kind] || {};
      out[kind] = b;
      const auto = kind === 'daily' ? cfg.autoDaily : kind === 'weekly' ? cfg.autoWeekly : kind === 'monthly' ? cfg.autoMonthly : cfg.autoCase;
      const can = (force && onlyKind === kind) || (auto && b.claimable === true);
      if (!can) continue;
      const j = await api('/api/rewards/claim', 'POST', { kind: kind });
      if (j.status === 200) {
        const amt = (j.json && (j.json.amount || (j.json.wallet && j.json.wallet.amount))) || 0;
        state.claims[kind + 'Count'] = (state.claims[kind + 'Count'] || 0) + 1;
        state.claims[kind + 'Total'] = (state.claims[kind + 'Total'] || 0) + (Number(amt) || 0);
        log((kind + ' bonus claimed ' + fmt(amt)).toUpperCase() + ' -> ' + JSON.stringify(j.json).slice(0, 160));
        await webhook('✅ ' + kind.charAt(0).toUpperCase() + kind.slice(1) + ' bonus claimed: ' + fmt(amt));
      } else if (j.status === 429) {
        log(kind + ' bonus claim rate limited (429)', 'warn');
      } else if (j.status === 409) {
        log(kind + ' bonus: ' + (j.json && j.json.error && j.json.error.message ? j.json.error.message : 'not claimable yet'), 'warn');
      } else {
        log(kind + ' bonus claim HTTP ' + j.status + ' ' + j.text.slice(0, 140), 'warn');
      }
    }
    return out;
  }

`;
rep(`  async function checkRakeback(force) {`, fn + `  async function checkRakeback(force) {`);

// 4) runOnce hook
rep(`      await checkRakeback(!!o.forceRakeback);`,
`      await checkRakeback(!!o.forceRakeback);
      await checkBonuses(!!o.forceBonus, o.bonusKind);`);

// 5) interval + start log
rep(`    setInterval(function () { checkWallet().catch(function (e) { log('wallet error: ' + e.message, 'warn'); }); },`,
`    setInterval(function () { checkBonuses(false).catch(function (e) { log('bonus error: ' + e.message, 'warn'); }); },
      Number(cfg.bonusPollMs || 60000));
    setInterval(function () { checkWallet().catch(function (e) { log('wallet error: ' + e.message, 'warn'); }); },`);

rep(`        ' rakeback=' + cfg.autoRakeback + ' | webhook=' + (cfg.webhookUrl ? 'on' : 'off'));`,
`        ' rakeback=' + cfg.autoRakeback + ' daily=' + cfg.autoDaily + ' weekly=' + cfg.autoWeekly +
        ' | webhook=' + (cfg.webhookUrl ? 'on' : 'off'));`);

// 6) exports
rep(`    checkRakeback: checkRakeback,`,
`    checkRakeback: checkRakeback,
    checkBonuses: checkBonuses,`);

fs.writeFileSync(p, s);
console.log('claimer patched, bytes=' + s.length);
