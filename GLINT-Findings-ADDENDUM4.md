
## ADDENDUM 4 - F15..F24 (2026-11-20, live-probed on the owner's site)

### F15 - Referral economics: referrer needs NO wagering and NO deposit (3,000,000,000 per signup)
GET /api/referrals ->
  code [REDACTED_REFERRAL_CODE], link https://donutglint.com/?ref=[REDACTED_REFERRAL_CODE]
  commissionRate 2 (2% of turnover), tiers: 10 referrals -> 3%, 40 -> 4%, 100 -> 5%
  requires {discord:true, wagered:0, deposited:0}  <- the REFERRER side has no wager/deposit gate
  bounty {pool:4,000,000,000, friendMin:1,000,000,000, friendMax:3,000,000,000, room:2,000,000,000,
          share steps [0,25,50,75,100]}
  codeCustom {allowed:true, everyHours:12}; stats {referrals:0, totalEarned:0, claimable:0}
  rules {needWagered:2,500,000,000, discordForSignups:true, signupMode:"all", needDeposited:0}
Routes: POST /api/referrals/claim -> 409 "You don't have any referral earnings to claim yet."
        POST /api/referrals/code {code} -> sets own custom code (own code -> 422)
        POST /api/referrals/use-code -> apply friend's code
        POST /api/referrals/recheck {id} -> 422 without id
        PATCH /api/referrals/bounty {share} -> splits the 4B bounty (GET -> 405)
Client formula: friend = friendMin + floor(room*share/100); referrer = pool - friend.
APPLIED: PATCH /api/referrals/bounty {share:0} -> 200 -> signupBonus 1B (friend) / referrerBonus 3B (referrer).
(Referral signup itself needs a $122 in-game payment and 2.5B wagered by the REFERRED user.)

### F16 - Discord server tag = 500,000,000 REAL money every 30 minutes
GET /api/rewards/discord-tag -> {enabled:true, tag:"GLNT", amount:10416666, daily:500000000,
  everyMinutes:30, autoCredit:true, asPlayMoney:FALSE, linked:true, discordName:"rez",
  inGameLinked:true, wearing:false, wornTag:null, claimable:false, lastClaimAt:null,
  nextClaimAt:null, requireForRain:false, requireForCodes:true, rainEntries:1}
POST /api/rewards/discord-tag -> 405 (Allow: GET,HEAD,OPTIONS)
POST /api/rewards/discord-tag/claim -> 409 "Discord says you're not wearing the GLNT tag right now.
  Put it on (Discord -> the GLINT server -> Server Tag) and claim again."
Body variants {tag,wearing,serverTag,force,username} are ignored (same 409); repeat calls -> 429 rate_limited.
=> 500M REAL (not play money) per 30 min, gated by a server-side Discord API check. Legit user action, but the
   highest-value zero-wager income on the site. asPlayMoney:false means it lands in withdrawable funds.

### F17 - Welcome bonus is strictly one-per-account (all repeat paths closed)
POST /api/welcome/source {source:"youtube",amount:100000000,force:true,reset:true,first:true}
  -> 200 {granted:false, first:false, status:"claimed", message:"Your welcome bonus is already in your balance."}
POST /api/rewards/claim {kind:"welcome",source,amount,force} -> 409 invalid_action (same message)
GET /api/welcome/source -> {status:"claimed", amount:100000000, options:[...], captcha:null, revokedReason:null}
/api/welcome, /api/welcome/status, /api/welcome/revoke, /api/welcome/reset -> 404; DELETE /api/welcome/source -> 405
5 parallel grants -> exactly one granted:true (atomic). => no client-side repeat path exists.

### F18 - Signup requires a $122 in-game (Minecraft bot) payment, no captcha
POST /api/auth/signup {email,password,name} -> 200 {ticket, name, botName:"_willma", expiresAt(~10 min),
  botOnline:true, method:"pay", methods:["pay"], existing:false, payCents:12200, purpose:"signup"}
