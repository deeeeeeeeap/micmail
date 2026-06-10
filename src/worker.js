import { APP_HTML } from "./ui.js";
import {
  HttpError,
  corsHeaders,
  handleError,
  jsonResponse,
  readJson,
  requireString,
  securityHeaders,
} from "./lib/http.js";
import { ensureSchema, getMessageKeyMode, invalidateMessageKeyMode } from "./lib/schema.js";
import {
  decryptText as decryptSecretText,
  encryptText as encryptSecretText,
} from "./lib/crypto.js";
import { makeAttachmentContentDisposition } from "./lib/safety.js";
import {
  addDays,
  addHours,
  chunkArray,
  clampInt,
  constantTimeStringEquals,
  logInfo,
  mapWithConcurrency,
  minutesAgoIso,
  parseJsonObject,
  randomHex,
  sha256Hex,
  summarizeUpstreamError,
} from "./lib/util.js";
import {
  EXPIRED_ARCHIVE_CLEANUP_LIMIT,
  getFanoutConcurrency,
  getImapBodyPeekBytes,
  getImapCommandTimeoutSeconds,
  getImapFetchBatchSize,
  getImapFetchMaxResponseBytes,
  getImapIdleTimeoutSeconds,
  getLoginMaxFailures,
  getLoginWindowMinutes,
  getMaxSyncAccountsPerRun,
  getMaxSyncPages,
  getPublicBaseUrl,
  getQueuedStaleMinutes,
  getRetentionDays,
  getRunningStaleMinutes,
  getSessionTtlHours,
  getSyncConcurrency,
  getSyncFolders,
  getSyncOpsBudget,
  getSyncPageSize,
  getSyncPolicy,
  getSyncRunRetentionDays,
  DEFAULT_IMAP_BASE_RESPONSE_BYTES,
} from "./lib/config.js";
import {
  isFreshSyncInProgress,
  isTransientSyncError,
  shouldAttemptImapFallback,
  shouldAutoSyncAccount,
  summarizeSyncFailure,
} from "./lib/sync-policy.js";
import { evaluateLoginThrottle, loginThrottleWindowCutoff } from "./lib/throttle.js";
import {
  buildDeltaUrl,
  graphFetchArrayBuffer,
  graphFetchJson,
  refreshAccessToken,
  refreshImapAccessToken,
  verifyMicrosoftAccount,
} from "./lib/graph.js";
import { createImapClient, selectImapMailbox } from "./lib/imap.js";
import {
  extractImapLiteralBodies,
  formatImapSearchDate,
  makeXoauth2Token,
  parseImapSearchUids,
} from "./lib/imap-parse.js";
import { parseRawEmailToGraphLikeItem } from "./lib/mime.js";
import {
  buildInPlaceholders,
  buildMessageUpsertParams,
  buildMessagesPayload,
  buildMessagesQueryPlan,
  extractBatchReturnedIds,
  messageUpsertSqlForMode,
} from "./lib/db-batch.js";

const SESSION_COOKIE = "mail_admin_session";
const R2_DELETE_CONCURRENCY = 6;

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      return handleError(error);
    }
  },

  async scheduled(controller, env, ctx) {
    await ensureSchema(env);
    ctx.waitUntil(runScheduledMaintenance(env, controller.cron));
  },
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/" || path === "/index.html") {
    return new Response(APP_HTML, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store",
        ...securityHeaders(),
      },
    });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (path === "/favicon.ico") {
    return new Response(null, { status: 204 });
  }

  if (path === "/api/health" && request.method === "GET") {
    return jsonResponse({
      success: true,
      data: {
        status: "ok",
        now: new Date().toISOString(),
      },
    });
  }

  await ensureSchema(env);

  if (path === "/api/auth/login" && request.method === "POST") {
    return await loginRoute(request, env);
  }

  if (path === "/api/auth/logout" && request.method === "POST") {
    return await logoutRoute(request, env);
  }

  if (path === "/api/auth/session" && request.method === "GET") {
    return await sessionRoute(request, env);
  }

  if (path === "/api/internal/sync/account" && request.method === "POST") {
    return await internalSyncRoute(request, env);
  }

  if (!path.startsWith("/api/")) {
    throw new HttpError(404, "Route not found.");
  }

  await requireSession(request, env);

  if (path === "/api/accounts" && request.method === "GET") {
    return await listAccountsRoute(env);
  }

  if (path === "/api/dashboard" && request.method === "GET") {
    return await dashboardRoute(url, env);
  }

  if (path === "/api/accounts" && request.method === "POST") {
    return await createAccountRoute(request, env);
  }

  if (path === "/api/sync/run" && request.method === "POST") {
    return await syncAllAccountsRoute(url, env, ctx);
  }

  if (path === "/api/sync/auto" && request.method === "POST") {
    return await syncAutoAccountsRoute(url, env, ctx);
  }

  if (path === "/api/sync/runs" && request.method === "GET") {
    return await listSyncRunsRoute(url, env);
  }

  if (path === "/api/messages" && request.method === "GET") {
    return await listMessagesRoute(url, env);
  }

  const accountMatch = path.match(/^\/api\/accounts\/(\d+)$/);
  if (accountMatch) {
    const accountId = Number(accountMatch[1]);
    if (request.method === "PATCH") {
      return await updateAccountRoute(request, env, accountId);
    }
    if (request.method === "DELETE") {
      return await deleteAccountRoute(env, accountId);
    }
  }

  const accountSyncMatch = path.match(/^\/api\/accounts\/(\d+)\/sync$/);
  if (accountSyncMatch && request.method === "POST") {
    return await syncSingleAccountRoute(env, Number(accountSyncMatch[1]), ctx);
  }

  const messageMatch = path.match(/^\/api\/messages\/(\d+)$/);
  if (messageMatch) {
    const messageId = Number(messageMatch[1]);
    if (request.method === "GET") {
      return await getMessageRoute(env, messageId);
    }
    if (request.method === "DELETE") {
      return await deleteMessageRoute(env, messageId);
    }
  }

  const messageReadMatch = path.match(/^\/api\/messages\/(\d+)\/read$/);
  if (messageReadMatch && request.method === "POST") {
    return await markMessageRoute(request, env, Number(messageReadMatch[1]));
  }

  const attachmentMatch = path.match(/^\/api\/messages\/(\d+)\/attachments\/(\d+)$/);
  if (attachmentMatch && request.method === "GET") {
    return await downloadAttachmentRoute(
      env,
      Number(attachmentMatch[1]),
      Number(attachmentMatch[2]),
    );
  }

  throw new HttpError(404, "Route not found.");
}

