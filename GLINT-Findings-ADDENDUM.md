
---

# ADDENDUM — Session 2 findings (2026-11-20)

Test account: `[REDACTED_ACCOUNT]` (role `user`, tier Coal L2; wallet values redacted).
All requests below use the site's own client headers: `Accept: application/json`, `X-Requested-With: glint`, `Content-Type: application/json`, `credentials: same-origin`, `cache: no-store`.
**Testing rule used:** minimum bet (10,000) until a working money exploit exists.

## F6 — Floor-is-Lava discloses its hazard set mid-round (post-hoc)
- `POST /api/games/floor-is-lava/start` `{amount,difficulty}` → round
- `POST /api/games/floor-is-lava/jump` `{tile}` → `{outcome, sank, state, ...}`
- `POST /api/games/floor-is-lava/cashout` `{}` → payout (allowed after ≥1 jump; live 200 → 10,939 on 10,000)
- Every jump response contains `sank` = the 6 tiles that were hazards **for that jump** (medium difficulty). The set is re-rolled per jump, excludes previously sunk tiles, and also includes the tile that sank.
- Cumulative hazard set is never disclosed before the bust → disclosure is post-hoc only, so it cannot be used to guarantee a win.
- Blocked-tile semantics: re-jumping a tile in `state.sunk` → 409 `That tile has already sunk.`; jumping to the current tile → `You're standing on that one. Jump to another tile.`
- `outcome` values: `safe` | `cleared` | `sank`. `cleared` = level goal reached (jumps-per-level from difficulty table) → `level++`, multiplier jumps (~×1.32 per successful jump), `state.sunk` resets.
- Round object carries `capped` flag (multiplier/level cap).
- Impact: information disclosure + a post-hoc oracle for hazard generation; **not** a money exploit (EV ≈ 1).

## F7 — Mines settles leak the mine layout (post-hoc)
- `POST /api/games/mines/reveal` `{tile}` → `{outcome, round, wallet}` — no mine positions.
- `POST /api/games/mines/cashout` `{}` → `{round, mines, wallet, payout}` — **`mines` = full mine array** (e.g. `[12,14,17]`, `[9,12,13]`).
- `GET /api/fairness/rounds` → settled rounds with `secret:{mines:[…]}`, `serverSeedHash`, `clientSeed`, `nonce`.
- Impact: post-hoc disclosure only; no predictive value for the running round.

## F8 — Provably-fair seed model (why prediction is currently blocked)
- `GET /api/fairness` → `{clientSeed, hashedServerSeed, nonce, nextHashedServerSeed}`
- `POST /api/fairness/rotate` → `{revealed:{serverSeed, serverSeedHash, clientSeed, nonces}, state:{...}}` — reveals the **previous** epoch's seed, resets nonce to 0, swaps in a new (secret) seed.
- `POST /api/fairness/client-seed` → blocked (409) while a round is active; `GET /api/fairness/seeds` → only revealed epochs.
- **The server seed is per-epoch (per-session), not per-round**: `serverSeedHash` was constant `d9a364…` for nonces 711–713 and constant `ee5382af…` for nonces 1–14+ (current epoch).
- Algorithm (extracted from chunk `1499-51d8bdd53cf6f027.js`, module 65139/1499) confirmed offline (3/3 known rounds):
  - floats: `HMAC_SHA256(key=utf8(serverSeed), msg=utf8(clientSeed + ":" + nonce + ":" + cursor))`, 8 floats per cursor, `float = b0/256 + b1/65536 + b2/2^24 + b3/2^32`
  - placement: `gR(seed, grid, mines)`: `u = floor(float * (grid - t))`, pick `n[u]`, replace with `n[grid-t-1]`; mine set = sorted `gR(...)`
  - `sha256(serverSeed) == serverSeedHash`
- Consequence: **if the active epoch's `serverSeed` is ever obtained, every future round of that epoch is predictable (100% wins).** Server refuses to expose it while rounds are active; 192 candidate seed-chain derivations from the revealed seed found no relation to the next seed.
- Client-side mass-assignment attempt (`serverSeed`/`clientSeed`/`nonce` in the Mines start body) is ignored by the server.