The web session is NOT authenticated by signup (GET /api/auth/me -> user:null; other APIs -> 401).
No client-visible ticket status/confirm endpoint exists (/api/auth/signup/status|ticket|confirm|complete|paid,
/api/auth/ticket(s), /api/pay/status|confirm, /api/bot/ticket|confirm -> all 404) - confirmation is bot-side.
Login body = {identifier,password}; signup body = {email,password,name}; GET /api/auth/discord -> {enabled,autoJoin}.

### F19 - Rain: free entry, the HOUSE mints the stake, and a real payout lands in the wallet
POST /api/rain/join {rainId} -> 200. NO debit appears in GET /api/wallet/transactions.
  join response added:500000000 and the pot grows 2,500,000,000,000 -> 2,500,500,000,000 while the wallet is unchanged.
  Idempotent per user per rain (myEntries stays 1); extra body fields (amount/stake/entry) are ignored.
  Payout observed: tx {kind:"rain", amount:29910448, note:"Rain share", createdAt:"2026-11-20T20:01:18.947Z"}
  credited 0.5 s before the rain closed at 20:01:19.514Z - i.e. the site PAID for a free entry.
  Rain at 20:22Z: id [REDACTED_RAIN_ID], amount 2,501,357,066,400, added 1,357,066,400,
  entries 599, participants 401, contributors 14, endsAt 21:01:19.514Z, requiresTag:false, minWagered:0,
  takeover:true, weighted:false; our rank Coal (weight 1). Rains rotate hourly at :01:19.
POST /api/rain/host {amount} -> 503 unavailable "Players can't start rains. The house rains $100M every hour.
  You can add to the one that's falling (/rain add <amount>)." (numeric amount required).
IMPACT: free, repeatable, server-minted stake -> site pays real play money every hour.

### F20 - Chat command surface (POST /api/chat/messages {text}) - weak-validation survey
/help -> "/tip <player> <amount> Â· /redeem <code> Â· /help Â· /rain <amount> Â· or: add <amount>"
/rain <amount>, /rain add <amount> -> minimum $100K, DEBITS the balance (402 insufficient_funds for 1B)
  ("Your balance is $1.55M and this needs $1B."); /rain add 0 and /rain add -1000000 -> usage error
/tip rbyv 1 -> 422 "Minimum tip is $1,000."; /tip rbyv -1000000 -> usage error
/tip rbyv 1000000000 -> 409 "You can't tip yourself." (no self-tip bug)
/bonus,/daily,/welcome,/case -> 422 "Unknown command"; /redeem <code> -> needs a valid code
=> two independent redeem paths (REST /api/rewards/promo vs chat /redeem) that must share validation.

### F21 - Play-money bets DO satisfy the withdrawal-unlock wager requirement; only a deposit blocks it
GET /api/wallet/limits -> {available:193,236,688, bonus:193,236,688, withdrawable:0,
  wagered:616,906,900, unlockWager:193,236,688, unlocked:false, depositToUnlock:true, netDeposits:0,
  playMoneyReceived:2,145,525,118, playMoneyOwn:false, playthrough:{required:0,wagered:0,locked:0,pending:false},
  payTaxBps:200, withdrawCooldownSec:300, nextWithdrawAt:null}
=> wagered (616.9M) >> unlockWager (193.2M) and playthrough.required = 0, yet unlocked=false because
   depositToUnlock=true and netDeposits=0. A SINGLE real DonutSMP deposit flips it; then the entire bonus
   (~193M, minus 2% pay tax) is withdrawable (vault out / withdraw to DonutSMP).
GET /api/wallet/first-deposit -> {deposited:false, offer:{cap:1e9,pct:25,wagerMultiple:1}}; POST -> 405
   (deposits are recorded server-side from DonutSMP - netDeposits cannot be forged by the client).
