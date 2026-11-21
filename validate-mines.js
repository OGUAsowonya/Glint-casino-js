// Validate GLINT mines predictor against known dataset (offline, Node)
const crypto = require("crypto");
const S0 = "3110b4f809cf1310ffd28c1bf13bfd9c4a8f34b0a0aea661e44e8f2c379b9a06";
const CLIENT = "f88591c30de27512cabc";

function floatGen(seed) {
  let e = 0;
  return function* () {
    for (;;) {
      const msg = `${seed.clientSeed}:${seed.nonce}:${e}`;
      const mac = crypto.createHmac("sha256", Buffer.from(seed.serverSeed, "utf8")).update(Buffer.from(msg, "utf8")).digest();
      for (let t = 0; t < 32; t += 4) yield mac[t] / 256 + mac[t + 1] / 65536 + mac[t + 2] / 0x1000000 + mac[t + 3] / 0x100000000;
      e++;
    }
  };
}
function gR(seed, grid, mines) {
  const n = Array.from({ length: grid }, (_, i) => i);
  const l = floatGen(seed); const out = [];
  for (let t = 0; t < mines; t++) { const r = grid - t; const u = Math.floor(l.next().value * r); out.push(n[u]); n[u] = n[r - 1]; }
  return out;
}
const dataset = { 711: [2, 3, 16], 712: [10, 16, 22], 713: [11, 19, 24] };
for (const [nonce, expect] of Object.entries(dataset)) {
  const got = gR({ serverSeed: S0, clientSeed: CLIENT, nonce: Number(nonce) }, 25, 3).sort((a, b) => a - b);
  console.log("nonce", nonce, "expect", JSON.stringify(expect), "got", JSON.stringify(got), JSON.stringify(got) === JSON.stringify(expect) ? "MATCH" : "MISMATCH");
}
