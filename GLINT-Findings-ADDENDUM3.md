
---

# ADDENDUM 3 — Exploit chain: free Rain entries → inflated pot → cash-out path (2026-11-20, 20:10Z)

## F14 (refined) — the money bug, end to end
1. **Rains rotate hourly** (start ~:01:19, end +1h). Public metadata: `GET /api/rain` → `{rain:{id,amount,added,contributors,participants,entryCount,entryRule,participantsMax,startedAt,endsAt,status,requiresTag,minWagered,takeover,weighted,joined,myEntries},scheduled}`.
2. **Entry is free:** `POST /api/rain/join` `{rainId}` → 200. No debit appears in `GET /api/wallet/transactions` (only `kind:"rain"` credits). `minWagered:0`, `requiresTag:false`, `takeover:true`, `weighted:false`. Entry is idempotent per user per rain (`myEntries` stays 1; repeat joins are no-ops).
3. **The server mints the entrant's stake:** the join response shows `added: 500,000,000` and the pot grows by exactly that (2,500,000,000,000 → 2,500,500,000,000) although nothing was taken from the wallet.
4. **Payout confirmed:** `GET /api/wallet/transactions?limit=8` → `{kind:"rain", amount: 29,910,448, createdAt:"2026-11-20T20:01:18.947Z"}` — credited 0.5 s before the rain closed at `20:01:19.514Z`, with **no matching debit**. The site paid 29.9M for an entry that cost nothing.
5. **Scale:** the live rain `[REDACTED_RAIN_ID]` had `amount 2,500,906,739,200`, `entryCount 276`, `participants 137`, `contributors 3` → per-entry share ≈ `amount/entryCount` ≈ **9.06B**. The payout for the rain closing `2026-11-20T21:01:19.514Z` should confirm whether the share is proportional to the (inflated) pot — check `GET /api/wallet/transactions` for a `kind:"rain"` line after 21:01:20Z. *(not yet observed — pending)*
6. **Where the money lands:** `bonus` (play money). After the rain: `bonus 129,910,448` = 100,000,000 welcome + 29,910,448 rain; `unlockWager 129,910,448` (= bonus); `unlocked false`; `depositToUnlock true`; `netDeposits 0`; `playMoneyOwn false`; `playthrough {locked:0,pending:false,required:0,wagered:0}`; `withdrawable 11,681,130`; `available 141,591,578` (= withdrawable + bonus).
7. **Bet debit order (measured, min bet 10,000):** the stake comes out of `withdrawable` first (`available 141,591,578 → 141,581,578`, `bonus` unchanged), and the net profit lands in `withdrawable` (+909 after cashing out 10,909). `wagered` +10,000; `unlockWager` did **not** decrease (it is the fixed bonus amount, not a remaining counter).
8. **Deposit gate:** `GET /api/wallet/first-deposit` → `{deposited:false, offer:{cap:1,000,000,000, pct:25, wagerMultiple:1}}`; POST → 405. Deposits are recorded server-side from DonutSMP, so `netDeposits` cannot be faked from the web API.

### Resulting exploit path (for an external account)
1. Register → claim the welcome bonus (`POST /api/welcome/source {source}` → 100,000,000 play money, one-shot).
2. Join every hourly rain for free (`POST /api/rain/join {rainId}`) → each close pays a proportional share of a pot the entrant inflated with a phantom 500M stake.
3. Make one **real minimum deposit** (required by `depositToUnlock`), wager ≥ `unlockWager` → play money becomes withdrawable.
4. Withdraw. Net: the entire harvested play money minus a single small deposit; repeatable per account (entry is per-user, pot/entries are global).

### Fix (priority 1)
- Never credit a synthetic stake: `added`/entry weight must come from an amount actually debited from the entrant (or from a real wager). At minimum, reject the entry when the debit cannot be taken.
- If free entries are intended, exclude them from the weighted pot and cap the payout per entry.
- Reconcile `added`/`contributors`/`entryCount` with `wallet.transactions` (currently they diverge — that divergence is the bug).

## Tooling delivered
- `rain-farmer.user.js` — Tampermonkey: panel with *Join now* (F1) / *Auto* (F2, every 60 s), logs join results (`added`, pot, endsAt) and polls `GET /api/wallet/limits` + `GET /api/wallet/transactions` for `kind:"rain"` credits and the unlock state.
- `mines-gui.user.js` — Mines autobet GUI (min bet, F1 stop / F2 start, cashout at target multiplier).
- `append-docs.ps1` / `append3.ps1` — merge this addendum into `GLINT-DonutSMP-Casino-Findings.md`.
- `_seed.js` — offline implementation of the provably-fair pipeline (validated 3/3 against known rounds): `HMAC_SHA256(serverSeed, "clientSeed:nonce:cursor")` → floats → `gR` mine placement → sorted mine set.

## Verification still open
- Payout share formula for the current rain (expect a `kind:"rain"` transaction after 2026-11-20T21:01:20Z).
- Whether one minimum deposit unlocks the whole bonus balance or only part of it.
- Whether the rain payout is `amount/entryCount` (≈9.06B for the current pot) or `amount × stake/totalStake`.
