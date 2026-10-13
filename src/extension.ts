// VS Code entry point: registers one Mailchimp MCP server per configured profile.

import * as vscode from "vscode";

import { activateProvider } from "./vscode/provider";

export function activate(context: vscode.ExtensionContext): void {
  activateProvider(context, {
    providerId: "mailchimpMcp.servers",
    section: "mailchimpMcp",
    displayName: "Mailchimp",
    serverScript: "dist/server.js",
    fields: [
      {
        id: "serverPrefix",
        env: "MAILCHIMP_SERVER_PREFIX",
        label: "Data center (optional)",
        placeholder: "e.g. us1 - leave empty to read it from the API key",
        validate: (v) => (/^[a-z]{2}\d+$/.test(v) ? undefined : "Looks like us1, us12, ..."),
      },
    ],
    flags: [
      {
        id: "allowWrites",
        env: "MAILCHIMP_ALLOW_WRITES",
        label: "Draft campaign tools",
        detail: "Create and edit unsent drafts. Each call previews first (dry run). Sending is never available.",
      },
      {
        id: "allowTestEmails",
        env: "MAILCHIMP_ALLOW_TEST_EMAILS",
        label: "Test email tool",
        detail: "Send a test copy of a campaign to up to 5 named addresses. Needs draft campaign tools.",
        requires: "allowWrites",
      },
    ],
    secrets: [
      {
        id: "apiKey",
        env: "MAILCHIMP_API_KEY",
        label: "API key",
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us1",
        validate: (v) => (/^[0-9a-f]{32}-[a-z]{2}\d+$/i.test(v) ? undefined : "A Mailchimp key looks like 32 hex characters, a dash and the data center."),
      },
    ],
  });
}

export function deactivate(): void {
  // Nothing to clean up; VS Code stops the MCP server processes.
}
