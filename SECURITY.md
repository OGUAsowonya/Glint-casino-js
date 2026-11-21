# Security Policy

## Reporting a repository issue

Do not open a public issue containing:

- session cookies or authentication headers;
- webhook URLs;
- private account identifiers;
- unredacted wallet or transaction records;
- a live exploit path that has not been disclosed to the affected operator.

For repository-level issues, use GitHub's private vulnerability reporting
feature when it is enabled. Otherwise, open a public issue containing only a
high-level description and ask the maintainer for a private contact channel.

## Reporting a GLINT platform issue

This is an independent research repository, not the official GLINT security
contact. Report platform vulnerabilities directly to the affected operator
through its published security or support channel. Allow reasonable time for
remediation before publishing sensitive operational details.

## Supported version

Only the latest revision of this repository is maintained. Historical reports
describe behavior observed at a specific time and may not reflect the current
deployment.

## Secret handling

The repository intentionally excludes local cookies, state, webhooks, editor
metadata, generated media, and environment files. If a secret is committed:

1. Revoke or rotate it immediately.
2. Remove it from the current tree.
3. Purge it from Git history before publishing.
4. Treat forks, caches, and logs as potentially compromised.
