// Entry point: stdio MCP server. Used by the VS Code extension and by any other MCP client.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { MailchimpClient, USER_AGENT } from "./client";
import { loadConfig } from "./config";
import { configureLog, log } from "./core/log";
import { Redactor } from "./core/redact";
import { registerTools } from "./tools";

const VERSION = USER_AGENT.split("/")[1];

const INSTRUCTIONS = `Tools for the Mailchimp Marketing API.
- Reads are safe. Prefer the dedicated tools; use mailchimp_api_get only when none fits.
- This server never sends or schedules campaigns. Draft tools exist only when the user enabled writes, and they default to dry_run=true: show the preview to the user before calling again with dry_run=false.
- Use status=sent when counting real sends; drafts have status=save.
- Keep pages small (count) and use fields to trim large responses.`;

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv.includes("--version")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (argv.includes("--help")) {
    process.stdout.write(
      "mailchimp-mcp: stdio MCP server for the Mailchimp Marketing API.\n" +
        "Environment: MAILCHIMP_API_KEY (required), MAILCHIMP_SERVER_PREFIX, MAILCHIMP_ALLOW_WRITES,\n" +
        "MAILCHIMP_ALLOW_TEST_EMAILS, MAILCHIMP_TIMEOUT_SECONDS, MAILCHIMP_MAX_CONCURRENCY, MAILCHIMP_LOG_LEVEL.\n",
    );
    return;
  }

  const redactor = new Redactor();
  const config = loadConfig();
  configureLog("mailchimp-mcp", config.logLevel);
  const client = new MailchimpClient(config, redactor);

  const server = new McpServer({ name: "mailchimp-mcp", version: VERSION }, { instructions: INSTRUCTIONS });
  registerTools({ server, redactor, allowWrites: config.allowWrites }, client);

  await server.connect(new StdioServerTransport());
  log.info(
    `ready (data center ${config.serverPrefix}; draft writes ${config.allowWrites ? "ON" : "off"}; test emails ${
      config.allowWrites && config.allowTestEmails ? "ON" : "off"
    })`,
  );
}

if (require.main === module) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    process.stderr.write(`[mailchimp-mcp] fatal: ${new Redactor().text(message)}\n`);
    process.exit(1);
  });
}
