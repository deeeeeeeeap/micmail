import assert from "node:assert/strict";
import test from "node:test";
import {
  isFreshSyncInProgress,
  isTransientSyncError,
  shouldAttemptImapFallback,
  shouldAutoSyncAccount,
  summarizeSyncFailure,
} from "../src/lib/sync-policy.js";

const NOW = new Date("2026-06-10T12:00:00.000Z");
const POLICY = {
  queuedStaleMinutes: 10,
  runningStaleMinutes: 60,
  transientRetryMinutes: 10,
  autoSyncStaleMinutes: 30,
};

function minutesAgo(minutes) {
  return new Date(NOW.getTime() - minutes * 60000).toISOString();
}

test("isTransientSyncError detects transient statuses, codes, and messages", () => {
  assert.equal(isTransientSyncError({ status: 429 }), true);
  assert.equal(isTransientSyncError({ status: 503 }), true);
  assert.equal(isTransientSyncError({ status: 500 }), true);
  assert.equal(isTransientSyncError({ code: "TooManyRequests" }), true);
  assert.equal(isTransientSyncError("rate limit exceeded"), true);
  assert.equal(isTransientSyncError("stopped early: sync budget reached"), true);
});

test("isTransientSyncError treats permanent auth failures as non-transient", () => {
  assert.equal(isTransientSyncError("invalid_grant"), false);
  assert.equal(isTransientSyncError(""), false);
});

test("shouldAttemptImapFallback skips IMAP when the token refresh failed fatally", () => {
  const error = new Error('Microsoft token refresh failed: HTTP 400 {"error":"invalid_grant"}');
  assert.equal(shouldAttemptImapFallback(error), false);
});

test("shouldAttemptImapFallback allows IMAP for a generic Graph 500 but not transient errors", () => {
  // The function summarizes the error to text first, so error.status is dropped
  // and "500" is not in the transient text patterns: fallback is allowed.
  const graph500 = Object.assign(new Error("Microsoft Graph request failed (500): boom"), {
    status: 500,
  });
  assert.equal(shouldAttemptImapFallback(graph500), true);
  // ...even though the same error object is transient when checked directly.
  assert.equal(isTransientSyncError(graph500), true);

  // "503" / "service unavailable" match the transient text patterns, so no fallback.
  const graph503 = new Error("Microsoft Graph request failed (503): Service Unavailable");
  assert.equal(shouldAttemptImapFallback(graph503), false);

  // A non-fatal token refresh failure still allows the fallback.
  const refresh400 = new Error("Microsoft token refresh failed: HTTP 400 server_error");
  assert.equal(shouldAttemptImapFallback(refresh400), true);
});

test("summarizeSyncFailure combines Graph and IMAP errors when both exist", () => {
  assert.equal(summarizeSyncFailure(new Error("IMAP login failed")), "IMAP login failed");
  assert.equal(
    summarizeSyncFailure(new Error("IMAP login failed"), "Graph boom"),
    "Graph failed: Graph boom | IMAP failed: IMAP login failed",
  );
});

test("shouldAutoSyncAccount syncs never-synced accounts and stale successful ones", () => {
  assert.equal(
    shouldAutoSyncAccount(
      { last_sync_status: "idle", last_sync_at: null, updated_at: minutesAgo(1) },
      NOW,
      POLICY,
    ),
    true,
  );
  assert.equal(
    shouldAutoSyncAccount(
      { last_sync_status: "success", last_sync_at: minutesAgo(29) },
      NOW,
      POLICY,
    ),
    false,
  );
  assert.equal(
    shouldAutoSyncAccount(
      { last_sync_status: "success", last_sync_at: minutesAgo(31) },
      NOW,
      POLICY,
    ),
    true,
  );
});

test("shouldAutoSyncAccount retries transient failures but not permanent errors", () => {
  assert.equal(
    shouldAutoSyncAccount(
      {
        last_sync_status: "error",
        last_sync_at: minutesAgo(999),
        last_sync_error: "invalid_grant",
      },
      NOW,
      POLICY,
    ),
    false,
  );
  assert.equal(
    shouldAutoSyncAccount(
      {
        last_sync_status: "error",
        last_sync_at: minutesAgo(11),
        last_sync_error: "429 too many requests",
      },
      NOW,
      POLICY,
    ),
    true,
  );
  assert.equal(
    shouldAutoSyncAccount(
      { last_sync_status: "pending_retry", last_sync_at: minutesAgo(11) },
      NOW,
      POLICY,
    ),
    true,
  );
  assert.equal(
    shouldAutoSyncAccount(
      { last_sync_status: "pending_retry", last_sync_at: minutesAgo(5) },
      NOW,
      POLICY,
    ),
    false,
  );
});

test("shouldAutoSyncAccount reclaims stale queued accounts but not fresh ones", () => {
  assert.equal(
    shouldAutoSyncAccount({ last_sync_status: "queued", updated_at: minutesAgo(5) }, NOW, POLICY),
    false,
  );
  assert.equal(
    shouldAutoSyncAccount({ last_sync_status: "queued", updated_at: minutesAgo(11) }, NOW, POLICY),
    true,
  );
});

test("isFreshSyncInProgress only reports fresh queued or running syncs", () => {
  assert.equal(
    isFreshSyncInProgress({ last_sync_status: "queued", updated_at: minutesAgo(5) }, NOW, POLICY),
    true,
  );
  assert.equal(
    isFreshSyncInProgress({ last_sync_status: "queued", updated_at: minutesAgo(11) }, NOW, POLICY),
    false,
  );
  assert.equal(
    isFreshSyncInProgress({ last_sync_status: "running", updated_at: minutesAgo(30) }, NOW, POLICY),
    true,
  );
  assert.equal(
    isFreshSyncInProgress({ last_sync_status: "running", updated_at: minutesAgo(61) }, NOW, POLICY),
    false,
  );
  assert.equal(
    isFreshSyncInProgress({ last_sync_status: "success", updated_at: minutesAgo(1) }, NOW, POLICY),
    false,
  );
});
