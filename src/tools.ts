// MCP tools for the Mailchimp Marketing API.
//
// Policy: reads are always available. Writes are limited to draft campaigns and need
// MAILCHIMP_ALLOW_WRITES=true. Test emails need MAILCHIMP_ALLOW_TEST_EMAILS=true as well.
// Sending, scheduling, deleting, unsubscribing and batch operations are not implemented.

import { z } from "zod";

import { InputError } from "./core/errors";
import { ok, preview } from "./core/result";
import { defineTool, dryRun, ToolContext } from "./core/tool";
import { MailchimpClient, seg, subscriberHash } from "./client";

const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Expected a Mailchimp id (letters, digits, - or _).");
const count = z.number().int().min(1).max(1000).default(50).describe("Records per page (1-1000, default 50).");
const offset = z.number().int().min(0).default(0).describe("Records to skip, for paging.");
const fields = z
  .string()
  .max(2000)
  .optional()
  .describe("Comma-separated fields to return, in Mailchimp's dotted syntax (e.g. campaigns.id,campaigns.settings.title). Replaces the default trimmed list.");
const isoTime = z.string().max(40).optional();

const CAMPAIGN_FIELDS = [
  "campaigns.id",
  "campaigns.web_id",
  "campaigns.type",
  "campaigns.status",
  "campaigns.create_time",
  "campaigns.send_time",
  "campaigns.emails_sent",
  "campaigns.recipients.list_id",
  "campaigns.recipients.list_name",
  "campaigns.recipients.segment_text",
  "campaigns.settings.subject_line",
  "campaigns.settings.preview_text",
  "campaigns.settings.title",
  "campaigns.settings.folder_id",
  "campaigns.report_summary",
  "total_items",
].join(",");

const REPORT_FIELDS = [
  "reports.id",
  "reports.campaign_title",
  "reports.subject_line",
  "reports.list_name",
  "reports.send_time",
  "reports.emails_sent",
  "reports.opens.unique_opens",
  "reports.opens.open_rate",
  "reports.clicks.unique_subscriber_clicks",
  "reports.clicks.click_rate",
  "reports.unsubscribed",
  "reports.bounces",
  "total_items",
].join(",");

