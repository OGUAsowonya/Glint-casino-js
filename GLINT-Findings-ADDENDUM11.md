# GLINT Findings — Addendum 11 (2026-11-21)

## F44 — Discord webhook: ONE message per 30 s, claims only (the spam is gone)

### Before
* `glint-helper.user.js` had `T.flush = 5000`; `flushEvents()` posted **every** queued bet/payout
  batch (mode `flush`) → a message every ~5 s while the dice autobet ran.
* `glint-claimer.js` posted **one message per balance delta** (`checkWallet()` → `webhook(...)`).
* Both also posted immediately on every claim → duplicates + noise.

### After (both scripts patched, `node --check` clean)
* `T.flush = 30000`, `cfg.claimFlushMs = 30000`.
* Two queues in the helper:
  * `S.activity` — bets/payouts. Tracked for the session P/L, **never posted on its own**.
  * `S.claims` — money that was actually credited. **Only this queue is posted.**
* `pushEvent()` → activity, new `pushClaim(amount, label, text)` → claims.
* Claim sources: rain entry (join), Discord server-tag claim, daily/weekly/monthly/case bonus,
  rakeback claim, `kind:'rain'` payout tx, `kind:'reward'` credit tx.
* `flushEvents()` → **at most one message per 30 s window and only when `S.claims` is non-empty**;
  claims are grouped per label (`✅ Rakeback claimed: $1,235  x3`); the message carries the session
  P/L and the balance. Modes:
  * `flush` — one message per 30 s when something was claimed (default)
  * `profit` — only when the session P/L went up
  * `loss` — only when the session P/L went down
  * `summary` — 10-min summaries only (`gh-summary-on` toggles the periodic summary)
* `glint-claimer.js`: `queueClaim()` + `flushClaims()` (30 s window, same modes), the per-delta
  webhook posts are gone, and `--once` flushes the queue before exiting.

### Message format
```
🎯 GLINT claims · session +$2,551
🌧 rain entry · pot $100.31M · 191 entries · mine 2
✅ Rakeback claimed: $12
✅ Discord server-tag reward claimed: $5,000,000
🌧 rain payout credited: $30.78M
balance $4.04M  |  3 claim(s)
```

### Live verification (2026-11-21 23:41–23:42 UTC, donutglint.com/dice, patched file injected)
```
[ok] [23:41:49] GUI ready - rain ON, tag ON, rakeback ON
[ok] [23:41:50] helper started on /dice
[ok] [23:41:50] new rain 3b1696d6 pot=$100.31M entries=191 ends=2026-11-21T00:01:26.753Z
[ok] [23:41:50] tracker started - balance $4.04M
[ok] [23:41:50] joined rain 3b1696d6 (added=$306.3K, myEntries=2)
[ok] [23:41:50] rakeback claimed: $8
[ok] [23:42:20] rakeback claimed: $12
[ok] [23:42:20] webhook sent (200) id=[REDACTED_MESSAGE_ID] channel=[REDACTED_CHANNEL_ID] -> 🎯 GLINT claims · session +$2,551
```
Exactly **one** Discord message in the 30 s window (containing the rain entry + both rakeback
claims) while the dice autobet kept changing the balance — no per-bet stream.
Panel counter `claims queued` showed `2` → `1` as the window consumed them.

### Offline test
`node glint-claimer.mocktest.js` → **ALL CHECKS PASSED** with the new payload:
`🎯 GLINT claims · session +$0\n✅ Discord server-tag reward claimed: $5,000,000\n✅ Rakeback claimed: $1,235`

### Operator warning
The `session ±$X` in the message is the balance delta since the helper started. During this test
the account fell from **$205M to $4.04M** because the dice autobet kept grinding against a 4 %
house edge. The positive paths remain: the Discord server tag ($5M real / 30 min), the hourly
equal-share rain, the referral bounty and the daily/weekly/case bonuses — not dice.

### Files
| file | role |
|---|---|
| `glint-helper.user.js` (38,355 B) | **Tampermonkey script** — GUI + auto rain/tag/bonus/rakeback + 30 s claim webhook |
| `glint-claimer.js` (22,532 B) | headless Node claimer (same features, no browser page) |
| `start-glint-claimer.bat` | launcher for the headless variant |
| `glint-cookie-export.user.js` | exports the HttpOnly `glint.did` cookie to the local bridge |
| `glint-claimer.mocktest.js` | offline harness (12 checks) |
| `patch-webhook.ps1` / `patch-webhook2.ps1` | the patches applied in this round |
