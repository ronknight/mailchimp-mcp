# Security

## Reporting a vulnerability

Please report security problems privately through the repository's GitHub Security Advisories ("Report a vulnerability"), not in public issues. Include steps to reproduce. Never include real API keys or subscriber data.

## Design

- **Least privilege.** Read tools only by default. Write tools are not registered unless enabled, are limited to unsent drafts, and default to a dry run.
- **No sending.** No code path sends, schedules or deletes campaigns, changes members, or uses batch endpoints.
- **Secrets.** In VS Code, API keys live in Secret Storage. A stored key is bound to the profile settings it was entered for; if those change, you are asked again. Keys are passed to the server process through its environment and are masked in all logs and error messages.
- **Workspace isolation.** Profile and runtime settings are read from user/machine settings only, so a workspace cannot redirect credentials or replace the executable.
- **Input handling.** Ids are validated, path segments are URL-encoded, and the raw GET tool rejects `..` and query strings in its path.
- **Bounded output.** Results are capped in size, and requests have timeouts, bounded retries (reads only, plus HTTP 429) and a concurrency cap.
- **Supply chain.** Two runtime dependencies (`@modelcontextprotocol/sdk`, `zod`), bundled at build time; licenses ship in `THIRD_PARTY_NOTICES.txt`.