async function loginRoute(request, env) {
  const body = await readJson(request);
  const password = requireString(body.password, "password");

  if (!env.ADMIN_PASSWORD) {
    throw new HttpError(500, "ADMIN_PASSWORD is not configured.");
  }

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const now = new Date();
  const throttleOptions = {
    maxFailures: getLoginMaxFailures(env),
    windowMinutes: getLoginWindowMinutes(env),
  };
  const throttleRow = await env.DB.prepare(
    "SELECT window_started_at, failure_count FROM login_throttle WHERE ip = ?",
  )
    .bind(ip)
    .first();
  const throttle = evaluateLoginThrottle(throttleRow, now, throttleOptions);
  if (throttle.blocked) {
    throw new HttpError(
      429,
      "Too many failed login attempts. Try again in about " + throttle.retryAfterMinutes + " minute(s).",
    );
  }

  if (!(await constantTimeStringEquals(password, env.ADMIN_PASSWORD))) {
    await recordLoginFailure(env, ip, now, throttleOptions.windowMinutes);
    throw new HttpError(401, "Invalid password.");
  }

  await env.DB.prepare("DELETE FROM login_throttle WHERE ip = ?").bind(ip).run();

  const sessionToken = randomHex(32);
  const tokenHash = await getSessionHash(sessionToken, env);
  const expiresAt = addHours(new Date(), getSessionTtlHours(env)).toISOString();

  await env.DB.prepare(
    "INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)",
  )
    .bind(tokenHash, expiresAt)
    .run();

  await cleanupExpiredSessions(env);

  return jsonResponse(
    {
      success: true,
      data: {
        authenticated: true,
        expiresAt,
      },
    },
    200,
    {
      "Set-Cookie": buildSessionCookie(sessionToken, getSessionTtlHours(env)),
    },
  );
}

async function recordLoginFailure(env, ip, now, windowMinutes) {
  const nowIso = now.toISOString();
  const cutoff = loginThrottleWindowCutoff(now, windowMinutes);
  await env.DB.prepare(
    `INSERT INTO login_throttle (ip, window_started_at, failure_count, last_failure_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(ip) DO UPDATE SET
       failure_count = CASE
         WHEN login_throttle.window_started_at <= ? THEN 1
         ELSE login_throttle.failure_count + 1
       END,
       window_started_at = CASE
         WHEN login_throttle.window_started_at <= ? THEN excluded.window_started_at
         ELSE login_throttle.window_started_at
       END,
       last_failure_at = excluded.last_failure_at`,
  )
    .bind(ip, nowIso, nowIso, cutoff, cutoff)
    .run();
}

async function logoutRoute(request, env) {
  const sessionToken = getSessionToken(request);

  if (sessionToken) {
    const tokenHash = await getSessionHash(sessionToken, env);
    await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
  }

  return jsonResponse(
    {
      success: true,
      data: { authenticated: false },
    },
    200,
    {
      "Set-Cookie": clearSessionCookie(),
    },
  );
}

async function sessionRoute(request, env) {
  const session = await getSession(request, env);
  return jsonResponse({
    success: true,
    data: {
      authenticated: Boolean(session),
      expiresAt: session?.expires_at ?? null,
    },
  });
}

async function listAccountsRoute(env) {
  return jsonResponse({
    success: true,
    data: await listAccountsData(env),
  });
}

const ACCOUNTS_LIST_SQL = `SELECT id, email, client_id, group_name, status, last_sync_at, last_sync_status, last_sync_error,
            created_at, updated_at
     FROM mail_accounts
     ORDER BY updated_at DESC, id DESC`;

const SYNC_SUMMARY_SQL = `SELECT
       SUM(CASE WHEN last_sync_status = 'success' THEN 1 ELSE 0 END) AS success_count,
       SUM(CASE WHEN last_sync_status IN ('queued', 'running') THEN 1 ELSE 0 END) AS active_count,
       SUM(CASE WHEN last_sync_status IN ('pending_retry', 'error') THEN 1 ELSE 0 END) AS attention_count,
       MAX(last_sync_at) AS latest_sync_at
     FROM mail_accounts
     WHERE status = 'active'`;

async function listAccountsData(env) {
  const result = await env.DB.prepare(ACCOUNTS_LIST_SQL).all();
  return result.results ?? [];
}

function buildGroupSummaries(accounts) {
  const map = new Map();
  for (const account of accounts) {
    const group = normalizeGroupName(account.group_name);
    const item = map.get(group) || { name: group, accountCount: 0, attentionCount: 0 };
    item.accountCount += 1;
    if (accountNeedsAttention(account)) {
      item.attentionCount += 1;
    }
    map.set(group, item);
  }
  const groups = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  const totalAttention = accounts.filter(accountNeedsAttention).length;
  return [
    {
      name: "",
      label: "全部分组",
      accountCount: accounts.length,
      attentionCount: totalAttention,
    },
    ...groups.map((item) => ({ ...item, label: item.name })),
  ];
}

function accountNeedsAttention(account) {
  const status = account.last_sync_status || "idle";
  return status === "pending_retry" || status === "error" || isTransientSyncError(account.last_sync_error);
}

async function createAccountRoute(request, env) {
  const body = await readJson(request);
  const clientId = requireString(body.clientId, "clientId");
  const refreshToken = requireString(body.refreshToken, "refreshToken");
  const emailInput = typeof body.email === "string" ? body.email.trim() : "";
  const groupName = normalizeGroupName(body.groupName);

  let validation = { skipped: true, error: null };
  let profile = null;
  if (!emailInput) {
    try {
      const verified = await verifyMicrosoftAccount(env, clientId, refreshToken);
      profile = verified.profile;
      validation = { skipped: false, error: null };
    } catch (error) {
      throw new HttpError(
        400,
        "Email is required when Microsoft validation fails: " + summarizeUpstreamError(error),
      );
    }
  }
  const email = emailInput || profile?.mail || profile?.userPrincipalName;

  if (!email) {
    throw new HttpError(400, "Unable to determine account email.");
  }

  const encryptedRefreshToken = await encryptSecretText(refreshToken, env.TOKEN_ENCRYPTION_SECRET);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO mail_accounts (
      email, client_id, refresh_token_encrypted, group_name, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      client_id = excluded.client_id,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      group_name = excluded.group_name,
      status = 'active',
      last_sync_status = 'idle',
      last_sync_error = NULL,
      updated_at = excluded.updated_at`,
  )
    .bind(email, clientId, encryptedRefreshToken, groupName, now, now)
    .run();

  const account = await getAccountByEmail(env, email);

  return jsonResponse({
    success: true,
    data: {
      account,
      validation,
    },
  });
}

async function updateAccountRoute(request, env, accountId) {
  const existing = await getAccountById(env, accountId, true);
  if (!existing) {
    throw new HttpError(404, "Account not found.");
  }

  const body = await readJson(request);
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : existing.email;
  const status = typeof body.status === "string" && body.status.trim() ? body.status.trim() : existing.status;
  const groupName = body.groupName !== undefined ? normalizeGroupName(body.groupName) : existing.group_name;
  let clientId = existing.client_id;
  let encryptedRefreshToken = existing.refresh_token_encrypted;

  if (body.clientId || body.refreshToken) {
    clientId = requireString(body.clientId ?? existing.client_id, "clientId");
    const refreshToken = requireString(body.refreshToken, "refreshToken");
    encryptedRefreshToken = await encryptSecretText(refreshToken, env.TOKEN_ENCRYPTION_SECRET);
  }

  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `UPDATE mail_accounts
       SET email = ?, client_id = ?, refresh_token_encrypted = ?, group_name = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(email, clientId, encryptedRefreshToken, groupName, status, now, accountId)
      .run();
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error?.message || error))) {
      throw new HttpError(409, "Another account already uses this email.");
    }
    throw error;
  }

  return jsonResponse({
    success: true,
    data: await getAccountById(env, accountId),
  });
}

