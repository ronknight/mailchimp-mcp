# Changelog

## [Unreleased]

#### 2026-10-13 - Extension icon

- Added an extension icon (`images/icon.png`, source `images/icon.svg`): a glowing envelope in the publisher's node-graph style, plus a dark gallery banner. Original artwork, no Mailchimp branding.

## [0.1.0] - 2026-10-13

#### 2026-10-13 - First release

- Stdio MCP server for the Mailchimp Marketing API (`src/server.ts`, `src/tools.ts`): audiences, members, segments, campaigns, content, send checklist, reports, click/open/activity details, templates and a read-only raw GET.
- Draft-only writes behind `MAILCHIMP_ALLOW_WRITES`: create and update unsent draft campaigns; test emails behind `MAILCHIMP_ALLOW_TEST_EMAILS`. All writes default to dry run. No send, schedule, delete or member changes.
- VS Code extension (`src/extension.ts`, `src/vscode/provider.ts`): one server per profile, keys in Secret Storage bound to profile settings, user/machine-scoped settings only, runs on VS Code's bundled Node.js.
- Offline test suite with a fake fetch; `scripts/nda-check.mjs` pre-publish guard.
