// Honest Mines win flow — browser console, logged in with a valid glint.did cookie
// API: POST /api/games/mines/start {amount, mines, grid:25} -> round
//      POST /api/games/mines/reveal {tile}  -> {outcome:"mine"|"safe", multiplier, round}
//      POST /api/games/mines/cashout {}     -> wallet (takes current win)
const AMOUNT = 10000, MINES = 3, TARGET_MULT = 7;
async function api(u, b) { const r = await fetch("https://donutglint.com/api/games/mines/" + u, {method:"POST",headers:{"Content-Type":"application/json"},body: JSON.stringify(b||{}),credentials:"include"}); return r.json(); }
(async () => {
  const round = await api("start", {amount: AMOUNT, mines: MINES, grid: 25});
  for (let tile = 0; tile < 25; tile++) {
    const r = await api("reveal", {tile});
    if (r.outcome === "mine") { console.log("busted"); return; }
    console.log("reveal", tile, r.multiplier);
    if (r.multiplier >= TARGET_MULT) break;
  }
  const w = await api("cashout", {});
  console.log("win:", w.payout, "balance:", w.wallet.balance);
})();
