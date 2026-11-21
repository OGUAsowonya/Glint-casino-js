'use strict';
/*
 * Offline test for glint-claimer.js -- no real requests, no real balance.
 * Starts a fake GLINT API + a fake Discord webhook on localhost and asserts that
 * the claimer joins the rain, claims the tag and the rakeback and posts a webhook.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRunner } = require('./glint-claimer.js');

const seen = { calls: [], webhooks: [] };

function readBody(req) {
  return new Promise(function (resolve) {
    let b = '';
    req.on('data', function (c) { b += c; });
    req.on('end', function () { resolve(b); });
  });
}

const api = http.createServer(async function (req, res) {
  const body = await readBody(req);
  seen.calls.push({ method: req.method, url: req.url, body: body, cookie: req.headers.cookie || null });
  const send = function (code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  if (req.url === '/api/auth/me') return send(200, { user: { id: 'u1', username: 'mock' }, wallet: { available: 1000 } });
  if (req.url === '/api/rain') return send(200, { rain: { id: 'rain-mock-1', amount: 10000000000, entryCount: 12, participants: 4, myEntries: 0, endsAt: new Date(Date.now() + 3600000).toISOString(), status: 'open' } });
  if (req.url === '/api/rain/join') return send(200, { joined: true, myEntries: 1, added: 500000000 });
  if (req.url === '/api/rewards/discord-tag') return send(200, { enabled: true, claimable: true, wearing: true, daily: 500000000 });
  if (req.url === '/api/rewards/discord-tag/claim') return send(200, { amount: 500000000, message: 'claimed' });
  if (req.url === '/api/rewards') return send(200, { rakeback: { accrued: 123456, claimable: true, rate: 2.5 } });
  if (req.url === '/api/rewards/claim') return send(200, { amount: 123456, message: 'Rakeback claimed' });
  if (req.url === '/api/wallet/limits') return send(200, { available: 1000, withdrawable: 1000, bonus: 0, unlocked: true });
  if (req.url.indexOf('/api/wallet/transactions') === 0) return send(200, { items: [] });
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 'not_found' } }));
});

const hook = http.createServer(function (req, res) {
  let b = '';
  req.on('data', function (c) { b += c; });
  req.on('end', function () {
    seen.webhooks.push(b);
    res.writeHead(204);
    res.end();
  });
});

function listen(server) {
  return new Promise(function (resolve) { server.listen(0, '127.0.0.1', function () { resolve(server.address().port); }); });
}

(async function () {
  const apiPort = await listen(api);
  const hookPort = await listen(hook);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glint-claim-test-'));
  const cfg = {
    baseUrl: 'http://127.0.0.1:' + apiPort,
    cookie: 'test-session-value',
    webhookUrl: 'http://127.0.0.1:' + hookPort + '/webhook',
    stateFile: path.join(tmp, 'state.json'),
    cookieFile: path.join(tmp, 'cookie.txt'),
    ingestPort: 0,
    verbose: false,
    summaryEveryMs: 0
  };
  const runner = createRunner(cfg);
  await runner.runOnce({});
  await runner.runOnce({});

  const urls = seen.calls.map(function (c) { return c.method + ' ' + c.url; });
  const checks = [
    ['auth check', urls.indexOf('GET /api/auth/me') >= 0],
    ['rain fetched', urls.indexOf('GET /api/rain') >= 0],
    ['rain joined', urls.indexOf('POST /api/rain/join') >= 0],
    ['tag fetched', urls.indexOf('GET /api/rewards/discord-tag') >= 0],
    ['tag claimed', urls.indexOf('POST /api/rewards/discord-tag/claim') >= 0],
    ['rakeback fetched', urls.indexOf('GET /api/rewards') >= 0],
    ['rakeback claimed', urls.indexOf('POST /api/rewards/claim') >= 0],
    ['limits read', urls.indexOf('GET /api/wallet/limits') >= 0],
    ['cookie sent', seen.calls.every(function (c) { return c.cookie === 'glint.did=test-session-value'; })],
    ['join body correct', (seen.calls.filter(function (c) { return c.url === '/api/rain/join'; })[0] || {}).body === '{"rainId":"rain-mock-1"}'],
    ['rakeback body correct', (seen.calls.filter(function (c) { return c.url === '/api/rewards/claim'; })[0] || {}).body === '{"kind":"rakeback"}'],
    ['webhook posted', seen.webhooks.length >= 1]
  ];
  let failed = 0;
  checks.forEach(function (c) {
    if (!c[1]) failed++;
    console.log((c[1] ? 'PASS  ' : 'FAIL  ') + c[0]);
  });
  console.log('webhook payloads:');
  seen.webhooks.forEach(function (w) { console.log('  ' + w); });
  api.close();
  hook.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  console.log(failed === 0 ? '\nALL CHECKS PASSED' : '\n' + failed + ' CHECK(S) FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
