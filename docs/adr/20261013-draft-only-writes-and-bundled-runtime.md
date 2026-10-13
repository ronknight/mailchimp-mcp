# Draft-only writes, bundled runtime, credentials in Secret Storage

- Status: accepted
- Date: 2026-10-13

## Context

The server lets an AI assistant act on a real Mailchimp account. A wrong send reaches every subscriber and cannot be undone. The extension is published on the VS Code Marketplace, so it must install without extra runtimes and must not leak credentials to a malicious workspace.

## Decision

1. Read tools only by default. Write tools are registered only when writes are enabled, are limited to unsent drafts, and default to a dry run. There is no send, schedule, delete or member-change code at all, rather than a disabled flag.
2. The server is TypeScript bundled with esbuild into one file and runs on VS Code's own Node.js (`ELECTRON_RUN_AS_NODE`), so users install nothing else. Other MCP clients run the same file with `node`.
3. VS Code stores keys in Secret Storage, bound to a fingerprint of the profile settings. Profile and runtime settings are user/machine-scoped and workspace values are ignored.

## Consequences

- Sending stays a human step in Mailchimp. Teams that want automated sends need a different tool.
- Changing a profile's settings asks for the key again.
- The shared `src/core` is copied into each sibling MCP server repo and must be kept in step by hand.