async function deleteAccountRoute(env, accountId) {
  const account = await getAccountById(env, accountId);
  if (!account) {
    throw new HttpError(404, "Account not found.");
  }

  await purgeAccountArchive(env, accountId, [
    env.DB.prepare("DELETE FROM sync_runs WHERE account_id = ?").bind(accountId),
    env.DB.prepare("DELETE FROM mail_accounts WHERE id = ?").bind(accountId),
  ]);

  return jsonResponse({
    success: true,
    data: { deletedAccountId: accountId },
  });
}

async function syncSingleAccountRoute(env, accountId, ctx) {
  const account = await getAccountById(env, accountId, true);
  if (!account) {
    throw new HttpError(404, "Account not found.");
  }

  if (account.status !== "active") {
    throw new HttpError(400, "Account is inactive and cannot be synced.");
  }

  if (isFreshSyncInProgress(account, new Date(), getSyncPolicy(env))) {
    return jsonResponse({
      success: true,
      data: {
        accountId: account.id,
        email: account.email,
        status: account.last_sync_status,
        message: "Account sync is already queued or running.",
      },
    }, 202);
  }

  const claimed = await claimSyncAccounts(env, [account], 1);
  if (!claimed.length) {
    return jsonResponse({
      success: true,
      data: {
        accountId: account.id,
        email: account.email,
        status: "queued",
        message: "Account sync is already queued or running.",
      },
    }, 202);
  }

  const task = syncAccount(env, claimed[0]);
  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
    return jsonResponse({
      success: true,
      data: {
        accountId: account.id,
        email: account.email,
        status: "queued",
        message: "Account sync is running in the background.",
      },
    }, 202);
  }

  const result = await task;
  return jsonResponse({ success: true, data: result });
}

async function syncAllAccountsRoute(url, env, ctx) {
  const startedAt = new Date().toISOString();
  const accounts = await claimManualSyncAccounts(env);
  const baseUrl = getPublicBaseUrl(env) || url.origin;
  const task = runSyncBatch(env, accounts, baseUrl, getSyncConcurrency(env));

  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
    return jsonResponse({
      success: true,
      data: {
        status: "started",
        queued: accounts.length,
        batchLimit: getMaxSyncAccountsPerRun(env),
        startedAt,
        message: accounts.length
          ? "Sync batch is running in the background."
          : "No account is available for sync right now.",
      },
    }, 202);
  }

  const results = await task;
  return jsonResponse({
    success: true,
    data: {
      queued: accounts.length,
      batchLimit: getMaxSyncAccountsPerRun(env),
      results,
    },
  });
}

async function syncAutoAccountsRoute(url, env, ctx) {
  const startedAt = new Date().toISOString();
  const accounts = await claimAutoSyncAccounts(env);
  const baseUrl = getPublicBaseUrl(env) || url.origin;
  const task = runSyncBatch(env, accounts, baseUrl, 1);

  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
    return jsonResponse({
      success: true,
      data: {
        status: "started",
        queued: accounts.length,
        startedAt,
        message: accounts.length
          ? "Auto sync is running in the background."
          : "No account needs auto sync right now.",
      },
    }, 202);
  }

  const results = await task;
  return jsonResponse({ success: true, data: { queued: accounts.length, results } });
}

async function internalSyncRoute(request, env) {
  const provided = request.headers.get("x-micmail-internal") || "";
  const expected = await internalSyncToken(env);
  if (!provided || !(await constantTimeStringEquals(provided, expected))) {
    throw new HttpError(401, "Authentication required.");
  }

  const body = await readJson(request);
  const accountId = Number(body.accountId);
  if (!Number.isInteger(accountId) || accountId < 1) {
    throw new HttpError(400, "Invalid accountId.");
  }

  const account = await getAccountById(env, accountId, true);
  if (!account) {
    throw new HttpError(404, "Account not found.");
  }
  if (account.status !== "active" || account.last_sync_status !== "queued") {
    return jsonResponse({
      success: true,
      data: { accountId, skipped: true, status: account.last_sync_status },
    });
  }

  const result = await syncAccount(env, account);
  return jsonResponse({ success: true, data: result });
}

async function internalSyncToken(env) {
  if (!env.SESSION_SECRET) {
    throw new HttpError(500, "SESSION_SECRET is not configured.");
  }
  return await sha256Hex(env.SESSION_SECRET + ":internal-sync:v1");
}

/**
 * Runs a claimed batch either by fanning each account out to its own Worker
 * invocation (fresh subrequest budget per account, required on the free plan)
 * or inline when no base URL is available.
 */
async function runSyncBatch(env, accounts, baseUrl, inlineConcurrency) {
  if (!accounts.length) {
    return [];
  }
  if (baseUrl && accounts.length > 1) {
    await dispatchSyncFanout(env, accounts, baseUrl);
    return accounts.map((account) => ({
      accountId: account.id,
      email: account.email,
      status: "dispatched",
    }));
  }
  // Inline batches share one ops budget: the whole batch runs inside a single
  // Worker invocation, so per-account budgets would multiply past the free-tier
  // subrequest limit. Accounts cut off by the shared budget end up in
  // pending_retry and continue on the next run.
  const sharedBudget = { remaining: getSyncOpsBudget(env) };
  return await syncAccounts(env, accounts, inlineConcurrency, sharedBudget);
}

async function dispatchSyncFanout(env, accounts, baseUrl) {
  const token = await internalSyncToken(env);
  await mapWithConcurrency(accounts, getFanoutConcurrency(env), async (account) => {
    try {
      const response = await fetch(baseUrl + "/api/internal/sync/account", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-micmail-internal": token,
        },
        body: JSON.stringify({ accountId: account.id }),
      });
      if (!response.ok) {
        logInfo("sync_fanout_child_failed", {
          accountId: account.id,
          email: account.email,
          status: response.status,
        });
      }
    } catch (error) {
      logInfo("sync_fanout_child_failed", {
        accountId: account.id,
        email: account.email,
        error: summarizeUpstreamError(error),
      });
    }
  });
}

