# GLINT — Findings Addendum 10 (2026-11-21)

> Companion to `GLINT-DonutSMP-Casino-Findings.md`. Covers the **cents-unit correction**, the **Discord webhook delivery bugs**, and the **daily/weekly/monthly/case bonus auto-claim**.

---

## ⚠ CRITICAL CORRECTION — every monetary value returned by the GLINT API is in **CENTS**

All raw numbers below are API units; divide by 100 for USD. The site's own copy confirms it:

| Raw API value | Correct USD | Site copy / proof |
|---|---:|---|
| `1_749_779` available | $17,497.79 | server: *"You can vault up to $17,497 right now."* |
| `10_000` minimum bet | $100 | server: *"Minimum bet is $100."* |
| `100_000_000` welcome grant | $1,000,000 | *"a $1M welcome bonus"* |
| `500_000_000` Discord-tag reward | $5,000,000 | 30-minute tag reward |
| `2_502_532_494_750` rain pot | $25.03B | banner: *"$25B rain started"* |
| `3_078_145_750` rain payout | $30,781,457.50 | tx `{kind:'rain', note:'Rain share'}` |
| `29_910_448` previous-hour rain payout | $299,104.48 | same formula, bigger entry count |
| `4_000_000_000` referral pool | $40,000,000 | *"Invite a friend: $40M per friend"* |
| `5_000_000` withdrawal floor | $50,000 | *"Minimum withdrawal is $50,000."* — **message is correct** |
| `195_000_000_000` daily-race pool | $1.95B (top $1B) | daily leaderboard |
| `46_117` daily reward | $461.17 | rewards panel |
| `95_794_741` rakeback claim | $957,947.41 | rewards panel |
| `1_500_000` upgrader item value | $15,000 | upgrader catalog |
| `20_593_077_083` account available | $205,930,770.83 | wallet API |

### Findings that change because of this

- **F14 / F19 (rain)** — formula unchanged (`floor(pot_cents / entryCount)` cents, paid per entry, no debit on join) but the magnitudes are: this hour's payout **$30.78M** (not $3.078B), the previous hour **$299.1K** (not $29.9M), the pot **$25B** (not $2.5B).
- **F16 (Discord tag)** — **$5,000,000 per 30 minutes** (not $500M). Still the highest-value no-wager path; requires the `GLNT` Discord server tag.
- **F10 / F17 (welcome)** — **$1,000,000** (not $100M), once per account, play money until a real deposit + wager unlock.
- **F21 (withdraw unlock)** — thresholds are cents; only `netDeposits > 0` blocks the unlock (plus the 2% `payTaxBps` tax).
- **F23 / F33 (daily race)** — pool **$1.95B**, top prize **$1B**; account `wageredTotal` ≈ `3,590,000,000` cents = **$35.9M** vs. #1 `5,937,974,122,000` cents = **$59.38B** → still far out of reach (not in the top 50).
- **F39 (withdrawal)** — floor is **$50,000** and the error message is **correct** (my earlier "the message is 100× wrong" conclusion is retracted; it was the unit confusion). The race is still blocked: the second parallel request → `409 "You already have a withdrawal approved and waiting for the bot, and only one can run at a time."`
- **F22 (rewards)** — daily $461.17, weekly $5,817.00, case $50,000–$500,000, rakeback 3.5% at Iron.
- **F36 (upgrader)** — stake $100, item value $15,000, max win 960× = $1.44M; EV −4%.
- Every earlier "$" figure in the main document and addenda 1–9 that was copied raw from an API response is **100× too high**. The structural findings (races, leaks, validation, one-in-flight guards) are unaffected.

---

## F42 — Discord webhook delivery: three real bugs (found by live probing, now fixed)

1. **`fetch(url, {mode:'no-cors'})` silently drops the `Content-Type: application/json` header.** Proof from the local echo server: the no-cors request and `sendBeacon` arrived as `contentType: "text/plain;charset=UTF-8"` → Discord gets a non-JSON body and rejects it, so the old fallback could *never* deliver. The same call in CORS mode returned `200` with the created message JSON.
   **Fix:** one CORS `fetch(url + '?wait=true', {method:'POST', body:payload, credentials:'omit'})`; the only fallback left is `sendBeacon` with a `Blob` typed `application/json`.
2. **`JSON.parse(r.text())`** — `r.text()` is a Promise, so the created message id/channel never reached the log (it silently threw inside the promise chain).
   **Fix:** `r.text().then(txt => …)` with `JSON.parse` inside.
