
---

# ADDENDUM 2 — The money bug: free Rain entries paid out 29.9M (2026-11-20)

## F14 — `POST /api/rain/join` is free but credits the pot with a 500,000,000 stake → free payouts
- Endpoint: `POST /api/rain/join` `{rainId}` (the field is `rainId`; sending `id` → 422 `Invalid input: expected string, received undefined`). `POST /api/rain/{id}/join` → 404.
- Rain object (from `GET /api/rain` → `{rain, scheduled}`):
  `{id, host, amount, added, contributors, participants, entryCount, entryRule, participantsMax, startedAt, endsAt, status, requiresTag, minWagered, takeover, weighted, joined, myEntries}`
- Live rain `[REDACTED_RAIN_ID]`: `amount 2,500,906,739,200`, `added 906,739,200`, `contributors 3`, `entryCount 276`, `participants 137`, `minWagered 0`, `requiresTag false`, `takeover true`, `weighted false`, `entryRule.ranks Coal→Obsidian = 1, Beacon = 2`, `entryRule.roles support 49 / mod null / admin 50 / owner 50`, `entryRule.tagBonus 1`, ends `2026-11-20T21:01:19.514Z` (rains rotate hourly at :01:19).
- **Joining is idempotent per user per rain** (`myEntries` stays 1; repeat joins return the same state, no new entry, no extra credit) → no entry spam.
- **Joining costs nothing.** `POST /api/rain/join` → 200 and the server credits the pot: first join returned `added: 500,000,000` (pot 2,500,000,000,000 → 2,500,500,000,000) while the wallet was **not debited** (`available`, `bonus`, `wagered` all unchanged; transaction log shows no rain debit, only `kind:"rain"` credits).
- **Payout confirmed:** `GET /api/wallet/transactions?limit=8` shows `{kind:"rain", amount: 29,910,448, createdAt:"2026-11-20T20:01:18.947Z"}` — i.e. the rain that ended at `20:01:19.514Z` paid out **29,910,448** to this account, credited 0.5 s before the rain closed, with **zero stake debited**.
- `minWagered: 0` and `requiresTag: false` → no wager or tag requirement to enter; the entry stake is invented by the server instead of taken from the entrant.
- **Impact: the house pays out ~29.9M per free hourly entry** (pot inflation with phantom stakes, payout to a participant who never paid). Repeatable every hour for as long as rains run.
- Where it lands: credited to `bonus` (play money): wallet after payout `available 141,591,578 / bonus 129,910,448 / withdrawable 11,681,130` → the 100M welcome + 29.91M rain sit in `bonus` and are **not** withdrawable yet (`playMoneyOwn:false`, `unlocked:false`, `depositToUnlock:true`, `playthrough.required:0`). The in-app rule ("It's in your balance as play money. Wager it once and it's yours to withdraw") plus `depositToUnlock:true` indicate the bonus needs (a) a wager and (b) a real deposit to become withdrawable.
- `GET /api/rain/{id}` → 404, `/api/rain/claim`, `/api/rain/{id}/claim`, `/api/rain/{id}/entries` → 404 → payout is automatic at `endsAt` (server-side cron), no client claim step.

### Reproduction
```http
POST /api/games/../rain/join   → actually: POST /api/rain/join
Accept: application/json
X-Requested-With: glint
Content-Type: application/json
{"rainId":"[REDACTED_RAIN_ID]"}
```
Wait for `endsAt` (top of the hour + 1:19) → observe `GET /api/wallet/transactions` entry `kind:"rain"` with no matching debit.

### Fix
- Debit the entrant's stake when the entry is created (or set `added` from the user's actual wagered amount), and never mint a fixed 500M stake server-side.
- Reject entries whose `minWagered` requirement is not met; if the entry is intentionally free, do not add it to the weighted pot.
- Make the payout proportional to *paid* stake, and make `added` a sum of actual contributions.
- Audit the rain scheduler for the same synthetic-stake path (takeover/host rains).

## Exploit-status summary
| candidate | status |
|---|---|
| Mines prediction via leaked seed | blocked — active `serverSeed` never exposed (`serverSeedHash` only); per-epoch seed means one leak would be total |
| Mines out-of-board tile farm | closed — `tile:25` → 422 `Invalid tile.` |
| Vault double-spend / concurrent "in" | closed — atomic, `wallet.version` optimistic concurrency |
| Welcome-bonus race | closed — exactly one grant of 100,000,000 across 5 parallel posts |
| Rakeback / case double-claim | closed — 1×200 + 409s; 429 rate limiter on `/api/rewards/claim` |
| Client-forgeable game outcome | none — every `api/games/*` outcome is server-computed |
| Lava/mine hazard pre-disclosure | not exploitable — disclosure is post-hoc (F6/F7) |
| Promo double-credit race | still open — needs a valid code; `Idempotency-Key` is never sent (F12) |
| Chat `/redeem` bypass of the GLNT-tag gate | still open — needs a valid code |
| **Free rain entry → 29.9M payout** | **CONFIRMED (F14)** — repeat hourly; currently paid as play money, so the remaining sub-step is the bonus→withdrawable conversion (wager + deposit) |
| Bonus→withdrawable conversion abuse | open — next endpoint to map (wallet chunk: withdraw/bonus/play-money endpoints) |

## Next steps to finish the chain
1. Map the wallet-side endpoints from the client bundle (`withdraw`, `bonus`, `playMoney`, `playthrough`, `depositToUnlock`) — find how `bonus` becomes `withdrawable` and whether the wager/deposit condition can be bypassed or satisfied cheaply.
2. Re-join every hourly rain (`POST /api/rain/join` with the current `rainId`) and log each `kind:"rain"` credit → quantify the hourly yield.
3. Test whether `minWagered:0` + free entry can be scaled with multiple accounts (rain entry is per-user; `entryCount` is global) — each account harvests ~29.9M per rain.
4. Verify the bonus wagering rule in-app (wager once → withdraw) on the 29.9M and check `withdrawable` delta.