async function listMessagesRoute(url, env) {
  return jsonResponse({
    success: true,
    data: await listMessagesData(url, env),
  });
}

async function dashboardRoute(url, env) {
  const plan = buildMessagesQueryPlan(url);
  // All dashboard reads share one batch: 1 D1 subrequest per poll instead of 4-5.
  const [accountsResult, totalResult, itemsResult, summaryResult] = await env.DB.batch([
    env.DB.prepare(ACCOUNTS_LIST_SQL),
    env.DB.prepare(plan.total.sql).bind(...plan.total.params),
    env.DB.prepare(plan.items.sql).bind(...plan.items.params),
    env.DB.prepare(SYNC_SUMMARY_SQL),
  ]);
  const accounts = accountsResult.results ?? [];

  return jsonResponse({
    success: true,
    data: {
      accounts,
      groups: buildGroupSummaries(accounts),
      messages: buildMessagesPayload(plan, totalResult, itemsResult),
      sync: mapSyncSummaryRow(summaryResult.results?.[0]),
      serverTime: new Date().toISOString(),
    },
  });
}

async function listMessagesData(url, env) {
  const plan = buildMessagesQueryPlan(url);
  // Total + page rows in one batch: 1 D1 subrequest instead of 2.
  const [totalResult, itemsResult] = await env.DB.batch([
    env.DB.prepare(plan.total.sql).bind(...plan.total.params),
    env.DB.prepare(plan.items.sql).bind(...plan.items.params),
  ]);
  return buildMessagesPayload(plan, totalResult, itemsResult);
}

async function listSyncRunsRoute(url, env) {
  const limit = clampInt(url.searchParams.get("limit"), 20, 1, 100);
  const accountId = url.searchParams.get("accountId");
  const filters = [];
  const params = [];

  if (accountId) {
    filters.push("r.account_id = ?");
    params.push(Number(accountId));
  }

  const whereClause = filters.length ? "WHERE " + filters.join(" AND ") : "";
  const rows = await env.DB.prepare(
    `SELECT
       r.id,
       r.account_id,
       a.email AS account_email,
       r.status,
       r.folder_scope,
       r.started_at,
       r.finished_at,
       r.message_count,
       r.attachment_count,
       r.error_text
     FROM sync_runs r
     LEFT JOIN mail_accounts a ON a.id = r.account_id
     ${whereClause}
     ORDER BY r.started_at DESC, r.id DESC
     LIMIT ?`,
  )
    .bind(...params, limit)
    .all();

  return jsonResponse({
    success: true,
    data: {
      limit,
      items: rows.results ?? [],
    },
  });
}

function mapSyncSummaryRow(row) {
  return {
    successCount: Number(row?.success_count || 0),
    activeCount: Number(row?.active_count || 0),
    attentionCount: Number(row?.attention_count || 0),
    latestSyncAt: row?.latest_sync_at || null,
  };
}

async function getMessageRoute(env, messageId) {
  const message = await env.DB.prepare(
    `SELECT
       m.*,
       a.email AS account_email
     FROM messages m
     JOIN mail_accounts a ON a.id = m.account_id
     WHERE m.id = ?`,
  )
    .bind(messageId)
    .first();

  if (!message) {
    throw new HttpError(404, "Message not found.");
  }

  const attachments = await env.DB.prepare(
    `SELECT id, graph_attachment_id, name, content_type, kind, size, storage_status
     FROM attachments
     WHERE message_id = ?
     ORDER BY id ASC`,
  )
    .bind(messageId)
    .all();

  return jsonResponse({
    success: true,
    data: {
      ...message,
      attachments: attachments.results ?? [],
    },
  });
}

async function markMessageRoute(request, env, messageId) {
  const body = await readJson(request);
  const isRead = Boolean(body.isRead);
  const now = new Date().toISOString();

  const result = await env.DB.prepare(
    "UPDATE messages SET is_read = ?, updated_at = ? WHERE id = ?",
  )
    .bind(isRead ? 1 : 0, now, messageId)
    .run();

  if (!result.meta?.changes) {
    throw new HttpError(404, "Message not found.");
  }

  return jsonResponse({
    success: true,
    data: { messageId, isRead },
  });
}

async function deleteMessageRoute(env, messageId) {
  await deleteMessageArchive(env, messageId);
  return jsonResponse({
    success: true,
    data: { deletedMessageId: messageId },
  });
}

async function downloadAttachmentRoute(env, messageId, attachmentId) {
  const attachment = await env.DB.prepare(
    `SELECT id, name, content_type, r2_key
     FROM attachments
     WHERE id = ? AND message_id = ?`,
  )
    .bind(attachmentId, messageId)
    .first();

  if (!attachment) {
    throw new HttpError(404, "Attachment not found.");
  }

  if (!attachment.r2_key) {
    throw new HttpError(409, "Attachment metadata exists, but no downloadable file was archived.");
  }

  const object = await env.ATTACHMENTS.get(attachment.r2_key);
  if (!object) {
    throw new HttpError(404, "Attachment object not found in R2.");
  }

  return new Response(object.body, {
    headers: {
      "content-type": attachment.content_type || "application/octet-stream",
      "content-disposition": makeAttachmentContentDisposition(attachment.name || "attachment.bin"),
      "cache-control": "no-store",
      ...securityHeaders(),
    },
  });
}

async function runScheduledMaintenance(env, cron) {
  logInfo("scheduled_start", { cron });
  await runMaintenanceSqlBatch(env);
  await cleanupExpiredArchive(env);
  await syncAutoAccounts(env);
  logInfo("scheduled_complete", { cron });
}

async function runMaintenanceSqlBatch(env) {
  const now = new Date();
  const nowIso = now.toISOString();
  const queuedStaleBefore = minutesAgoIso(now, getQueuedStaleMinutes(env));
  const runningStaleBefore = minutesAgoIso(now, getRunningStaleMinutes(env));
  // All pure-SQL cleanups in one batch: 1 subrequest, applied atomically.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(nowIso),
    env.DB.prepare("DELETE FROM login_throttle WHERE last_failure_at <= ?").bind(
      minutesAgoIso(now, 24 * 60),
    ),
    env.DB.prepare(
      `UPDATE sync_runs
       SET status = 'error',
           finished_at = ?,
           error_text = 'Sync run marked stale after timeout.'
       WHERE status = 'running'
         AND started_at <= ?
         AND finished_at IS NULL`,
    ).bind(nowIso, runningStaleBefore),
    env.DB.prepare(
      `UPDATE mail_accounts
       SET last_sync_status = 'pending_retry',
           last_sync_error = 'Sync state marked stale after queued timeout.',
           updated_at = ?
       WHERE status = 'active'
         AND last_sync_status = 'queued'
         AND updated_at <= ?`,
    ).bind(nowIso, queuedStaleBefore),
    env.DB.prepare(
      `UPDATE mail_accounts
       SET last_sync_status = 'pending_retry',
           last_sync_error = 'Sync state marked stale after running timeout.',
           updated_at = ?
       WHERE status = 'active'
         AND last_sync_status = 'running'
         AND updated_at <= ?`,
    ).bind(nowIso, runningStaleBefore),
    env.DB.prepare("DELETE FROM sync_runs WHERE started_at <= ? AND status != 'running'").bind(
      addDays(now, -getSyncRunRetentionDays(env)).toISOString(),
    ),
  ]);
}

