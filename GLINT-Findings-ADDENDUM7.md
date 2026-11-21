# GLINT — Addendum 7 (rain payout math, race correction, final game-route sweep)

Author: security audit of `https://donutglint.com/` (owner-authorized), account `[REDACTED_ACCOUNT]`.
Date: 2026-11-20, audit window ~19:30Z–21:03Z. All bets at the 10,000 minimum.

---

## F32 — Rain entries are FREE and pay out an EQUAL SHARE of the pot (verified with money)

**Verdict: WORKING MONEY BUG (economic exploit).** Not a race, not a mass-assignment — a design/accounting flaw. The site **mints** a rain entry for free and then pays the entrant a full equal share of the pot at close.

### Evidence

**1. Free entry, no debit.**
```
POST /api/rain/join   { "rainId": "<uuid>" }      -> 200
```
* Response contains `joined:true`, `myEntries:1`, and a full `rain` object.
* **No wallet debit.** Nothing appears in `GET /api/wallet/transactions` for the join (the payout appears later as `kind:"rain"`, `note:"Rain share"`, with no matching debit).
* `GET /api/rain` shows the public rules for the live rain:
  `minWagered: 0`, `requiresTag: false`, `takeover: false`, `weighted: false`, `entryRule.ranks` = Coal/Copper/Iron/Gold/Lapis/Redstone/Diamond/Emerald/Obsidian = 1, Beacon = 2.

**2. Payout formula confirmed (exact arithmetic).**
Rain `[REDACTED_RAIN_ID]`, closed `2026-11-20T21:01:19.514Z`:

| Quantity | Value |
|---|---|
| Pot at close (`rain.amount`) | 2,502,532,494,750 |
| `rain.entryCount` at close | 813 |
| Our payout tx | `{kind:"rain", amount:3078145750, note:"Rain share", status:"completed", createdAt:"2026-11-20T21:01:20.796Z"}` |
| Check | `floor(2,502,532,494,750 / 813) = 3,078,145,750` ✅ exact |

So **each entry receives `floor(rain.amount / rain.entryCount)`** — an equal split, *not* a stake-weighted split, and *not* capped by what the entrant actually contributed. A **zero-contribution** entry therefore receives exactly the same share as a funded one.

The previous hour proves the share scales with the pot: rain pot 2.5e12 with a much larger entry count paid **29,910,448** to the same account, i.e. `floor(pot/entryCount)` again.

**3. Where the money lands.**
* Unlocked account (`unlocked:true`, `depositToUnlock:false`): payout goes straight to **withdrawable** balance — i.e. **real, withdrawable money** (2% `payTaxBps`, 300 s withdrawal cooldown). Observed: `available 2,347,596,515 → 6,267,068,365` across the close, and `withdrawable === available` with `bonus: 0`.
* Fresh/unfunded account: the same payout lands in **`bonus` (play money)**, which then only needs the standard unlock conditions (one deposit + wagering) — see F21.

**4. Timing advantage — join EARLY.** Because the split is equal-per-entry and the house pot keeps growing with player contributions, **the first entries of the hour get the biggest slices** (the fresh rain opened at 21:01:23 with `amount:10000000000`, `added:0`, `entryCount:3`; by 21:02:14 it was 179 entries). Joining in the first seconds is worth far more than joining at the buzzer.

**5. Body fields are ignored (no stake inflation).**
`POST /api/rain/join {rainId, amount:1e9}` → the rain's `added` stayed **0**; the entry was created but contributed nothing. `stake`/`entry` variants behave the same. So the exploit is *free entry*, not forged stake — the pot is not robbed, but the house pays out an equal share to every entrant including free ones.

**6. Late-join race is blocked (tested).**
`POST /api/rain/join {rainId: "<previous rain>"}` at 21:02:18 → `409 invalid_action "This rain has ended."` No credit, no second entry. Idempotency per user per rain is enforced (`myEntries` stays 1 on re-join).

**7. House messaging bug.** `POST /api/rain/host` → `503 "Players can't start rains. The house rains $100M every hour."` but the actual fresh pot at 21:01:23 was **10,000,000,000 (10B)**, and the observed hourly pots were ~2.5T. The advertised amount, the real amount, and the payout per entry are three different numbers — the rain economy is undocumented and inconsistent with its own error text.

### Impact / fix
* **Impact:** any account can farm ~1 equal share of the hourly pot for free, and those shares are withdrawable real money once the account is unlocked. At the observed pot/entryCount this was **3,078,145,750 per hour per account**.
* **Fix:** an entry must cost something (`minWagered` > 0) **or** the payout must be proportional to the entrant's own contribution (`payout_i = pot × stake_i / Σstake`), with the remainder staying in the house. Never pay `pot/entries` to an entrant whose stake was 0. Audit the join path so `added` and the paid share derive from the same value. Reconcile the `$100M` copy with the real pot.

