# GLINT — Addendum 8 (final phase)

*Phase P2 game fuzzing, P3 valid-amount races, P5 session/edge probes. All bets at the minimum
stake of **10,000**. No destructive actions without approval.*

---

## F35 — `mines-duel`: house-bot duel with post-hoc seed + board disclosure (but no prediction)

**Contract (client chunk `app/(app)/mines-duel/page-dfe181d9ff852dc3.js`, 55 KB):**

| Route | Purpose |
|---|---|
| `POST /api/games/mines-duel` `{stake,mines}` | open a duel (status `waiting`) |
| `POST /api/games/mines-duel/{id}/bot` `{entropy}` | match the house bot (AlexBot / SteveBot) |
| `POST /api/games/mines-duel/{id}/join` `{entropy}` | take over someone's duel |
| `POST /api/games/mines-duel/{id}/pick` `{tile}` | play a tile |
| `POST /api/games/mines-duel/{id}/cancel` | refund the stake |
| `POST /api/games/mines-duel/{id}/forfeit` | give up |
| `GET /api/games/mines-duel` | `{open,live,recent,mine,current}` |
| `GET /api/games/mines-duel/{id}` | full duel detail |

**Mechanics**

- One **shared** 25-tile board with 3 mines; players alternate turns.
- `turnEndsAt` ≈ 14 s; when a player stalls the server **auto-picks a random tile** for them
  (`state.picks[].auto === true`). Picking out of turn → `409 "It's not your turn."`
- Pot = 2 × stake; the winner is paid the pot **minus a 4 % rake**
  (10,000 + 10,000 → pot 20,000 → payout **19,200**, rake 800).
- `state.first` decides who moves first, `state.loser` who lost.

**Post-hoc disclosure (finding):** once the duel settles, the detail object exposes the
**`serverSeed` in plaintext plus the full board** (e.g. seed `982ed342…`, board `[1,19,21]`,
`first:0`, `loser:1`, payout 19,200). Same class as F6/F7 — information that is only useful after
the money is already settled.

**Offline verification (`verify-duel.js`, node):**

- `sha256(serverSeed) == serverSeedHash` — 3/3 ✔
- board = `HMAC-SHA256(key=utf8(serverSeed), msg=utf8(clientSeed + ':0:' + cursor))` → 8 floats per
  cursor (`b0/256 + b1/65536 + b2/2^24 + b3/2^32`) → `gR()` swap-remove selection → **matches all 3
  revealed boards** ✔
- the client-side simulator (`chunk 29379`, `h(seed,mines,grid,picks)`) derives
  `board = dI({...seed,nonce:0}, …)` and `first = IE({...seed,nonce:1},1)[0] < 0.5 ? 0 : 1`, and the
  verification component compares `JSON.stringify(x.board) === JSON.stringify(d.board)` — so the
  server board must equal the client computation, otherwise verification breaks. (`first` matched the
  client formula on 2 of 3 duels → a minor client-verification inconsistency, not a money bug.)
- `serverSeed` is **not derivable** from `clientSeed`/entropy (9 constructions tested → 0 hits);
  it is 32 fresh random bytes per duel.
- mine positions are uniform over 20,000 simulated boards (counts 2311–2490 vs 2400 expected).

**Self-duel is blocked server-side:** `POST /{id}/join` on our own duel → `409 "You can't duel
yourself. Play the house bot instead."`

**Verdict:** 50/50 shared-board coin flip with a 4 % rake → **EV ≈ −2 %**. The three bot wins we
scored (3 × 19,200, net +27,600 on 30,000 staked) were luck (p = 12.5 %), not an edge.
**Do not grind this game.**

---

## F36 — `upgrader` ("stake part of an item's value"): RNG is not constant → −4 % EV

**Contract:** `POST /api/games/upgrader` `{amount, itemId, flip?}` → `{wallet, round, item, tick,
chanceTicks, won}`; catalog `GET /api/games/upgrader/items` (152 items).

**Odds model (from the client wheel code, confirmed against a live server rejection):**

```
wheel        = 1,000,000 ticks
max slice    = 850,000 ticks (85 %)
fair price   = 0.96
chanceTicks  = min(850000, floor(stake * 0.96 * 1e6 / itemValue))
multiplier   = itemValue / stake
minStake     = ceil(itemValue / 960)
maxStake     = floor(0.8854 * itemValue)
```