async function syncAutoAccounts(env) {
  const accounts = await claimAutoSyncAccounts(env);
  const baseUrl = getPublicBaseUrl(env);
  return await runSyncBatch(env, accounts, baseUrl, 1);
}

async function getActiveAccounts(env) {
  const accounts = await env.DB.prepare(
    `SELECT *
     FROM mail_accounts
     WHERE status = 'active'
     ORDER BY
       CASE WHEN last_sync_at IS NULL THEN 0 ELSE 1 END,
       last_sync_at ASC,
       id ASC`,
  ).all();
  return accounts.results ?? [];
}

async function getManualSyncAccounts(env) {
  const now = new Date();
  const policy = getSyncPolicy(env);
  const accounts = await getActiveAccounts(env);
  return accounts.filter((account) => !isFreshSyncInProgress(account, now, policy));
}

async function claimManualSyncAccounts(env) {
  const maxAccounts = getMaxSyncAccountsPerRun(env);
  const candidates = await getManualSyncAccounts(env);
  return await claimSyncAccounts(env, candidates, maxAccounts);
}

async function claimAutoSyncAccounts(env) {
  const now = new Date();
  const policy = getSyncPolicy(env);
  const maxAccounts = getMaxSyncAccountsPerRun(env);
  const candidates = await getActiveAccounts(env);

  return await claimSyncAccounts(
    env,
    candidates.filter((account) => shouldAutoSyncAccount(account, now, policy)),
    maxAccounts,
  );
}

async function claimSyncAccounts(env, candidates, maxAccounts) {
  const now = new Date();
  const nowIso = now.toISOString();
  const queuedStaleBefore = minutesAgoIso(now, getQueuedStaleMinutes(env));
  const runningStaleBefore = minutesAgoIso(now, getRunningStaleMinutes(env));
  const claimSql = `UPDATE mail_accounts
       SET last_sync_status = 'queued', updated_at = ?
       WHERE id = ?
         AND status = 'active'
         AND (
           last_sync_status NOT IN ('running', 'queued')
           OR (last_sync_status = 'queued' AND updated_at <= ?)
           OR (last_sync_status = 'running' AND updated_at <= ?)
         )`;
  const claimed = [];
  let cursor = 0;

  // The per-account conditional UPDATE stays the atomic claim; grouping a round
  // of them in one batch costs 1 subrequest. Extra rounds only happen when a
  // concurrent invocation won some claims (meta.changes = 0).
  while (claimed.length < maxAccounts && cursor < candidates.length) {
    const attempts = candidates.slice(cursor, cursor + (maxAccounts - claimed.length));
    cursor += attempts.length;

    const results = await env.DB.batch(
      attempts.map((account) =>
        env.DB.prepare(claimSql).bind(nowIso, account.id, queuedStaleBefore, runningStaleBefore),
      ),
    );

    results.forEach((result, index) => {
      if (result.meta?.changes) {
        claimed.push({ ...attempts[index], last_sync_status: "queued" });
      }
    });
  }

  return claimed;
}

async function syncAccounts(env, accounts, concurrency, sharedBudget = null) {
  return await mapWithConcurrency(accounts, concurrency, (account) =>
    syncAccount(env, account, sharedBudget),
  );
}