---

## F33 — CORRECTION to F23: the 100B daily race is NOT reachable for this account

The earlier note (F23) listed the daily race as a money path based on `GET /api/leaderboard/races`. The actual standings endpoint exists and shows the opposite:

```
GET /api/leaderboard?period=daily
{
  period:"daily", periodKey:"2026-11-20", endsAt:"2026-11-21T00:00:00.000Z",
  prizePool:195000000000,
  prizes:[100000000000,50000000000,25000000000,12500000000,7500000000],
  entries:[ 50 ],            // top 50 only
  me: [],                    // <-- our account is NOT in the top 50
  excluded:[...]
}
```
Top of the board by period wagering: #1 **5,937,974,122,000**, #2 3,914,374,962,855, #3 3,003,476,923,894, #4 1,655,062,082,200, #5 976,120,452,006, #6 971,980,754,300.

Our `wageredTotal` was ~3.59e9 — about **1,650× behind #1** and below #6 by ~270×, and `me` is empty. **The 100B top prize is not obtainable for the test account**; treat it as unreachable, not as a money path. (Also note the payouts are auto-paid: no `/api/leaderboard/.../claim` route exists — `/api/leaderboard/races/daily`, `/daily`, `/standings`, `/api/leaderboard/races/claim` all 404.)

**Fix for the product:** show the player's own rank/turnover (the server clearly computes it) so users can see whether a prize is reachable; a 195B pool that nobody can realistically contest is marketing noise.

---

## F34 — Final game-route sweep + mass-assignment dead ends (no new win)

Full route inventory confirmed by probing (the site exposes no client-forgeable outcome path):

| Game | Routes | Result |
|---|---|---|
| coinflip | `POST /api/games/coinflip {amount,side}` | server-decided; `state.result` + `secret.result` disclosed **after** settlement |
| plinko | `POST /api/games/plinko {amount,rows:16,risk}` | server-decided path + bucket |
| crash | `POST /api/games/crash/bet {amount}` | `409 "Betting is closed for this round."` when the window is shut |
| rps | `/start {amount,hand}`, `/call {hand}`, `/cashout` | house pick is returned **after** our pick was submitted (start response showed `call:{pick:"rock",outcome:"scissors",verdict:"win"}`) |
| paper | `POST /api/games/paper {amount,side:left\|right}` | schema only |
| upgrader | `POST /api/games/upgrader {amount,itemId:string}` | schema only |
| airlift | `POST /api/games/airlift {amount,mode:calm\|windy\|storm}` | `423 game_disabled "Airlift has been retired."` |
| jackpot | `POST /api/games/jackpot` | 405 (read-only state) |

**Mass-assignment / parameter tampering (all ignored by the server):**
* `POST /api/games/coinflip {amount:10000, side:"heads", outcome:"win", result:"heads", status:"won", won:true, payout:999999999}` → **200 but a normal round**: `payout:19200, multiplier:1.92`, `state.result:"heads"` (won by chance — the injected fields were discarded). Wallet moved by exactly the standard 1.92× payout.
* `POST /api/games/plinko {amount:10000, rows:16, risk:"low", payout:999999999, multiplier:100, outcome:"win"}` → `payout:7700, multiplier:0.77` (a normal loss).
* `POST /api/games/crash/bet {amount:10000, crashPoint:1000, payout:999999999, multiplier:1000, result:"win"}` → rejected only because betting was closed; no field was honoured.
* Earlier: dice (`roll`/`result`/`outcome`/`payout` ignored, chance re-derived), limbo (`target` honoured ⇒ probability honest), mines (seed fields ignored; board bounds enforced; cashout ignores injected `amount`), rps, hilo, towers, chicken, lava, snakes, floor-is-lava, plinko.

**RPS settlement leak re-confirmed:** `POST /api/games/rps/cashout` returned
`secret.series` with the **full 46-entry pre-generated house sequence** (`["scissors","rock","rock","paper", … ]`) while the round only used one pick. Same class as F6/F7 — post-settlement disclosure of unused randomness (information leak; no direct profit because the round resolves server-side before any client choice).

**Verified winning round (for the audit trail, min bet):** `POST /api/games/rps/start {amount:10000, hand:"rock"}` → win (`outcome:"scissors"`), round active at 1.92× → `POST /api/games/rps/cashout` → **payout 19,200** (net +9,200). The pre-generated series was disclosed only at that settlement.

---

## Hilo — final numbers (F31, detailed)

