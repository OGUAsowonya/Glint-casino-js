## F30 - Slots integration: a second, undocumented game platform (donutclash.com bridge)

The `/slots` section runs a **completely different game stack** from the in-house casino games. It was not present in the original API inventory; it was found by following the `/slots` page chunk (`page-0bb513fa6a375324.js`).

**Endpoint inventory (authenticated):**

| Endpoint | Method | Response |
|---|---|---|
| `/api/games/slots/catalog` | GET | `{games:[1026], testMode:false, launchEnabled:true}` |
| `/api/games/slots/balance` | GET | `{balanceMinor:1972107299, testMode:false}` |
| `/api/games/slots/rounds?limit=10` | GET | `{currency, rounds:[], nextCursor}` |
| `/api/games/slots/sessions` | GET | 405 (POST only) |
| `/api/games/slots/sessions` | POST | `{launchUrl, expiresAt, framable, currency:"COIN", game, testMode}` |
| `/api/games/slots/status` | GET | `{open:true, staffOnly:false, configured:true}` |

**Catalog entry shape** (e.g. Pragmatic "888 Dragons"):
`{provider:"pragmatic", gameId:"2356", title:"888 Dragons", slug:"888-dragons", image:"https://donutclash.com/slot-games/...", tags:[...], minBetMinor:"10000000", maxPayoutMinor:"2000000000000", returnBps:8800}`
Providers in the catalog: `hacksaw`, `pragmatic`, `elk`, `bgaming` (1026 games). Slot minimum bet is `10,000,000` minor units - roughly an order of magnitude above the 10,000 minimum of the in-house games, so slot grinding needs real capital.

**Launch flow (client chunk `page-0bb513fa6a375324.js`):**
1. `POST /api/games/slots/sessions {gameSlug}` -> server returns `launchUrl`.
2. `launchUrl` = `https://donutclash.com/slots/launch?game=<slug>&ticket=v1.<b64url-payload>.<86-char-signature>` - i.e. the vendor bridge lives on **donutclash.com**, a separate domain/tenant of the same operator.
3. Ticket payload decoded from a live session: `{"sub":"[REDACTED_PLAYER_ID]","exp":1795209607,"ten":"donutglint","frm":["https://donutglint.com","https://www.donutglint.com"]}`.
   - `sub` = per-player slot id, `exp` = expiry, `ten` = tenant, `frm` = allowed frame origins.
   - The payload carries **no balance and no currency** claim, and the signature is 86 characters (HMAC/EdDSA), so the ticket is not forgeable from the client.
4. The client opens the vendor game in a new tab (`window.open` + `t.location.href = s.launchUrl`), or embeds it in an iframe when the session says `framable:true` (observed: `framable:true`). Copy shown in the UI: *"Your balance here updates as you spin."*
5. In `testMode` the client polls `/api/games/slots/balance` every 5 s and `/api/games/slots/rounds` every 15 s; in real mode it relies on server-side settlement.

**Mass-assignment / mode-switch probes (all rejected):**
`{gameSlug, testMode:true}` / `{demo:true}` / `{mode:"demo"}` / `{currency:"TEST"}` / `{balanceMinor:999999999}` -> **422 `validation_failed` "Unrecognized key"** (strict zod object, extra keys rejected). So the demo/test currency cannot be forced from the request body.

**Why this matters (attack surface that does not exist in the in-house games):**
- The player balance for slots lives in a **separate ledger** (`balanceMinor`, `currency:"COIN"`) that is not the in-house wallet ledger. Any settlement bug between `donutclash.com` and GLINT is invisible to the in-house game validation code.
- A `testMode` deployment flag exists server-side, and the UI explicitly says *"Development mode - Separate test balance. Spins here do not spend your site balance."* If any deployment runs with `testMode:true` **and** the settlement path still posts wins into the real wallet ledger, spins become free money. The flag is currently `false`, but it is a server-side config switch with no visible guardrail.
- The vendor session is created server-side and the round results are **not** posted by the browser, so a client-side forged-spin exploit is not available here (unlike a normal casino frontend). The exploitable class is: (a) currency/demo mismatch at the vendor bridge, (b) callback replay or missing nonce on the `donutclash -> GLINT` settlement API, (c) `testMode` + shared-ledger confusion, (d) `gameSlug`/`gameId` mismatch letting a cheap game be launched with a high-RTP game's settlement.
- `catalog.gameId` is provider-controlled and `slug` is the request key. The server must bind the session to the exact `(provider, gameId)` pair and verify the settlement callback against that binding, otherwise a mismatched slug could change RTP or payout limits.

**Remediation:**
- Sign the launch ticket with the currency, the exact `(provider, gameId)` and the balance snapshot; include a single-use `jti` and enforce it server-side.
- Reject any settlement callback whose currency/ledger differs from the session's; keep the test ledger physically separate (separate account row), never a flag on the same ledger.
- Require callback authentication (mTLS or HMAC with a timestamp + nonce) and store the last-seen nonce per session to make replays impossible.
- Make `gameSlug` resolution authoritative server-side (never echo a provider-supplied id) and re-verify `minBetMinor`/`maxPayoutMinor`/`returnBps` server-side at settlement, not only in the catalog.
- Audit the whole `donutclash.com` tenant boundary: it currently runs on a different domain with its own session/ticket issuer and its own image CDN, so a bug there is a bug on this casino.

