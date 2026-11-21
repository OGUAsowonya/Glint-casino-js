'use strict';
/*
 * Local test server used to validate the GLINT scripts in a real browser:
 *   GET  /files/<name>   serves a file from this folder (CORS *)
 *   POST /sink           records a webhook payload, answers 204
 *   GET  /sink/log       returns the recorded payloads
 *   POST /reset          clears the recorded payloads
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8899);
const received = [];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

const server = http.createServer(function (req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/sink' && req.method === 'POST') {
    let b = '';
    req.on('data', function (c) { b += c; });
    req.on('end', function () {
      received.push({ ts: new Date().toISOString(), body: b });
      console.log('[sink] ' + b);
      res.writeHead(204);
      res.end();
    });
    return;
  }
  if (req.url === '/sink/log' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(received));
    return;
  }
  if (req.url === '/reset' && req.method === 'POST') {
    received.length = 0;
    res.writeHead(204);
    res.end();
    return;
  }

  const name = decodeURIComponent(String(req.url).replace(/^\/files\//, ''));
  const file = path.join(ROOT, path.normalize(name).replace(/^([\\/])+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
  res.end(fs.readFileSync(file));
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('glint test server on http://127.0.0.1:' + PORT + ' (files/, sink, sink/log, reset)');
});
