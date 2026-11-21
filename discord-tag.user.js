// ==UserScript==
// @name         GLINT Discord Tag Auto-Claim (500M / 30 min)
// @namespace    glint-audit
// @version      1.0
// @description  Claims the GLNT Discord server-tag reward every 30 minutes while the tag is worn. Real (non-play) money. Logs every attempt.
// @author       GLINT Tools Contributors
// @match        https://donutglint.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  var HEADERS = {
    Accept: 'application/json',
    'X-Requested-With': 'glint',
    'Content-Type': 'application/json'
  };

  var CLAIM_URL = '/api/rewards/discord-tag/claim';
  var STATUS_URL = '/api/rewards/discord-tag';
  var LOG_KEY = '__glintTagLog';

  function log(line) {
    try {
      var arr = window[LOG_KEY] || [];
      arr.push(new Date().toISOString() + ' ' + line);
      if (arr.length > 100) arr.shift();
      window[LOG_KEY] = arr;
      console.log('[GLINT TAG] ' + line);
    } catch (e) {}
  }

  function req(url, body) {
    return fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: HEADERS,
      credentials: 'same-origin',
      cache: 'no-store',
      body: body ? JSON.stringify(body) : undefined
    })
      .then(function (r) {
        return r
          .json()
          .catch(function () {
            return { httpStatus: r.status, nonJson: true };
          })
          .then(function (j) {
            j.__status = r.status;
            return j;
          });
      })
      .catch(function (e) {
        return { error: { code: 'network', message: String(e) } };
      });
  }

  function describe(j) {
    if (!j) return 'empty';
    if (j.error) return j.error.code + ': ' + (j.error.message || '');
    if (j.wallet) {
      return 'OK amount=' + (j.amount != null ? j.amount : '?') +
        ' available=' + j.wallet.available + ' bonus=' + j.wallet.bonus;
    }
    return JSON.stringify(j).slice(0, 220);
  }

  function claim(reason) {
    req(STATUS_URL)
      .then(function (st) {
        var s = st || {};
        var next = s.nextClaimAt || s.lastClaimAt;
        log('status wearing=' + s.wearing + ' claimable=' + s.claimable +
            ' next=' + next + ' everyMinutes=' + s.everyMinutes + ' (' + reason + ')');
        if (s.wearing === false) {
          log('tag not worn -> wear the GLNT server tag in Discord, then F3 to retry');
          return null;
        }
        return req(CLAIM_URL, {}).then(function (j) {
          log('claim(' + reason + ') -> ' + describe(j));
          return j;
        });
      })
      .catch(function (e) {
        log('error ' + String(e));
      });
  }

  // F3 = claim now. F4 = show log.
  window.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'F3') {
      e.preventDefault();
      claim('manual F3');
    } else if (e.key === 'F4') {
      e.preventDefault();
      log('--- log dump ---');
      (window[LOG_KEY] || []).forEach(function (l) { console.log(l); });
      alert((window[LOG_KEY] || []).slice(-20).join('\n'));
    }
  });

  // Poll every 60s; claim only when the server says we are claimable.
  function tick() {
    req(STATUS_URL)
      .then(function (st) {
        var s = st || {};
        window.__glintTagStatus = s;
        if (s.claimable === true || (s.wearing === true && !s.nextClaimAt)) {
          claim('auto-poll');
        }
      })
      .catch(function () {});
  }

  if (window.__glintTagTimer) clearInterval(window.__glintTagTimer);
  window.__glintTagTimer = setInterval(tick, 60000);
  log('auto-claimer armed (poll 60s, F3 claim now, F4 dump log)');
})();