## F9 — Welcome bonus flow (`/api/welcome/source`) — atomic, but message understates the amount
- `GET /api/welcome/source` → `{status:"needs_source", amount:100000000, options:[youtube,tiktok,friend,discord,ingame,search,other], needsDiscord:false, captcha:null, revokedReason}`
- `POST /api/welcome/source` `{source}` → `{granted, status:"claimed", amount, message, wallet}`
- 5 parallel posts → exactly **one** `granted:true` (atomic). Credited **100,000,000** while the message says only "$1M welcome bonus added" (message bug).
- After claiming: `welcomeGranted true`, `playMoneyReceived 2,109,114,670`.
- **Withdrawability gap:** `available 111,680,221` vs `withdrawable 11,680,221` → exactly the 100M welcome money is *not* withdrawable; `playMoneyOwn:false`, `unlocked:false`, `depositToUnlock:true`, `netDeposits:0`, `playthrough.required:0`. A real deposit (on the DonutSMP server) is required to unlock it → not exploitable, but a strong incentive-engineering finding: a 100M bonus that cannot be withdrawn without depositing.

## F10 — Vault endpoint: misleading validation, but no race
- `POST /api/wallet/vault` `{direction:"in"|"out", amount}` (direction is `in`/`out`, not `withdraw`/`deposit`).
- `amount` 1 and 10 → 422 `Vault at least $1.` although the real minimum is **100** (misleading error).
- 3 parallel `out` → 1×200, 2×409 `Your vault holds $0.` (no double-spend). 3 parallel `in` → all 200, net movement only 100 (optimistic concurrency / last-write-wins, `wallet.version` increments).
- Client-side clamp on the withdraw modal **is** validated server-side → F1 is not exploitable.

## F11 — Reward claim endpoints: rate limiter + misleading errors
- `GET /api/rewards` → `level, levelName, tier, nextTier, totalClaimable, daily, weekly, monthly, case, candy, rakeback, levels, promos[], welcome, vouchers[], personalBoost, redeemed[], rewardsOff, serverTime`
- `POST /api/rewards/claim` `{kind,level}`; live kinds: `daily` (46,110, 22h43m cooldown, minLevel 1), `weekly` (locked, minLevel 5/Copper), `monthly` (disabled), `case` (free, expected 14,000,000, ladder 10, ready in 20h41m), `candy` (409 `Halloween's over…`), `rakeback` (accrued 78, rate 1.5), `level`, `welcome` (409 `One question first: tell us how you heard about GLINT`).
- Parallel `rakeback` claims → exactly one `200 Rakeback claimed amount 78`; the rest 409 → atomic.
- Parallel `case` claims → one 409 + one **429 `You're doing that too fast. Try again in a moment.`** → per-endpoint rate limiter exists (mass-assignment probes on `kind/amount/force/ignoreCooldown` were blocked by the 429).

## F12 — Promo redemption: client-only normalization + no idempotency key + divergent chat path
- `POST /api/rewards/promo` `{code}` → 401 unauth · 422 `That doesn't look like a valid code.` (min 2 chars, 41 chars rejected) · 403 `Promo codes are for people wearing the GLNT tag.` · `GET` → 405, `OPTIONS` → `Allow: OPTIONS,POST`.
- Guessed routes (`/api/redeem`, `/api/coupons`, `/api/promo`, `/api/games/redeem`, `/api/wallet/redeem`) → 404.
- **Client bug:** the shared request helper (`chunk 48062`, fn `FH`) sets the `Idempotency-Key` header only when the `idempotent` option is a **string**; official code passes `idempotent:true` (boolean) → no idempotency header on promo/claim/mines calls → double-credit race candidate if a valid code exists.
- **Divergent implementation:** `POST /api/chat/messages` `{text:"/redeem CODE"}` is a *separate* redemption path that may enforce weaker checks than the GLNT-tag gate → candidate bypass (needs a valid code).
- `GET /api/rewards/discord-tag` → `{enabled:true, tag:"GLNT", amount:10416666, daily:500000000, everyMinutes:30, autoCredit:true, linked:true, discordName:"rez", inGameLinked:true, wearing:false, requireForRain:false, requireForCodes:true, rainEntries:1}` → codes require wearing the GLNT tag; Discord auto-credit pays 500,000,000 every 30 minutes.

