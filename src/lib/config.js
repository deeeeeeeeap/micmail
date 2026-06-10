import { clampInt } from "./util.js";

export const DEFAULT_SESSION_TTL_HOURS = 12;
export const DEFAULT_RETENTION_DAYS = 90;
export const DEFAULT_SYNC_PAGE_SIZE = 20;
export const DEFAULT_MAX_SYNC_PAGES = 40;
export const DEFAULT_SYNC_FOLDERS = ["inbox", "junkemail"];
export const DEFAULT_AUTO_SYNC_STALE_MINUTES = 30;
export const DEFAULT_TRANSIENT_RETRY_MINUTES = 10;
export const DEFAULT_QUEUED_STALE_MINUTES = 10;
export const DEFAULT_RUNNING_STALE_MINUTES = 60;
export const DEFAULT_MAX_SYNC_ACCOUNTS_PER_RUN = 3;
export const DEFAULT_SYNC_RUN_RETENTION_DAYS = 14;
export const DEFAULT_SYNC_OPS_BUDGET = 35;
export const DEFAULT_FANOUT_CONCURRENCY = 4;
export const DEFAULT_LOGIN_MAX_FAILURES = 8;
export const DEFAULT_LOGIN_WINDOW_MINUTES = 15;
export const DEFAULT_IMAP_FETCH_BATCH_SIZE = 1;
export const DEFAULT_IMAP_BODY_PEEK_BYTES = 2 * 1024 * 1024;
export const DEFAULT_IMAP_COMMAND_TIMEOUT_SECONDS = 60;
export const DEFAULT_IMAP_IDLE_TIMEOUT_SECONDS = 30;
export const DEFAULT_IMAP_BASE_RESPONSE_BYTES = 512 * 1024;
export const EXPIRED_ARCHIVE_CLEANUP_LIMIT = 100;
export const MAX_HTML_TEXT_EXTRACTION_BYTES = 512 * 1024;

export function getRetentionDays(env) {
  return clampInt(env.MAIL_RETENTION_DAYS, DEFAULT_RETENTION_DAYS, 1, 3650);
}

export function getSessionTtlHours(env) {
  return clampInt(env.SESSION_TTL_HOURS, DEFAULT_SESSION_TTL_HOURS, 1, 24 * 30);
}

export function getSyncPageSize(env) {
  return clampInt(env.SYNC_PAGE_SIZE, DEFAULT_SYNC_PAGE_SIZE, 1, 100);
}

export function getMaxSyncPages(env) {
  return clampInt(env.MAX_SYNC_PAGES, DEFAULT_MAX_SYNC_PAGES, 1, 500);
}

export function getSyncConcurrency(env) {
  return clampInt(env.SYNC_CONCURRENCY, 1, 1, 10);
}

export function getSyncOpsBudget(env) {
  return clampInt(env.SYNC_OPS_BUDGET, DEFAULT_SYNC_OPS_BUDGET, 10, 100000);
}

export function getFanoutConcurrency(env) {
  return clampInt(env.SYNC_FANOUT_CONCURRENCY, DEFAULT_FANOUT_CONCURRENCY, 1, 20);
}

export function getPublicBaseUrl(env) {
  const raw = typeof env.PUBLIC_BASE_URL === "string" ? env.PUBLIC_BASE_URL.trim() : "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function getAutoSyncStaleMinutes(env) {
  return clampInt(env.AUTO_SYNC_STALE_MINUTES, DEFAULT_AUTO_SYNC_STALE_MINUTES, 5, 24 * 60);
}

export function getTransientRetryMinutes(env) {
  return clampInt(env.TRANSIENT_RETRY_MINUTES, DEFAULT_TRANSIENT_RETRY_MINUTES, 5, 24 * 60);
}

export function getQueuedStaleMinutes(env) {
  return clampInt(env.QUEUED_STALE_MINUTES, DEFAULT_QUEUED_STALE_MINUTES, 5, 24 * 60);
}

export function getRunningStaleMinutes(env) {
  return clampInt(env.RUNNING_STALE_MINUTES, DEFAULT_RUNNING_STALE_MINUTES, 15, 24 * 60);
}

export function getMaxSyncAccountsPerRun(env) {
  return clampInt(env.MAX_SYNC_ACCOUNTS_PER_RUN, DEFAULT_MAX_SYNC_ACCOUNTS_PER_RUN, 1, 100);
}

export function getSyncRunRetentionDays(env) {
  return clampInt(env.SYNC_RUN_RETENTION_DAYS, DEFAULT_SYNC_RUN_RETENTION_DAYS, 1, 365);
}

export function getLoginMaxFailures(env) {
  return clampInt(env.LOGIN_MAX_FAILURES, DEFAULT_LOGIN_MAX_FAILURES, 3, 1000);
}

export function getLoginWindowMinutes(env) {
  return clampInt(env.LOGIN_WINDOW_MINUTES, DEFAULT_LOGIN_WINDOW_MINUTES, 1, 24 * 60);
}

export function getImapFetchBatchSize(env) {
  return clampInt(env.IMAP_FETCH_BATCH_SIZE, DEFAULT_IMAP_FETCH_BATCH_SIZE, 1, 10);
}

export function getImapBodyPeekBytes(env) {
  return clampInt(env.IMAP_BODY_PEEK_BYTES, DEFAULT_IMAP_BODY_PEEK_BYTES, 64 * 1024, 8 * 1024 * 1024);
}

export function getImapCommandTimeoutSeconds(env) {
  return clampInt(env.IMAP_COMMAND_TIMEOUT_SECONDS, DEFAULT_IMAP_COMMAND_TIMEOUT_SECONDS, 10, 120);
}

export function getImapIdleTimeoutSeconds(env) {
  return clampInt(env.IMAP_IDLE_TIMEOUT_SECONDS, DEFAULT_IMAP_IDLE_TIMEOUT_SECONDS, 3, 60);
}

export function getImapFetchMaxResponseBytes(bodyPeekBytes, batchSize) {
  return DEFAULT_IMAP_BASE_RESPONSE_BYTES + bodyPeekBytes * Math.max(1, batchSize);
}

export function getSyncFolders(env) {
  const raw = typeof env.SYNC_FOLDERS === "string" ? env.SYNC_FOLDERS : "";
  const folders = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return folders.length ? folders : DEFAULT_SYNC_FOLDERS;
}

export function getSyncPolicy(env) {
  return {
    queuedStaleMinutes: getQueuedStaleMinutes(env),
    runningStaleMinutes: getRunningStaleMinutes(env),
    transientRetryMinutes: getTransientRetryMinutes(env),
    autoSyncStaleMinutes: getAutoSyncStaleMinutes(env),
  };
}
