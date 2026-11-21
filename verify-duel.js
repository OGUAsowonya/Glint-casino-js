const crypto = require('crypto');
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();

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
function gR(seed, cs, nonce, grid, mines, f) {
  const n = Array.from({ length: grid }, (_, i) => i);
  const fl = f(seed, cs, nonce, mines);
  const o = [];
  for (let t = 0; t < mines; t++) { const r = grid - t; const u = Math.floor(fl[t] * r); o.push(n[u]); n[u] = n[r - 1]; }
  return o;
}

const duels = [
  { id: 'd1', seed: '982ed34291712c89e1c7d8457dfc7c9d80aefe90b680c1551a8869a4feb89f92', hash: '115bfc4085dda1ff4e5d520293758f550fcd271fd75abd5bd85ed72beeb68ae0', cs: '00000000-0000-4000-8000-000000000000:house:a1b2c3d4e5f6071829304a5b6c7d8e9f', board: [14, 19, 21], first: 0, picks: [[0, 5], [1, 14], [0, 18], [1, 21]] },
  { id: 'd2', seed: '99d3f0ad5f3c1eda6a6f3bf5de226bfc2b9717d57e63ebaa80d830c0c6e2fcfa', hash: '3fbc459af39e16e299d55fdb060a88a42245c540388279b07125d314343e46eb', cs: '00000000-0000-4000-8000-000000000000:house:b7c8d9e0f1a2b3c4d5e6f708192a3b4', board: [0, 9, 23], first: 1, picks: [[1, 1]] },
  { id: 'd3', seed: '4f5fea3cfdb7e19767542e2946f68cdcfd7fa4e15d566e3ee4f28f3838dbd727', hash: '07cfa357fa835ebe351d0c39b86d7412794116ed0f7790f8ad6c967ccc724ea6', cs: '00000000-0000-4000-8000-000000000000:house:c3d4e5f60718293a4b5c6d7e8f90a1b2', board: [14, 23, 24], first: 1, picks: [[1, 11], [0, 10], [1, 21], [0, 18], [1, 0], [0, 14], [1, 23]] },
];

for (const d of duels) {
  const hashOK = sha256(d.seed) === d.hash;
  let boardHit = null, firstHit = null;
  for (const [fname, f] of [['A', floatsA], ['B', floatsB]]) {
    for (const nonce of [0, 1, 2, 3]) {
      const b = gR(d.seed, d.cs, nonce, 25, 3, f).sort((x, y) => x - y);
      if (b.join() === d.board.join()) boardHit = `${fname}/nonce${nonce}`;
      for (const fn of [0, 1]) {
        const fl = f(d.seed, d.cs, fn, 1)[0];
        const first = fl < 0.5 ? 0 : 1;
        if (first === d.first) firstHit = `${fname}/fnNonce${fn}/fl=${fl.toFixed(6)}`;
      }
    }
  }
  console.log(d.id, 'sha256(seed)==hash:', hashOK, '| boardMatch:', boardHit, '| firstMatch:', firstHit, '| expected board', JSON.stringify(d.board), 'first', d.first);
}

// Does the board depend on clientSeed at all? Recompute board with a DIFFERENT clientSeed to see if only serverSeed matters.
const d1 = duels[0];
const alt = gR(d1.seed, '00000000-0000-4000-8000-000000000000:house:ffffffffffffffffffffffffffffffff', 0, 25, 3, floatsA).sort((a, b) => a - b);
console.log('d1 board with different clientSeed:', JSON.stringify(alt), '(if different -> clientSeed matters)');

// Is the serverSeed derivable from clientSeed / entropy?
for (const d of duels) {
  const ent = d.cs.split(':').pop();
  const cands = {
    'sha256(cs)': sha256(d.cs),
    'sha256(ent)': sha256(ent),
    'sha256(enthex)': sha256(Buffer.from(ent, 'hex')),
    'sha256(cs+ent)': sha256(d.cs + ent),
    'sha256(ent+cs)': sha256(ent + d.cs),
    'hmac(cs,ent)': crypto.createHmac('sha256', d.cs).update(ent).digest('hex'),
    'hmac(ent,cs)': crypto.createHmac('sha256', ent).update(d.cs).digest('hex'),
    'hmac(enthex,cs)': crypto.createHmac('sha256', Buffer.from(ent, 'hex')).update(d.cs).digest('hex'),
  };
  for (const [k, v] of Object.entries(cands)) if (v === d.seed) console.log('>>> SEED DERIVATION HIT', d.id, k);
}
console.log('derivation scan done (no HIT lines = not derivable by simple constructions)');

// Distribution sanity: simulate 200k boards to check mine-position uniformity (index 0 should appear ~3/25 of the time)
let counts = new Array(25).fill(0);
let s = 'seed';
for (let k = 0; k < 20000; k++) {
  s = sha256(s + k);
  const b = gR(s, 'cs', 0, 25, 3, floatsA);
  for (const t of b) counts[t]++;
}
const exp = 20000 * 3 / 25;
console.log('mine index counts (20000 boards, expected ' + exp.toFixed(0) + ' each):', counts.join(','));
console.log('max deviation:', Math.max(...counts.map(c => Math.abs(c - exp))).toFixed(1));
