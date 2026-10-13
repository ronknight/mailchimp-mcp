# Repository Working Agreement

Instructions for every AI coding assistant working in this repository. `CLAUDE.md` imports this file; edit only this one.

## Hard rules

- **Never call a real Mailchimp account from tests or while developing.** Tests use the fake fetch in `test/helpers.ts`, which refuses any host that does not end in `.test`. Do not add live, sandbox or "smoke" tests.
- **Nothing sends.** Do not add tools that send, schedule, replicate, delete, unsubscribe, batch, or change members, tags or automations. New write tools must be draft-only, default to `dry_run: true`, and be registered only when `MAILCHIMP_ALLOW_WRITES` is true.
- **Public repository.** Never commit real account data: no keys, audience/list ids, campaign titles, company names, hostnames or subscriber details, including in tests, examples and docs. Use invented values (`example.com`, `abc123`). `npm run nda-check` must pass before any publish.
- **Secrets** never appear in logs, errors or tool results; route messages through `Redactor`.
- **Logs go to stderr.** stdout carries the MCP protocol.

## Layout

- `src/core/` shared, API-agnostic pieces (HTTP, redaction, results, tool registration). Kept identical across the sibling MCP server repos; change it in all of them together.
- `src/config.ts`, `src/client.ts`, `src/tools.ts`, `src/server.ts` the Mailchimp server.
- `src/extension.ts`, `src/vscode/provider.ts` the VS Code extension.
- `test/` offline tests (`npm test`).

## Definition of Done

1. `npm test` and `npm run typecheck` pass.
2. Add a dated entry under `## [Unreleased]` in `CHANGELOG.md` (`#### YYYY-MM-DD - <summary>`).
3. Update `README.md` (tool tables, settings) and `docs/` when behavior changes.
4. Update `openspec/diagram/*.md` when the flow changes.
5. Add an ADR in `docs/adr/YYYYMMDD-<kebab-title>.md` for architectural decisions.
