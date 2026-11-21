// ==UserScript==
// @name         donutglint mines gui
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Honest Mines autobet GUI + F1 stop / F2 start (headers/response-shape correct)
// @author       GLINT Tools Contributors
// @match        https://donutglint.com/*
// @grant        none
// ==/UserScript==

(() => {
  const BASE = "/api/games/mines";
  const H = {Accept: "application/json", "X-Requested-With": "glint", "Content-Type": "application/json"};
  let running = false, stop = false;
  const UI = {};

  async function api(path, body, method = "POST") {
    const r = await fetch(BASE + path, {
      method,
      headers: H,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store"
    });
    const txt = await r.text();
    let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
    if (!r.ok) {
      const err = (j && j.error) || {};
      throw new Error(err.message || err.code || (r.status + " " + txt.slice(0, 140)));
    }
    return j;
  }
  const multOf = (res) => {
    const rd = res && res.round;
    if (!rd) return 0;
    if (rd.state && typeof rd.state.multiplier === "number") return rd.state.multiplier;
    if (typeof rd.multiplier === "number") return rd.multiplier;
    return 0;
  };

  function setStatus(s) { if (UI.status) UI.status.textContent = s; }

  function addGUI() {
    if (document.getElementById("mines-gui-panel")) return;
    const d = document.createElement("div");
    d.id = "mines-gui-panel";
    d.style.cssText = "position:fixed;top:10px;right:10px;z-index:99999;background:#000d;color:#0f0;font:12px monospace;padding:10px;border-radius:8px;border:1px solid #555;box-shadow:0 0 18px #000c;";
    d.innerHTML = `<b>Mines autobet</b><br>
      <label>Amount <input id="mg-amount" value="10000" size="6"></label><br>
      <label>Mines <input id="mg-mines" type="range" min="1" max="24" value="3"> <span id="mg-mines-v">3</span></label><br>
      <label>Target x <input id="mg-target" value="7" size="3"></label><br>
      <button id="mg-start">Start</button> <button id="mg-stop">Stop</button>
      <div id="mg-status" style="margin-top:4px;white-space:pre"></div>`;
    document.body.appendChild(d);
    UI.amount = d.querySelector("#mg-amount");
    UI.mines = d.querySelector("#mg-mines");
    UI.minesV = d.querySelector("#mg-mines-v");
    UI.target = d.querySelector("#mg-target");
    UI.startBtn = d.querySelector("#mg-start");
    UI.stopBtn = d.querySelector("#mg-stop");
    UI.status = d.querySelector("#mg-status");
    UI.mines.oninput = () => { UI.minesV.textContent = UI.mines.value; };
    UI.startBtn.onclick = start;
    UI.stopBtn.onclick = () => { stop = true; setStatus("stopping..."); };
    window.addEventListener("keydown", (e) => {
      if (e.key === "F1") { if (running) { stop = true; setStatus("stopping..."); } }
      if (e.key === "F2") { e.preventDefault(); start(); }
    });
  }

  async function readActiveRound() {
    try {
      const r = await api("", undefined, "GET");
      if (r && r.round) setStatus("active round: mult=" + multOf(r) + " revealed=" + (r.round.state ? r.round.state.revealed.length : "?"));
      return r;
    } catch (e) { /* no active round */ return null; }
  }

  function start() {
    if (running) return;
    running = true; stop = false;
    setStatus("betting...");
    autobet().catch(e => setStatus("err: " + e.message)).finally(() => { running = false; });
  }

  async function autobet() {
    const amount = Number(UI.amount.value);
    const mines = Number(UI.mines.value);
    const target = Number(UI.target.value) || 7;
    let rounds = 0, wins = 0, spent = 0, earned = 0;
    while (!stop) {
      rounds++;
      let s;
      try {
        s = await api("/start", {amount: amount, mines: mines, grid: 25});
      } catch (e) { setStatus("start failed: " + e.message); break; }
      if (!s || !s.round) { setStatus("start: no round"); break; }
      let busted = false, done = false;
      for (let tile = 0; tile < 25 && !stop; tile++) {
        let r;
        try { r = await api("/reveal", {tile: tile}); }
        catch (e) { setStatus("reveal err: " + e.message); busted = true; break; }
        const out = r.outcome;
        if (out === "mine") { busted = true; break; }
        if (out === "cleared") {
          earned += (r.round && r.round.payout) || 0;
          wins++;
          setStatus("cleared all tiles! payout=" + ((r.round && r.round.payout) || 0));
          done = true;
          break;
        }
        const m = multOf(r);
        if (m >= target) {
          let c;
          try { c = await api("/cashout", {}); }
          catch (e) { setStatus("cashout err: " + e.message); break; }
          const p = (c && c.payout) || ((c && c.round && c.round.payout) || 0);
          earned += p; wins++;
          setStatus("WIN payout=" + p + " x" + m + " balance=" + ((c && c.wallet && c.wallet.balance) || "?"));
          done = true;
          break;
        }
      }
      if (busted) { spent += amount; setStatus("busted (round " + rounds + ") spent=" + spent + " won=" + earned); }
      else if (!done) { setStatus("stopped. rounds=" + rounds + " wins=" + wins + " spent=" + spent + " won=" + earned); }
      await new Promise(r => setTimeout(r, 250));
    }
    setStatus("done. rounds=" + rounds + " wins=" + wins + " spent=" + spent + " earned=" + earned);
  }

  const init = () => { if (document.body) { addGUI(); readActiveRound(); } else setTimeout(init, 200); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
