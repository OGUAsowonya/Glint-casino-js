# GLINT Casino — Rigging, Fairness, and Harm Audit

Date: 2026-11-21  
Scope: downloaded current frontend bundles, fairness verifier, existing API observations, and reports F1–F44.  
Money units: API amounts are cents; all dollar amounts below are converted.

## Bottom line

The files do **not** prove that Dice changes outcomes after an account reaches $20–30M profit. That trigger, if real, is server-side and requires round-level history to establish.

The files do prove several other reasons the casino is unsafe or materially unfavorable:

1. **Dice payout caps can silently destroy the advertised 96% RTP at large high-odds bets.**
2. **The fairness system proves reproducibility, not unbiased seed generation or seed selection.**
3. **The fairness page makes a misleading claim about the server being unable to predict results without the client seed.**
4. **Only 30 recent rounds are loaded by the fairness UI, which is inadequate for auditing a long autobet run.**
5. **Autobet accelerates exposure to a 4% edge and provides progression systems that cannot overcome it.**
6. **Multi-step games can charge the edge repeatedly, compounding losses inside one apparent round.**
7. **Some slots disclose only 88% RTP and run through a separate platform and ledger.**
8. **A confirmed rain accounting defect paid zero-contribution entries equal shares of real money.**
9. **The site exposes other players' identifiers and exact stakes.**
10. **Several games disclose unused secret outcome material after settlement, showing poor randomness hygiene.**

These are sufficient to call the product economically dangerous and poorly auditable. They are not, by themselves, proof of adaptive outcome manipulation.

---

## F45 — Dice payout cap can turn a 4% edge into a 95% edge

### Confirmed code

The shared payout helper in `_allchunks/73160-5a98e2838c38f878.js`, module `18761`, is:

```js
function cG(amount, multiplier, limits) {
  const nominal = Math.floor(amount * multiplier);
  const payout = Math.min(nominal, limits.maxPayout);
  return {
    payout,
    profit: payout - amount,
    capped: nominal > limits.maxPayout,
    effective: amount > 0 ? payout / amount : multiplier
  };
}
```

The Dice page `_allchunks/page-906490ba5e7133cc.js`:

- accepts win chances from `0.01%` to `98%`;
- accepts multipliers up to `9900×`;
- displays a muted `Payout (cap …)` / `Profit on win · capped` label;
- does **not** reduce the stake to preserve 96% RTP;
- does **not** display effective RTP or effective house edge;
- allows the capped configuration to run through autobet.

Current limits previously read from `/api/games/limits`:

```text
maxBet    = 25,000,000,000 cents = $250,000,000
maxPayout = 12,500,000,000,000 cents = $125,000,000,000
```

Dice's uncapped multiplier is:

```text
multiplier = 96 / displayedChancePercent
```

At a $250M stake, the payout cap limits the effective multiplier to:

```text
$125B / $250M = 500×
```

| Displayed chance | Nominal multiplier | Effective multiplier | Approx. RTP | Effective house edge |
|---:|---:|---:|---:|---:|
| 0.01% | 9,600× | 500× | 5% | **95%** |
| 0.10% | 960× | 500× | 50% | **50%** |
| 0.192% | 500× | 500× | 96% | 4% |
| 1.00% | 96× | 96× | 96% | 4% |

The cap begins worsening the advertised RTP whenever:

```text
stake > maxPayout / nominalMultiplier
```

For the 0.01% setting, the largest stake that preserves the nominal 9,600× payout is only about:

```text
$125B / 9,600 = $13.02M
```

Allowing a $250M stake at that setting is therefore severely unfavorable. A cap label is not an adequate substitute for showing that the edge changed from 4% to as much as 95%.

### Verdict

**Confirmed unfair payout design.** This is not evidence that the roll itself is manipulated; it is evidence that a displayed high multiplier can cease to be the multiplier actually used for economic return.

### Required fix

- Clamp the stake to `floor(maxPayout / multiplier)`.
- Disable autobet if a requested stake would be capped.
- Display effective multiplier, RTP, and house edge before accepting the bet.
- Reject any configuration whose effective RTP is below the game's advertised RTP.

---

## F46 — “Provably fair” does not prove unbiased seed selection

### What the verifier actually proves

The current fairness bundle `_fair/page-8e78d51e3c8cc312.js` says:

> “We lock in the server seed before you bet and reveal it when you rotate, so you can re-run any round here and get the same result.”

The recovered pipeline is:

```text
HMAC_SHA256(serverSeed, clientSeed + ":" + nonce + ":" + cursor)
```

The existing offline verifier reproduced three historical Mines boards, and duel verification reproduced disclosed boards. This confirms that disclosed inputs can reproduce those outcomes.

### What it does not prove

A hash commitment proves that the operator did not change a particular committed seed after showing its hash. It does **not** prove:

- the seed was generated uniformly;
- the operator did not test many candidate seeds before committing one;
- losing candidate epochs were not selectively chosen;
- every accepted bet was recorded in an append-only public log;
- a payout/accounting rule was not changed based on balance, profit, cadence, or account state;
- the server did not reject, delay, or reroute a bet before settlement.

