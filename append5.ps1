$main = Join-Path $PSScriptRoot 'GLINT-DonutSMP-Casino-Findings.md'
$add  = Join-Path $PSScriptRoot 'GLINT-Findings-ADDENDUM5.md'
$text = @'

## ADDENDUM 5 - F25..F29 (2026-11-20, live-probed on the owner's site, min bet 10,000)

### F25 - Odds parameters ARE validated server-side (dice / limbo / plinko) - no parameter-tampering exploit
POST /api/games/dice {amount,mode,target}
  target:100 -> 422 "Too big: expected number to be <=99.99"; target:0 -> 422 "Too small: expected number to be >=0.01"
  target:99.99 -> accepted, but the server RE-DERIVES chance:0.01 (1%) and rolls 38.11 -> lost.
  mass-assignment {roll:99.99,result:"win",outcome:"win",payout:999999999} -> IGNORED (roll 25.79, lost).
POST /api/games/limbo {amount,target}   (the param is `target`, not `multiplier`)
  target:2 -> 6 rounds, 2 wins, payout sum 40,000, multipliers [0,0,2,0,0,2] (~50% as expected)
  target:1000 -> 10 rounds, 0 wins (0.1% as expected) => implied probability is honoured, no edge.
POST /api/games/plinko requires {rows:16, risk:"low|medium|high"} (risk required, else 422) -> payout 7,800 (lost).
POST /api/games/upgrader expects a STRING `itemId` (422 itemId) - different game family.
POST /api/games/double/start -> 404; POST /api/games/double -> non-JSON response (endpoint contract unclear).
=> the multiplier ladder is derived from the requested odds on the server; clients cannot buy a better payout.

### F26 - No pre-commit outcome leaks in the round-state endpoints (checked in every phase)
GET /api/games/crash -> {roundId, phase, startsAt, startedAt, crashPoint, hash, history, bets, serverTime}
  phase "waiting" -> crashPoint:null, bets:1, hash present; phase "crashed" -> crashPoint:1.34 (post-settlement).
GET /api/games/roulette -> {roundId, phase, bettingEndsAt, spinStartedAt, resultAt, nextRoundAt, spinMs, hash, result, bets}
  phase "result" -> result:null, bets:0.
GET /api/games/pig-race -> {roundId, raceNo, phase, bettingEndsAt, raceStartedAt, resultAt, nextRoundAt, raceMs, hash, revealed, order}
  phase "result" -> order:null, revealed:false.
GET /api/games/moon -> {coin:null, position:null}.
GET /api/games/double -> phase "betting" -> tile:null, tiles:25 (a count, not a ladder).
GET /api/games/snakes -> round.state.rolls contains only the rolls already made
  (e.g. rolls:[{dice:[4,6],pays:1.2,tile:9,total:10},{dice:[2,2],pays:1.2,tile:3,total:4}], difficulty easy, multiplier 1.44).
GET /api/games/moon-or-rug -> phase "live", t:489, ticks:600, points.length = 490 (t+1) => the curve is HISTORY only;
  max point seen 1.121 at index 41, current 0.3266 - no future path disclosed.
GET /api/games/rush-hour -> phase "traffic", only timing fields + hash (no outcome).
GET /api/games/jackpot -> phase "cancelled", pot 0, entries [] (inactive).
GET /api/games/<name> for mines, rps, towers, chicken, hilo, floor-is-lava, moles, video-poker, blackjack,
  live-blackjack -> {round} only. 405 (no GET): plinko, dice, limbo, coinflip, airlift, paper, baccarat, keno.
  404: duel, battles, slots, cases, /api/games/double/start.
=> no game exposes its outcome before the bet is committed (a change-only poller stays armed on crash/roulette/
   pig-race/moon to catch the betting phases).

### F27 - Mines is airtight (all injection attempts rejected, no double-spend)
amount -10000 / 0 -> 422 "Too small: expected number to be >0"; 0.5 -> 422 "Amount must be whole cents.";
  "10000" -> 422 type error; 1e12 -> 422 "Maximum bet is $1B."; mass-assignment {betAmount,payout,amountCents} IGNORED.
mines:0 -> "Too small: expected number to be >=1"; grid:0 -> "Invalid input"; tile -1 -> "expected number to be >=0";
  tile "0" -> type error; tile 24 -> 200 safe (mult 1.0909); tile 25 -> "Invalid tile."; tile 1.5 -> "expected int"; tile null -> type error.
cashout with injected {amount:999999999} IGNORED (payout 10,909). 5 PARALLEL cashouts -> 1x200 (payout 10,909)
  + 4x409 "There is no active round." => no double-spend.

### F28 - Rock-Paper-Scissors discloses the ENTIRE pre-generated house sequence at settlement
POST /api/games/rps/start {amount,hand} resolves the first call; POST /api/games/rps/call {hand} -> {call:{pick,outcome,verdict},round}.
A WIN multiplies 1.92 -> 3.84 -> 7.68; a LOSE ends the round (payout 0). POST /api/games/rps/cashout -> payout 76,800 at 7.68x
AND reveals secret.series = the FULL pre-generated house sequence (16+ values, e.g.
scissors,rock,scissors,scissors,rock,rock,rock,rock,scissors,rock,scissors,paper) - including every house hand that
was never used. Active responses never contain the secret (start + 5 calls all had hasSecret=false).
EV of "call until the first win" = 0.96x (slightly negative), so the leak is a fairness/transparency defect, not a money edge.
FIX: reveal only the hands actually played, or publish the full commitment hash before the round.

### F29 - Withdrawal endpoint contract (POST /api/wallet/withdraw) + inconsistent minimum message
GET /api/wallet/withdraw -> {items}; POST validates:
  amount <= 0 -> "Too small: expected number to be >0"; string -> type error; 0.5 -> "Amount must be whole cents.";
  1e12 -> "The most you can withdraw at once is $2.5B. You can make another withdrawal 5m later.";
  amount 50,000 AND 50,001 -> 422 "Minimum withdrawal is $50,000." (the message contradicts the accepted value - the real
  threshold is higher than $50,000 or the check is strict-inequality). Parallel 50,001 x2 -> both 422.
  Cooldown 300 s (withdrawCooldownSec), payTaxBps 200 (2% tax), depositToUnlock still gates play money.
FIX: state the real threshold in the error message and expose the numeric minimum via /api/wallet/limits.

### STATUS OF THE MONEY PATHS (unchanged, all verified)
- Rain (F19): free entry, house mints the stake, real payout (29,910,448 credited for the 20:01Z rain).
- Bonus unlock (F21): wager requirement already satisfied by play-money bets (616.9M wagered >= 193.2M unlockWager);
  only netDeposits > 0 remains. Deposit is server-recorded from DonutSMP (cannot be forged client-side).
- Discord tag (F16): 500,000,000 REAL money per 30 min, requires the GLNT Discord server tag (server-verified).
- Daily race (F23): 195B pool / 100B top prize, auto-paid at 00:00Z, no claim endpoint (standings endpoint missing).
- Level / daily / free case rewards (F22): wager-threshold based, free money.
'@
Add-Content -Path $main -Value $text -Encoding UTF8
Set-Content -Path $add -Value $text -Encoding UTF8
Write-Output ("main size = " + (Get-Item $main).Length)