## F13 — Rain API (public metadata, join endpoint found)
- `GET /api/rain` → `{rain, scheduled}`; active rain `cbe96c6e`, amount `10,000,000,000`, entryCount 240, `minWagered 0`, `requiresTag false`, `takeover false`, `weighted false`, `entryRule.ranks` Coal→Obsidian = 1, Beacon = 2, `entryRule.roles` support 49, mod null, admin 50, owner 50.
- `POST /api/rain/join` expects **`{rainId}`** (422 `Invalid input: expected string, received undefined` when sending `id`); `POST /api/rain/{id}/join` → 404.
- Public metadata exposes the full entry-rule table (rank/role multipliers) → information disclosure; live join/claim semantics still to be verified.

## Game-by-game request inventory (all server-decided; no client-supplied outcomes)
| game | endpoints | body | outcome source |
|---|---|---|---|
| mines | `GET /api/games/mines`, `/start`, `/reveal`, `/cashout` | `{amount,mines,grid}` / `{tile}` | server (seeded HMAC) |
| coinflip | `POST /api/games/coinflip` | `{amount,side}` | server (`round.status` won/lost) |
| rps | `/api/games/rps` (+`/start`,`/call`,`/cashout`) | `{amount,hand}` | server (`round.state.house`) |
| hilo | `/start`,`/guess` | `{amount}`, `{choice}` | server (win/lose/max) |
| towers | `/start`,`/pick` | `{amount,difficulty}`, `{block}` | server (hazard/safe) |
| chicken | `/start`,`/step` | `{amount,difficulty}`, `{}` | server (hazard/cleared) |
| floor-is-lava | `/start`,`/jump`,`/cashout` | `{amount,difficulty}`, `{tile}` | server (per-jump hazard roll) |
| snakes | `/start`,`/roll`,`/cashout` | `{amount,difficulty}` | server (dice roll) |
| crash / double / baccarat / moon-or-rug / rush-hour | — | — | server |

## Negative results (checked, not exploitable)
- Mines out-of-board tile (`tile:25` with `grid:25`) → 422 `Invalid tile.` (board bounds enforced).
- Cashout before any reveal → 409 `Reveal at least one tile before cashing out.`; double cashout → 409 `There is no active round.`; concurrent round → 409 `You already have an active round.`; double reveal → `Tile already revealed.`
- `Idempotency-Key` (string) does dedupe Mines bets (same key → same `roundId`, single debit).
- Vault double-spend: none. Welcome-bonus race: none. Rakeback race: none.
- Wrong header set (missing `X-Requested-With: glint`) → request rejected; this is why early scripts failed.
- All `api/games/*` outcomes are server-computed — no client-forgeable outcome found in any game sweep.

## Recommended fixes
1. Never return `mines` / `sank` / `secret` layouts to the client before the round is settled (F6/F7).
2. Make `Idempotency-Key` mandatory (or derive it from a stable request fingerprint) on all mutating endpoints, and fix the helper that ignores boolean `idempotent` (F12).
3. Use one redemption service for both `/api/rewards/promo` and chat `/redeem`; canonicalize codes server-side (trim + uppercase) and consume atomically (`UPDATE … WHERE used_at IS NULL`) (F12).
4. Keep the active `serverSeed` secret — but note that a per-epoch seed means a single leak predicts every round of the epoch; prefer per-round seeds with a server-side commitment (hash) revealed on rotation (F8).
5. Fix misleading user-facing messages: "Vault at least $1." (minimum is 100), "Minimum bet is $100." (minimum is 10,000), "$1M welcome bonus added" (credits 100,000,000), lava "Mines is played on the 5×5 board now" (F10/F11/F9).
6. Document and enforce the withdrawability model in-product: a 100M bonus that requires a deposit to unlock needs explicit disclosure before the claim (F9).