The fairness page states:

> “We make a random 32-byte seed…”

The client can verify the seed length and hash after disclosure, but it cannot verify the claimed randomness source or the absence of candidate-seed screening.

### Important mitigating detail

The API exposes `nextHashedServerSeed`, and changing the client seed also rotates the pair. If a user independently chooses an unpredictable client seed **after** the next server-seed hash is irrevocably committed, and the server demonstrably uses that exact next commitment, this can prevent useful seed screening for that new client seed. The frontend alone does not prove the complete server-side ordering or rejection behavior.

### Verdict

**Confirmed limitation, not confirmed cheating.** The system provides outcome reproducibility, but the marketing language is broader than what the proof establishes.

---

## F47 — Misleading client-seed claim

The fairness page describes the client seed as:

> “Your half of the randomness. Set it to anything, any time. It's mixed into every result, so we can't predict outcomes without it.”

But the current client obtains `clientSeed` from `/api/fairness`, and rounds are submitted without sending a new secret client seed in each request. The backend necessarily stores or otherwise knows the active client seed to calculate each outcome.

Therefore:

- a user-chosen client seed can stop the operator from choosing a favorable server seed **only if commitment ordering is correct**;
- it does not stop the operator from predicting current outcomes once both active seeds are known to the backend;
- the statement “we can't predict outcomes without it” may be mathematically true in isolation, but is misleading as a protection against the operator because the operator has the value.

### Verdict

**Confirmed misleading explanation.** Client seeds improve commitment design; they do not make current outcomes unknown to the server.

---

## F48 — Long autobet sessions are poorly auditable

The fairness page fetches:

```js
/api/fairness/rounds?limit=30
```

Its table includes:

```text
game, bet, multiplier, payout, nonce, server seed, client seed, verify
```

Thirty rounds are insufficient to investigate:

- a transition after $20–30M profit;
- hundreds or thousands of automatic bets;
- change points by nonce, balance, cumulative profit, or request cadence;
- long-run win-rate confidence intervals.

No public append-only audit feed was found. The endpoint is authenticated and account-scoped. The active seed remains hidden until rotation.

### Verdict

**Confirmed transparency defect.** The site provides a verifier but not a practical long-session audit trail in its UI.

### Required fix

- Add paginated CSV/JSON export for every round.
- Include timestamp, request ID, nonce, committed hash, amount, mode, target/chance, roll, payout, balance before/after, and seed epoch.
- Sign exports or publish a Merkle root / append-only event log.

---

## F49 — Dice has a small probability-denominator mismatch

The shared deterministic Dice result helper in `_fair/1499-51d8bdd53cf6f027.js` generates:

```js
Math.floor(10001 * randomFloat) / 100
```

This produces displayed values from `0.00` through `100.00`, approximately 10,001 discrete outcomes.

The odds helper in `_allchunks/31965-d675570b2dce5936.js` prices Dice ranges using a 10,000-unit denominator:

```js
chance = winningUnits / 100
multiplier = floor4(100 * 0.96 / chance)
```

For a nominal 50% range containing 5,000 winning values, the actual discrete probability is approximately:

```text
5,000 / 10,001 = 49.9950005%
```

instead of exactly 50%. At a 1.92× payout, approximate RTP becomes:

```text
(5,000 / 10,001) × 1.92 = 95.9904%
```

That changes the edge from 4.0000% to roughly 4.0096%.

### Verdict

**Code-level arithmetic discrepancy; low monetary severity.** It is tiny compared with F45, but “the win chance shown is the real one” is not exactly true if the server uses the disclosed 10,001-point result mapping and strict interval rules.

---

## F50 — Repeated-action edge compounds inside one round

Hilo uses:

```text
stepMultiplier = 0.96 / probability
```

so each successful decision has expected-value factor `0.96`. If a strategy requires surviving multiple priced decisions, expected value compounds:

| Priced decisions | Expected-value factor |
|---:|---:|
| 1 | 96.00% |
| 2 | 92.16% |
| 5 | 81.54% |
| 10 | 66.48% |
| 20 | 44.20% |
| 30 | 29.39% |

The already-confirmed extreme case is a displayed `100.00%` Hilo choice paying `0.96×`: a guaranteed successful action that guarantees a 4% reduction. Two such actions reduce the cashout multiplier to `0.9216×`.

RPS similarly increases the displayed multiplier across calls while pricing the game through repeated outcome steps. Calling a multi-step sequence “one round” can obscure how often the edge is applied.

### Verdict

**Confirmed aggressive game design.** It is mathematical pricing, not proof of manipulated randomness, but users can lose far more than a headline “4% edge” suggests during multi-step play.

---

## F51 — Autobet is a loss accelerator, not a separate fair mode

The shared hook `_allchunks/61931-459600384f661a71.js` confirms:

- session profit is calculated locally;
- stop-profit and stop-loss are local browser checks;
- win/loss progression changes the next stake;
- the browser repeatedly invokes the same game request;
- no autobet flag or session-profit value is sent in the explicit Dice payload.

