// Server configuration, read from environment variables only.

import { envBool, envInt, envRequired, envString, Env } from "./core/env";
import { ConfigError } from "./core/errors";

export interface MailchimpConfig {
  apiKey: string;
  serverPrefix: string;
  baseUrl: string;
  allowWrites: boolean;
  allowTestEmails: boolean;
  timeoutMs: number;
  maxConcurrency: number;
  logLevel?: string;
}

const PREFIX = /^[a-z]{2}\d+$/;

export function loadConfig(env: Env = process.env): MailchimpConfig {
  const apiKey = envRequired(env, "MAILCHIMP_API_KEY", "Create one in Mailchimp under Profile > Extras > API keys.");
  const serverPrefix = envString(env, "MAILCHIMP_SERVER_PREFIX") ?? apiKey.split("-").pop() ?? "";
  if (!PREFIX.test(serverPrefix)) {
    throw new ConfigError(
      "Could not determine the Mailchimp data center. Set MAILCHIMP_SERVER_PREFIX (for example us1), or use a key that ends in -us1 style suffix.",
    );
  }
  // MAILCHIMP_BASE_URL exists for local mock servers in tests; normal use derives it from the data center.
  const baseUrl = (envString(env, "MAILCHIMP_BASE_URL") ?? `https://${serverPrefix}.api.mailchimp.com/3.0`).replace(/\/+$/, "");
  return {
    apiKey,
    serverPrefix,
    baseUrl,
    allowWrites: envBool(env, "MAILCHIMP_ALLOW_WRITES", false),
    allowTestEmails: envBool(env, "MAILCHIMP_ALLOW_TEST_EMAILS", false),
    timeoutMs: envInt(env, "MAILCHIMP_TIMEOUT_SECONDS", 30, 5, 300) * 1000,
    // Mailchimp allows 10 simultaneous connections per key; stay well under it.
    maxConcurrency: envInt(env, "MAILCHIMP_MAX_CONCURRENCY", 4, 1, 8),
    logLevel: envString(env, "MAILCHIMP_LOG_LEVEL"),
  };
}
