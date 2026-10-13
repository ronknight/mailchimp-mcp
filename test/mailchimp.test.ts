import assert from "node:assert/strict";
import { test } from "node:test";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MailchimpClient, subscriberHash } from "../src/client";
import { loadConfig } from "../src/config";
import { ConfigError } from "../src/core/errors";
import { Redactor } from "../src/core/redact";
import { registerTools } from "../src/tools";
import { connect, fakeFetch, json, Route, text } from "./helpers";

// Invented key; the base URL points at a .test host the fake fetch enforces.
const KEY = "fake-test-key-us99";

async function setup(env: Record<string, string>, routes: Route[] = []) {
  const config = loadConfig({ MAILCHIMP_API_KEY: KEY, MAILCHIMP_BASE_URL: "https://mc.test/3.0", ...env });
  const redactor = new Redactor();
  const fake = fakeFetch(routes);
  const client = new MailchimpClient(config, redactor, fake.fetch);
  const server = new McpServer({ name: "t", version: "0" });
  registerTools({ server, redactor, allowWrites: config.allowWrites }, client);
  return { mcp: await connect(server), calls: fake.calls };
}

test("config derives the data center from the key and defaults to read-only", () => {
  const cfg = loadConfig({ MAILCHIMP_API_KEY: KEY });
  assert.equal(cfg.serverPrefix, "us99");
  assert.equal(cfg.baseUrl, "https://us99.api.mailchimp.com/3.0");
  assert.equal(cfg.allowWrites, false);
  assert.throws(() => loadConfig({ MAILCHIMP_API_KEY: "fake-no-datacenter" }), ConfigError);
  assert.throws(() => loadConfig({}), ConfigError);
});

test("subscriber hash ignores case and whitespace and passes hashes through", () => {
  const h = subscriberHash(" Person@Example.com ");
  assert.equal(h, subscriberHash("person@example.com"));
  assert.match(h, /^[0-9a-f]{32}$/);
  assert.equal(subscriberHash(h.toUpperCase()), h);
});

test("read-only server offers no write tools", async () => {
  const { mcp } = await setup({});
  const names = (await mcp.listTools()).tools.map((t) => t.name);
  assert.ok(names.includes("mailchimp_list_campaigns"));
  for (const write of ["mailchimp_create_draft_campaign", "mailchimp_update_draft_campaign", "mailchimp_send_test_email"]) {
    assert.ok(!names.includes(write), write);
  }
  for (const t of (await mcp.listTools()).tools) assert.equal(t.annotations?.readOnlyHint, true, t.name);
});

test("test-email tool needs its own switch on top of writes", async () => {
  const writesOnly = (await (await setup({ MAILCHIMP_ALLOW_WRITES: "true" })).mcp.listTools()).tools.map((t) => t.name);
  assert.ok(writesOnly.includes("mailchimp_create_draft_campaign"));
  assert.ok(!writesOnly.includes("mailchimp_send_test_email"));
  const both = (await (await setup({ MAILCHIMP_ALLOW_WRITES: "true", MAILCHIMP_ALLOW_TEST_EMAILS: "true" })).mcp.listTools()).tools.map((t) => t.name);
  assert.ok(both.includes("mailchimp_send_test_email"));
});

test("no tool can send or schedule a campaign", async () => {
  const { mcp } = await setup({ MAILCHIMP_ALLOW_WRITES: "true", MAILCHIMP_ALLOW_TEST_EMAILS: "true" });
  const names = (await mcp.listTools()).tools.map((t) => t.name);
  assert.deepEqual(
    names.filter((n) => /_send(?!_test_email|_checklist)|schedule|delete|unsubscribe|batch/.test(n)),
    [],
  );
});

test("list campaigns sends a trimmed field list and auth header", async () => {
  const { mcp, calls } = await setup({}, [(c) => (c.url.pathname === "/3.0/campaigns" ? json({ campaigns: [], total_items: 0 }) : undefined)]);
  const res = await mcp.callTool({ name: "mailchimp_list_campaigns", arguments: { status: "sent", count: 5 } });
  assert.equal(res.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get("status"), "sent");
  assert.equal(calls[0].url.searchParams.get("count"), "5");
  assert.match(calls[0].url.searchParams.get("fields") ?? "", /campaigns\.settings\.subject_line/);
  assert.match(calls[0].headers.Authorization, /^Basic /);
});

test("create draft defaults to a dry run that makes no request", async () => {
  const { mcp, calls } = await setup({ MAILCHIMP_ALLOW_WRITES: "true" });
  const res = await mcp.callTool({
    name: "mailchimp_create_draft_campaign",
    arguments: { list_id: "abc123", subject_line: "Hello", from_name: "Shop", reply_to: "team@example.com", html: "<p>Hi</p>" },
  });
  assert.equal(calls.length, 0);
  assert.match(text(res), /"dry_run": true/);
});

test("create draft with dry_run=false creates, sets content and returns the editor link", async () => {
  const { mcp, calls } = await setup({ MAILCHIMP_ALLOW_WRITES: "true" }, [
    (c) => (c.method === "POST" && c.url.pathname === "/3.0/campaigns" ? json({ id: "c1", web_id: 42, status: "save" }) : undefined),
    (c) => (c.method === "PUT" && c.url.pathname === "/3.0/campaigns/c1/content" ? json({}) : undefined),
  ]);
  const res = await mcp.callTool({
    name: "mailchimp_create_draft_campaign",
    arguments: { list_id: "abc123", segment_id: 7, subject_line: "Hello", from_name: "Shop", reply_to: "team@example.com", html: "<p>Hi</p>", dry_run: false },
  });
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.url.pathname}`),
    ["POST /3.0/campaigns", "PUT /3.0/campaigns/c1/content"],
  );
  const body = calls[0].body as { type: string; recipients: { segment_opts: { saved_segment_id: number } } };
  assert.equal(body.type, "regular");
  assert.equal(body.recipients.segment_opts.saved_segment_id, 7);
  assert.match(text(res), /campaigns\/edit\?id=42/);
});

test("update refuses a campaign that is not a draft", async () => {
  const { mcp, calls } = await setup({ MAILCHIMP_ALLOW_WRITES: "true" }, [
    (c) => (c.method === "GET" ? json({ status: "sent", web_id: 1, settings: {} }) : undefined),
  ]);
  const res = await mcp.callTool({ name: "mailchimp_update_draft_campaign", arguments: { campaign_id: "c1", subject_line: "New", dry_run: false } });
  assert.equal(res.isError, true);
  assert.match(text(res), /Only drafts/);
  assert.equal(calls.filter((c) => c.method !== "GET").length, 0);
});

test("raw GET rejects path traversal and query strings", async () => {
  const { mcp, calls } = await setup({});
  for (const path of ["/lists/../account-exports", "/lists?count=1", "lists"]) {
    const res = await mcp.callTool({ name: "mailchimp_api_get", arguments: { path } });
    assert.equal(res.isError, true, path);
  }
  assert.equal(calls.length, 0);
});

test("API errors come back as tool errors without the key", async () => {
  const { mcp } = await setup({}, [() => json({ title: "API Key Invalid", detail: `Your API key may be invalid: ${KEY}` }, 401)]);
  const res = await mcp.callTool({ name: "mailchimp_get_campaign", arguments: { campaign_id: "c1" } });
  assert.equal(res.isError, true);
  assert.ok(!text(res).includes(KEY));
  assert.match(text(res), /HTTP 401/);
});
