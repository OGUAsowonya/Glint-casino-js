# GLINT Research Toolkit

Security research notes, reproducibility scripts, browser userscripts, and a
headless helper for the GLINT / DonutSMP casino frontend.

This repository documents frontend behavior, game math, API contracts, and
responsible remediation recommendations observed during a technical review. It
is an independent research project and is not affiliated with, endorsed by, or
maintained by GLINT or DonutSMP.

## What's included

### Research reports

- [`GLINT-DonutSMP-Casino-Findings.md`](GLINT-DonutSMP-Casino-Findings.md) —
  consolidated findings and methodology.
- [`GLINT-RIGGING-AND-FAIRNESS-AUDIT.md`](GLINT-RIGGING-AND-FAIRNESS-AUDIT.md) —
  analysis of provably-fair behavior and payout math.
- [`GLINT-REFERRALS-AUDIT.md`](GLINT-REFERRALS-AUDIT.md) — referral-system
  observations.
- `GLINT-Findings-ADDENDUM*.md` — supporting sessions, corrections, and
  follow-up evidence.

Values copied directly from the GLINT API are generally represented in cents.
Read the unit note at the top of the consolidated report before interpreting
financial figures.

### Tools

| File | Purpose |
| --- | --- |
| [`glint-claimer.js`](glint-claimer.js) | Node.js helper for rain, rewards, rakeback, wallet tracking, and optional webhook summaries |
| [`glint-helper.user.js`](glint-helper.user.js) | Browser GUI userscript with claim and session tracking controls |
| [`glint-cookie-export.user.js`](glint-cookie-export.user.js) | Optional localhost bridge for transferring a session cookie to the headless helper |
| [`mines-gui.user.js`](mines-gui.user.js) | Mines interface helper |
| [`rain-farmer.user.js`](rain-farmer.user.js) | Rain helper |
| [`discord-tag.user.js`](discord-tag.user.js) | Discord-tag reward helper |
| [`validate-mines.js`](validate-mines.js) | Offline Mines validation |
| [`verify-duel.js`](verify-duel.js) | Offline duel/fairness test vectors using anonymized identifiers |

The PowerShell scripts are research and extraction utilities. They use paths
relative to the repository through `$PSScriptRoot`.

## Requirements

- Node.js 18 or newer
- A userscript manager such as Tampermonkey for `*.user.js` files
- PowerShell 7 is recommended for the research scripts

## Headless helper quick start

1. Clone or download the repository.
2. Keep authentication material out of tracked files.
3. Supply the session cookie using an environment variable:

   **PowerShell**

   ```powershell
   $env:GLINT_COOKIE = "your-glint.did-value"
   node .\glint-claimer.js --once
   ```

   **Command Prompt**

   ```bat
   set "GLINT_COOKIE=your-glint.did-value"
   node glint-claimer.js --once
   ```

4. For persistent local settings, copy the safe template:

   ```powershell
   Copy-Item glint-claimer.config.json glint-claimer.local.json
   node .\glint-claimer.js --config .\glint-claimer.local.json
   ```

   `glint-claimer.local.json`, `glint-cookie.txt`, and runtime state are ignored
   by Git.

5. Run continuously after confirming a single pass works:

   ```powershell
   node .\glint-claimer.js --config .\glint-claimer.local.json
   ```

Use `node glint-claimer.js --help` for CLI options.

## Userscript installation

1. Install a userscript manager.
2. Open the desired `*.user.js` file.
3. Create a new userscript and paste the complete file.
4. Review its permissions and configuration before enabling it.
5. Add your own webhook through the UI only if needed. No webhook is bundled.

Never publish session cookies, webhook URLs, local state files, or copied
browser storage.

## Validation

Run the offline helper test:

```powershell
node .\glint-claimer.mocktest.js
```

The GitHub Actions workflow performs JavaScript and PowerShell syntax checks,
the helper mock test, and JSON validation on every push and pull request.

## Repository layout

```text
.
├── GLINT-DonutSMP-Casino-Findings.md
├── GLINT-Findings-ADDENDUM*.md
├── glint-claimer.js
├── glint-claimer.config.json
├── *.user.js
├── verify-duel.js
├── validate-mines.js
└── *.ps1
```

Folders beginning with `_` contain downloaded frontend bundles used as
read-only research evidence. GitHub language statistics mark them as generated.

## Responsible use

- Use these tools only with accounts and systems you are authorized to test.
- Prefer offline validation and minimum-impact requests.
- Do not include credentials, personal identifiers, or active session data in
  issues or pull requests.
- Reconfirm observations against the current deployment before relying on
  historical findings.
- Report newly discovered vulnerabilities privately to the affected operator
  before publishing operational details.

See [`SECURITY.md`](SECURITY.md) for reporting guidance.

## Contributing

Corrections, reproducible tests, documentation improvements, and defensive
recommendations are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before
opening a pull request.

## License

No open-source license has been selected yet. Until a `LICENSE` file is added,
normal copyright restrictions apply. Choose and add a license before inviting
broad reuse or redistribution.