---

## F31 - Hilo: probability is disclosed (good), but a 100% certainty pays 0.96x - a guaranteed win that guarantees a loss

**Contract (client chunk `app/(app)/hilo/page-6e6491ad4da4623b.js` + shared helper module 18761 in chunk 73160):**
- `POST /api/games/hilo/start {amount}` -> round
- `POST /api/games/hilo/guess {choice:"higher"|"lower"|"skip"}` -> `{outcome:"win"|"lose"|"max"|"skip", card, round}`
- `POST /api/games/hilo/cashout` -> `{round, wallet, payout}` (endpoint exists, confirmed live)
- `GET /api/games/hilo` -> active round

**State exposed to the player (this is the interesting part):**
`state.options.higher|lower = {probability, step, multiplier}`, `state.current`, `state.cards`, `state.steps[]`, `state.multiplier`, `state.maxSteps` (30), `state.skipsLeft` (2), `state.stepCount`.
The UI literally renders *"100.00% chance, pays 0.96x"* from `probability` and `step`.

**Odds model, derived and verified against live values:**
`step = (1 - edge) / probability` with `edge = 0.04` (4% house edge per call):
- live: `lower p=0.7692 -> step 1.2479` (0.96/0.7692 = 1.2480) and `higher p=0.3076 -> step 3.1199` (0.96/0.3076 = 3.1210).
- `options.*.multiplier = currentMultiplier * step`; the cumulative `state.multiplier` is the product of the steps.
- Payout helper `cG(bet, multiplier, limits)` in module 18761: `payout = min(floor(bet * multiplier), maxPayout)`.

**Live cashout proof (gross, not profit-based semantics):**
A live round at `state.multiplier = 0.9216` (10,000 stake) cashed out at **9,216** - i.e. `payout = floor(bet * multiplier)` exactly. A profit-based interpretation (`bet * (1 + multiplier)` = 19,216) is ruled out, so there is no accounting bug here.

**The actual defect:** the deck rule is *"higher or same"* / *"lower or same"* (client labels; `p_higher + p_lower = 1 + p_same`, so equal-rank cards are counted on both sides). When the current card is an **Ace**, "higher or same" has `probability = 1.0`, so `step = 0.96 / 1.0 = 0.96`: the player is shown a **100.00% certainty**, takes the win, and the payout multiplier *drops to 0.96x* - a guaranteed 4% loss on a guaranteed win. The same happens from a King with "lower or same". Observed live steps: `from A -> K, choice higher, step 0.96, multiplier 0.96` and `from K -> J, choice lower, step 0.96, multiplier 0.9216`.

**EV analysis:** per call, `EV = probability * step = 0.96` regardless of which side is chosen, so selecting the higher-probability side does **not** produce positive EV; Hilo is not exploitable by odds selection. `skip` draws a card without changing the multiplier (2 skips) and does not end the round; `max` (reaching the 30-step cap) settles at `round.payout`.

**Remediation:**
- Price the `p = 1.0` option at `step = 1.0` (or refund the bet) instead of `0.96`; a 100% certainty must never reduce the payout.
- Label the option as "Higher or same" with the same-rank probability shown separately, and show the *net* multiplier after the current step rather than a raw percentage that reads like "guaranteed".
- Publish the edge in the fairness verifier (the `/fairness` page already accepts an `edge` parameter for `hilo`, which confirms the server-side edge model) so players can recompute the ladder.

---

## Money-path status (2026-11-20 ~20:52Z)

- **Wallet state is now fully withdrawable:** `available 2,066,427,299`, `bonus 0`, `withdrawable = available`, `unlocked:true`, `depositToUnlock:false` - the 193.2M bonus from F21 has been converted and the blocker is gone. Rain payouts from this point land directly in withdrawable balance (only `payTaxBps 200` = 2% tax and the 300 s withdrawal cooldown apply).
- **Rain (F14/F19) - live pot:** rain `[REDACTED_RAIN_ID]`, pot `2,502,422,494,400`, entries 788, participants 512, `myEntries 1` (our free entry already in), closes `2026-11-20T21:01:19.514Z`. Our free entry cost nothing; last hour paid `29,910,448` with no matching debit.
- **Discord tag (F16) - 500M real money every 30 min** remains the highest-value *real-money* path and needs one free user action: wear the `GLNT` server tag in the Discord server, then `POST /api/rewards/discord-tag/claim`. A Tampermonkey auto-claimer is shipped next to this document (`discord-tag.user.js`).
- **Daily race (F23):** `195,000,000,000` prize pool, `100,000,000,000` top prize, settles automatically at `2026-11-21T00:00:00.000Z`; the account's `wageredTotal` is `3,592,000,000` and rising, so a top-5 finish (and possibly the top prize) is in reach without any exploit.