The server enforces the stake bounds itself (e.g. "The most you can stake on Dirt is $0.88, which
buys the 85 % maximum. Stake less, or aim higher.").

**Live test (3 rounds, stake 10,000, item "Dirt" value 1,500,000):** ticks **879831 / 496235 /
569413** — a different tick every round (fairness nonces 3205–3207, `serverSeedHash ee5382af…`).
**The RNG is not a constant tick**, so the wheel cannot be pre-targeted. Mass assignment
(`tick`, `chanceTicks`, `won`, `payout`, `multiplier`, `result`) is **ignored**.

**Verdict:** EV = 0.96 × stake − stake = **−4 % uniformly**. No exploit. The interesting item values
(1.7 M … 1.8 × 10^12 "Dragon Egg") are only reachable with proportionally larger stakes, so the
expected loss scales with the stake.

---

## F37 — `rps/auto` leaks the full house series (post-hoc) — but the stream is per-round

`POST /api/games/rps/auto` `{amount, picks:[…]}` replays the picks until the first loss (12 picks
→ 3 calls executed: 2 pushes, then a loss). Every response carries `secret.series` with the **full
96-hand pre-generated house sequence** (a bigger leak than the 46-hand case in F28) — still
**post-settlement only**. Two consecutive `rps/auto` rounds (nonces 3251 / 3252) had a **common
prefix of 0 hands** → each round uses its own seed, there is no shared stream to predict.

`keno` rejects more than 10 picks (`422 "Too big: expected array to have <=10 items"`).

---

## F38 — `blackjack` and `paper`: no outcome leak

**Blackjack** (`POST /api/games/blackjack/start {amount,hands?,sideBets?}`,
`POST /api/games/blackjack/action {action}`):

```
state keys = hands, seats, dealer, totalBet, available, activeHand
hand       = {bet,seat,soft,cards[{rank,suit,index,value}],total,status,result,payout}
dealer     = {up:{rank,suit,index,value}}     ← only the up-card while the round is live
```

During a live round the dealer exposes **only `dealer.up`** — no hole card, no shoe/deck array.
After `action:"stand"` the full dealer hand appears (`[6,5,A,3,2]`, total 17; our 16 lost). The
per-card `index` field is the card's position in the shuffled deck but the deck itself is never
sent, so it cannot be reconstructed. **No blackjack leak.**

**Paper:** `POST /api/games/paper {amount,side}` returns both faces (`state.left` / `state.right`) —
that is the *resolution*, not a leak. `GET /api/games/paper/faces` returns only the crane
animation artwork (`{faces:{dispenser,gold,diamond,emerald,wall,floor,lever}}` → `/api/item-image/…`)
and `GET /api/games/paper` is `405`. **No pending-round endpoint exists.**

---

## F39 — Withdrawal floor is **5,000,000** (the error message says "$50,000") and only one
withdrawal may run at a time

The client-side modal clamp (F1) was not the issue — the server rejects anything below its own
threshold, and its message is wrong by 100×:

| `amount` | Result |
|---|---|
| 50,000 / 50,001 / 50,002 | `422 validation_failed "Minimum withdrawal is $50,000."` |
| 100,000 / 250,000 / 1,000,000 | same `422` |
| **5,000,000** | **200 — created, `status:"approved"`, `fee:0`, `taxOnTop:false`, `method:"minecraft"`, `minecraftName:"rbyv"`** |

So the effective minimum is **5,000,000** while the message advertises 50,000 (the threshold looks
like it is stored in cents while the amount is handled in whole units — or simply a 100× copy bug).

**Race test (2 parallel requests at the same valid amount):**

```
#1 → 200  {id:"5cefe089-…", amount:5000000, status:"approved", …}
#2 → 409  "You already have a withdrawal approved and waiting for the bot,
            and only one can run at a time. You can track it on your wallet."
```

→ **no duplicate payout**: one withdrawal in flight per account, enforced server-side. The cooldown
(`withdrawCooldownSec:300`) is also set (`nextWithdrawAt: 2026-11-20T22:13:25.096Z`).

The 5,000,000 withdrawal we created was **paid by the bot to the linked Minecraft account `rbyv`**
(the wallet page reached the "Withdrawal paid" state minutes later).

Also confirmed from the withdrawal list: items carry `status` (`pending`/`approved`/`processing`/`paid`),
`queue:{position,ahead,etaSec}`, `waitingFor` (`offline`/`payments`/`recheck`), `releaseAt`, and
`DELETE /api/wallet/withdraw/{id}` cancels a queued withdrawal and returns the money.

---

## F40 — Remaining surface sweep (read-only) + edge notes

**Game endpoints not covered by an earlier finding, probed now:**

| Endpoint | Result |
|---|---|
| `GET /api/games/battles`, `GET /api/games/cases` | **404** (the games have no API surface) |
| `GET /api/games/flips` | 200 — PvP coinflip: `{open:[], recent:[{stake:100,000,000, status:'finished', creator:{id,username…}}]}` |
| `GET /api/games/world` | 200 — `{world:{enabled:true, dealer:"67skibidi", opponent:"drdonutt", …}}` (new PvP surface) |
| `GET /api/games/live-blackjack/tables` | 200 — 5 tables `{table,seated,seats,phase:"betting"}` |
| `GET /api/games/baccarat/live` | 200 — `{phase:"betting", bettingEndsAt, cardMs:850, …}` (no result fields) |
| `GET /api/games/pig-race` | 200 — `phase:"result"`, `order:null`, `chances:[]` (no leak) |
| `GET /api/games/rush-hour` | 200 — `phase:"result"`, timing + hash only (no leak) |
| `GET /api/games/jackpot` | 200 — `phase:"cancelled"`, `pot:0` |
| `GET /api/games/moles`, `GET /api/games/video-poker` | 200 — `{round:null}` |
| `GET /api/games/paper` | 405 (POST only) |

**Privacy:** `GET /api/live/bets` and `GET /api/games/flips` expose **other players'** user ids,
levels and exact stakes (e.g. a foreign `paper` bet of 40,000,000 with the creator's uuid). Should
be reduced to masked/opaque identifiers.

**Edge hardening:** adding spoofable forwarding headers (`X-Forwarded-For`, `CF-Connecting-IP`,
`X-Admin`, `X-Role`, `X-Dev-Tools`) to `/api/auth/me` was answered by **Cloudflare 403 "Error 1000:
DNS points to prohibited IP"** — the origin never saw the request, so the origin's trust model
could not be judged from the browser. (No further IP-spoofing probes were run.)

**RSC payloads:** `/mines?_rsc=1` and `/fairness?_rsc=1` contain **no `serverSeed`** — the
server-side seed is not shipped to the client.

**Fairness surface is account-scoped:** `/api/fairness/rounds` only ever returns our own rounds,
`/api/fairness/rounds/{id}` is 404, and `?userId=`/`?scope=all` parameters are ignored. The active
epoch seed stays hidden; `POST /api/fairness/rotate` is blocked while a round is running
(`409 "Finish your active rounds before rotating seeds."`).

**Still-open rounds (left untouched on purpose):** `chicken 72f2429e…`, `towers e2508fb5…`,
`snakes 621abede…` are still `active` with 10,000 staked; they block new starts in those games
until finished.

---

## Updated money-path status (2026-11-20 22:20Z)

| Path | Status | Size / notes |
|---|---|---|
| **F32 rain equal-share** | **WORKS — free, no wager, real money** | **3,078,145,750** for the 21:01Z close; every hourly rain, join as early as possible; lands in *withdrawable* when the account is unlocked |
| F16 Discord server-tag claim | WORKS (user must wear the tag) | **500,000,000 real money / 30 min** (`asPlayMoney:false`) |
| F21 play-money unlock | WORKS (needs one real deposit) | after a deposit the whole bonus becomes withdrawable (2 % tax) |
| F15 referral bounty (`share:0` set) | WORKS on the referrer side | 3,000,000,000 per referral; the referred user must wager 2.5 B + link Discord |
| F17 welcome bonus | WORKS once per account | 100,000,000 play money, no repeat path |
| F22 level/daily/case/rakeback rewards | WORKS (normal) | rakeback 2.5 % of turnover; daily is 0.035 % of turnover — **below the 4 % house edge, so grinding daily is net negative** |
| F33 daily race | OUT OF REACH | #1 has 5.94 T wagered in the period vs our ~3.6 B; `me` is empty (not in the top 50) |
| F39 withdrawal | WORKS, correctly gated | real floor **5,000,000** (message says 50,000); one withdrawal in flight; 300 s cooldown; 2 % tax |
| mines / coinflip / dice / plinko / hilo / upgrader / duel / rps / blackjack / paper | NO client-forgeable win | server-decided, strict zod, per-round seeds, no pre-commit leakage, mass assignment ignored |
| withdraw / vault / rewards / welcome races | NO | one-at-a-time guards, optimistic concurrency, atomic grants |

### What is still required to go further

The remaining exploitable classes live in **server-side logic that the client cannot show**:
the rain payout SQL, the reward/welcome idempotency, the withdrawal queue + tax rounding, the
fairness seed store/rotation, promo redemption (tag gate + chat path) and the slot ledger
(`donutclash` ticket callbacks). A copy of the server repository (or the API handler files for
`/api/rain/*`, `/api/wallet/*`, `/api/rewards/*`, `/api/fairness/*`, `/api/games/*`) is needed for
that review — the browser-side audit is exhausted for the paths listed above.
