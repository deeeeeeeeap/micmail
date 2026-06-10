import { minutesSince, summarizeUpstreamError } from "./util.js";

const TRANSIENT_ERROR_PATTERNS = [
  "too many",
  "429",
  "rate limit",
  "throttl",
  "temporar",
  "try again",
  "timeout",
  "timed out",
  "network",
  "socket",
  "connection",
  "server busy",
  "service unavailable",
  "503",
  "504",
  "imap response did not complete",
  "sync budget",
];

export function isTransientSyncError(error) {
  const status = Number(error?.status || 0);
  if (status === 429 || status === 503 || status === 504 || status >= 500) return true;
  const code = String(error?.code || error?.error?.code || error?.odataError?.code || "").toLowerCase();
  if (["toomanyrequests", "ratelimitexceeded", "serviceunavailable", "internalservererror", "timeout"].includes(code)) {
    return true;
  }
  const message = String(error?.message || error || "").toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export function shouldAttemptImapFallback(error) {
  const message = summarizeUpstreamError(error).toLowerCase();
  if (isTransientSyncError(message)) {
    return false;
  }
  if (!message.startsWith("microsoft token refresh failed:")) {
    return true;
  }
  return ![
    "invalid_grant",
    "invalid_client",
    "unauthorized_client",
    "interaction_required",
    "consent_required",
  ].some((marker) => message.includes(marker));
}

export function summarizeSyncFailure(error, graphError = null) {
  const imapError = summarizeUpstreamError(error);
  if (!graphError) {
    return imapError;
  }
  return ("Graph failed: " + graphError + " | IMAP failed: " + imapError).slice(0, 600);
}

export function shouldAutoSyncAccount(account, now, policy) {
  const status = account.last_sync_status || "idle";
  if (status === "queued") {
    return minutesSince(account.updated_at, now) >= policy.queuedStaleMinutes;
  }

  if (status === "running") {
    return minutesSince(account.updated_at, now) >= policy.runningStaleMinutes;
  }

  if (!account.last_sync_at) {
    return true;
  }

  const lastSyncAge = minutesSince(account.last_sync_at, now);
  if (status === "pending_retry" || (status === "error" && isTransientSyncError(account.last_sync_error))) {
    return lastSyncAge >= policy.transientRetryMinutes;
  }

  if (status === "error") {
    return false;
  }

  return lastSyncAge >= policy.autoSyncStaleMinutes;
}

export function isFreshSyncInProgress(account, now, policy) {
  const status = account.last_sync_status || "idle";
  if (status === "queued") {
    return minutesSince(account.updated_at, now) < policy.queuedStaleMinutes;
  }
  if (status === "running") {
    return minutesSince(account.updated_at, now) < policy.runningStaleMinutes;
  }
  return false;
}
