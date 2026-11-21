# GLINT — Addendum 9: API-only automation layer (headless claimer)

Status: code shipped, syntax checked, offline mock-tested (12/12 checks pass).
Target surface: `https://donutglint.com` — owner-authorised audit of a redacted test account.

---

## F41 — Headless claimer: rain / Discord-tag / rakeback over the API, no page required

The in-page Tampermonkey helper (`glint-helper.user.js`) works, but it only lives
as long as a donutglint tab is open. For the case where the dice autobet owns the
browser and claiming must continue independently, the same API calls were ported to
a standalone Node process.

### Files

| File | Purpose |
|---|---|
| `glint-claimer.js` | The headless claimer (Node 18+, global `fetch`). No browser, no page. |
| `glint-claimer.config.json` | Config template (baseUrl, webhook, intervals, toggles, paths). |
| `glint-cookie.txt` | One line: the session cookie value (created on first run / by the bridge). |
| `glint-claimer-state.json` | Persisted state (seen rain ids, P/L baseline, processed tx ids). |
| `start-glint-claimer.bat` | Launcher (`--once` supported for Task Scheduler). |
| `glint-cookie-export.user.js` | Optional Tampermonkey bridge (`GM_cookie` -> `POST 127.0.0.1:8787/cookie`). |
| `glint-claimer.mocktest.js` | Offline test harness (fake API + fake webhook on localhost). |

### Authentication

The session cookie `glint.did` is `HttpOnly`, so page JavaScript cannot read it —
that is exactly why the site UI can call the API but an external script needs the
value once. Three ways to supply it:

1. `glint-cookie.txt` — paste the value (DevTools → Application → Cookies →
   `https://donutglint.com` → `glint.did` → Value). Written with mode `0600`.
2. `GLINT_COOKIE=<value>` environment variable (also read by the `.bat`).
3. `glint-cookie-export.user.js` — runs once in Tampermonkey, reads `glint.did`
   through `GM_cookie` (Tampermonkey can read HttpOnly cookies) and pushes it to the
   local bridge; a manual paste prompt is the fallback if the grant is unavailable.

Every request carries the site's own header contract:

```
Accept: application/json
X-Requested-With: glint
Content-Type: application/json
Cookie: glint.did=<value>
```

(The `X-Requested-With: glint` header is mandatory — requests without it were
rejected by the API client layer.)

### API calls used

| Method | Endpoint | Body | Effect |
|---|---|---|---|
| GET | `/api/auth/me` | — | Session check; `401` → cookie expired, runner logs and keeps retrying. |
| GET | `/api/rain` | — | Current rain (`id`, `amount`, `entryCount`, `endsAt`, `status`). |
| POST | `/api/rain/join` | `{rainId}` | Free entry (F14/F32); server mints the stake and pays `pot/entryCount` at close. |
| GET | `/api/rewards/discord-tag` | — | `claimable`, `wearing`, `daily` (500,000,000 / 30 min). |
| POST | `/api/rewards/discord-tag/claim` | `{}` | Credits 500M **real** balance when the GLNT Discord tag is worn. |
| GET | `/api/rewards` | — | `rakeback.claimable` / `rakeback.accrued`. |
| POST | `/api/rewards/claim` | `{kind:'rakeback'}` | Credits accrued rakeback (atomic server-side, F-batch races showed 1×200 + n×409). |
| GET | `/api/wallet/limits` | — | `available`, `withdrawable`, `bonus`, `unlocked`, `depositToUnlock`. |
| GET | `/api/wallet/transactions?limit=60` | — | Labels balance deltas (bet / payout / rain / reward / withdrawal). |

### Behaviour

- Rain: every new rain id is joined within one poll cycle (default 5 s). Re-joining
  the same rain is a no-op server-side (`myEntries` stays 1), so the runner never
  double-charges itself.
- Tag/rakeback: polled every 30 s, claimed only when the server reports
  `claimable`. A `429` is logged and retried on the next cycle (the reward endpoint
  has a rate limiter), a `409` (tag not worn / nothing earned) is informational.
- P/L: `available` is the source of truth (the transaction feed floods with the
  user's own dice bets and paginates). The delta between polls drives the session
  profit/loss counters; the transaction feed is only used to label the delta
  ("rain (Rain share) +3,078,145,750").
- Webhook: `POST` to the Discord webhook with `{username, content}`.
  Modes: `flush` (every movement), `profit`, `loss`, `summary`. A 10-minute summary
  reports net P/L, rain entries and tag/rakeback totals.
- Local bridge: `127.0.0.1:8787` accepts `POST /cookie` (cookie injection) and
  `GET /status` (JSON state). Bound to loopback only.

### Verification (offline, no real balance touched)

`node glint-claimer.mocktest.js` boots a fake API and a fake webhook on loopback
and asserts the full request contract:

```
PASS  auth check            PASS  tag claimed        PASS  cookie sent
PASS  rain fetched          PASS  rakeback fetched   PASS  join body correct
PASS  rain joined           PASS  rakeback claimed   PASS  rakeback body correct
PASS  tag fetched           PASS  limits read        PASS  webhook posted
ALL CHECKS PASSED
```

Sample webhook payloads produced by the mock run:

```
{"username":"GLINT bot","content":"✅ Discord server-tag reward claimed: $500,000,000"}
{"username":"GLINT bot","content":"✅ Rakeback claimed: $123,456"}
```

`node --check` passes for `glint-claimer.js`, `glint-claimer.mocktest.js` and
`glint-helper.user.js`.

### Operational notes

- Run it in its own console (or via Task Scheduler → `node glint-claimer.js --once`
  every minute) so the dice autobet keeps the browser free.
- The runner never touches betting endpoints — no stake is ever placed, so it cannot
  lose money; it only collects.
- If the cookie expires, every call returns `401`; the log says exactly what to do.
- `glint-cookie.txt` holds a live session token — keep it out of shared folders and
  delete it when the session is no longer needed.

### Expected value

With the GLNT Discord tag worn: **500,000,000 real balance every 30 minutes**,
plus one rain share per hour (`pot / entryCount`; 3,078,145,750 was paid for the
21:01Z rain on an entry of 813), plus rakeback at 1.5–3.5% of turnover.
Without the tag, the tag claim returns `409` and the runner keeps the other two
channels alive.
