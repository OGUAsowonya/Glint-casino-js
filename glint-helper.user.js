// ==UserScript==
// @name         GLINT Auto-Rain + Tag + Rakeback + P/L Webhook
// @namespace    donutglint-tools
// @version      1.0.0
// @description  GUI helper for GLINT: auto-joins every hourly rain, auto-claims the Discord server-tag reward ($5M/30min) and rakeback, tracks your wallet P/L (works with any dice autobet) and posts profits/losses to a Discord webhook.
// @author       GLINT Tools Contributors
// @match        https://donutglint.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.__glintHelperLoaded) return;
  window.__glintHelperLoaded = true;

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */

  // The site's API client always sends these three headers, otherwise the
  // routes answer 401/400 even with a valid session cookie.
  const H = {
    Accept: 'application/json',
    'X-Requested-With': 'glint',
    'Content-Type': 'application/json'
  };

  const T = {
    rain: 5000,      // rain rotation poll
    tag: 30000,      // discord server-tag poll
    rake: 30000,bonus: 60000,
     // rakeback poll
    tx: 10000,       // wallet / transactions poll
    flush: 30000,     // webhook coalescing window
    summary: 600000  // periodic summary webhook (10 min)
  };

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  const S = {
    autoRain: true,
    autoTag: true,
    autoRakeback: true,autoDaily: true,
    autoWeekly: true,
    autoMonthly: true,
    autoCase: true,
    daily: null,
    weekly: null,
    monthly: null,
    caseR: null,
    bonusWarnAt: {},
    busyBonus: { daily: false, weekly: false, monthly: false, case: false },

    rain: null,
    seenRainId: null,   // last rain id we saw
    joinedRainId: null,  // last rain id we successfully joined

    tag: null,
    rake: null,

    balance: null,
    prevBalance: null,
    sessionPnl: 0,
    startBalance: null,

    seenTx: new Set(),
    pending: [],
    claims: [],
    activity: [],
    lastPnlSent: 0,
    initialised: false,

    webhook: '',
    mode: 'flush',      // flush | profit | loss | summary
    summaryOn: true,

    lastPost: 0,
    lastSummaryAt: 0,
    tagWarnAt: 0,
    rakeWarnAt: 0,
    busyRain: false,
    busyTag: false,
    busyRake: false,
    log: []
  };

  try { S.webhook = localStorage.getItem('glint_helper_webhook') || ''; } catch (e) { /* private mode */ }

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  const nf = new Intl.NumberFormat('en-US');

  // IMPORTANT: every monetary value the GLINT API returns is in CENTS.
  // Proof: available=1_749_779 is announced as "You can vault up to $17,497",
  // the 10_000 minimum bet is announced as "$100", the rain pot
  // 2_502_532_494_750 is shown in the UI as "$25B" and the referral pool
  // 4_000_000_000 as "$40M".
  function usd(n) { return (Number(n) || 0) / 100; }

  function fmt(n) {
    const v = usd(n);
    try { return '$' + nf.format(Math.round(v)); } catch (e) { return '$' + String(Math.round(v)); }
  }

  function compact(n) {
    const v = usd(n);
    const a = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (a >= 1e12) return '$' + sign + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + sign + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + sign + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + sign + (a / 1e3).toFixed(1) + 'K';
    return '$' + sign + String(Math.round(a));
  }

  function errText(res) {
    if (!res) return 'no response';
    if (res.data && res.data.error && res.data.error.message) return res.data.error.message;
    if (res.data && res.data.message) return res.data.message;
    if (res.text) return res.text.slice(0, 160);
    return ('HTTP ' + res.status);
  }

  function log(msg, cls) {
    const line = '[' + new Date().toISOString().slice(11, 19) + '] ' + msg;
    S.log.push((cls ? '[' + cls + '] ' : '') + line);
    if (S.log.length > 200) S.log.shift();
    const box = document.getElementById('gh-log');
    if (box) {
      box.textContent = S.log.slice(-60).join('\n');
      box.scrollTop = box.scrollHeight;
    }
    console.log('[GLINT helper] ' + line);
  }

  /* ------------------------------------------------------------------ *
   * API wrapper (same-origin, session cookie included)
   * ------------------------------------------------------------------ */

  function api(path, method, body) {
    return fetch(path, {
      method: method || 'GET',
      headers: H,
      credentials: 'same-origin',
      cache: 'no-store',
      body: body ? JSON.stringify(body) : undefined
    })
      .then(function (r) {
        return r.text().then(function (t) {
          let j = null;
          try { j = JSON.parse(t); } catch (e) { /* non JSON */ }
          return { ok: r.ok, status: r.status, data: j, text: t };
        });
      })
      .catch(function (e) {
        return { ok: false, status: 0, data: null, text: String(e) };
      });
  }

  /* ------------------------------------------------------------------ *
   * Discord webhook
   * ------------------------------------------------------------------ */

  function postWebhook(content) {
    if (!S.webhook) { log('webhook not set', 'warn'); return Promise.resolve(false); }
    if (!content) return Promise.resolve(false);

    const payload = JSON.stringify({ content: content });
    const now = Date.now();
    // Hard rate limit so a dice autobet cannot flood the channel.
    if (now - S.lastPost < 1200) return Promise.resolve(false);
    S.lastPost = now;

    // One post, one host. Discord's webhook endpoint answers with CORS
    // headers (verified: 200 + the created message JSON), so a normal
    // cross-origin fetch works and we can read the message id back.
    // Do NOT switch to mode:'no-cors' - the browser strips the
    // Content-Type: application/json header there and Discord rejects it.
    const url = String(S.webhook).trim();
    const sep = url.indexOf('?') >= 0 ? '&' : '?';

    return fetch(url + sep + 'wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      mode: 'cors',
      credentials: 'omit'
    })
      .then(function (r) {
        return r.text().then(function (txt) {
          let extra = '';
          try {
            const j = JSON.parse(txt);
            if (j && j.id) extra = ' id=' + j.id + ' channel=' + j.channel_id;
          } catch (e) { /* empty body */ }
          if (r.ok) {
            log('webhook sent (' + r.status + ')' + extra + ' -> ' + content.split('\n')[0].slice(0, 70), 'ok');
            return true;
          }
          log('webhook failed HTTP ' + r.status + ' ' + txt.slice(0, 120), 'bad');
          return false;
        });
      })
      .catch(function (e) {
        // Network/CSP failure: a beacon keeps the JSON content type because it
        // is sent as a Blob.
        try {
          navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
          log('webhook sent (beacon)', 'ok');
          return true;
        } catch (e2) {
          log('webhook failed: ' + String(e).slice(0, 90), 'bad');
          return false;
        }
      });
  }

  /* ------------------------------------------------------------------ *
   * Transaction classification
   * ------------------------------------------------------------------ */

  function classify(tx) {
    const k = String(tx.kind || '').toLowerCase();
    if (/bet|stake|wager/.test(k)) return 'bet';
    if (/payout|win/.test(k)) return 'payout';
    if (/rain/.test(k)) return 'rain';
    if (/rakeback|reward|daily|case|level|welcome|tag|bonus|candy|weekly|monthly/.test(k)) return 'reward';
    if (/withdraw/.test(k)) return 'withdraw';
    if (/vault/.test(k)) return 'vault';
    if (/deposit/.test(k)) return 'deposit';
    return Number(tx.amount) >= 0 ? 'credit' : 'debit';
  }

  function labelFor(tx) {
    const kind = classify(tx);
    const note = tx.note ? ' (' + String(tx.note).slice(0, 28) + ')' : '';
    const game = tx.game ? ' ' + tx.game : '';
    return kind + game + note;
  }

  /* ------------------------------------------------------------------ *
   * P/L tracking
   * ------------------------------------------------------------------ */

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

  function buildSummary() {
    const pnl = S.sessionPnl;
    const head = pnl >= 0 ? '\u{1F4CA} GLINT session +' + fmt(pnl) : '\u{1F4CA} GLINT session ' + fmt(pnl);
    const parts = [];
    parts.push('balance ' + compact(S.balance));
    if (S.rain) {
      parts.push('rain pot ' + compact(S.rain.amount) + ' (' + (S.rain.entryCount || 0) + ' entries, mine ' + (S.rain.myEntries || 0) + ')');
    }
    if (S.tag) parts.push('tag claimable ' + (S.tag.claimable ? 'YES' : 'no'));
    if (S.rake) parts.push('rakeback ' + compact(S.rake.accrued) + (S.rake.claimable ? ' (claimable)' : ''));
    return head + '\n' + parts.join('  |  ');
  }

  /* ------------------------------------------------------------------ *
   * Rain
   * ------------------------------------------------------------------ */

  function readRain() {
    return api('/api/rain').then(function (res) {
      if (!res.ok || !res.data) { log('rain read failed: ' + errText(res), 'bad'); return; }
      const r = (res.data.rain || res.data);
      if (!r || !r.id) return;
      const prev = S.rain;
      S.rain = r;

      if (r.id !== S.seenRainId) {
        S.seenRainId = r.id;
        log('new rain ' + String(r.id).slice(0, 8) + ' pot=' + compact(r.amount) + ' entries=' + (r.entryCount || 0) + ' ends=' + (r.endsAt || '?'), 'ok');
        if (S.autoRain) joinRain(r.id);
      } else if (prev && prev.entryCount !== r.entryCount) {
        // pot grows while people join - only refresh the display
        S.rain = r;
      }
    });
  }

  function joinRain(rainId) {
    const id = rainId || (S.rain && S.rain.id);
    if (!id) return Promise.resolve();
    if (S.busyRain) return Promise.resolve();
    if (S.joinedRainId === id) return Promise.resolve();
    S.busyRain = true;

    return api('/api/rain/join', 'POST', { rainId: id }).then(function (res) {
      S.busyRain = false;
      if (res.ok) {
        S.joinedRainId = id;
        const added = res.data && (res.data.added !== undefined ? res.data.added : (res.data.rain && res.data.rain.added));
        log('joined rain ' + String(id).slice(0, 8) + ' (added=' + compact(added || 0) + ', myEntries=' + ((res.data && res.data.myEntries) || (S.rain && S.rain.myEntries) || '?') + ')', 'ok');
        pushClaim(0, 'rain entry', '\u{1F327} rain entry \u00B7 pot ' + compact((S.rain && S.rain.amount) || 0) + ' \u00B7 ' + ((S.rain && S.rain.entryCount) || 0) + ' entries \u00B7 mine ' + ((res.data && res.data.myEntries) || (S.rain && S.rain.myEntries) || 1));
      } else {
        log('join failed: ' + errText(res), 'warn');
        // A rain can close between poll and join - let the next rotation retry.
        if (res.status === 409) S.joinedRainId = null;
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Discord server tag (500M real money every 30 min)
   * ------------------------------------------------------------------ */

  function readTag(forceClaim) {
    return api('/api/rewards/discord-tag').then(function (res) {
      if (!res.ok || !res.data) { log('tag read failed: ' + errText(res), 'bad'); return; }
      S.tag = res.data;

      if (S.tag.wearing === false && Date.now() - S.tagWarnAt > 600000) {
        S.tagWarnAt = Date.now();
        log('Discord tag not worn - put the GLNT server tag on to claim ' + compact(S.tag.daily || 0) + ' every ' + (S.tag.everyMinutes || 30) + ' min', 'warn');
      }
      if (forceClaim || (S.autoTag && S.tag.claimable)) {
        if (S.busyTag) return;
        S.busyTag = true;
        return api('/api/rewards/discord-tag/claim', 'POST', {}).then(function (c) {
          S.busyTag = false;
          if (c.ok) {
            const amt = c.data && (c.data.amount !== undefined ? c.data.amount : (c.data.claimed && c.data.claimed.amount));
            log('Discord tag claimed: ' + compact(amt || S.tag.daily || 0), 'ok');
            pushClaim(Number(amt) || Number(S.tag.daily) || 0, 'discord tag reward', '\u2705 Discord server-tag reward claimed: ' + fmt(Number(amt) || Number(S.tag.daily) || 0));
            S.tag.claimable = false;
          } else if (c.status === 429) {
            log('tag claim rate limited', 'warn');
          } else if (c.status === 409) {
            if (Date.now() - S.tagWarnAt > 600000) {
              S.tagWarnAt = Date.now();
              log('tag claim refused: ' + errText(c), 'warn');
            }
          } else {
            log('tag claim failed: ' + errText(c), 'bad');
          }
        });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Rakeback
   * ------------------------------------------------------------------ */

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
              pushClaim(Number(amt) || Number(info.amount) || 0, kind + ' bonus', '\u2705 ' + kind.charAt(0).toUpperCase() + kind.slice(1) + ' bonus claimed: ' + fmt(Number(amt) || Number(info.amount) || 0));
              info.claimable = false;
              if (kind === 'daily') S.daily = info;
              else if (kind === 'weekly') S.weekly = info;
              else if (kind === 'monthly') S.monthly = info;
              else S.caseR = info;
            } else if (c.status === 429) {
              log(kind + ' claim rate limited', 'warn');
            } else if (c.status === 409) {
              const lastWarn = S.bonusWarnAt[kind] || 0;
              if (Date.now() - lastWarn > 600000) {
                S.bonusWarnAt[kind] = Date.now();
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
  function readRakeback(forceClaim) {
    return api('/api/rewards').then(function (res) {
      if (!res.ok || !res.data) { log('rewards read failed: ' + errText(res), 'bad'); return; }
      const rk = res.data.rakeback || {};
      S.rake = rk;

      if (forceClaim || (S.autoRakeback && rk.claimable && Number(rk.accrued) > 0)) {
        if (S.busyRake) return;
        S.busyRake = true;
        return api('/api/rewards/claim', 'POST', { kind: 'rakeback' }).then(function (c) {
          S.busyRake = false;
          if (c.ok) {
            const amt = c.data && (c.data.amount !== undefined ? c.data.amount : 0);
            log('rakeback claimed: ' + compact(amt), 'ok');
            pushClaim(Number(amt) || Number(rk.accrued) || 0, 'rakeback', '\u2705 Rakeback claimed: ' + fmt(Number(amt) || Number(rk.accrued) || 0));
            S.rake.claimable = false;
          } else if (c.status === 429) {
            log('rakeback rate limited', 'warn');
          } else if (c.status === 409) {
            if (Date.now() - S.rakeWarnAt > 600000) {
              S.rakeWarnAt = Date.now();
              log('rakeback: ' + errText(c), 'warn');
            }
          } else {
            log('rakeback claim failed: ' + errText(c), 'bad');
          }
        });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Wallet + transactions tracker (drives the profit/loss messages)
   * ------------------------------------------------------------------ */

  function pollWallet() {
    return Promise.all([api('/api/wallet/limits'), api('/api/wallet/transactions?limit=60')]).then(function (res) {
      const lim = res[0];
      const tx = res[1];

      if (lim.ok && lim.data) {
        const w = lim.data.wallet || lim.data;
        const bal = Number(w.available);
        if (!isNaN(bal)) {
          S.balance = bal;
          if (!S.initialised) {
            S.initialised = true;
            S.startBalance = bal;
            S.prevBalance = bal;
            log('tracker started - balance ' + compact(bal), 'ok');
          }
        }
      }

      if (tx.ok && tx.data && Array.isArray(tx.data.items)) {
        const items = tx.data.items;
        if (!S.init) {
          // Baseline: do not report the transactions that already existed.
          items.forEach(function (t) { if (t.id) S.seenTx.add(t.id); });
          S.init = true;
          return;
        }
        let observed = 0;
        for (let i = 0; i < items.length; i++) {
          const t = items[i];
          if (!t.id || S.seenTx.has(t.id)) continue;
          S.seenTx.add(t.id);
          const amt = Number(t.amount) || 0;
          observed += amt;
          if (t.kind === 'rain' || t.kind === 'reward') pushClaim(amt, labelFor(t), (t.kind === 'rain' ? '\u{1F327} rain payout credited: ' : '\u2705 reward credited: ') + fmt(amt));
          else pushEvent(amt, labelFor(t));
          if (S.seenTx.size > 4000) {
            // keep the set bounded
            const arr = Array.from(S.seenTx).slice(-1500);
            S.seenTx = new Set(arr);
          }
        }
        // Reconcile with the balance movement in case a transaction was not visible.
        if (S.prevBalance !== null && S.balance !== null) {
          const delta = S.balance - S.prevBalance;
          const diff = delta - observed;
          if (Math.abs(diff) > 1) pushEvent(diff, 'unobserved balance change');
          S.sessionPnl += delta;
        }
        S.prevBalance = S.balance;
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * GUI
   * ------------------------------------------------------------------ */

  const CSS = [
    '#glint-helper-panel{position:fixed;top:16px;right:16px;width:336px;z-index:2147483000;',
    'background:rgba(9,9,11,.95);color:#e9e9ec;border:1px solid rgba(255,255,255,.10);border-radius:12px;',
    'box-shadow:0 20px 60px rgba(0,0,0,.6);font:12px/1.45 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;',
    'overflow:hidden;backdrop-filter:blur(10px)}',
    '#glint-helper-panel .gh-head{display:flex;align-items:center;justify-content:space-between;gap:8px;',
    'padding:9px 11px;background:rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.08);cursor:move;user-select:none}',
    '#glint-helper-panel .gh-title{font-weight:800;letter-spacing:.6px;font-size:11px;text-transform:uppercase}',
    '#glint-helper-panel .gh-body{padding:9px 10px;max-height:74vh;overflow:auto}',
    '#glint-helper-panel.gh-min .gh-body{display:none}',
    '#glint-helper-panel .gh-sec{border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:8px;',
    'margin-bottom:8px;background:rgba(255,255,255,.02)}',
    '#glint-helper-panel .gh-sec h4{margin:0 0 6px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8f8f99;font-weight:800}',
    '#glint-helper-panel .gh-row{display:flex;justify-content:space-between;gap:10px;padding:2px 0}',
    '#glint-helper-panel .gh-k{color:#8b8b95;white-space:nowrap}',
    '#glint-helper-panel .gh-v{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-align:right;word-break:break-all}',
    '#glint-helper-panel .gh-ok{color:#4ade80}#glint-helper-panel .gh-bad{color:#f87171}#glint-helper-panel .gh-warn{color:#fbbf24}#glint-helper-panel .gh-dim{color:#77777f}',
    '#glint-helper-panel button{background:rgba(255,255,255,.08);color:#e9e9ec;border:1px solid rgba(255,255,255,.14);',
    'border-radius:7px;padding:4px 9px;font-size:11px;cursor:pointer;font-family:inherit}',
    '#glint-helper-panel button:hover{background:rgba(255,255,255,.16)}',
    '#glint-helper-panel button.gh-primary{background:#f2f2f4;color:#0c0c0e;border-color:#f2f2f4;font-weight:700}',
    '#glint-helper-panel input[type=text],#glint-helper-panel select{background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.14);',
    'color:#e9e9ec;border-radius:6px;padding:4px 6px;font-size:11px;width:100%;font-family:ui-monospace,Menlo,Consolas,monospace}',
    '#glint-helper-panel label{display:flex;align-items:center;gap:6px;padding:2px 0;color:#b6b6bf;font-size:11px;cursor:pointer}',
    '#glint-helper-panel .gh-grid{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
    '#glint-helper-panel .gh-log{max-height:148px;overflow:auto;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.08);',
    'border-radius:7px;padding:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10.5px;white-space:pre-wrap;',
    'word-break:break-word;color:#c8c8d1}',
    '#glint-helper-panel .gh-foot{padding:0 10px 9px;color:#6a6a73;font-size:10px}'
  ].join('');

  function buildGui() {
    if (!document.body) return;
    if (document.getElementById('glint-helper-panel')) return;

    const style = document.createElement('style');
    style.id = 'glint-helper-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'glint-helper-panel';
    panel.innerHTML = [
      '  <div class="gh-head" id="gh-head">',
      '  <span class="gh-title">GLINT helper</span>',
      '  <span style="display:flex;gap:6px">',
      '    <button id="gh-min" title="minimise (Ctrl+Shift+5)">–</button>',
      '  </span>',
      '</div>',
      '<div class="gh-body">',

      '  <div class="gh-sec">',
      '    <h4>Rain</h4>',
      '    <div class="gh-row"><span class="gh-k">pot</span><span class="gh-v" id="gh-rain-pot">–</span></div>',
      '    <div class="gh-row"><span class="gh-k">entries</span><span class="gh-v" id="gh-rain-ent">–</span></div>',
      '    <div class="gh-row"><span class="gh-k">my entries</span><span class="gh-v" id="gh-rain-mine">–</span></div>',
      '    <div class="gh-row"><span class="gh-k">ends</span><span class="gh-v" id="gh-rain-end">–</span></div>',
      '    <label><input type="checkbox" id="gh-autorain" checked> auto-join every rain</label>',
      '    <div class="gh-grid"><button id="gh-join" class="gh-primary">Join now (Ctrl+Shift+1)</button></div>',
      '  </div>',

      '  <div class="gh-sec">',
      '    <h4>Discord server tag</h4>',
      '    <div class="gh-row"><span class="gh-k">wearing</span><span class="gh-v" id="gh-tag-wear">–</span></div>',
      '    <div class="gh-row"><span class="gh-k">claimable</span><span class="gh-v" id="gh-tag-claim">–</span></div>',
      '    <div class="gh-row"><span class="gh-k">reward</span><span class="gh-v" id="gh-tag-amt">–</span></div>',
      '    <div class="gh-row"><span class="gh-k">next claim</span><span class="gh-v" id="gh-tag-next">–</span></div>',
      '    <label><input type="checkbox" id="gh-autotag" checked> auto-claim</label>',
      '    <div class="gh-grid"><button id="gh-tag-btn" class="gh-primary">Claim now (Ctrl+Shift+2)</button></div>',
      '  </div>',

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
      '  <div class="gh-sec">',
      '    <h4>Rakeback</h4>',
      '    <div class="gh-row"><span class="gh-k">accrued</span><span class="gh-v" id="gh-rake-acc">–</span></div>',
      '    <div class="gh-row"><span class="gh-k">claimable</span><span class="gh-v" id="gh-rake-claim">–</span></div>',
      '    <label><input type="checkbox" id="gh-autorake" checked> auto-claim</label>',
      '    <div class="gh-grid"><button id="gh-rake-btn" class="gh-primary">Claim now (Ctrl+Shift+3)</button></div>',
      '  </div>',

      '  <div class="gh-sec">',
      '    <h4>Profit / loss tracker</h4>',
      '    <div class="gh-row"><span class="gh-k">balance</span><span class="gh-v" id="gh-bal">–</span></div>',
      '    <div class="gh-row"><span class="gh-k">session P/L</span><span class="gh-v" id="gh-pnl">–</span></div>',
      '    <div class="gh-row"><span class="gh-k">claims queued</span><span class="gh-v" id="gh-queue">0</span></div>',
      '    <div style="margin-top:6px">',
      '      <input type="text" id="gh-webhook" placeholder="https://discord.com/api/webhooks/…">',
      '    </div>',
      '    <div class="gh-grid">',
      '      <button id="gh-hook-save">Save webhook</button>',
       '      <button id="gh-hook-clear">Clear webhook</button>',
      '      <button id="gh-hook-test">Test</button>',
      '      <button id="gh-summary">Send summary</button>',
      '    </div>',
      '    <div style="margin-top:6px">',
      '      <select id="gh-mode">',
      '        <option value="flush">one message per 30s when something was claimed</option>',
      '        <option value="profit">one message per 30s, only when session P/L went up</option>',
      '        <option value="loss">one message per 30s, only when session P/L went down</option>',
      '        <option value="summary">10-min summaries only</option>',
      '      </select>',
      '    </div>',
      '    <label><input type="checkbox" id="gh-summary-on" checked> send a summary every 10 min</label>',
      '  </div>',

      '  <div class="gh-sec">',
      '    <h4>Log</h4>',
      '    <div class="gh-log" id="gh-log"></div>',
      '    <div class="gh-grid"><button id="gh-copy">Copy log</button><button id="gh-clear">Clear</button></div>',
      '  </div>',

      '</div>',
      '<div class="gh-foot">Ctrl+Shift+1 rain · 2 tag · 3 rakeback · 4 summary · 5 minimise</div>'
    ].join('');
    document.body.appendChild(panel);

    // --- wire up ---
    const q = function (id) { return document.getElementById(id); };

    q('gh-join').addEventListener('click', function () { joinRain(); });
    q('gh-tag-btn').addEventListener('click', function () { readTag(true); });
    q('gh-rake-btn').addEventListener('click', function () { readRakeback(true); });
    q('gh-daily-btn').addEventListener('click', function () { readBonuses(true, 'daily'); });
    q('gh-weekly-btn').addEventListener('click', function () { readBonuses(true, 'weekly'); });

    q('gh-autorain').addEventListener('change', function (e) { S.autoRain = e.target.checked; log('auto-rain ' + (S.autoRain ? 'ON' : 'OFF')); });
    q('gh-autotag').addEventListener('change', function (e) { S.autoTag = e.target.checked; log('auto-tag ' + (S.autoTag ? 'ON' : 'OFF')); });
    q('gh-autorake').addEventListener('change', function (e) { S.autoRakeback = e.target.checked; log('auto-rakeback ' + (S.autoRakeback ? 'ON' : 'OFF')); });
    q('gh-autodaily').addEventListener('change', function (e) { S.autoDaily = e.target.checked; log('auto-daily ' + (S.autoDaily ? 'ON' : 'OFF')); });
    q('gh-autoweekly').addEventListener('change', function (e) { S.autoWeekly = e.target.checked; log('auto-weekly ' + (S.autoWeekly ? 'ON' : 'OFF')); });

    q('gh-webhook').value = S.webhook;
    q('gh-hook-save').addEventListener('click', function () {
      S.webhook = String(q('gh-webhook').value || '').trim();
      try { localStorage.setItem('glint_helper_webhook', S.webhook); } catch (e) {}
      log('webhook saved' + (S.webhook ? '' : ' (empty)'), S.webhook ? 'ok' : 'warn');
    });
    q('gh-hook-clear').addEventListener('click', function () {
      S.webhook = '';
      q('gh-webhook').value = '';
      try { localStorage.removeItem('glint_helper_webhook'); } catch (e) {}
      log('webhook cleared', 'warn');
    });
    q('gh-hook-test').addEventListener('click', function () {
      S.webhook = String(q('gh-webhook').value || '').trim();
      try { localStorage.setItem('glint_helper_webhook', S.webhook); } catch (e) {}
      postWebhook('\u{1F9EA} GLINT helper test - webhook is working.');
    });
    q('gh-summary').addEventListener('click', function () {
      S.webhook = String(q('gh-webhook').value || '').trim();
      postWebhook(buildSummary());
    });

    q('gh-mode').addEventListener('change', function (e) { S.mode = e.target.value; log('webhook mode: ' + S.mode); });
    q('gh-summary-on').addEventListener('change', function (e) { S.summaryOn = e.target.checked; });

    q('gh-copy').addEventListener('click', function () {
      const text = S.log.join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { log('log copied', 'ok'); }, function () { log('copy failed', 'bad'); });
      }
    });
    q('gh-clear').addEventListener('click', function () { S.log = []; const b = q('gh-log'); if (b) b.textContent = ''; });

    q('gh-min').addEventListener('click', function () { panel.classList.toggle('gh-min'); });

    // drag
    const head = q('gh-head');
    let drag = null;
    head.addEventListener('mousedown', function (e) {
      if (e.target.tagName === 'BUTTON') return;
      const r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!drag) return;
      panel.style.left = (e.clientX - drag.dx) + 'px';
      panel.style.top = (e.clientY - drag.dy) + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', function () { drag = null; });

    log('GUI ready - rain ' + (S.autoRain ? 'ON' : 'OFF') + ', tag ' + (S.autoTag ? 'ON' : 'OFF') + ', rakeback ' + (S.autoRakeback ? 'ON' : 'OFF'), 'ok');
  }

  /* ------------------------------------------------------------------ *
   * GUI refresh
   * ------------------------------------------------------------------ */

  function setText(id, text, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (cls !== undefined) {
      el.className = 'gh-v' + (cls ? ' ' + cls : '');
    }
  }

  function render() {
    if (!document.getElementById('glint-helper-panel')) return;
    if (S.rain) {
      setText('gh-rain-pot', compact(S.rain.amount));
      setText('gh-rain-ent', String(S.rain.entryCount || 0) + ' / ' + (S.rain.participants || 0) + ' ppl');
      setText('gh-rain-mine', String(S.rain.myEntries || 0), (S.rain.myEntries ? 'gh-ok' : 'gh-dim'));
      setText('gh-rain-end', S.rain.endsAt ? String(S.rain.endsAt).replace('T', ' ').replace('.000Z', 'Z').slice(0, 20) : '–');
    }
    if (S.tag) {
      setText('gh-tag-wear', S.tag.wearing ? 'yes' : 'no', S.tag.wearing ? 'gh-ok' : 'gh-warn');
      setText('gh-tag-claim', S.tag.claimable ? 'YES' : 'no', S.tag.claimable ? 'gh-ok' : 'gh-dim');
      setText('gh-tag-amt', compact(S.tag.daily || 0));
      setText('gh-tag-next', S.tag.nextClaimAt ? String(S.tag.nextClaimAt).replace('T', ' ').slice(0, 19) : '–');
    }
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
    if (S.balance !== null) setText('gh-bal', compact(S.balance) + '  (' + fmt(S.balance) + ')');
    if (S.sessionPnl !== 0) {
      setText('gh-pnl', (S.sessionPnl >= 0 ? '+' : '') + compact(S.sessionPnl) + '  (' + fmt(S.sessionPnl) + ')', S.sessionPnl >= 0 ? 'gh-ok' : 'gh-bad');
    } else {
      setText('gh-pnl', '0', 'gh-dim');
    }
    setText('gh-queue', String(S.claims.length));
  }

  /* ------------------------------------------------------------------ *
   * Hotkeys (Ctrl+Shift+N so we do not fight the site / your autobet)
   * ------------------------------------------------------------------ */

  document.addEventListener('keydown', function (e) {
    if (!e.ctrlKey || !e.shiftKey) return;
    const k = e.key;
    if (k === '1') { e.preventDefault(); joinRain(); }
    else if (k === '2') { e.preventDefault(); readTag(true); }
    else if (k === '3') { e.preventDefault(); readRakeback(true); }
    else if (k === '6') { e.preventDefault(); readBonuses(true, 'daily'); }
    else if (k === '7') { e.preventDefault(); readBonuses(true, 'weekly'); }
    else if (k === '4') { e.preventDefault(); postWebhook(buildSummary()); }
    else if (k === '5') {
      e.preventDefault();
      const p = document.getElementById('glint-helper-panel');
      if (p) p.classList.toggle('gh-min');
    }
  });

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  function boot() {
    buildGui();
    readRain();
    readTag(false);
    readRakeback(false);
    readBonuses(false);
    pollWallet();

    setInterval(readRain, T.rain);
    setInterval(readTag, T.tag);
    setInterval(readRakeback, T.rake);
    setInterval(readBonuses, T.bonus);
    setInterval(pollWallet, T.tx);
    setInterval(flushEvents, T.flush);
    setInterval(render, 1000);
    setInterval(function () {
      if (S.summaryOn && Date.now() - S.lastSummaryAt > T.summary) {
        S.lastSummaryAt = Date.now();
        postWebhook(buildSummary());
      }
    }, 30000);

    log('helper started on ' + location.pathname, 'ok');
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
