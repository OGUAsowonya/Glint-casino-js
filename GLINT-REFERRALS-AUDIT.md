# GLINT `/referrals` audit

Audit date: 2026-11-21  
Target: `https://donutglint.com/referrals`  
Current referral bundle: `/_next/static/chunks/app/(app)/referrals/page-933ed5ecf1c2a9a2.js`

## Summary

- **0 critical**
- **0 high**
- **5 medium**
- **7 low**
- **6 verified passes**

The public/guest flow loads and renders without JavaScript exceptions at 375 px. All 57 internal links and assets referenced by the page returned 2xx. The unauthenticated private referrals endpoint correctly returned 401.

The authenticated-only UI and mutations could not be exercised because the saved local session cookie had expired.

## Findings

### RF-01 — Commission chart is mouse-only (Medium)

The 14-day SVG chart exposes each bar's value only through `onMouseEnter`/`onMouseLeave` on transparent `<rect>` elements. Those elements are not focusable and have no keyboard, touch, or screen-reader equivalent. The SVG only has the broad label “Referral commissions over the last 14 days”; it does not expose the daily values.

**Impact:** keyboard, touch, and screen-reader users cannot inspect individual daily commissions.

**Location:** referral bundle, function `E`.

**Fix:** render a visually hidden table/list of day/value pairs, and make interactive chart targets focusable with `tabIndex="0"`, `onFocus`, `onBlur`, and useful accessible names.

### RF-02 — Status and earnings details rely on `title` tooltips (Medium)

In the referral list:

- “Active” is represented by a dot with only `title="Active"`.
- The earned-value breakdown is stored only in a dynamic `title` attribute.
- Rejection/hold details are similarly packed into hover text.

`title` is unreliable on mobile and is inconsistently announced by assistive technology.

**Impact:** important qualification and payment details are unavailable to touch and keyboard users.

**Location:** referral bundle, function `V`.

**Fix:** add visible expandable details or an accessible disclosure button; include screen-reader text for active state.

### RF-03 — Progress bar has no accessible name (Medium)

The shared progress component emits `role="progressbar"`, `aria-valuenow`, and `aria-valuemax`, but no `aria-label`/`aria-labelledby`. The referrals page uses it for qualification progress.

**Impact:** a screen reader announces an unnamed progress bar with no explanation of what is progressing.

**Location:** chunk `7666-f2f9601e7bb487d4.js`, component exported as `ke`; used by referral function `G`.

**Fix:** accept a required label prop and emit `aria-label`, `aria-valuemin="0"`, and an appropriate `aria-valuetext` such as “$10M of $25M wagered”.

### RF-04 — Mobile navigation marks the wrong URL as the current page (Medium)

On `/referrals`, the mobile navigation emits:

```html
<a aria-current="page" href="/rewards">…Rewards</a>
```

The desktop header simultaneously styles both “Referrals” and the “Rewards” group as active.

**Impact:** assistive technology reports `/rewards` as the current page while the browser is on `/referrals`; visual navigation state is ambiguous.

**Fix:** give `/referrals` its own current item, or use a non-link group indicator with `aria-current="location"` while ensuring only the actual current destination uses `aria-current="page"`.

### RF-05 — No Content Security Policy (Medium)

The document and API responses do not send a `Content-Security-Policy` header. Existing `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy` headers are good but do not mitigate script injection.

**Impact:** any future HTML/script injection has fewer browser-enforced limits.

**Fix:** deploy a nonce- or hash-based CSP. Start with `Content-Security-Policy-Report-Only`, inventory required origins, then enforce it.

### RF-06 — Clipboard failure fallback is not actually usable (Low)

When `navigator.clipboard.writeText()` fails, the code shows a short-lived “Copy manually” toast. The referral URL displayed in the page is deliberately truncated (`truncate`), so a user denied clipboard permission has no persistent, fully visible/selectable copy control.

**Location:** referral bundle, functions `W` and `L`.

**Fix:** show the full URL in a read-only input with a selectable value, or open a persistent dialog when clipboard access fails.

### RF-07 — “Share” choices only copy the same link (Low)

Buttons labelled “Discord”, “Send DM”, “Email”, and “Anywhere” all perform the same clipboard write. No email composer, native share sheet, or destination is opened.

**Impact:** the labels imply distinct actions that do not occur.

**Fix:** rename them to “Copy for Discord”, etc., or implement `navigator.share`, `mailto:`, and supported deep links with a copy fallback.

### RF-08 — Empty chart uses a misleading $1M scale (Low)

When every chart amount is zero, the chart maximum function returns `1e8` cents, which formats as `$1M`. The empty-state panel overlays the chart, but the artificial scale remains in the accessibility/render tree.

**Location:** referral bundle, function `E`: `if(e<=0)return 1e8`.

**Fix:** omit the axis/chart entirely for an empty series, or use a neutral zero scale.

### RF-09 — Referral SEO metadata is generic and has no canonical URL (Low)

The page title is specific, but the description and Open Graph/Twitter title describe the casino generally. No canonical link or `og:url` is present.

**Impact:** weaker referral-page search snippets and ambiguous social previews.

**Fix:** add referral-specific description, Open Graph title/description/URL, and:

```html
<link rel="canonical" href="https://donutglint.com/referrals">
```

### RF-10 — “Real money” wording conflicts with the site disclaimer (Low)

Referral copy says commission and prizes are “real money,” while the footer says everything is DonutSMP in-game money and is never bought or sold for real-world currency.

**Impact:** users may reasonably interpret the referral reward as real-world currency.

**Fix:** consistently use a precise term such as “withdrawable DonutSMP balance” and reserve “play money” for wager-locked bonuses.

### RF-11 — Awkward duplicated wording (Low)

Guest instructions say:

> “Your friend has to link their DonutSMP account and link their Discord.”

**Fix:** “Your friend has to link both their DonutSMP and Discord accounts.”

### RF-12 — Page is unusable without JavaScript (Low)

The server response contains navigation/footer plus loading skeletons. Referral content is client-rendered; with JavaScript disabled, the splash is hidden but the page never progresses beyond loading placeholders.

**Impact:** poor resilience, crawler semantics, and no-JS accessibility.

**Fix:** server-render the guest explanation and, where authentication permits, the initial referral overview; retain client hydration for interactions.

## Verified passes

- `/referrals` returned **200** and rendered at a true 375×812 emulated viewport with no horizontal overflow.
- No uncaught page/runtime JavaScript exceptions were observed.
- All **57** internal links/assets referenced by the page returned **2xx**.
- `/api/referrals` returned **401** to an unauthenticated request with `Cache-Control: no-store`.
- `/api/referral-race` returned a valid minimal public response and `Cache-Control: no-store`.
- Security basics present: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`.

## Additional observations

- `Strict-Transport-Security` was not observed. Add HSTS after confirming every subdomain is HTTPS-ready.
- The page references 41 JavaScript chunks totaling about 1.34 MB uncompressed on disk. Hashed static assets are correctly served with one-year immutable caching.
- The HTML response is intentionally `private, no-cache, no-store`; compressed transfer was approximately 15 KB in this test.
- The saved `glint-cookie.txt` session returned 401, so claim, bounty split, code entry, recheck, authenticated chart/list data, and real overlay-code behavior remain unverified.
