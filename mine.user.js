// ==UserScript==
// @name         DonutGlint Mines Honest Win
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Reveal tiles until the ladder reaches 7x, then cashout (honest flow)
// @match        https://donutglint.com/*
// @grant        none
// ==/UserScript==

(async () => {
  const AMOUNT = 10000, MINES = 3, TARGET_MULT = 7;
  try {
    const api = async (u, b) => {
      const r = await window.fetch("https://donutglint.com/api/games/mines/" + u, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b || {}),
        credentials: "include"
      });
      return r.json();
    };
    const round = await api("start", { amount: AMOUNT, mines: MINES, grid: 25 });
    for (let tile = 0; tile < 25; tile++) {
      const r = await api("reveal", { tile });
      console.log("[mines] reveal", tile, r.outcome, "mult", r.multiplier);
      if (r.outcome === "mine") { console.log("[mines] busted"); return; }
      if (r.multiplier >= TARGET_MULT) {
        const w = await api("cashout", {});
        console.log("[mines] WIN payout:", w.payout);
        return;
      }
    }
  } catch (e) {
    console.error("[mines] error:", e);
  }
})();
