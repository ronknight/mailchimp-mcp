# MCP Server for Mailchimp

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI assistants (GitHub Copilot agent mode in VS Code, Claude Code, Claude Desktop and other MCP clients) read your Mailchimp Marketing data, and optionally prepare draft campaigns.

**It never sends.** No tool sends, schedules, deletes or unsubscribes anything. The only writes are unsent draft campaigns, and only when you switch them on. A person reviews and sends from Mailchimp.

> Not affiliated with or endorsed by Intuit Mailchimp. "Mailchimp" is a trademark of its owner.

## Tools

| Tool | What it does |
|---|---|
| `mailchimp_account_info` | Checks the connection and shows which write features are on |
| `mailchimp_list_audiences`, `mailchimp_get_audience` | Audiences and their stats |
| `mailchimp_list_members`, `mailchimp_get_member`, `mailchimp_search_members` | Audience members (by email; hashing is done for you) |
| `mailchimp_list_segments` | Saved segments and tags |
| `mailchimp_list_campaigns`, `mailchimp_get_campaign`, `mailchimp_get_campaign_content`, `mailchimp_get_send_checklist` | Campaigns, their HTML and what still blocks sending |
| `mailchimp_list_reports`, `mailchimp_get_campaign_report`, `mailchimp_get_click_details`, `mailchimp_get_open_details`, `mailchimp_get_email_activity` | Results of sent campaigns |
| `mailchimp_list_templates` | Email templates |
| `mailchimp_api_get` | Read-only GET to any other Marketing API path |

Only offered when you enable them:

| Tool | Switch | What it does |
|---|---|---|
| `mailchimp_create_draft_campaign` | draft campaign tools | Creates an unsent regular campaign (optionally with HTML) and returns its editor link |
| `mailchimp_update_draft_campaign` | draft campaign tools | Edits settings or HTML of a campaign that is still a draft |
| `mailchimp_send_test_email` | test email tool | Sends a test copy to up to 5 addresses you name |

Every write tool defaults to `dry_run: true`, which only shows the request it would make. The assistant has to call it again with `dry_run: false`. Most MCP clients also ask you to approve each tool call.

## Use in VS Code

1. Install the extension.
2. Run **Mailchimp MCP: Add or Edit Profile** from the Command Palette. Give the profile a name, choose the optional write features (leave them off for read-only), and paste your API key (Mailchimp: Profile > Extras > API keys).
3. Open Copilot Chat in agent mode. The server appears as **Mailchimp** in the tools picker and in the MCP Servers view.

You can add several profiles, for example one per Mailchimp account. Keys are stored in VS Code Secret Storage, never in settings files. The server runs on the Node.js runtime that ships with VS Code, so nothing else needs to be installed.

| Setting | Scope | Purpose |
|---|---|---|
| `mailchimpMcp.profiles` | user | Profiles: `name`, optional `serverPrefix`, `allowWrites`, `allowTestEmails` |
| `mailchimpMcp.nodePath` | machine | Use a different Node.js executable (normally leave empty) |

Both settings are ignored in workspace settings, so a cloned repository cannot change where your key is sent or which program runs.

## Use with other MCP clients

Build once (`npm ci && npm run build`), then point your client at `dist/server.js`. Example for Claude Code (`.mcp.json`) or Claude Desktop:

```json
{
  "mcpServers": {
    "mailchimp": {
      "command": "node",
      "args": ["/path/to/mailchimp-mcp/dist/server.js"],
      "env": {
        "MAILCHIMP_API_KEY": "${MAILCHIMP_API_KEY}",
        "MAILCHIMP_ALLOW_WRITES": "false"
      }
    }
  }
}
```

| Variable | Default | Purpose |
|---|---|---|
| `MAILCHIMP_API_KEY` | (required) | Marketing API key |
| `MAILCHIMP_SERVER_PREFIX` | from key | Data center, e.g. `us1` |
| `MAILCHIMP_ALLOW_WRITES` | `false` | Offer the draft campaign tools |
| `MAILCHIMP_ALLOW_TEST_EMAILS` | `false` | Also offer the test email tool |
| `MAILCHIMP_TIMEOUT_SECONDS` | `30` | Per-request timeout |
| `MAILCHIMP_MAX_CONCURRENCY` | `4` | Parallel requests (Mailchimp allows 10 per key) |
| `MAILCHIMP_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` (logs go to stderr) |

## Privacy and data handling

- The server talks only to `https://<dc>.api.mailchimp.com`. There is no telemetry and no other network traffic.
- Tool results (which can include subscriber emails and names) go to the AI assistant you use. Use the read tools with that in mind.
- API keys and `Authorization` headers are masked in logs and error messages.

## Limits by design

Sending or scheduling campaigns, deleting anything, changing members or tags, automations, batch operations and the Transactional (Mandrill) API are not included.

## Development

```bash
npm ci
npm test          # offline tests; a fake fetch blocks any real network call
npm run build     # bundles dist/extension.js and dist/server.js
npm run package   # .vsix; runs the NDA check, type check and production build first
```

To report a vulnerability, follow SECURITY.md in the source repository.

## License

MIT