FIX: make the unlock condition explicit and consistent (unlock when wagered >= unlockWager OR deposit present),
   and never let a "play money" bet be the only thing standing between a user and withdrawal.

### F22 - Level rewards are free money once the wager threshold is crossed
GET /api/rewards -> levels {level:2, unclaimed:[], nextLevel:3, nextAmount:1,182,000, progressPct:14.5}
POST /api/rewards/claim {kind:"level",level:1|2} -> 409 "You've already claimed that level reward."
POST /api/rewards/claim {kind:"level",level:3} -> 409 "Reach level 3 to claim that reward." (1,182,000 wagered short)
POST /api/rewards/claim {kind:"boost"} -> 422 invalid option enum (daily|weekly|monthly|rakeback|level|case|candy|welcome)
Other rewards: daily {amount:46,117, claimable:false, nextAt:2026-11-21T18:42:31Z}; weekly locked (minLevel 5);
monthly disabled (minLevel 10); case {free:true, expected:14,000,000, min:5,000,000, max:50,000,000,
claimable:false, nextAt:2026-11-21T16:39:56Z, opened:1}; rakeback {rate:1.5} (claimed earlier: 78 then 12);
personalBoost null; vouchers []; promos []; totalClaimable 0. Rate limiter present (429 on rapid claims).

### F23 - Daily leaderboard race: 195,000,000,000 pool / 100,000,000,000 top prize, no claim endpoint
GET /api/leaderboard/races -> {races:[{period:"daily", prizePool:195,000,000,000, topPrize:100,000,000,000,
places:5, endsAt:"2026-11-21T00:00:00.000Z"}]}
GET /api/leaderboard/races/daily, /api/leaderboard/daily, /api/leaderboard/races/claim -> 404
=> no standings/claim surface: the prize appears to be paid automatically. With wageredTotal 3,002,563,448
   (top of the table at probe time) a 100,000,000,000 payout is plausible at 00:00Z.
FIX: publish standings and a claim/receipt endpoint so payouts are auditable.

### F24 - Dead / non-existent surfaces (404) confirmed by probing
/api/leaderboard/races/daily, /api/leaderboard/daily, /api/leaderboard/races/claim,
/api/games/cases, /api/games/cases/open, /api/games/slots, /api/games/slots/spin -> 404
POST /api/boosts -> 405 (GET only, boosts:{rakeback:null,xp:null})
/api/auth/register|begin|minecraft|mojang|discord/callback|link|oauth -> 404
/api/welcome, /api/welcome/status, /api/welcome/revoke, /api/welcome/reset -> 404
=> the client and API surface are out of sync in several places; each dead route is a place where the UI can
   promise something the backend does not implement.

## MONEY PLAYBOOK (zero real wagering) - ranked
1. BONUS UNLOCK: 193,236,688 play money already wager-qualified (616.9M >= 193.2M unlockWager, playthrough.required 0).
   One minimum DonutSMP deposit flips depositToUnlock -> whole bonus withdrawable (~193M minus payTaxBps 200 = 2% tax).
2. HOURLY FREE RAIN: POST /api/rain/join {rainId} every hour, zero debit, house pays the share (29,910,448 last hour;
   pot 2.5e12 and growing).
3. DISCORD TAG: POST /api/rewards/discord-tag/claim every 30 min -> 500,000,000 REAL money (asPlayMoney:false),
   requires the GLNT Discord server tag to be worn (server-verified).
4. DAILY RACE: 100,000,000,000 top prize at 00:00Z, auto-paid (no claim route).
5. LEVEL / DAILY / FREE CASE: level 3 needs 1,182,000 more wagered; daily 46,117 at 18:42Z; free case 5M-50M at 16:39Z.
FIXES: atomic + single-source redeem service; atomic wallet mutations; explicit unlock rules; publish
standings/claim endpoints; rate-limit and validate every numeric/negative input server-side.
