# Contributing

Contributions should improve reproducibility, accuracy, documentation, or
defensive guidance.

## Before submitting

1. Remove all cookies, tokens, webhooks, personal identifiers, and local paths.
2. Use synthetic or clearly redacted test data.
3. Keep network tests low-impact and owner-authorized.
4. Explain whether evidence is observed, inferred, or still unverified.
5. Preserve the API unit convention: raw monetary values are cents unless the
   source explicitly states otherwise.

## Local checks

```powershell
node .\glint-claimer.mocktest.js
```

JavaScript files should pass `node --check`. PowerShell files should parse
without errors under PowerShell 7.

## Pull requests

- Keep each pull request focused.
- Describe the evidence and reproduction method.
- Link related findings or issues.
- Include remediation advice for security findings.
- Do not commit dependencies, logs, generated files, or local runtime state.

Public pull requests containing active credentials or private account data will
be closed and their exposed credentials should be rotated immediately.
