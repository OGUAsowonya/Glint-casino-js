// ==UserScript==
// @name         donutglint rain farmer (free-entry rain payout)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Joins EVERY hourly rain for free within seconds of rotation and logs the payout. F1 = join now, F2 = auto on/off, F3 = dump log.
// @author       GLINT Tools Contributors
// @match        https://donutglint.com/*
// @grant        none
// ==/UserScript==

(() => {
  const H = {Accept: "application/json", "X-Requested-With": "glint", "Content-Type": "application/json"};

  let auto = true;          // auto-join is ON by default: early entry = bigger equal share
  let lastRainId = null;    // rain we already joined
  let seenPayouts = new Set();
  let joined = new Set();

  async function api(path, body, method) {
    try {
      const r = await fetch(path, {
        method: method || (body ? "POST" : "GET"),
        headers: H,
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin",
        cache: "no-store"
      });
      let j = null;
      try { j = await r.json(); } catch (e) {}
      return {status: r.status, j};
    } catch (e) {
      return {status: 0, j: null, err: String(e)};
    }
  }

  function panel() {
    if (document.getElementById("rain-farmer")) return;
    const d = document.createElement("div");
    d.id = "rain-farmer";
    d.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:9999;background:#000e;color:#0ff;font:12px monospace;padding:8px;border:1px solid #0ff;border-radius:6px;max-width:520px;";
    d.innerHTML = "<b>Rain farmer v2</b> (F1 join, F2 auto, F3 dump)" +
      "<br><button id='rf-now'>Join now (F1)</button> <button id='rf-auto'>Auto (F2)</button> <button id='rf-dump'>Dump (F3)</button>" +
      "<div id='rf-log' style='white-space:pre-wrap;max-height:220px;overflow:auto'></div>";
    document.body.appendChild(d);
    d.querySelector("#rf-now").onclick = () => joinRain("manual", true);
    d.querySelector("#rf-auto").onclick = () => { auto = !auto; log("auto=" + auto); };
    d.querySelector("#rf-dump").onclick = () => dump();
    window.addEventListener("keydown", (e) => {
      if (e.key === "F1") { e.preventDefault(); joinRain("F1", true); }
      if (e.key === "F2") { e.preventDefault(); auto = !auto; log("auto=" + auto); }
      if (e.key === "F3") { e.preventDefault(); dump(); }
    });
  }

  let logText = "";
  function log(s) {
    logText = (new Date().toISOString().slice(11, 19) + " " + s + "\n" + logText).slice(0, 4000);
    const el = document.getElementById("rf-log");
    if (el) el.textContent = logText;
    console.log("[rain-farmer] " + s);
  }
  function dump() {
    log("---- log ----");
    console.log(logText);
  }

  // rain object lives either at j.rain or j itself
  function pickRain(j) {
    if (!j) return null;
    return j.rain || j;
  }

  async function joinRain(tag, force) {
    const r = await api("/api/rain", null, "GET");
    const rain = pickRain(r.j);
    if (!rain || !rain.id) { log(tag + ": no rain (" + r.status + ")"); return; }
    if (joined.has(rain.id) && !force) return;
    if (rain.myEntries > 0) { joined.add(rain.id); return; }

    const j = await api("/api/rain/join", {rainId: rain.id});
    const rn = pickRain(j.j);
    const ok = j.status === 200;
    if (ok) joined.add(rain.id);
    log(tag + ": join " + j.status +
        " id=" + (rn ? rn.id : "?") +
        " pot=" + (rn ? rn.amount : rain.amount) +
        " added=" + (rn ? rn.added : "?") +
        " entries=" + (rn ? rn.entryCount : rain.entryCount) +
        " myEntries=" + (rn ? rn.myEntries : "?") +
        (ok ? " -> FREE ENTRY LOCKED (no debit)" : " -> " + JSON.stringify(j.j).slice(0, 160)));
  }

  async function pollRain() {
    const r = await api("/api/rain", null, "GET");
    const rain = pickRain(r.j);
    if (!rain || !rain.id) return;
    if (rain.id !== lastRainId) {
      lastRainId = rain.id;
      log("NEW RAIN " + rain.id + " pot=" + rain.amount + " entries=" + rain.entryCount +
          " ends=" + rain.endsAt + " status=" + rain.status);
      if (auto) joinRain("auto", false);
    }
  }

  async function walletWatch() {
    const w = await api("/api/wallet/limits", null, "GET");
    const t = await api("/api/wallet/transactions?limit=12", null, "GET");
    const wj = (w.j && (w.j.wallet || w.j)) || {};
    const txs = ((t.j && (t.j.transactions || t.j.items)) || []);
    for (const x of txs) {
      if (x.kind === "rain") {
        const key = String(x.createdAt) + ":" + String(x.amount);
        if (!seenPayouts.has(key)) {
          seenPayouts.add(key);
          log("RAIN PAYOUT +" + x.amount + " @ " + x.createdAt + " (" + (x.note || "") + ")");
        }
      }
    }
    log("balance " + wj.available + " withdrawable " + wj.withdrawable + " bonus " + wj.bonus +
        " unlocked " + wj.unlocked + " depositToUnlock " + wj.depositToUnlock);
  }

  const init = () => { if (document.body) panel(); else setTimeout(init, 200); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  setInterval(pollRain, 4000);        // fast rotation detection -> join early
  setInterval(walletWatch, 15000);    // payout + balance watcher
  pollRain();
  walletWatch();
  log("armed (auto=" + auto + ") - join each new rain free, payout = floor(pot/entries)");
})();