3. **Dual-posting to `ptb.discord.com` + `discord.com` mirrored every event twice** (same channel id, different message ids — separate Discord databases). **Fix:** one post to the configured URL.
4. Bonus: the **"Use default webhook"** button referenced a non-existent `DEFAULT` object → `ReferenceError` inside the click handler → silent no-op. Now the literal default URL is written back to `S.webhook` + `localStorage`.

**Host note:** `ptb.discord.com`, `discord.com` and `canary.discord.com` all accept the POST and return `200` with a channel id; message ids differ per host (separate DBs). Use one host only.

---

## F43 — Daily / weekly / monthly / case bonus auto-claim (new feature)

- **Endpoints:** `GET /api/rewards` → `{daily, weekly, monthly, case, rakeback, …}`; `POST /api/rewards/claim {kind:'daily'|'weekly'|'monthly'|'case'|'rakeback'|'level'}`.
- **Live state (2026-11-21):** `daily` $1,110 (next `2026-11-21T18:42:31Z`) → `409 "Your daily bonus is ready in 19h 27m."`; `weekly` $309,500 (next in 6d 21h) → `409 "Your weekly bonus is ready in 6d 21h."`. Both bonuses are real, simply **not due yet** — the auto-claim fires the moment `claimable === true`.
- **Userscript:** new **Bonuses** section (daily/weekly amount + next time, auto-claim checkboxes, *Claim now* buttons), `Ctrl+Shift+6` = daily, `Ctrl+Shift+7` = weekly, 60 s poll, per-kind 409 throttling (the old single shared timestamp swallowed the second message when two bonuses were clicked together).
- **Headless claimer:** `cfg.autoDaily/autoWeekly/autoMonthly/autoCase`, `bonusPollMs 60000`, `checkBonuses(force, onlyKind)`, per-kind counters, webhook line per claim.

---

## Live verification (2026-11-21, authenticated tab on `/dice`, redacted test account, level 14 Iron)

- **Browser → Discord delivery proven:** `webhook sent (200) id=[REDACTED_MESSAGE_ID] channel=[REDACTED_CHANNEL_ID]` plus five further `200`s; the user's channel now receives the helper's own messages. The previously installed script used the no-cors path and could never deliver — **reinstall the patched file**.
- **Rain auto-join:** `new rain 3b1696d6 pot=$100.31M entries=90` → `joined rain 3b1696d6`.
- **Rakeback auto-claim:** `$28`, then `$14`, then `$14` — all delivered to the webhook (`💰 +$14  reward (Rakeback · 3.5%)`).
- **Session summary:** `📊 GLINT session $-19,958` (cents-correct).
- **Wallet display:** `$28.25M ($28,252,089)` — the panel shows the raw cents value in parentheses on purpose.
- **Headless claimer against the live site** (code evaluated in the page, cookie/bridge stubbed): auth `200`, rain join `200`, **rakeback claimed `95,794,741` cents = $957,947.41**, webhook line `✅ Rakeback claimed: $957,947.41`.
- **Cookie:** `glint.did` is `HttpOnly` → page JS cannot read it. Either copy it from DevTools into `glint-cookie.txt`, export `GLINT_COOKIE`, or let the Tampermonkey exporter (`GM_cookie`) POST it to `http://127.0.0.1:8787/cookie`.

---

## Files in the repository root

| File | Purpose |
|---|---|
| `glint-helper.user.js` | Tampermonkey GUI: rain auto-join, Discord-tag claim, rakeback, daily/weekly/monthly/case bonus claims, P/L tracker, Discord webhook |
| `glint-claimer.js` | Headless Node claimer (no browser page needed), same feature set + local cookie-injection bridge on `127.0.0.1:8787` |
| `glint-claimer.config.json` | Config template (cookie, webhook URL, toggles) |
| `glint-claimer.mocktest.js` | Offline harness — 12/12 checks green |
| `start-glint-claimer.bat` | Launcher for the headless claimer (Task-Scheduler friendly, `--once`) |
| `glint-cookie-export.user.js` | Tampermonkey bridge that reads the HttpOnly cookie via `GM_cookie` and pushes it to the local bridge |
| `glint-test-server.js` | Local harness (serves the userscript, records webhook payloads) |
| `patch-bonus.ps1`, `patch-claimer.js` | The patch scripts applied for the bonus features |
| `verify-duel.js`, `_seed.js` | Offline fairness/board verification (F35, F9) |
| `GLINT-DonutSMP-Casino-Findings.md` | Main document (F1–F43) |