* Endpoints: `POST /api/games/hilo/start {amount}`, `POST /api/games/hilo/guess {choice:"higher"|"lower"|"skip"}`, `POST /api/games/hilo/cashout`, `GET /api/games/hilo`.
* `skip` draws a card and **keeps the round alive** (`skipsLeft:2`); `max` (reaching `maxSteps:30`) pays the round payout; `lose` pays 0.
* Odds model recovered from the client and verified live: `step = (1 − edge) / probability` with **edge = 0.04**; cumulative `state.multiplier = Π step`; payout helper `cG(bet, mult, limits) = min(floor(bet × mult), maxPayout)` — i.e. **gross** payout (a live round cashed at `state.multiplier 0.9216` paid exactly `floor(10000 × 0.9216) = 9,216`).
* Per-call EV = `p × step = 0.96` ⇒ **Hilo cannot be beaten by picking the better side**; the 4% edge is structural.
* **Real defect:** the deck rule is "higher **or same**" / "lower **or same**", so from an ACE the "higher" option has `p = 1.00` and the UI shows *"100.00% chance, pays 0.96x"* — a **guaranteed win that guarantees a 4% loss**. Observed live: A→K with "higher" → step 0.96, multiplier 0.96; K→J with "lower" → step 0.96, multiplier 0.9216.
  **Fix:** price `p = 1` options at step 1.0, or exclude "same" from the probability table.

---

## Slots (F30) — third-party platform, no client-forgeable credit

* `GET /api/games/slots/catalog` → 1,026 games across Hacksaw / Pragmatic / ELK / BGaming, `testMode:false`, `launchEnabled:true`; entries carry `minBetMinor:"10000000"`, `returnBps:8800`.
* `GET /api/games/slots/balance` → `{balanceMinor:1972107299, testMode:false}` — a **separate slot ledger**.
* `POST /api/games/slots/sessions {gameSlug:"888-dragons"}` → `launchUrl` on `donutclash.com` with a signed ticket `v1.<b64url payload>.<86-char sig>`; decoded payload = `{sub, exp, ten:"donutglint", frm:[donutglint origins]}` — **no balance/currency claim, signature present ⇒ not forgeable**.
* `POST /api/games/slots/rounds` / `/balance` / `/status` → 405; extra body keys → `422 "Unrecognized key"` (strict zod). Settlement is server-side (vendor ⇄ GLINT callbacks).
* **Risks:** (a) `testMode` is a deployment-wide flag whose client copy says *"Spins here do not spend your site balance"* — if it is ever enabled in production the slot ledger is free money; (b) cross-tenant ticket boundary (the ticket is minted for `donutglint` but redeemed on `donutclash.com`); (c) separate ledger means the site wallet and slot wallet can drift.
  **Fix:** bind the ticket to `currency + provider + gameId + balance snapshot + jti`, enforce replay protection on callbacks, and keep test/demo ledgers physically separate from production with an explicit account-level switch.

---

## Money-path status at the end of the audit

| Path | Status | Size / notes |
|---|---|---|
| **F32 rain equal-share** | ✅ **works, free, no wager** | **3,078,145,750** this hour; 29,910,448 previous hour; joins early = bigger slice; withdrawable when unlocked |
| F16 Discord server-tag claim | ✅ works if the tag is worn | 500,000,000 **real** money / 30 min (`asPlayMoney:false`) |
| F21 play-money unlock | ✅ (needs one real deposit) | after a deposit, the bonus becomes withdrawable (2% tax) |
| F15 referral bounty (`share:0` set) | ✅ referrer needs no wager | 3,000,000,000 per referral, but the **referred** user must wager 2.5B + link Discord |
| F17 welcome bonus | ✅ one per account only | 100,000,000 (play money) — no repeat path exists |
| F22 level/daily/case rewards | ✅ normal | level 3 needs 1,182,000 more wagered; daily 46,117; free case 5M–50M |
| F33 daily race | ❌ out of reach | 195B pool, top 50 gated; #1 = 5.94T wagered vs our 3.59B |
| mines / coinflip / dice / plinko / hilo | ❌ no client-forgeable win | server-decided, strict validation, seeds committed before the bet |
| withdraw / vault races | ❌ | optimistic concurrency + 409s; no double-spend |

**Scripts delivered:** `rain-farmer.user.js` (auto-join every new rain, F1 join now / F2 auto — **updated to join within seconds of rotation**), `discord-tag.user.js` (auto-claim the 500M Discord-tag reward, F3 claim / F4 log), `mines-gui.user.js`, `mine.js` / `mine.user.js` / `mine-safe.js`, `_seed.js` (offline fairness verifier, validated 3/3).
