#!/usr/bin/env node
'use strict';
/*
 * GLINT headless claimer
 * ----------------------
 * Claims rain drops, the Discord server-tag reward and rakeback straight over the
 * HTTP API -- NO browser page required, so it can run next to a dice autobet.
 *
 * Node 18+ (global fetch). Tested with Node v24.
 *
 * Usage
 *   node glint-claimer.js                 run the loop
 *   node glint-claimer.js --once          one pass, then exit
 *   node glint-claimer.js --config path   alternative config file
 *
 * Session
 *   The site session cookie `glint.did` is HttpOnly, so it cannot be read by page
 *   JavaScript. Copy it once from DevTools:
 *     Application -> Cookies -> https://donutglint.com -> glint.did -> Value
 *   then either
 *     set GLINT_COOKIE=<value>            (environment variable)
 *     or put it in glint-cookie.txt        (single line, no quotes)
 *   or use the optional Tampermonkey bridge glint-cookie-export.user.js, which
 *   pushes the cookie to this process on 127.0.0.1:<ingestPort>/cookie.
 *
 * Endpoints used (all same-origin, need the session cookie + the GLINT headers)
 *   GET  /api/rain
 *   POST /api/rain/join                {rainId}
 *   GET  /api/rewards/discord-tag
 *   POST /api/rewards/discord-tag/claim
 *   GET  /api/rewards
 *   POST /api/rewards/claim            {kind:'rakeback'}
 *   GET  /api/wallet/limits
 *   GET  /api/wallet/transactions?limit=60
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  baseUrl: 'https://donutglint.com',
  cookie: '',
  webhookUrl: '',
  webhookUsername: 'GLINT bot',
  pollMs: 5000,            // rain poll
  tagPollMs: 30000,        // discord-tag poll
  rakebackPollMs: 30000,   // rakeback poll
  bonusPollMs: 60000,      // daily / weekly / monthly / case poll
  walletPollMs: 10000,     // balance / P&L poll
  summaryEveryMs: 600000,  // periodic webhook summary
  autoRain: true,
  autoTag: true,
  autoRakeback: true,
  autoDaily: true,
  autoWeekly: true,
  autoMonthly: true,
  autoCase: true,
  webhookMode: 'flush',    // flush | profit | loss | summary
  claimFlushMs: 30000,    // one webhook message per 30s (claims only)
  minWebhookAmount: 1,
  stateFile: 'glint-claimer-state.json',
  cookieFile: 'glint-cookie.txt',
  ingestPort: 8787,        // local bridge for the Tampermonkey cookie export (0 = off)
  verbose: true,
  logFile: ''              // optional append-only log
};

// IMPORTANT: every monetary value the GLINT API returns is in CENTS
// (available 6_100_000_000 means $61,000,000; the 10_000 minimum bet is
// announced as "$100"; the rain pot 2_502_532_494_750 is shown as "$25B").
function fmt(n) {
  const v = Math.round((Number(n) || 0) / 100);
  return '$' + v.toLocaleString('en-US');
}

function createRunner(userConfig) {
  const cfg = Object.assign({}, DEFAULT_CONFIG, userConfig || {});
  // keep state/cookie next to the script even when started from another folder
  if (cfg.stateFile && !path.isAbsolute(cfg.stateFile)) cfg.stateFile = path.join(__dirname, cfg.stateFile);
  if (cfg.cookieFile && !path.isAbsolute(cfg.cookieFile)) cfg.cookieFile = path.join(__dirname, cfg.cookieFile);
  const state = {
    seenRainIds: [],
    lastRainId: null,
    baselineAvailable: null,
    lastAvailable: null,
    sessionProfit: 0,
    sessionLoss: 0,
    claims: { rainCount: 0, tagCount: 0, tagTotal: 0, rakebackCount: 0, rakebackTotal: 0, dailyCount: 0, dailyTotal: 0, weeklyCount: 0, weeklyTotal: 0, monthlyCount: 0, monthlyTotal: 0, caseCount: 0, caseTotal: 0 },
    claimQueue: [],
    lastPnlSent: 0,
    txIds: [],
    startedAt: new Date().toISOString(),
    lastRainCheck: 0,
    lastTagCheck: 0,
    lastRakebackCheck: 0,
    lastWalletCheck: 0,
    lastSummaryAt: Date.now()
  };
  let authFailed = false;

  function log(msg, level) {
    const line = '[' + new Date().toISOString() + '] ' + String(level || 'info').toUpperCase() + ' ' + msg;
    if (cfg.verbose) console.log(line);
    if (cfg.logFile) { try { fs.appendFileSync(cfg.logFile, line + '\n'); } catch (e) { /* ignore */ } }
    return line;
  }

  function loadState() {
    try {
      if (cfg.stateFile && fs.existsSync(cfg.stateFile)) {
        const parsed = JSON.parse(fs.readFileSync(cfg.stateFile, 'utf8'));
        Object.assign(state, parsed);
        state.claims = Object.assign({ rainCount: 0, tagCount: 0, tagTotal: 0, rakebackCount: 0, rakebackTotal: 0, dailyCount: 0, dailyTotal: 0, weeklyCount: 0, weeklyTotal: 0, monthlyCount: 0, monthlyTotal: 0, caseCount: 0, caseTotal: 0 }, parsed.claims || {});
      }
    } catch (e) { log('could not read state file: ' + e.message, 'warn'); }
  }

  function saveState() {
    try {
      if (cfg.stateFile) fs.writeFileSync(cfg.stateFile, JSON.stringify(state, null, 2));
    } catch (e) { log('could not write state file: ' + e.message, 'warn'); }
  }

  function cookieValue() {
    let c = (cfg.cookie || '').trim();
    if (!c && process.env.GLINT_COOKIE) c = String(process.env.GLINT_COOKIE).trim();
    if (!c && cfg.cookieFile && fs.existsSync(cfg.cookieFile)) {
      c = fs.readFileSync(cfg.cookieFile, 'utf8').trim();
    }
    if (!c) return '';
    if (c.indexOf('=') >= 0) return c.indexOf('glint.did=') === 0 ? c : 'glint.did=' + c;
    return 'glint.did=' + c;
  }

  function persistCookie(value) {
    try {
      if (cfg.cookieFile) fs.writeFileSync(cfg.cookieFile, String(value).trim(), { mode: 0o600 });
    } catch (e) { log('could not persist cookie: ' + e.message, 'warn'); }
  }

  async function api(p, method, body) {
    const headers = {
      'Accept': 'application/json',
      'X-Requested-With': 'glint',
      'Content-Type': 'application/json',
      'User-Agent': 'glint-claimer/1.0'
    };
    const ck = cookieValue();
    if (ck) headers.Cookie = ck;
    const res = await fetch(String(cfg.baseUrl).replace(/\/+$/, '') + p, {
      method: method || 'GET',
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    return { status: res.status, json: json, text: text.slice(0, 500), retryAfter: res.headers.get('retry-after') };
  }

  function handleAuthFail(r) {
    if (!authFailed) {
      authFailed = true;
      log('HTTP ' + r.status + ' from ' + r.text.slice(0, 120) + ' -- session cookie missing or expired. ' +
          'Re-copy glint.did from DevTools (or run the TM cookie exporter) and restart.', 'error');
    }
  }

  async function webhook(text) {
    const msg = String(text).slice(0, 1900);
    if (!cfg.webhookUrl) { log('webhook (not configured): ' + msg); return false; }
    // One host, one post. ?wait=true makes Discord return the created message
    // so the log can show the message id and channel (proof of delivery).
    const url = String(cfg.webhookUrl).trim();
    const sep = url.indexOf('?') >= 0 ? '&' : '?';
    try {
      const res = await fetch(url + sep + 'wait=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cfg.webhookUsername, content: msg })
      });
      const body = await res.text().catch(function () { return ''; });
      let extra = '';
      try {
        const j = JSON.parse(body);
        if (j && j.id) extra = ' id=' + j.id + ' channel=' + j.channel_id;
      } catch (e) { /* empty body */ }
      if (res.ok) {
        log('webhook sent (' + res.status + ')' + extra + ': ' + msg.slice(0, 140));
        return true;
      }
      log('webhook HTTP ' + res.status + ' on ' + url + ' ' + body.slice(0, 120), 'warn');
    } catch (e) { log('webhook failed: ' + String(e.message).slice(0, 100), 'warn'); }
    return false;
  }

  async function checkAuth() {
    const r = await api('/api/auth/me');
    if (r.status === 200 && r.json && r.json.user) {
      if (authFailed) log('session restored (' + (r.json.user.username || r.json.user.name || 'user') + ')', 'info');
      authFailed = false;
      return true;
    }
    handleAuthFail(r);
    return false;
  }

  async function checkRain(force) {
    const r = await api('/api/rain');
    if (r.status === 401) { handleAuthFail(r); return null; }
    if (r.status !== 200 || !r.json) { log('rain fetch HTTP ' + r.status, 'warn'); return null; }
    const rain = r.json.rain || r.json.current || r.json;
    if (!rain || !rain.id) return null;
    state.lastRainId = rain.id;
    const known = state.seenRainIds.indexOf(rain.id) >= 0;
    if (!known) {
      state.seenRainIds.push(rain.id);
      if (state.seenRainIds.length > 80) state.seenRainIds.shift();
      log('new rain ' + rain.id + ' pot=' + fmt(rain.amount) + ' entries=' + (Number(rain.entryCount) || 0) +
          ' ends=' + (rain.endsAt || '?'));
    }
    const open = rain.status !== 'closed' && rain.status !== 'ended' && rain.status !== 'paid';
    if (force || (!known && cfg.autoRain && open)) {
      const j = await api('/api/rain/join', 'POST', { rainId: rain.id });
      if (j.status === 200) {
        state.claims.rainCount++;
        log('RAIN JOINED ' + rain.id + ' -> ' + JSON.stringify(j.json).slice(0, 180));
      } else if (j.status === 409) {
        log('rain join refused (409): ' + j.text.slice(0, 140), 'warn');
      } else {
        log('rain join HTTP ' + j.status + ' ' + j.text.slice(0, 140), 'warn');
      }
    }
    return rain;
  }

  async function checkTag(force) {
    const r = await api('/api/rewards/discord-tag');
    if (r.status === 401) { handleAuthFail(r); return null; }
    if (r.status !== 200 || !r.json) { log('discord-tag fetch HTTP ' + r.status, 'warn'); return null; }
    const tag = r.json;
    if (force || (cfg.autoTag && tag.claimable)) {
      const j = await api('/api/rewards/discord-tag/claim', 'POST', {});
      if (j.status === 200) {
        const amt = (j.json && (j.json.amount || j.json.credited || j.json.reward)) || 0;
        state.claims.tagCount++;
        state.claims.tagTotal += Number(amt) || 0;
        log('TAG CLAIMED ' + fmt(amt) + ' -> ' + JSON.stringify(j.json).slice(0, 160));
        queueClaim(amt, 'discord tag reward', '✅ Discord server-tag reward claimed: ' + fmt(amt));
      } else if (j.status === 429) {
        log('tag claim rate limited (429)', 'warn');
      } else {
        log('tag claim HTTP ' + j.status + ' ' + j.text.slice(0, 140), 'warn');
      }
    }
    return tag;
  }

  async function checkBonuses(force, onlyKind) {
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
        queueClaim(amt, kind + ' bonus', '✅ ' + kind.charAt(0).toUpperCase() + kind.slice(1) + ' bonus claimed: ' + fmt(amt));
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

  async function checkRakeback(force) {
    const r = await api('/api/rewards');
    if (r.status === 401) { handleAuthFail(r); return null; }
    if (r.status !== 200 || !r.json) { log('rewards fetch HTTP ' + r.status, 'warn'); return null; }
    const rk = r.json.rakeback || {};
    if (force || (cfg.autoRakeback && rk.claimable)) {
      const j = await api('/api/rewards/claim', 'POST', { kind: 'rakeback' });
      if (j.status === 200) {
        const amt = (j.json && (j.json.amount || (j.json.wallet && j.json.wallet.amount))) || 0;
        state.claims.rakebackCount++;
        state.claims.rakebackTotal += Number(amt) || 0;
        log('RAKEBACK CLAIMED ' + fmt(amt) + ' -> ' + JSON.stringify(j.json).slice(0, 160));
        queueClaim(amt, 'rakeback', '✅ Rakeback claimed: ' + fmt(amt));
      } else if (j.status === 429) {
        log('rakeback claim rate limited (429)', 'warn');
      } else {
        log('rakeback claim HTTP ' + j.status + ' ' + j.text.slice(0, 140), 'warn');
      }
    }
    return rk;
  }

  async function classifyDelta(delta) {
    try {
      const t = await api('/api/wallet/transactions?limit=60');
      if (t.status !== 200 || !t.json || !Array.isArray(t.json.items)) return 'balance change';
      const fresh = t.json.items.filter(function (it) {
        return it && it.id && state.txIds.indexOf(it.id) < 0;
      });
      t.json.items.forEach(function (it) {
        if (it && it.id && state.txIds.indexOf(it.id) < 0) state.txIds.push(it.id);
      });
      if (state.txIds.length > 240) state.txIds = state.txIds.slice(-180);
      if (!fresh.length) return 'balance change';
      const it = fresh[0];
      const sign = Number(it.amount) >= 0 ? '+' : '';
      return it.kind + (it.note ? ' (' + it.note + ')' : '') + ' ' + sign + fmt(it.amount);
    } catch (e) { return 'balance change'; }
  }

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
  async function checkWallet() {
    const l = await api('/api/wallet/limits');
    if (l.status === 401) { handleAuthFail(l); return null; }
    if (l.status !== 200 || !l.json) { log('limits HTTP ' + l.status, 'warn'); return null; }
    const avail = Number(l.json.available || 0);
    if (state.baselineAvailable === null) {
      state.baselineAvailable = avail;
      state.lastAvailable = avail;
      log('baseline balance ' + fmt(avail) + ' (withdrawable ' + fmt(l.json.withdrawable) +
          ', bonus ' + fmt(l.json.bonus) + ')');
      return l.json;
    }
    const delta = avail - Number(state.lastAvailable || 0);
    state.lastAvailable = avail;
    if (delta !== 0) {
      state.sessionProfit += Math.max(0, delta);
      state.sessionLoss += Math.max(0, -delta);
      const label = await classifyDelta(delta);
      log('balance ' + (delta > 0 ? '+' : '') + fmt(delta) + ' [' + label + '] -> available ' + fmt(avail));
      // No per-bet webhook spam: only real credits are queued (one message per 30s).
      if (delta > 0 && /rain|reward|rakeback|daily|weekly|monthly|case|tag|bonus/i.test(String(label))) {
        queueClaim(delta, String(label), '🌧 ' + label + ': ' + fmt(delta));
      }
    }
    return l.json;
  }

  async function sendSummary(force) {
    const now = Date.now();
    if (!force && now - state.lastSummaryAt < Number(cfg.summaryEveryMs || 600000)) return;
    state.lastSummaryAt = now;
    const net = state.sessionProfit - state.sessionLoss;
    const text = '📊 GLINT session summary\n' +
      'P/L: ' + (net >= 0 ? '+' : '') + fmt(net) + ' (wins ' + fmt(state.sessionProfit) +
      ' / losses ' + fmt(state.sessionLoss) + ')\n' +
      'rains joined: ' + state.claims.rainCount + '\n' +
      'tag claims: ' + state.claims.tagCount + ' (' + fmt(state.claims.tagTotal) + ')\n' +
      'rakeback claims: ' + state.claims.rakebackCount + ' (' + fmt(state.claims.rakebackTotal) + ')';
    await webhook(text);
    log('summary sent (net ' + (net >= 0 ? '+' : '') + fmt(net) + ')');
  }

  async function runOnce(opts) {
    const o = opts || {};
    loadState();
    const ok = await checkAuth();
    if (ok) {
      await checkRain(!!o.forceRain);
      await checkTag(!!o.forceTag);
      await checkRakeback(!!o.forceRakeback);
      await checkBonuses(!!o.forceBonus, o.bonusKind);
      await checkWallet();
      await flushClaims();
    }
    await sendSummary(!!o.summary);
    saveState();
    return state;
  }

  function start() {
    loadState();
    log('GLINT claimer started -> ' + cfg.baseUrl + ' | rain=' + cfg.autoRain + ' tag=' + cfg.autoTag +
        ' rakeback=' + cfg.autoRakeback + ' daily=' + cfg.autoDaily + ' weekly=' + cfg.autoWeekly +
        ' | webhook=' + (cfg.webhookUrl ? 'on' : 'off'));
    if (!cookieValue()) log('no cookie found yet -- expecting one via GLINT_COOKIE, ' + cfg.cookieFile +
                            ' or the local bridge on port ' + cfg.ingestPort, 'warn');
    checkAuth();
    setInterval(function () { checkRain(false).catch(function (e) { log('rain error: ' + e.message, 'warn'); }); },
      Number(cfg.pollMs || 5000));
    setInterval(function () { checkTag(false).catch(function (e) { log('tag error: ' + e.message, 'warn'); }); },
      Number(cfg.tagPollMs || 30000));
    setInterval(function () { checkRakeback(false).catch(function (e) { log('rakeback error: ' + e.message, 'warn'); }); },
      Number(cfg.rakebackPollMs || 30000));
    setInterval(function () { checkBonuses(false).catch(function (e) { log('bonus error: ' + e.message, 'warn'); }); },
      Number(cfg.bonusPollMs || 60000));
    setInterval(function () { checkWallet().catch(function (e) { log('wallet error: ' + e.message, 'warn'); }); },
      Number(cfg.walletPollMs || 10000));
    setInterval(function () { flushClaims().catch(function (e) { log('claim flush error: ' + e.message, 'warn'); }); },
      Number(cfg.claimFlushMs || 30000));
    setInterval(function () { sendSummary(false).catch(function (e) { log('summary error: ' + e.message, 'warn'); }); },
      60000);
    setInterval(saveState, 15000);
    startIngest();
  }

  function startIngest() {
    const port = Number(cfg.ingestPort || 0);
    if (!port) return;
    let http;
    try { http = require('http'); } catch (e) { return; }
    http.createServer(function (req, res) {
      if (req.method === 'POST' && req.url === '/cookie') {
        let body = '';
        req.on('data', function (c) { body += c; });
        req.on('end', function () {
          try {
            const parsed = JSON.parse(body || '{}');
            if (parsed && parsed.cookie) {
              cfg.cookie = String(parsed.cookie);
              persistCookie(cfg.cookie);
              log('session cookie received through the local bridge');
              res.writeHead(200, { 'Content-Type': 'text/plain' });
              res.end('ok');
              checkAuth();
              return;
            }
          } catch (e) { /* fall through */ }
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('bad request');
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          lastRainId: state.lastRainId,
          profit: state.sessionProfit,
          loss: state.sessionLoss,
          claims: state.claims
        }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    }).listen(port, '127.0.0.1', function () {
      log('local bridge listening on http://127.0.0.1:' + port + ' (POST /cookie, GET /status)');
    });
  }

  return {
    config: cfg,
    state: state,
    api: api,
    webhook: webhook,
    runOnce: runOnce,
    checkRain: checkRain,
    checkTag: checkTag,
    checkRakeback: checkRakeback,
    checkBonuses: checkBonuses,
    checkWallet: checkWallet,
    sendSummary: sendSummary,
    start: start,
    loadState: loadState,
    saveState: saveState
  };
}

function loadConfigFile(file) {
  let cfg = {};
  const p = file || path.join(__dirname, 'glint-claimer.config.json');
  if (fs.existsSync(p)) {
    try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.error('config parse failed: ' + e.message); }
  }
  if (process.env.GLINT_COOKIE) cfg.cookie = process.env.GLINT_COOKIE;
  if (process.env.GLINT_WEBHOOK) cfg.webhookUrl = process.env.GLINT_WEBHOOK;
  return cfg;
}

async function main() {
  const argv = process.argv.slice(2);
  let configFile = null;
  let once = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--once') once = true;
    else if (argv[i] === '--config' && argv[i + 1]) { configFile = argv[i + 1]; i++; }
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('node glint-claimer.js [--once] [--config file.json]');
      console.log('env: GLINT_COOKIE, GLINT_WEBHOOK');
      return;
    }
  }
  const cfg = loadConfigFile(configFile);
  const runner = createRunner(cfg);
  if (once) { await runner.runOnce({}); return; }
  runner.start();
}

if (require.main === module) {
  main().catch(function (e) { console.error('fatal: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
}

module.exports = { createRunner: createRunner, DEFAULT_CONFIG: DEFAULT_CONFIG, fmt: fmt };