export function registerTools(ctx: ToolContext, mc: MailchimpClient): void {
  const cfg = mc.config;

  defineTool(ctx, {
    name: "mailchimp_account_info",
    title: "Account info",
    description: "Checks the API connection and returns the account name, plan and subscriber total, plus which write features this server has enabled.",
    kind: "read",
    input: {},
    handler: async () => {
      await mc.get("/ping");
      const account = await mc.get("/", {
        fields: "account_id,account_name,role,pricing_plan_type,total_subscribers,account_timezone",
      });
      return ok({
        account,
        server: {
          data_center: cfg.serverPrefix,
          draft_writes_enabled: cfg.allowWrites,
          test_emails_enabled: cfg.allowWrites && cfg.allowTestEmails,
          sending_available: false,
        },
      });
    },
  });

  defineTool(ctx, {
    name: "mailchimp_list_audiences",
    title: "List audiences",
    description: "Lists audiences (lists) with member counts.",
    kind: "read",
    input: { count, offset, fields },
    handler: async (a) =>
      ok(
        await mc.get("/lists", {
          count: a.count,
          offset: a.offset,
          fields:
            a.fields ??
            "lists.id,lists.web_id,lists.name,lists.date_created,lists.stats.member_count,lists.stats.unsubscribe_count,lists.stats.campaign_count,total_items",
        }),
      ),
  });

  defineTool(ctx, {
    name: "mailchimp_get_audience",
    title: "Get audience",
    description: "Returns one audience's settings and stats.",
    kind: "read",
    input: { list_id: id, fields },
    handler: async (a) => ok(await mc.get(`/lists/${seg(a.list_id)}`, { fields: a.fields, exclude_fields: a.fields ? undefined : "_links" })),
  });

  defineTool(ctx, {
    name: "mailchimp_list_members",
    title: "List audience members",
    description: "Lists members of an audience, optionally filtered by status or by last-changed time.",
    kind: "read",
    input: {
      list_id: id,
      status: z.enum(["subscribed", "unsubscribed", "cleaned", "pending", "transactional", "archived"]).optional(),
      since_last_changed: isoTime.describe("Only members changed after this ISO 8601 time."),
      count,
      offset,
      fields,
    },
    handler: async (a) =>
      ok(
        await mc.get(`/lists/${seg(a.list_id)}/members`, {
          status: a.status,
          since_last_changed: a.since_last_changed,
          count: a.count,
          offset: a.offset,
          fields:
            a.fields ??
            "members.id,members.email_address,members.status,members.full_name,members.last_changed,members.member_rating,members.tags,total_items",
        }),
      ),
  });

  defineTool(ctx, {
    name: "mailchimp_get_member",
    title: "Get audience member",
    description: "Returns one member of an audience by email address (or subscriber hash).",
    kind: "read",
    input: { list_id: id, email: z.string().trim().min(3).max(320).describe("Email address or its MD5 subscriber hash."), fields },
    handler: async (a) =>
      ok(
        await mc.get(`/lists/${seg(a.list_id)}/members/${subscriberHash(a.email)}`, {
          fields: a.fields,
          exclude_fields: a.fields ? undefined : "_links",
        }),
      ),
  });

  defineTool(ctx, {
    name: "mailchimp_search_members",
    title: "Search members",
    description: "Searches members by email or name across all audiences, or within one audience.",
    kind: "read",
    input: { query: z.string().trim().min(1).max(200), list_id: id.optional() },
    handler: async (a) => ok(await mc.get("/search-members", { query: a.query, list_id: a.list_id, exclude_fields: "exact_matches.members._links,full_search.members._links" })),
  });

  defineTool(ctx, {
    name: "mailchimp_list_segments",
    title: "List segments and tags",
    description: "Lists saved segments and tags of an audience.",
    kind: "read",
    input: { list_id: id, type: z.enum(["saved", "static", "fuzzy"]).optional(), count, offset, fields },
    handler: async (a) =>
      ok(
        await mc.get(`/lists/${seg(a.list_id)}/segments`, {
          type: a.type,
          count: a.count,
          offset: a.offset,
          fields: a.fields ?? "segments.id,segments.name,segments.type,segments.member_count,segments.updated_at,total_items",
        }),
      ),
  });

  defineTool(ctx, {
    name: "mailchimp_list_campaigns",
    title: "List campaigns",
    description:
      "Lists campaigns with a trimmed field set. Use status=sent to count real sends; drafts have status=save.",
    kind: "read",
    input: {
      status: z.enum(["save", "paused", "schedule", "sending", "sent"]).optional(),
      type: z.enum(["regular", "plaintext", "absplit", "rss", "variate"]).optional(),
      list_id: id.optional(),
      folder_id: id.optional(),
      since_send_time: isoTime.describe("ISO 8601 time; campaigns sent after it."),
      before_send_time: isoTime.describe("ISO 8601 time; campaigns sent before it."),
      since_create_time: isoTime.describe("ISO 8601 time; campaigns created after it."),
      sort_field: z.enum(["create_time", "send_time"]).optional(),
      sort_dir: z.enum(["ASC", "DESC"]).optional(),
      count,
      offset,
      fields,
    },
    handler: async (a) =>
      ok(
        await mc.get("/campaigns", {
          status: a.status,
          type: a.type,
          list_id: a.list_id,
          folder_id: a.folder_id,
          since_send_time: a.since_send_time,
          before_send_time: a.before_send_time,
          since_create_time: a.since_create_time,
          sort_field: a.sort_field,
          sort_dir: a.sort_dir,
          count: a.count,
          offset: a.offset,
          fields: a.fields ?? CAMPAIGN_FIELDS,
        }),
      ),
  });

  defineTool(ctx, {
    name: "mailchimp_get_campaign",
    title: "Get campaign",
    description: "Returns one campaign's settings, recipients, tracking and status.",
    kind: "read",
    input: { campaign_id: id, fields },
    handler: async (a) => ok(await mc.get(`/campaigns/${seg(a.campaign_id)}`, { fields: a.fields, exclude_fields: a.fields ? undefined : "_links" })),
  });

  defineTool(ctx, {
    name: "mailchimp_get_campaign_content",
    title: "Get campaign content",
    description: "Returns a campaign's HTML or plain-text content.",
    kind: "read",
    input: {
      campaign_id: id,
      format: z.enum(["html", "plain_text"]).default("html"),
      max_chars: z.number().int().min(500).max(200_000).default(20_000).describe("Cut the content after this many characters."),
    },
    handler: async (a) => {
      const content = await mc.get<Record<string, unknown>>(`/campaigns/${seg(a.campaign_id)}/content`, { fields: a.format });
      const text = typeof content[a.format] === "string" ? (content[a.format] as string) : "";
      return ok(text || `(no ${a.format} content)`, { maxChars: a.max_chars, summary: `${a.format} content, ${text.length} characters:` });
    },
  });

  defineTool(ctx, {
    name: "mailchimp_get_send_checklist",
    title: "Get send checklist",
    description: "Returns Mailchimp's pre-send checklist for a campaign (what still blocks it from being sendable).",
    kind: "read",
    input: { campaign_id: id },
    handler: async (a) => ok(await mc.get(`/campaigns/${seg(a.campaign_id)}/send-checklist`, { exclude_fields: "_links" })),
  });

  defineTool(ctx, {
    name: "mailchimp_list_reports",
    title: "List campaign reports",
    description: "Lists sent-campaign reports with opens, clicks, bounces and unsubscribes.",
    kind: "read",
    input: {
      type: z.enum(["regular", "plaintext", "absplit", "rss", "variate"]).optional(),
      since_send_time: isoTime.describe("ISO 8601 time."),
      before_send_time: isoTime.describe("ISO 8601 time."),
      count,
      offset,
      fields,
    },
    handler: async (a) =>
      ok(
        await mc.get("/reports", {
          type: a.type,
          since_send_time: a.since_send_time,
          before_send_time: a.before_send_time,
          count: a.count,
          offset: a.offset,
          fields: a.fields ?? REPORT_FIELDS,
        }),
      ),
  });

  defineTool(ctx, {
    name: "mailchimp_get_campaign_report",
    title: "Get campaign report",
    description: "Returns the full report for one sent campaign.",
    kind: "read",
    input: { campaign_id: id, fields },
    handler: async (a) => ok(await mc.get(`/reports/${seg(a.campaign_id)}`, { fields: a.fields, exclude_fields: a.fields ? undefined : "_links" })),
  });

  defineTool(ctx, {
    name: "mailchimp_get_click_details",
    title: "Get click details",
    description: "Returns clicks per link for a sent campaign.",
    kind: "read",
    input: { campaign_id: id, count, offset, fields },
    handler: async (a) =>
      ok(
        await mc.get(`/reports/${seg(a.campaign_id)}/click-details`, {
          count: a.count,
          offset: a.offset,
          fields: a.fields ?? "urls_clicked.id,urls_clicked.url,urls_clicked.total_clicks,urls_clicked.unique_clicks,urls_clicked.click_percentage,urls_clicked.last_click,total_items",
        }),
      ),
  });

  defineTool(ctx, {
    name: "mailchimp_get_open_details",
    title: "Get open details",
    description: "Returns the members who opened a sent campaign.",
    kind: "read",
    input: { campaign_id: id, since: isoTime.describe("Only opens after this ISO 8601 time."), count, offset, fields },
    handler: async (a) =>
      ok(
        await mc.get(`/reports/${seg(a.campaign_id)}/open-details`, {
          since: a.since,
          count: a.count,
          offset: a.offset,
          fields: a.fields ?? "members.email_address,members.opens_count,members.opens,total_items,total_opens",
        }),
      ),
  });

  defineTool(ctx, {
    name: "mailchimp_get_email_activity",
    title: "Get email activity",
    description: "Returns per-member activity (opens, clicks, bounces) for a sent campaign.",
    kind: "read",
    input: { campaign_id: id, since: isoTime.describe("Only activity after this ISO 8601 time."), count, offset, fields },
    handler: async (a) =>
      ok(
        await mc.get(`/reports/${seg(a.campaign_id)}/email-activity`, {
          since: a.since,
          count: a.count,
          offset: a.offset,
          fields: a.fields ?? "emails.email_address,emails.activity,total_items",
        }),
      ),
  });

  defineTool(ctx, {
    name: "mailchimp_list_templates",
    title: "List templates",
    description: "Lists email templates.",
    kind: "read",
    input: { type: z.enum(["user", "base", "gallery"]).optional(), count, offset, fields },
    handler: async (a) =>
      ok(
        await mc.get("/templates", {
          type: a.type,
          count: a.count,
          offset: a.offset,
          fields: a.fields ?? "templates.id,templates.name,templates.type,templates.category,templates.date_created,templates.date_edited,templates.active,total_items",
        }),
      ),
  });

  defineTool(ctx, {
    name: "mailchimp_api_get",
    title: "Raw GET request",
    description:
      "Read-only escape hatch: sends a GET to any Marketing API path (e.g. /automations or /lists/{list_id}/interest-categories). Use the dedicated tools when one fits.",
    kind: "read",
    input: {
      path: z.string().trim().min(1).max(500).describe("Path below /3.0, starting with /."),
      query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe("Query parameters, e.g. {\"count\": 20}."),
    },
    handler: async (a) => {
      if (!/^\/[A-Za-z0-9_\-/.@%]*$/.test(a.path) || a.path.includes("..")) {
        throw new InputError("path must start with / and contain only URL path characters (no query string, no ..).");
      }
      return ok(await mc.get(a.path, a.query));
    },
  });

  // ---- Draft-only writes -------------------------------------------------------------

  const settings = {
    subject_line: z.string().trim().min(1).max(150),
    preview_text: z.string().trim().max(150).optional(),
    title: z.string().trim().max(100).optional().describe("Internal campaign name shown in Mailchimp."),
    from_name: z.string().trim().min(1).max(100),
    reply_to: z.string().trim().email(),
  };

  defineTool(ctx, {
    name: "mailchimp_create_draft_campaign",
    title: "Create draft campaign",
    description:
      "Creates a regular campaign as an unsent draft (status 'save') and optionally sets its HTML. It never sends or schedules. Returns the editor link so a person can review and send it in Mailchimp.",
    kind: "write",
    input: {
      list_id: id,
      segment_id: z.number().int().positive().optional().describe("Saved segment or tag id to target."),
      folder_id: id.optional(),
      ...settings,
      html: z.string().max(1_000_000).optional().describe("Full HTML for the email body."),
      dry_run: dryRun,
    },
    handler: async (a) => {
      const create = {
        type: "regular",
        recipients: {
          list_id: a.list_id,
          ...(a.segment_id ? { segment_opts: { saved_segment_id: a.segment_id } } : {}),
        },
        settings: {
          subject_line: a.subject_line,
          preview_text: a.preview_text,
          title: a.title ?? a.subject_line,
          from_name: a.from_name,
          reply_to: a.reply_to,
          folder_id: a.folder_id,
        },
      };
      const steps: unknown[] = [{ method: "POST", path: "/campaigns", body: create }];
      if (a.html) steps.push({ method: "PUT", path: "/campaigns/{new_id}/content", body: { html: `(${a.html.length} characters of HTML)` } });
      if (a.dry_run) return preview("create draft campaign", steps, ["The campaign will be created unsent. Nothing is sent or scheduled."]);

      const campaign = await mc.post<{ id: string; web_id: number; status: string }>("/campaigns", create);
      const result: Record<string, unknown> = {
        campaign_id: campaign.id,
        web_id: campaign.web_id,
        status: campaign.status,
        edit_url: mc.editUrl(campaign.web_id),
      };
      if (a.html) {
        try {
          await mc.put(`/campaigns/${seg(campaign.id)}/content`, { html: a.html });
          result.content = "set";
        } catch (err) {
          result.content = `NOT set: ${(err as Error).message}. The draft exists without content; set it with mailchimp_update_draft_campaign or delete the draft in Mailchimp.`;
        }
      }
      return ok(result, { summary: "Draft created. It has not been sent. Review and send it in Mailchimp." });
    },
  });

  defineTool(ctx, {
    name: "mailchimp_update_draft_campaign",
    title: "Update draft campaign",
    description: "Changes the settings and/or HTML of a campaign that is still a draft (status 'save'). Refuses any other status.",
    kind: "write",
    input: {
      campaign_id: id,
      subject_line: settings.subject_line.optional(),
      preview_text: settings.preview_text,
      title: settings.title,
      from_name: settings.from_name.optional(),
      reply_to: settings.reply_to.optional(),
      html: z.string().max(1_000_000).optional(),
      dry_run: dryRun,
    },
    handler: async (a) => {
      const current = await mc.get<{ status: string; web_id: number; settings: Record<string, unknown> }>(`/campaigns/${seg(a.campaign_id)}`, {
        fields: "status,web_id,settings.subject_line,settings.preview_text,settings.title,settings.from_name,settings.reply_to",
      });
      if (current.status !== "save") {
        throw new InputError(`Campaign status is '${current.status}'. Only drafts (status 'save') can be edited here.`);
      }
      const changes: Record<string, unknown> = {};
      for (const key of ["subject_line", "preview_text", "title", "from_name", "reply_to"] as const) {
        if (a[key] !== undefined && a[key] !== current.settings?.[key]) changes[key] = a[key];
      }
      if (!Object.keys(changes).length && !a.html) throw new InputError("Nothing to change.");
      // Mailchimp expects these three on every settings PATCH, so carry the current values.
      const body = {
        settings: {
          subject_line: current.settings?.subject_line,
          from_name: current.settings?.from_name,
          reply_to: current.settings?.reply_to,
          ...changes,
        },
      };
      if (a.dry_run) {
        return preview(
          "update draft campaign",
          {
            before: current.settings,
            settings_patch: Object.keys(changes).length ? body : "(no settings change)",
            html: a.html ? `(${a.html.length} characters will replace the current HTML)` : "(unchanged)",
          },
          ["The campaign stays a draft. Nothing is sent."],
        );
      }
      if (Object.keys(changes).length) await mc.patch(`/campaigns/${seg(a.campaign_id)}`, body);
      if (a.html) await mc.put(`/campaigns/${seg(a.campaign_id)}/content`, { html: a.html });
      return ok({ campaign_id: a.campaign_id, changed: Object.keys(changes), html_replaced: Boolean(a.html), edit_url: mc.editUrl(current.web_id) });
    },
  });

  defineTool(ctx, {
    name: "mailchimp_send_test_email",
    title: "Send test email",
    description: "Sends a test copy of a campaign to up to 5 addresses you name. It does not send the campaign to its audience.",
    kind: "write",
    enabled: cfg.allowTestEmails,
    input: {
      campaign_id: id,
      test_emails: z.array(z.string().trim().email()).min(1).max(5),
      send_type: z.enum(["html", "plaintext"]).default("html"),
      dry_run: dryRun,
    },
    handler: async (a) => {
      const body = { test_emails: a.test_emails, send_type: a.send_type };
      if (a.dry_run) {
        return preview("send test email", { method: "POST", path: `/campaigns/${a.campaign_id}/actions/test`, body }, [
          "This sends real email to the listed addresses only.",
        ]);
      }
      await mc.post(`/campaigns/${seg(a.campaign_id)}/actions/test`, body);
      return ok({ sent_to: a.test_emails, send_type: a.send_type });
    },
  });
}
