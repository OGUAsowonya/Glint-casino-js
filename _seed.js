const crypto = require('crypto');
const S0 = '3110b4f809cf1310ffd28c1bf13bfd9c4a8f34b0a0aea661e44e8f2c379b9a06';
const H0 = 'd9a3649ce0d44f25617520d62a69a94fe2cd23399c994d48e2483d64c569f6d6';
const H1 = 'ee5382af603d99dc6905e5d3e98e69d972655799c7b47e12d663835f4fe1d4cd';
const H2 = 'e6e8cfa229f10b803de6a3fc8349faa703371a5aa0bb389ee0b543ccae4329d6';
const CS = 'f88591c30de27512cabc';

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();

function floatsA(seed, cs, nonce, count) { // HMAC(key=serverSeed, msg=cs:nonce:cursor)
  const out = []; let cur = 0;
  while (out.length < count) {
    const mac = hmac(Buffer.from(seed, 'utf8'), `${cs}:${nonce}:${cur}`);
    for (let i = 0; i < 32; i += 4) out.push(mac[i]/256 + mac[i+1]/65536 + mac[i+2]/0x1000000 + mac[i+3]/0x100000000);
    cur++;
  }
  return out.slice(0, count);
}
function floatsB(seed, cs, nonce, count) { // HMAC(key=cs:nonce:cursor, msg=serverSeed)
  const out = []; let cur = 0;
  while (out.length < count) {
    const mac = hmac(Buffer.from(`${cs}:${nonce}:${cur}`, 'utf8'), Buffer.from(seed, 'utf8'));
    for (let i = 0; i < 32; i += 4) out.push(mac[i]/256 + mac[i+1]/65536 + mac[i+2]/0x1000000 + mac[i+3]/0x100000000);
    cur++;
  }
  return out.slice(0, count);
}
function floatsC(seed, cs, nonce, count) { // sha256(seed + cs:nonce:cursor)
  const out = []; let cur = 0;
  while (out.length < count) {
    const d = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(seed,'utf8'), Buffer.from(`${cs}:${nonce}:${cur}`,'utf8')])).digest();
    for (let i = 0; i < 32; i += 4) out.push(d[i]/256 + d[i+1]/65536 + d[i+2]/0x1000000 + d[i+3]/0x100000000);
    cur++;
  }
  return out.slice(0, count);
}
function floatsD(seed, cs, nonce, count) { // sha256(cs:nonce:cursor + seed)
  const out = []; let cur = 0;
  while (out.length < count) {
    const d = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(`${cs}:${nonce}:${cur}`,'utf8'), Buffer.from(seed,'utf8')])).digest();
    for (let i = 0; i < 32; i += 4) out.push(d[i]/256 + d[i+1]/65536 + d[i+2]/0x1000000 + d[i+3]/0x100000000);
    cur++;
  }
  return out.slice(0, count);
}
const variants = { A: floatsA, B: floatsB, C: floatsC, D: floatsD };
function gR(seed, cs, nonce, grid, mines, f) {
  const n = Array.from({length: grid}, (_, i) => i);
  const fl = f(seed, cs, nonce, mines);
  const o = [];
  for (let t = 0; t < mines; t++) { const r = grid - t; const u = Math.floor(fl[t] * r); o.push(n[u]); n[u] = n[r - 1]; }
  return o;
}
const dataset = [[711,[2,3,16]],[712,[10,16,22]],[713,[11,19,24]]];
for (const [name, f] of Object.entries(variants)) {
  let ok = 0, got = [];
  for (const [nonce, exp] of dataset) {
    const g = gR(S0, CS, nonce, 25, 3, f).sort((a,b)=>a-b);
    got.push(nonce + ':' + JSON.stringify(g));
    if (g.join() === exp.join()) ok++;
  }
  console.log('variant', name, 'matches', ok + '/3', got.join(' | '));
}
console.log('sha256(S0)==H0 ?', sha256(S0) === H0);

// derivation hunt: S_{k+1} = f(S_k)?
const salts = ['', 'next', 'next-seed', 'next_seed', 'fairness', 'next-server-seed', 'server-seed', 'seed', 'nonce', 'rotate', 'rot', 'glint', 'mines', '1', '2', '3', 'glint:next', 'next:glint'];
const cands = {};
for (const salt of salts) {
  cands[`sha256(S0+'${salt}')`] = sha256(S0 + salt);
  cands[`sha256('${salt}'+S0)`] = sha256(salt + S0);
  cands[`sha256(S0+':'+'${salt}')`] = sha256(S0 + ':' + salt);
  cands[`sha256('${salt}'+':'+S0)`] = sha256(salt + ':' + S0);
  cands[`sha256(sha256(S0)+'${salt}')`] = sha256(sha256(S0) + salt);
  cands[`sha256(H0+'${salt}')`] = sha256(H0 + salt);
  cands[`hmac(S0,'${salt}')`] = crypto.createHmac('sha256', S0).update(salt).digest('hex');
  cands[`hmac('${salt}',S0)`] = crypto.createHmac('sha256', salt).update(S0).digest('hex');
  cands[`hmac(H0,'${salt}')`] = crypto.createHmac('sha256', H0).update(salt).digest('hex');
  cands[`hmac('${salt}',H0)`] = crypto.createHmac('sha256', salt).update(H0).digest('hex');
}
cands['sha256(S0hex)'] = crypto.createHash('sha256').update(Buffer.from(S0, 'hex')).digest('hex');
cands['sha256(S0hex_rev)'] = crypto.createHash('sha256').update(Buffer.from(S0, 'hex').reverse()).digest('hex');
cands['sha256(S0utf8+0x00)'] = sha256(S0 + '\u0000');
cands['sha256(S0utf8+0x0a)'] = sha256(S0 + '\n');
cands['sha256(S0utf8+0x01)'] = sha256(S0 + '\u0001');
cands['sha256(H0hex)'] = crypto.createHash('sha256').update(Buffer.from(H0, 'hex')).digest('hex');
cands['sha256(H0hex_rev)'] = crypto.createHash('sha256').update(Buffer.from(H0, 'hex').reverse()).digest('hex');
cands['sha256(H0+S0)'] = sha256(H0 + S0);
cands['sha256(S0+H0)'] = sha256(S0 + H0);
cands['hmac(S0,H0)'] = crypto.createHmac('sha256', S0).update(H0).digest('hex');
cands['hmac(H0,S0)'] = crypto.createHmac('sha256', H0).update(S0).digest('hex');
cands['hmac(S0bin,H0hex)'] = crypto.createHmac('sha256', Buffer.from(S0, 'hex')).update(Buffer.from(H0, 'hex')).digest('hex');
let hits = 0;
for (const [k, v] of Object.entries(cands)) if (v === H1) { console.log('>>> DERIVATION HIT for H1:', k); hits++; }
console.log('H1 derivation hits:', hits, ' (candidates tested:', Object.keys(cands).length + ')');
