// Thin Mailchimp Marketing API 3.0 client on top of the shared HttpClient.

import { createHash } from "node:crypto";

import { HttpClient, QueryValue } from "./core/http";
import { Redactor } from "./core/redact";
import { MailchimpConfig } from "./config";

export const USER_AGENT = "mailchimp-mcp/0.1.0";

export class MailchimpClient {
  readonly http: HttpClient;

  constructor(
    readonly config: MailchimpConfig,
    redactor: Redactor,
    fetchImpl?: typeof fetch,
  ) {
    const auth = `Basic ${Buffer.from(`mcp:${config.apiKey}`).toString("base64")}`;
    redactor.add(config.apiKey, auth);
    this.http = new HttpClient({
      baseUrl: config.baseUrl,
      userAgent: USER_AGENT,
      redactor,
      timeoutMs: config.timeoutMs,
      maxConcurrency: config.maxConcurrency,
      headers: () => ({ Authorization: auth }),
      fetchImpl,
    });
  }

  get<T = Record<string, unknown>>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    return this.http.request<T>({ method: "GET", path, query });
  }

  post<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
    return this.http.request<T>({ method: "POST", path, body: body ?? {} });
  }

  patch<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
    return this.http.request<T>({ method: "PATCH", path, body });
  }

  put<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
    return this.http.request<T>({ method: "PUT", path, body });
  }

  /** Link to the campaign editor in the Mailchimp web app (uses web_id, not the API id). */
  editUrl(webId: number | string): string {
    return `https://${this.config.serverPrefix}.admin.mailchimp.com/campaigns/edit?id=${encodeURIComponent(String(webId))}`;
  }
}

/** Mailchimp addresses list members by the MD5 hash of the lower-cased email. */
export function subscriberHash(emailOrHash: string): string {
  const value = emailOrHash.trim();
  if (/^[0-9a-f]{32}$/i.test(value)) return value.toLowerCase();
  return createHash("md5").update(value.toLowerCase()).digest("hex");
}

/** Path segments from model input are encoded so they cannot change the path. */
export function seg(value: string): string {
  return encodeURIComponent(value.trim());
}