The current Dice request remains:

```json
{
  "amount": 10000,
  "mode": "over",
  "target": 50
}
```

The server can still infer automation from cadence, nonce sequence, balance, and wagering history.

Progression systems do not remove the edge. They increase wager volume and can concentrate losses after streaks. The live account observation—approximately $205.93M falling to $4.04M—shows the practical danger, but without retained per-round data it does not prove an adaptive trigger.

### Verdict

**Confirmed harmful automation design; threshold rigging remains unproven.**

---

## F52 — Slots have far worse RTP and weaker auditability

The slot catalog observed through `_allchunks/page-0bb513fa6a375324.js` contained entries such as:

```json
{
  "provider": "pragmatic",
  "returnBps": 8800
}
```

`8800` basis points means **88% RTP / 12% house edge**, three times the in-house 4% headline edge.

Slots also:

- run through `donutclash.com`;
- use a separate `balanceMinor` ledger;
- settle through server-to-server vendor callbacks;
- are not covered by the in-house seed verifier;
- expose a deployment-wide `testMode` concept;
- rely on a launch ticket that did not include currency, balance, provider, or game ID in its visible payload.

The signature prevents client forgery, but players must trust a second platform, a second ledger, and opaque callback settlement.

### Verdict

**Confirmed high-edge, lower-transparency product.** No evidence was found that slot outcomes can be forged by the browser.

---

## Other confirmed reasons the casino is “bad”

### Rain accounting was economically broken

F32 proved a zero-contribution rain entry received:

```text
floor(pot / entryCount)
```

The observed payout was `3,078,145,750` cents = **$30,781,457.50**, with no matching entry debit. This demonstrates that the production economy has contained a major real-money accounting defect.

### Bonus and reward design encourages negative-EV wagering

- Welcome funds were play money until deposit/wager conditions were met.
- Daily and rakeback rewards were smaller than the underlying wagering edge in the measured tiers.
- The interface encourages turnover even where rewards do not offset expected losses.
- Withdrawal applies a 2% tax after the gambling edge.

### Privacy leakage

`/api/live/bets` and `/api/games/flips` exposed other players' user IDs, levels, and exact stakes. This is unnecessary personal and financial activity disclosure.

### Randomness hygiene defects

Settled responses disclosed more secret material than required:

- Mines: full mine board;
- Floor-is-Lava: full hazard set for a completed jump;
- RPS: entire unused pre-generated house series;
- Mines Duel: plaintext seed and full board after settlement.

Post-settlement disclosure is not itself a predictive exploit, but exposing unused random streams increases damage if seed reuse or epoch separation ever fails.

### Inconsistent and fragmented systems

- Slots use a separate platform and ledger.
- Promo redemption had REST and chat command paths.
- Several advertised or guessed surfaces returned 404/405.
- Earlier documentation repeatedly confused cents and dollars, illustrating how difficult the product's economics are to audit correctly.

---

## Evidence classification

### Proven unfair or harmful

- Dice payout cap can reduce RTP as low as approximately 5% at allowed settings.
- Hilo charges 4% on a 100%-certain action and compounds edge per decision.
- Slots can advertise 88% RTP.
- Autobet and progression increase exposure without changing mathematical expectation.
- Fairness UI only loads 30 rounds.
- Rain paid equal real-money shares to zero-contribution entries.
- Other players' identifiers and exact stakes were exposed.

### Proven transparency limitations

- Commit–reveal proves consistency, not random seed selection.
- The backend knows the active client seed.
- Current outcomes cannot be independently checked until the seed is rotated.
- Long-run account history is not publicly auditable.
- Third-party slots are outside the in-house verifier.

### Still unproven

- Dice starts cheating specifically after $20M, $25M, or $30M profit.
- Selecting “Auto” directly activates a different RNG.
- The backend changes committed results after a bet.
- A particular account is individually targeted.

---

## What would prove or disprove the $20–30M trigger

Export all Dice rounds around the first crossing of $15M through $35M cumulative session profit:

```text
roundId
timestamp
seedEpoch / serverSeedHash
clientSeed
nonce
amount
mode
target / displayedChance
nominalMultiplier
effectiveMultiplier after cap
roll
win
payout
balanceBefore
balanceAfter
cumulativeSessionProfit
cumulativeAccountProfit
```

Then:

1. Separate capped from uncapped bets.
2. Recompute every roll after rotating and revealing the seed.
3. Compare observed wins with the exact discrete probability, not only the displayed percentage.
4. Test change points at $20M, $25M, and $30M.
5. Control for stake progression, payout caps, nonce, cadence, and seed-epoch boundaries.
6. Compare manual and automatic sequences at matched cadence and stakes.

Until that dataset exists, the accurate conclusion is:

> The casino contains confirmed severe payout, transparency, economic, and privacy defects. Its current frontend does not prove a profit-triggered Dice RNG switch, but its audit tooling is too limited to rule one out from a long autobet session.
