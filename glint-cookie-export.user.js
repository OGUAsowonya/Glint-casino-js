// ==UserScript==
// @name         GLINT cookie export -> local claimer
// @namespace    donutglint
// @version      1.0.0
// @description  Sends the HttpOnly glint.did session cookie to the local GLINT claimer (127.0.0.1:8787) so the claimer can keep running with the page closed.
// @author       GLINT Tools Contributors
// @match        https://donutglint.com/*
// @grant        GM_cookie
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var PORT = 8787;
  var TARGET = 'http://127.0.0.1:' + PORT + '/cookie';

  function say(msg, bad) {
    var style = bad
      ? 'background:#7f1d1d;color:#fff;padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui'
      : 'background:#052e16;color:#d1fae5;padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui';
    var el = document.createElement('div');
    el.textContent = msg;
    el.setAttribute('style', style + ';position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;box-shadow:0 8px 24px rgba(0,0,0,.35)');
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 6000);
  }

  function push(cookieValue, done) {
    try {
      GM_xmlhttpRequest({
        method: 'POST',
        url: TARGET,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ cookie: cookieValue }),
        onload: function (res) {
          if (res && res.status === 200) {
            say('Cookie sent to the local claimer. You can close this tab.');
          } else {
            say('Local claimer answered HTTP ' + (res ? res.status : '?') + '. Is glint-claimer.js running?', true);
          }
          if (done) done();
        },
        onerror: function () {
          say('Could not reach 127.0.0.1:' + PORT + ' -- start glint-claimer.js first.', true);
          if (done) done();
        }
      });
    } catch (e) {
      say('GM_xmlhttpRequest failed: ' + e.message, true);
    }
  }

  function fromGmCookie() {
    try {
      var result = GM_cookie.list({ domain: 'donutglint.com' });
      if (result && typeof result.then === 'function') {
        result.then(function (list) { handleList(list); }).catch(function (e) { manual(); });
        return;
      }
      if (typeof GM_cookie.list === 'function') {
        GM_cookie.list({ domain: 'donutglint.com' }, function (list) { handleList(list); });
        return;
      }
    } catch (e) { /* fall through to manual */ }
    manual();
  }

  function handleList(list) {
    var hit = null;
    (list || []).forEach(function (c) { if (c && c.name === 'glint.did') hit = c; });
    if (!hit) { manual(); return; }
    push('glint.did=' + hit.value);
  }

  function manual() {
    var value = window.prompt(
      'GM_cookie could not read glint.did.\n\n' +
      'Paste the cookie value manually:\n' +
      'DevTools -> Application -> Cookies -> https://donutglint.com -> glint.did -> Value',
      ''
    );
    if (!value) { say('Cancelled - the claimer still needs a cookie.', true); return; }
    push('glint.did=' + value.trim().replace(/^glint\.did=/, ''));
  }

  if (typeof GM_cookie !== 'undefined') {
    fromGmCookie();
  } else {
    manual();
  }
})();
