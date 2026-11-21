// ==UserScript==
// @name         DonutGlint Mines Safe Win
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Predict safe mines tiles via the site fairness HMAC, reveal only safe tiles, cashout
// @match        https://donutglint.com/*
// @grant        none
// ==/UserScript==

(async () => {
  const AMOUNT = 10000, MINES = 3, TARGET_MULT = 7;
  let seed = window.prompt("Server seed (from /fairness round page, or start round seed):");
  if (!seed) { console.log("no seed, abort"); return; }
  const enc = new TextEncoder();

  const api = async (u, b) => {
    const r = await window.fetch("https://donutglint.com/api/games/mines/" + u, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b || {}),
      credentials: "include"
    });
    return r.json();
  };

  let key;
  async function mkFloats(nonce, cursor) {
    const cryptoObj = window.crypto || window.msCrypto;
    key = await cryptoObj.subtle.importKey("raw", enc.encode(seed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await cryptoObj.subtle.sign("HMAC", key, enc.encode(`${clientSeed}:${nonce}:${cursor}`)));
    const out = [];
    for (let i = 0; i < 8; i++) out.push((mac[i*4]/256 + mac[i*4+1]/65536 + mac[i*4+2]/16777216 + mac[i*4+3]/4294967296) % 1);
    return out;
  }
  const clientSeed = "seed-anytime-or-hash-from-fairness-page";
  let cursor = 0, floats = [];
  async function oneFloat() {
    if (floats.length === 0) {
      floats = await mkFloats(0, cursor);
      cursor += 8;
    }
    return floats.shift();
  }
  async function predictSafeTiles() {
    floats = []; cursor = 0;
    const board = []; for (let i = 0; i < 25; i++) board.push(i);
    const mine = new Set();
    for (let i = board.length - 1; i > 0; i--) {
      const j = Math.floor(await oneFloat() * (i + 1));
      const t = board[i]; board[i] = board[j]; board[j] = t;
    }
    for (let i = 0; i < MINES; i++) mine.add(board[i]);
    const safe = [];
    for (let t = 0; t < 25; t++) if (!mine.has(t)) safe.push(t);
    return safe;
  }

  try {
    const round = await api("start", { amount: AMOUNT, mines: MINES, grid: 25 });
    const safe = await predictSafeTiles();
    console.log("[mines-safe] predicted safe tiles:", safe.join(","));
    for (const t of safe) {
      const r = await api("reveal", { tile: t });
      console.log("[mines-safe] reveal", t, r.outcome, "mult", r.multiplier);
      if (r.outcome === "mine") { console.log("[mines-safe] BUSTED"); return; }
      if (r.multiplier >= TARGET_MULT) {
        const w = await api("cashout", {});
        console.log("[mines-safe] WIN payout:", w.payout);
        return;
      }
    }
    console.log("[mines-safe] safe tiles done without hitting target — more runs");
  } catch (e) {
    console.error("[mines-safe] error:", e);
    console.log("[mines-safe] 2nd approach: use mine.user.js (honest flow, no seed)");
  }
})();
