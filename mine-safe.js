// glint.com — MINE SAFE WINNER (fairness pipeline from /fairness page)
// Pipeline: float = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`) → b0/256+b1/256²+b2/256³+b3/256⁴
// cursor += 8 every 8 floats. 3 mines by Fisher–Yates over 25 tiles.
// YOU need the ACTIVE round's serverSeed during the round.
const AMOUNT = 10000, MINES = 3;
const seed = "__SERVER_SEED_FROM_ROUND__", clientSeed = "glint-seed-userset-anytime";
let nonce = 0, cursor = 0;
const enc = new TextEncoder();
async function oneFloat() {
  if (cursor % 8 === 0 || _floats.length === 0) {
    _floats = await mkFloats();
  }
  return _floats.shift();
}
let _floats = [];
async function mkFloats() {
  const key = await crypto.subtle.importKey("raw", enc.encode(seed), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${clientSeed}:${nonce}:${cursor}`)));
  const n = 8; const out = [];
  for (let i = 0; i < n; i++) out.push((mac[i*4]/256 + mac[i*4+1]/65536 + mac[i*4+2]/16777216 + mac[i*4+3]/4294967296) % 1);
  return out;
}
async function predictSafeTiles() {
  _floats = [];
  const board = []; for (let i = 0; i < 25; i++) board.push(i);
  const mine = new Set();
  for (let i = board.length - 1; i > 0; i--) { const j = Math.floor(await oneFloat() * (i + 1)); [board[i], board[j]] = [board[j], board[i]]; }
  for (let i = 0; i < MINES; i++) mine.add(board[i]);
  const safe = [];
  for (let t = 0; t < 25; t++) if (!mine.has(t)) safe.push(t);
  return safe;
}
async function api(u, b) { const r = await fetch("https://donutglint.com/api/games/mines/" + u, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(b || {}), credentials: "include"}); return r.json(); }
(async () => {
  const round = await api("start", {amount: AMOUNT, mines: MINES, grid: 25});
  nonce = round.state ? round.state.nonce : 0;
  const safe = await predictSafeTiles();
  console.log("predicted safe tiles:", safe.join(","));
  for (const t of safe) {
    const r = await api("reveal", {tile: t});
    console.log("reveal", t, r.outcome, r.multiplier);
    if (r.multiplier >= 7) { const w = await api("cashout", {}); console.log("WIN:", w.payout); return; }
  }
  console.log("done");
})();