async function syncAccount(env, account, sharedBudget = null) {
  const startedAt = new Date().toISOString();
  const folderList = getSyncFolders(env);
  const syncRun = await env.DB.prepare(
    `INSERT INTO sync_runs (account_id, status, folder_scope, started_at)
     VALUES (?, 'running', ?, ?)`,
  )
    .bind(account.id, folderList.join(","), startedAt)
    .run();

  await env.DB.prepare(
    `UPDATE mail_accounts
     SET last_sync_status = 'running', last_sync_error = NULL, updated_at = ?
     WHERE id = ?`,
  )
    .bind(startedAt, account.id)
    .run();

  let messageCount = 0;
  let attachmentCount = 0;
  let partial = false;
  const budget = sharedBudget || { remaining: getSyncOpsBudget(env) };
  const cursorMap = parseJsonObject(account.delta_links_json);
  let graphSyncError = null;

  try {
    const refreshToken = await decryptSecretText(
      account.refresh_token_encrypted,
      env.TOKEN_ENCRYPTION_SECRET,
    );
    let syncMode = "graph";
    try {
      budget.remaining -= 1;
      const accessToken = await refreshAccessToken(
        env,
        account.client_id,
        refreshToken,
        "https://graph.microsoft.com/.default offline_access",
      );

      for (const folder of folderList) {
        if (budget.remaining <= 0) {
          partial = true;
          break;
        }
        const syncResult = await syncFolderMessages(env, account, accessToken, folder, cursorMap, budget);
        cursorMap[folder] = syncResult.cursor;
        messageCount += syncResult.messageCount;
        attachmentCount += syncResult.attachmentCount;
        if (syncResult.partial) {
          partial = true;
          break;
        }
      }
    } catch (graphError) {
      graphSyncError = summarizeUpstreamError(graphError);
      if (!shouldAttemptImapFallback(graphError)) {
        logInfo("graph_sync_failed_skip_imap", {
          accountId: account.id,
          email: account.email,
          error: graphSyncError,
        });
        graphSyncError = null;
        throw graphError;
      }
      syncMode = "imap";
      logInfo("graph_sync_failed_try_imap", {
        accountId: account.id,
        email: account.email,
        error: graphSyncError,
      });

      budget.remaining -= 1;
      const accessToken = await refreshImapAccessToken(env, account.client_id, refreshToken);
      for (const folder of folderList) {
        if (budget.remaining <= 0) {
          partial = true;
          break;
        }
        const syncResult = await syncImapFolderMessages(env, account, accessToken, folder, cursorMap, budget);
        cursorMap["imap:" + folder + ":lastUid"] = syncResult.lastUid || cursorMap["imap:" + folder + ":lastUid"] || 0;
        messageCount += syncResult.messageCount;
        if (syncResult.partial) {
          partial = true;
          break;
        }
      }
    }

    const finishedAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE sync_runs
       SET status = 'success', finished_at = ?, message_count = ?, attachment_count = ?, error_text = ?
       WHERE id = ?`,
    )
      .bind(
        finishedAt,
        messageCount,
        attachmentCount,
        partial ? "Partial run: per-run sync budget reached; continues automatically." : null,
        syncRun.meta.last_row_id,
      )
      .run();

    const accountStatus = partial ? "pending_retry" : "success";
    const accountError = partial
      ? "Sync paused: per-run sync budget reached; remaining mail continues on the next run."
      : null;
    await env.DB.prepare(
      `UPDATE mail_accounts
       SET last_sync_at = ?, last_sync_status = ?, last_sync_error = ?,
           delta_links_json = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(finishedAt, accountStatus, accountError, JSON.stringify(cursorMap), finishedAt, account.id)
      .run();

    logInfo(partial ? "sync_partial" : "sync_success", {
      accountId: account.id,
      email: account.email,
      syncMode,
      messageCount,
      attachmentCount,
    });

    return {
      accountId: account.id,
      email: account.email,
      status: partial ? "partial" : "success",
      syncMode,
      messageCount,
      attachmentCount,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const syncError = summarizeSyncFailure(error, graphSyncError);
    const failureStatus = isTransientSyncError(syncError) ? "pending_retry" : "error";
    await env.DB.prepare(
      `UPDATE sync_runs
       SET status = 'error', finished_at = ?, message_count = ?, attachment_count = ?, error_text = ?
       WHERE id = ?`,
    )
      .bind(finishedAt, messageCount, attachmentCount, syncError, syncRun.meta.last_row_id)
      .run();

    await env.DB.prepare(
      `UPDATE mail_accounts
       SET last_sync_at = ?, last_sync_status = ?, last_sync_error = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(finishedAt, failureStatus, syncError, finishedAt, account.id)
      .run();

    logInfo("sync_error", {
      accountId: account.id,
      email: account.email,
      status: failureStatus,
      error: syncError,
    });

    return {
      accountId: account.id,
      email: account.email,
      status: failureStatus,
      messageCount,
      attachmentCount,
      error: syncError,
      finishedAt,
    };
  }
}

async function syncFolderMessages(env, account, accessToken, folder, cursorMap, budget) {
  let url = cursorMap[folder] || buildDeltaUrl(env, folder);
  let pages = 0;
  let messageCount = 0;
  let attachmentCount = 0;
  let cursor = url;
  let partial = false;

  while (url && pages < getMaxSyncPages(env)) {
    if (budget.remaining <= 0) {
      partial = true;
      break;
    }

    budget.remaining -= 1;
    let payload;
    try {
      payload = await graphFetchJson(url, accessToken, { pageSize: getSyncPageSize(env) });
    } catch (error) {
      cursorMap[folder] = cursor;
      await checkpointAccountCursors(env, account.id, cursorMap);
      throw error;
    }
    const items = (Array.isArray(payload.value) ? payload.value : []).filter(
      (item) => !item["@removed"],
    );

    if (items.length) {
      if (budget.remaining <= 0) {
        partial = true;
        break;
      }

      const localMessageIds = await upsertMessagesBatch(env, account.id, folder, items, budget);
      messageCount += items.length;

      const noAttachmentIds = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!item.hasAttachments) {
          noAttachmentIds.push(localMessageIds[index]);
          continue;
        }
        if (budget.remaining <= 0) {
          partial = true;
          break;
        }
        attachmentCount += await syncMessageAttachments(
          env,
          accessToken,
          account.id,
          localMessageIds[index],
          item.id,
          budget,
        );
      }

      // Skipping the purge on partial is safe: the cursor stays on this page,
      // so the next run re-fetches it and purges then.
      if (!partial && noAttachmentIds.length) {
        if (budget.remaining <= 0) {
          partial = true;
        } else {
          await purgeAttachmentsForMessages(env, noAttachmentIds, budget);
        }
      }
    }

    pages += 1;

    if (partial) {
      // Cursor stays on the current page URL so the next run re-fetches and
      // finishes this page; message upserts are idempotent.
      break;
    }

    if (payload["@odata.nextLink"]) {
      url = payload["@odata.nextLink"];
      cursor = url;
      cursorMap[folder] = cursor;
      budget.remaining -= 1;
      await checkpointAccountCursors(env, account.id, cursorMap);
      continue;
    }

    if (payload["@odata.deltaLink"]) {
      cursor = payload["@odata.deltaLink"];
    }
    break;
  }

  return { cursor, messageCount, attachmentCount, partial };
}

async function checkpointAccountCursors(env, accountId, cursorMap) {
  await env.DB.prepare(
    `UPDATE mail_accounts
     SET delta_links_json = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(JSON.stringify(cursorMap), new Date().toISOString(), accountId)
    .run();
}

// Upserts a whole page of messages in one env.DB.batch (1 subrequest, atomic),
// returning the local message ids in input order via per-statement RETURNING id.
async function upsertMessagesBatch(env, accountId, folder, items, budget) {
  if (!items.length) {
    return [];
  }

  const options = { now: new Date(), retentionDays: getRetentionDays(env) };
  const paramsList = items.map((item) =>
    buildMessageUpsertParams(accountId, folder, item, options),
  );

  const runBatch = async (mode) => {
    const statement = env.DB.prepare(messageUpsertSqlForMode(mode));
    return await env.DB.batch(paramsList.map((params) => statement.bind(...params)));
  };

  budget.remaining -= 1;
  let results;
  try {
    results = await runBatch(await getMessageKeyMode(env));
  } catch (error) {
    if (/ON CONFLICT clause does not match/i.test(String(error?.message || error))) {
      // The failed batch rolled back as a whole; rebuild every statement under
      // the re-detected key mode and retry once.
      invalidateMessageKeyMode();
      budget.remaining -= 1;
      results = await runBatch(await getMessageKeyMode(env));
    } else {
      throw error;
    }
  }

  return extractBatchReturnedIds(results).map((id) => {
    if (!id) {
      throw new Error("Message upsert did not return an id.");
    }
    return id;
  });
}

async function syncMessageAttachments(env, accessToken, accountId, localMessageId, graphMessageId, budget) {
  budget.remaining -= 1;
  const payload = await graphFetchJson(
    "https://graph.microsoft.com/v1.0/me/messages/" +
      encodeURIComponent(graphMessageId) +
      "/attachments",
    accessToken,
  );

  const attachments = Array.isArray(payload.value) ? payload.value : [];
  budget.remaining -= 1;
  const existingRows = await env.DB.prepare(
    `SELECT id, graph_attachment_id, name, content_type, kind, size, storage_status, r2_key
     FROM attachments
     WHERE message_id = ?`,
  )
    .bind(localMessageId)
    .all();
  const existingByGraphId = new Map(
    (existingRows.results ?? []).map((row) => [row.graph_attachment_id, row]),
  );
  const seenGraphIds = new Set();

  let stored = 0;
  for (const item of attachments) {
    if (!item.id) {
      continue;
    }
    const kind = item["@odata.type"] || "unknown";
    const existing = existingByGraphId.get(item.id);
    const expectedR2Key = kind === "#microsoft.graph.fileAttachment"
      ? buildAttachmentR2Key(accountId, graphMessageId, item)
      : null;
    const unchanged = attachmentMetadataMatches(existing, item, kind, expectedR2Key);
    seenGraphIds.add(item.id);

    if (unchanged) {
      continue;
    }

    if (existing?.r2_key && existing.r2_key !== expectedR2Key) {
      budget.remaining -= 1;
      await env.ATTACHMENTS.delete(existing.r2_key);
    }

    let r2Key = null;
    let storageStatus = "metadata_only";
    if (kind === "#microsoft.graph.fileAttachment") {
      budget.remaining -= 2;
      const binary = await graphFetchArrayBuffer(
        "https://graph.microsoft.com/v1.0/me/messages/" +
          encodeURIComponent(graphMessageId) +
          "/attachments/" +
          encodeURIComponent(item.id) +
          "/$value",
        accessToken,
      );

      await env.ATTACHMENTS.put(expectedR2Key, binary, {
        httpMetadata: {
          contentType: item.contentType || "application/octet-stream",
        },
      });

      r2Key = expectedR2Key;
      storageStatus = "stored";
      stored += 1;
    }

    budget.remaining -= 1;
    await env.DB.prepare(
      `INSERT INTO attachments (
        message_id, graph_attachment_id, name, content_type, kind, size, storage_status, r2_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id, graph_attachment_id) DO UPDATE SET
        name = excluded.name,
        content_type = excluded.content_type,
        kind = excluded.kind,
        size = excluded.size,
        storage_status = excluded.storage_status,
        r2_key = excluded.r2_key`,
    )
      .bind(
        localMessageId,
        item.id,
        item.name || "",
        item.contentType || null,
        kind,
        Number(item.size || 0),
        storageStatus,
        r2Key,
      )
      .run();
  }

  for (const row of existingRows.results ?? []) {
    if (seenGraphIds.has(row.graph_attachment_id)) {
      continue;
    }
    if (row.r2_key) {
      budget.remaining -= 1;
      await env.ATTACHMENTS.delete(row.r2_key);
    }
    budget.remaining -= 1;
    await env.DB.prepare("DELETE FROM attachments WHERE id = ?").bind(row.id).run();
  }

  return stored;
}

function buildAttachmentR2Key(accountId, graphMessageId, attachment) {
  return (
    "mail/" +
    accountId +
    "/" +
    sanitizeKeyPart(graphMessageId) +
    "/" +
    sanitizeKeyPart(attachment.id) +
    "/" +
    sanitizeKeyPart(attachment.name || "attachment.bin")
  );
}

function attachmentMetadataMatches(existing, item, kind, expectedR2Key) {
  if (!existing) {
    return false;
  }
  const expectedStorageStatus = kind === "#microsoft.graph.fileAttachment" ? "stored" : "metadata_only";
  if (kind === "#microsoft.graph.fileAttachment" && existing.r2_key !== expectedR2Key) {
    return false;
  }
  return (
    existing.name === (item.name || "") &&
    (existing.content_type || null) === (item.contentType || null) &&
    existing.kind === kind &&
    Number(existing.size || 0) === Number(item.size || 0) &&
    existing.storage_status === expectedStorageStatus
  );
}

// Replaces the per-message attachment purge during sync: one SELECT, concurrent
// R2 deletes, one DELETE for the whole page. Deducts the actual subrequest count.
// Ids are chunked to stay under the D1 limit of 100 bound parameters; a normal
// sync page fits in a single chunk.
async function purgeAttachmentsForMessages(env, messageIds, budget) {
  for (const chunk of chunkArray(messageIds, 100)) {
    const placeholders = buildInPlaceholders(chunk.length);
    budget.remaining -= 1;
    const existing = await env.DB.prepare(
      `SELECT message_id, r2_key FROM attachments
       WHERE message_id IN (${placeholders}) AND r2_key IS NOT NULL`,
    )
      .bind(...chunk)
      .all();

    const keys = (existing.results ?? []).map((row) => row.r2_key);
    if (keys.length) {
      budget.remaining -= keys.length;
      await mapWithConcurrency(keys, R2_DELETE_CONCURRENCY, (key) => env.ATTACHMENTS.delete(key));
    }

    budget.remaining -= 1;
    await env.DB.prepare(`DELETE FROM attachments WHERE message_id IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
}

async function purgeAccountArchive(env, accountId, extraStatements = []) {
  const attachments = await env.DB.prepare(
    `SELECT at.r2_key
     FROM attachments at
     JOIN messages m ON m.id = at.message_id
     WHERE m.account_id = ? AND at.r2_key IS NOT NULL`,
  )
    .bind(accountId)
    .all();

  await mapWithConcurrency(
    (attachments.results ?? []).map((row) => row.r2_key),
    R2_DELETE_CONCURRENCY,
    (key) => env.ATTACHMENTS.delete(key),
  );

  // One atomic batch covers the archive purge plus any caller-provided
  // statements (e.g. account deletion), instead of one D1 call per table.
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM attachments
       WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?)`,
    ).bind(accountId),
    env.DB.prepare("DELETE FROM messages WHERE account_id = ?").bind(accountId),
    env.DB.prepare("DELETE FROM message_counters WHERE account_id = ?").bind(accountId),
    ...extraStatements,
  ]);
}

async function deleteMessageArchive(env, messageId) {
  const [messageResult, attachmentResult] = await env.DB.batch([
    env.DB.prepare("SELECT id FROM messages WHERE id = ?").bind(messageId),
    env.DB.prepare(
      "SELECT r2_key FROM attachments WHERE message_id = ? AND r2_key IS NOT NULL",
    ).bind(messageId),
  ]);

  if (!(messageResult.results ?? []).length) {
    throw new HttpError(404, "Message not found.");
  }

  await mapWithConcurrency(
    (attachmentResult.results ?? []).map((row) => row.r2_key),
    R2_DELETE_CONCURRENCY,
    (key) => env.ATTACHMENTS.delete(key),
  );

  await env.DB.batch([
    env.DB.prepare("DELETE FROM attachments WHERE message_id = ?").bind(messageId),
    env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(messageId),
  ]);
}

async function cleanupExpiredArchive(env) {
  const nowIso = new Date().toISOString();
  const expiredScopeSql =
    "SELECT id FROM messages WHERE expires_at <= ? ORDER BY expires_at ASC, id ASC LIMIT ?";
  // Both reads run in one batch (1 subrequest) against the same snapshot.
  const [idsResult, keysResult] = await env.DB.batch([
    env.DB.prepare(expiredScopeSql).bind(nowIso, EXPIRED_ARCHIVE_CLEANUP_LIMIT),
    env.DB.prepare(
      `SELECT r2_key FROM attachments
       WHERE r2_key IS NOT NULL AND message_id IN (${expiredScopeSql})`,
    ).bind(nowIso, EXPIRED_ARCHIVE_CLEANUP_LIMIT),
  ]);

  const messageIds = (idsResult.results ?? []).map((row) => row.id);
  if (!messageIds.length) {
    return;
  }

  await mapWithConcurrency(
    (keysResult.results ?? []).map((row) => row.r2_key),
    R2_DELETE_CONCURRENCY,
    (key) => env.ATTACHMENTS.delete(key),
  );

  const placeholders = buildInPlaceholders(messageIds.length);
  // One atomic batch; the messages delete trigger keeps message_counters in sync.
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM attachments WHERE message_id IN (${placeholders})`).bind(
      ...messageIds,
    ),
    env.DB.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).bind(...messageIds),
  ]);
}

async function syncImapFolderMessages(env, account, accessToken, folder, cursorMap = {}, budget = { remaining: Number.POSITIVE_INFINITY }) {
  const bodyPeekBytes = getImapBodyPeekBytes(env);
  const fetchBatchSize = getImapFetchBatchSize(env);
  const client = await createImapClient("outlook.office365.com", 993, {
    totalTimeoutMs: getImapCommandTimeoutSeconds(env) * 1000,
    idleTimeoutMs: getImapIdleTimeoutSeconds(env) * 1000,
  });
  try {
    await client.readGreeting();
    await client.command(
      "AUTHENTICATE XOAUTH2 " + makeXoauth2Token(account.email, accessToken),
      "OK",
      {
        label: "AUTHENTICATE XOAUTH2",
        totalTimeoutMs: Math.max(getImapCommandTimeoutSeconds(env) * 1000, 60000),
        idleTimeoutMs: Math.max(getImapIdleTimeoutSeconds(env) * 1000, 30000),
      },
    );

    const mailbox = await selectImapMailbox(client, folder);
    const cursorKey = "imap:" + folder + ":lastUid";
    const previousLastUid = clampInt(cursorMap[cursorKey], 0, 0);
    const searchCommand = previousLastUid > 0
      ? "UID SEARCH UID " + String(previousLastUid + 1) + ":*"
      : "UID SEARCH SINCE " + formatImapSearchDate(addDays(new Date(), -getRetentionDays(env)));
    const searchResponse = await client.command(searchCommand, "OK", {
      label: "UID SEARCH",
      maxBytes: DEFAULT_IMAP_BASE_RESPONSE_BYTES * 2,
    });
    const searchedUids = parseImapSearchUids(searchResponse)
      .filter((uid) => uid > previousLastUid);
    const uids = previousLastUid > 0 ? searchedUids : searchedUids.slice(-getSyncPageSize(env));
    let messageCount = 0;
    let lastUid = previousLastUid;
    let partial = false;

    if (!uids.length) {
      return { messageCount: 0, mailbox, lastUid, partial };
    }

    for (const chunk of chunkArray(uids, fetchBatchSize)) {
      if (budget.remaining <= 0) {
        partial = true;
        break;
      }
      const response = await client.command(
        "UID FETCH " + chunk.join(",") + " (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[]<0." + bodyPeekBytes + ">)",
        "OK",
        {
          label: "UID FETCH",
          maxBytes: getImapFetchMaxResponseBytes(bodyPeekBytes, chunk.length),
        },
      );
      const rawMessages = extractImapLiteralBodies(response);
      const chunkItems = rawMessages.map((rawMessage) =>
        parseRawEmailToGraphLikeItem(rawMessage, account.email, folder),
      );
      if (chunkItems.length) {
        await upsertMessagesBatch(env, account.id, folder, chunkItems, budget);
        messageCount += chunkItems.length;
      }
      lastUid = Math.max(lastUid, ...chunk);
      cursorMap[cursorKey] = lastUid;
      budget.remaining -= 1;
      await checkpointAccountCursors(env, account.id, cursorMap);
    }

    return { messageCount, mailbox, lastUid, partial };
  } finally {
    await client.close();
  }
}

async function getSession(request, env) {
  const token = getSessionToken(request);
  if (!token) {
    return null;
  }

  const tokenHash = await getSessionHash(token, env);
  return await env.DB.prepare(
    `SELECT id, expires_at
     FROM admin_sessions
     WHERE token_hash = ? AND expires_at > ?`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first();
}

async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session) {
    throw new HttpError(401, "Authentication required.");
  }
  return session;
}

async function cleanupExpiredSessions(env) {
  await env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?")
    .bind(new Date().toISOString())
    .run();
}

function buildSessionCookie(token, ttlHours) {
  return (
    SESSION_COOKIE +
    "=" +
    token +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" +
    String(ttlHours * 3600)
  );
}

function clearSessionCookie() {
  return SESSION_COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function getSessionToken(request) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  return cookies[SESSION_COOKIE] || null;
}

function parseCookies(cookieHeader) {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((result, pair) => {
      const index = pair.indexOf("=");
      if (index === -1) {
        return result;
      }
      result[pair.slice(0, index)] = pair.slice(index + 1);
      return result;
    }, {});
}

async function getAccountById(env, accountId, includeSecrets = false) {
  const columns = includeSecrets
    ? "*"
    : "id, email, client_id, group_name, status, last_sync_at, last_sync_status, last_sync_error, created_at, updated_at";
  return await env.DB.prepare(
    "SELECT " + columns + " FROM mail_accounts WHERE id = ?",
  )
    .bind(accountId)
    .first();
}

async function getAccountByEmail(env, email) {
  return await env.DB.prepare(
    `SELECT id, email, client_id, group_name, status, last_sync_at, last_sync_status, last_sync_error,
            created_at, updated_at
     FROM mail_accounts
     WHERE email = ?`,
  )
    .bind(email)
    .first();
}

async function getSessionHash(token, env) {
  if (!env.SESSION_SECRET) {
    throw new HttpError(500, "SESSION_SECRET is not configured.");
  }
  return await sha256Hex(env.SESSION_SECRET + ":" + token);
}

function sanitizeKeyPart(value) {
  return encodeURIComponent(String(value).replace(/\//g, "_"));
}

function normalizeGroupName(value) {
  const input = typeof value === "string" ? value.trim() : "";
  return input || "默认分组";
}
