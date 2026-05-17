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
import { ensureSchema } from "./lib/schema.js";
import { connect } from "cloudflare:sockets";
const SESSION_COOKIE = "mail_admin_session";
const DEFAULT_SESSION_TTL_HOURS = 12;
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_SYNC_PAGE_SIZE = 50;
const DEFAULT_MAX_SYNC_PAGES = 40;
const DEFAULT_SYNC_FOLDERS = ["inbox", "junkemail"];
const DEFAULT_AUTO_SYNC_STALE_MINUTES = 30;
const DEFAULT_TRANSIENT_RETRY_MINUTES = 10;
const DEFAULT_QUEUED_STALE_MINUTES = 10;
const DEFAULT_RUNNING_STALE_MINUTES = 60;
const DEFAULT_MAX_SYNC_ACCOUNTS_PER_RUN = 8;
const DEFAULT_SYNC_RUN_RETENTION_DAYS = 14;
const DEFAULT_IMAP_FETCH_BATCH_SIZE = 1;
const DEFAULT_IMAP_BODY_PEEK_BYTES = 2 * 1024 * 1024;
const DEFAULT_IMAP_COMMAND_TIMEOUT_SECONDS = 60;
const DEFAULT_IMAP_IDLE_TIMEOUT_SECONDS = 30;
const DEFAULT_IMAP_BASE_RESPONSE_BYTES = 512 * 1024;
const encoder = new TextEncoder();

const aesKeyCache = new Map();

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

  await ensureSchema(env);

  if (path === "/api/health" && request.method === "GET") {
    return jsonResponse({
      success: true,
      data: {
        status: "ok",
        now: new Date().toISOString(),
      },
    });
  }

  if (path === "/api/auth/login" && request.method === "POST") {
    return await loginRoute(request, env);
  }

  if (path === "/api/auth/logout" && request.method === "POST") {
    return await logoutRoute(request, env);
  }

  if (path === "/api/auth/session" && request.method === "GET") {
    return await sessionRoute(request, env);
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
    return await syncAllAccountsRoute(env, ctx);
  }

  if (path === "/api/sync/auto" && request.method === "POST") {
    return await syncAutoAccountsRoute(env, ctx);
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

  if (password !== env.ADMIN_PASSWORD) {
    throw new HttpError(401, "Invalid password.");
  }

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

async function listAccountsData(env) {
  const result = await env.DB.prepare(
    `SELECT id, email, client_id, group_name, status, last_sync_at, last_sync_status, last_sync_error,
            created_at, updated_at
     FROM mail_accounts
     ORDER BY updated_at DESC, id DESC`,
  ).all();

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

  const encryptedRefreshToken = await encryptText(refreshToken, env.TOKEN_ENCRYPTION_SECRET);
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
    encryptedRefreshToken = await encryptText(refreshToken, env.TOKEN_ENCRYPTION_SECRET);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE mail_accounts
     SET email = ?, client_id = ?, refresh_token_encrypted = ?, group_name = ?, status = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(email, clientId, encryptedRefreshToken, groupName, status, now, accountId)
    .run();

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

  await purgeAccountArchive(env, accountId);
  await env.DB.prepare("DELETE FROM sync_runs WHERE account_id = ?").bind(accountId).run();
  await env.DB.prepare("DELETE FROM mail_accounts WHERE id = ?").bind(accountId).run();

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

  if (isFreshSyncInProgress(env, account, new Date())) {
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

async function syncAllAccountsRoute(env, ctx) {
  const urlStartedAt = new Date().toISOString();
  const accounts = await claimManualSyncAccounts(env);
  const task = syncAccounts(env, accounts, getSyncConcurrency(env));
  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
    return jsonResponse({
      success: true,
      data: {
        status: "started",
        queued: accounts.length,
        batchLimit: getMaxSyncAccountsPerRun(env),
        startedAt: urlStartedAt,
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

async function syncAutoAccountsRoute(env, ctx) {
  const startedAt = new Date().toISOString();
  const accounts = await claimAutoSyncAccounts(env);
  const task = syncAccounts(env, accounts, 1);

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

async function listMessagesRoute(url, env) {
  return jsonResponse({
    success: true,
    data: await listMessagesData(url, env),
  });
}

async function dashboardRoute(url, env) {
  const [accounts, messages, syncSummary] = await Promise.all([
    listAccountsData(env),
    listMessagesData(url, env),
    getSyncSummary(env),
  ]);

  return jsonResponse({
    success: true,
    data: {
      accounts,
      groups: buildGroupSummaries(accounts),
      messages,
      sync: syncSummary,
      serverTime: new Date().toISOString(),
    },
  });
}

async function listMessagesData(url, env) {
  const page = clampInt(url.searchParams.get("page"), 1, 1);
  const pageSize = clampInt(url.searchParams.get("pageSize"), 25, 1, 100);
  const offset = (page - 1) * pageSize;
  const filters = [];
  const params = [];

  const accountId = url.searchParams.get("accountId");
  if (accountId) {
    filters.push("m.account_id = ?");
    params.push(Number(accountId));
  }

  const folder = url.searchParams.get("folder");
  if (folder) {
    filters.push("m.folder = ?");
    params.push(folder);
  }

  const groupName = url.searchParams.get("group");
  if (groupName) {
    filters.push("a.group_name = ?");
    params.push(groupName);
  }

  const keyword = url.searchParams.get("keyword");
  if (keyword) {
    const like = "%" + keyword.trim() + "%";
    filters.push(
      "(m.subject LIKE ? OR m.from_name LIKE ? OR m.from_address LIKE ? OR m.body_text LIKE ?)",
    );
    params.push(like, like, like, like);
  }

  const dateFrom = url.searchParams.get("dateFrom");
  if (dateFrom) {
    filters.push("m.received_at >= ?");
    params.push(dateFrom);
  }

  const dateTo = url.searchParams.get("dateTo");
  if (dateTo) {
    filters.push("m.received_at <= ?");
    params.push(dateTo);
  }

  const whereClause = filters.length ? "WHERE " + filters.join(" AND ") : "";
  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total
     FROM messages m
     JOIN mail_accounts a ON a.id = m.account_id
     ${whereClause}`,
  )
    .bind(...params)
    .first();

  const rows = await env.DB.prepare(
    `SELECT
       m.id,
       m.account_id,
       a.email AS account_email,
       m.folder,
       m.subject,
       m.from_name,
       m.from_address,
       m.received_at,
       m.is_read,
       m.has_attachments,
       substr(coalesce(m.body_text, ''), 1, 180) AS preview
     FROM messages m
     JOIN mail_accounts a ON a.id = m.account_id
     ${whereClause}
     ORDER BY m.received_at DESC, m.id DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...params, pageSize, offset)
    .all();

  return {
    page,
    pageSize,
    total: totalRow?.total ?? 0,
    items: rows.results ?? [],
  };
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

async function getSyncSummary(env) {
  const row = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN last_sync_status = 'success' THEN 1 ELSE 0 END) AS success_count,
       SUM(CASE WHEN last_sync_status IN ('queued', 'running') THEN 1 ELSE 0 END) AS active_count,
       SUM(CASE WHEN last_sync_status IN ('pending_retry', 'error') THEN 1 ELSE 0 END) AS attention_count,
       MAX(last_sync_at) AS latest_sync_at
     FROM mail_accounts
     WHERE status = 'active'`,
  ).first();

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
      "content-disposition":
        'attachment; filename="' + safeHeaderFilename(attachment.name || "attachment.bin") + '"',
      "cache-control": "private, max-age=300",
    },
  });
}

async function runScheduledMaintenance(env, cron) {
  logInfo("scheduled_start", { cron });
  await cleanupExpiredSessions(env);
  await cleanupExpiredArchive(env);
  await cleanupStaleSyncRuns(env);
  await cleanupOldSyncRuns(env);
  await syncAutoAccounts(env);
  logInfo("scheduled_complete", { cron });
}

async function syncAutoAccounts(env) {
  return await syncAccounts(env, await claimAutoSyncAccounts(env), 1);
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
  const accounts = await getActiveAccounts(env);
  return accounts.filter((account) => !isFreshSyncInProgress(env, account, now));
}

async function claimManualSyncAccounts(env) {
  const maxAccounts = getMaxSyncAccountsPerRun(env);
  const candidates = await getManualSyncAccounts(env);
  return await claimSyncAccounts(env, candidates, maxAccounts);
}

async function claimAutoSyncAccounts(env) {
  const now = new Date();
  const maxAccounts = getMaxSyncAccountsPerRun(env);
  const candidates = await getActiveAccounts(env);

  return await claimSyncAccounts(
    env,
    candidates.filter((account) => shouldAutoSyncAccount(env, account, now)),
    maxAccounts,
  );
}

async function claimSyncAccounts(env, candidates, maxAccounts) {
  const now = new Date();
  const nowIso = now.toISOString();
  const queuedStaleBefore = minutesAgoIso(now, getQueuedStaleMinutes(env));
  const runningStaleBefore = minutesAgoIso(now, getRunningStaleMinutes(env));
  const claimed = [];

  for (const account of candidates) {
    if (claimed.length >= maxAccounts) {
      break;
    }

    const result = await env.DB.prepare(
      `UPDATE mail_accounts
       SET last_sync_status = 'queued', updated_at = ?
       WHERE id = ?
         AND status = 'active'
         AND (
           last_sync_status NOT IN ('running', 'queued')
           OR (last_sync_status = 'queued' AND updated_at <= ?)
           OR (last_sync_status = 'running' AND updated_at <= ?)
         )`,
    )
      .bind(nowIso, account.id, queuedStaleBefore, runningStaleBefore)
      .run();

    if (result.meta?.changes) {
      claimed.push({ ...account, last_sync_status: "queued" });
    }
  }

  return claimed;
}

async function syncAccounts(env, accounts, concurrency) {
  return await mapWithConcurrency(accounts, concurrency, (account) =>
    syncAccount(env, account),
  );
}

function shouldAutoSyncAccount(env, account, now) {
  const status = account.last_sync_status || "idle";
  if (status === "queued") {
    return minutesSince(account.updated_at, now) >= getQueuedStaleMinutes(env);
  }

  if (status === "running") {
    return minutesSince(account.updated_at, now) >= getRunningStaleMinutes(env);
  }

  if (!account.last_sync_at) {
    return true;
  }

  const lastSyncAge = minutesSince(account.last_sync_at, now);
  if (status === "pending_retry" || (status === "error" && isTransientSyncError(account.last_sync_error))) {
    return lastSyncAge >= getTransientRetryMinutes(env);
  }

  if (status === "error") {
    return false;
  }

  return lastSyncAge >= getAutoSyncStaleMinutes(env);
}

function isFreshSyncInProgress(env, account, now) {
  const status = account.last_sync_status || "idle";
  if (status === "queued") {
    return minutesSince(account.updated_at, now) < getQueuedStaleMinutes(env);
  }
  if (status === "running") {
    return minutesSince(account.updated_at, now) < getRunningStaleMinutes(env);
  }
  return false;
}

async function syncAccount(env, account) {
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
  const cursorMap = parseJsonObject(account.delta_links_json);
  let graphSyncError = null;

  try {
    const refreshToken = await decryptText(
      account.refresh_token_encrypted,
      env.TOKEN_ENCRYPTION_SECRET,
    );
    let syncMode = "graph";
    try {
      const accessToken = await refreshAccessToken(
        env,
        account.client_id,
        refreshToken,
        "https://graph.microsoft.com/.default offline_access",
      );

      for (const folder of folderList) {
        const syncResult = await syncFolderMessages(env, account, accessToken, folder, cursorMap);
        cursorMap[folder] = syncResult.cursor;
        messageCount += syncResult.messageCount;
        attachmentCount += syncResult.attachmentCount;
      }
    } catch (graphError) {
      graphSyncError = summarizeUpstreamError(graphError);
      syncMode = "imap";
      logInfo("graph_sync_failed_try_imap", {
        accountId: account.id,
        email: account.email,
        error: graphSyncError,
      });

      const accessToken = await refreshImapAccessToken(env, account.client_id, refreshToken);
      for (const folder of folderList) {
        const syncResult = await syncImapFolderMessages(env, account, accessToken, folder, cursorMap);
        cursorMap["imap:" + folder + ":lastUid"] = syncResult.lastUid || cursorMap["imap:" + folder + ":lastUid"] || 0;
        messageCount += syncResult.messageCount;
      }
    }

    const finishedAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE mail_accounts
       SET last_sync_at = ?, last_sync_status = 'success', last_sync_error = NULL,
           delta_links_json = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(finishedAt, JSON.stringify(cursorMap), finishedAt, account.id)
      .run();

    await env.DB.prepare(
      `UPDATE sync_runs
       SET status = 'success', finished_at = ?, message_count = ?, attachment_count = ?
       WHERE id = ?`,
    )
      .bind(finishedAt, messageCount, attachmentCount, syncRun.meta.last_row_id)
      .run();

    logInfo("sync_success", {
      accountId: account.id,
      email: account.email,
      syncMode,
      messageCount,
      attachmentCount,
    });

    return {
      accountId: account.id,
      email: account.email,
      status: "success",
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
      `UPDATE mail_accounts
       SET last_sync_at = ?, last_sync_status = ?, last_sync_error = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(finishedAt, failureStatus, syncError, finishedAt, account.id)
      .run();

    await env.DB.prepare(
      `UPDATE sync_runs
       SET status = 'error', finished_at = ?, message_count = ?, attachment_count = ?, error_text = ?
       WHERE id = ?`,
    )
      .bind(finishedAt, messageCount, attachmentCount, syncError, syncRun.meta.last_row_id)
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

async function syncFolderMessages(env, account, accessToken, folder, cursorMap) {
  let url = cursorMap[folder] || buildDeltaUrl(env, folder);
  let pages = 0;
  let messageCount = 0;
  let attachmentCount = 0;
  let cursor = url;

  while (url && pages < getMaxSyncPages(env)) {
    const payload = await graphFetchJson(url, accessToken);
    const items = Array.isArray(payload.value) ? payload.value : [];

    for (const item of items) {
      if (item["@removed"]) {
        continue;
      }

      const localMessageId = await upsertMessage(env, account.id, folder, item);
      messageCount += 1;

      if (item.hasAttachments) {
        attachmentCount += await syncMessageAttachments(
          env,
          accessToken,
          account.id,
          localMessageId,
          item.id,
        );
      } else {
        await purgeMessageAttachments(env, localMessageId);
      }
    }

    pages += 1;

    if (payload["@odata.nextLink"]) {
      url = payload["@odata.nextLink"];
      cursor = url;
      continue;
    }

    if (payload["@odata.deltaLink"]) {
      cursor = payload["@odata.deltaLink"];
    }
    break;
  }

  return { cursor, messageCount, attachmentCount };
}

async function upsertMessage(env, accountId, folder, item) {
  const receivedAt = item.receivedDateTime || new Date().toISOString();
  const bodyHtml = item.body?.content || "";
  const bodyContentType = item.body?.contentType || null;
  const syncedAt = new Date().toISOString();
  const expiresAt = addDays(new Date(receivedAt), getRetentionDays(env)).toISOString();
  const fromAddress = item.from?.emailAddress?.address || "";
  const fromName = item.from?.emailAddress?.name || "";

  await env.DB.prepare(
    `INSERT INTO messages (
      account_id, graph_message_id, internet_message_id, folder, subject, from_name, from_address,
      received_at, is_read, has_attachments, body_content_type, body_html, body_text,
      web_link, synced_at, expires_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(graph_message_id) DO UPDATE SET
      account_id = excluded.account_id,
      internet_message_id = excluded.internet_message_id,
      folder = excluded.folder,
      subject = excluded.subject,
      from_name = excluded.from_name,
      from_address = excluded.from_address,
      received_at = excluded.received_at,
      is_read = excluded.is_read,
      has_attachments = excluded.has_attachments,
      body_content_type = excluded.body_content_type,
      body_html = excluded.body_html,
      body_text = excluded.body_text,
      web_link = excluded.web_link,
      synced_at = excluded.synced_at,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at`,
  )
    .bind(
      accountId,
      item.id,
      item.internetMessageId || null,
      folder,
      item.subject || "",
      fromName,
      fromAddress,
      receivedAt,
      item.isRead ? 1 : 0,
      item.hasAttachments ? 1 : 0,
      bodyContentType,
      bodyHtml,
      htmlToText(bodyHtml),
      item.webLink || null,
      syncedAt,
      expiresAt,
      syncedAt,
    )
    .run();

  const saved = await env.DB.prepare(
    "SELECT id FROM messages WHERE graph_message_id = ?",
  )
    .bind(item.id)
    .first();

  return saved.id;
}

async function syncMessageAttachments(env, accessToken, accountId, localMessageId, graphMessageId) {
  const payload = await graphFetchJson(
    "https://graph.microsoft.com/v1.0/me/messages/" +
      encodeURIComponent(graphMessageId) +
      "/attachments",
    accessToken,
  );

  const attachments = Array.isArray(payload.value) ? payload.value : [];
  await purgeMessageAttachments(env, localMessageId);

  let stored = 0;
  for (const item of attachments) {
    const kind = item["@odata.type"] || "unknown";
    let r2Key = null;
    let storageStatus = "metadata_only";

    if (kind === "#microsoft.graph.fileAttachment") {
      const objectKey =
        "mail/" +
        accountId +
        "/" +
        sanitizeKeyPart(graphMessageId) +
        "/" +
        sanitizeKeyPart(item.id) +
        "/" +
        sanitizeKeyPart(item.name || "attachment.bin");

      const binary = await graphFetchArrayBuffer(
        "https://graph.microsoft.com/v1.0/me/messages/" +
          encodeURIComponent(graphMessageId) +
          "/attachments/" +
          encodeURIComponent(item.id) +
          "/$value",
        accessToken,
      );

      await env.ATTACHMENTS.put(objectKey, binary, {
        httpMetadata: {
          contentType: item.contentType || "application/octet-stream",
        },
      });

      r2Key = objectKey;
      storageStatus = "stored";
      stored += 1;
    }

    await env.DB.prepare(
      `INSERT INTO attachments (
        message_id, graph_attachment_id, name, content_type, kind, size, storage_status, r2_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

  return stored;
}

async function purgeMessageAttachments(env, messageId) {
  const existing = await env.DB.prepare(
    "SELECT r2_key FROM attachments WHERE message_id = ? AND r2_key IS NOT NULL",
  )
    .bind(messageId)
    .all();

  for (const row of existing.results ?? []) {
    await env.ATTACHMENTS.delete(row.r2_key);
  }

  await env.DB.prepare("DELETE FROM attachments WHERE message_id = ?").bind(messageId).run();
}

async function purgeAccountArchive(env, accountId) {
  const attachments = await env.DB.prepare(
    `SELECT at.r2_key
     FROM attachments at
     JOIN messages m ON m.id = at.message_id
     WHERE m.account_id = ? AND at.r2_key IS NOT NULL`,
  )
    .bind(accountId)
    .all();

  for (const row of attachments.results ?? []) {
    await env.ATTACHMENTS.delete(row.r2_key);
  }

  await env.DB.prepare(
    `DELETE FROM attachments
     WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?)`,
  )
    .bind(accountId)
    .run();

  await env.DB.prepare("DELETE FROM messages WHERE account_id = ?").bind(accountId).run();
}

async function deleteMessageArchive(env, messageId) {
  const message = await env.DB.prepare("SELECT id FROM messages WHERE id = ?")
    .bind(messageId)
    .first();

  if (!message) {
    throw new HttpError(404, "Message not found.");
  }

  await purgeMessageAttachments(env, messageId);
  await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(messageId).run();
}

async function cleanupExpiredArchive(env) {
  const expiredMessages = await env.DB.prepare(
    "SELECT id FROM messages WHERE expires_at <= ?",
  )
    .bind(new Date().toISOString())
    .all();

  for (const row of expiredMessages.results ?? []) {
    await deleteMessageArchive(env, row.id);
  }
}

async function cleanupStaleSyncRuns(env) {
  const staleBefore = minutesAgoIso(new Date(), getRunningStaleMinutes(env));
  await env.DB.prepare(
    `UPDATE sync_runs
     SET status = 'error',
         finished_at = ?,
         error_text = 'Sync run marked stale after timeout.'
     WHERE status = 'running'
       AND started_at <= ?
       AND finished_at IS NULL`,
  )
    .bind(new Date().toISOString(), staleBefore)
    .run();
}

async function cleanupOldSyncRuns(env) {
  await env.DB.prepare(
    "DELETE FROM sync_runs WHERE started_at <= ?",
  )
    .bind(addDays(new Date(), -getSyncRunRetentionDays(env)).toISOString())
    .run();
}

async function verifyMicrosoftAccount(env, clientId, refreshToken) {
  const accessToken = await refreshAccessToken(env, clientId, refreshToken);
  const profile = await graphFetchJson(
    "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName",
    accessToken,
  );
  return { accessToken, profile };
}

async function refreshAccessToken(env, clientId, refreshToken, scope = null) {
  const tenantId = env.MICROSOFT_TENANT_ID || "common";
  const url =
    "https://login.microsoftonline.com/" +
    encodeURIComponent(tenantId) +
    "/oauth2/v2.0/token";
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  if (scope) {
    body.set("scope", scope);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Microsoft token refresh failed: " + detail);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("Microsoft token refresh returned no access token.");
  }

  return payload.access_token;
}

async function refreshImapAccessToken(env, clientId, refreshToken) {
  const attempts = [
    "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
    "https://outlook.office.com/.default offline_access",
    null,
  ];
  const errors = [];

  for (const scope of attempts) {
    try {
      return await refreshAccessToken(env, clientId, refreshToken, scope);
    } catch (error) {
      errors.push(scope ? scope + ": " + summarizeUpstreamError(error) : "original scope: " + summarizeUpstreamError(error));
    }
  }

  throw new Error("Unable to refresh IMAP access token. " + errors.join(" | "));
}

function buildDeltaUrl(env, folder) {
  const cutoff = addDays(new Date(), -getRetentionDays(env)).toISOString();
  const params = new URLSearchParams();
  params.set(
    "$select",
    "id,internetMessageId,subject,from,receivedDateTime,body,isRead,hasAttachments,webLink",
  );
  params.set("$top", String(getSyncPageSize(env)));
  params.set("$filter", "receivedDateTime ge " + cutoff);

  return (
    "https://graph.microsoft.com/v1.0/me/mailFolders/" +
    encodeURIComponent(folder) +
    "/messages/delta?" +
    params.toString()
  );
}

async function graphFetchJson(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      authorization: "Bearer " + accessToken,
      prefer: "odata.maxpagesize=50",
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Microsoft Graph request failed (" + response.status + "): " + detail);
  }

  return await response.json();
}

async function graphFetchArrayBuffer(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      authorization: "Bearer " + accessToken,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Microsoft Graph binary request failed (" + response.status + "): " + detail);
  }

  return await response.arrayBuffer();
}

async function syncImapFolderMessages(env, account, accessToken, folder, cursorMap = {}) {
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

    if (!uids.length) {
      return { messageCount: 0, mailbox, lastUid };
    }

    for (const chunk of chunkArray(uids, fetchBatchSize)) {
      const response = await client.command(
        "UID FETCH " + chunk.join(",") + " (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[]<0." + bodyPeekBytes + ">)",
        "OK",
        {
          label: "UID FETCH",
          maxBytes: getImapFetchMaxResponseBytes(bodyPeekBytes, chunk.length),
        },
      );
      const rawMessages = extractImapLiteralBodies(response);
      for (const rawMessage of rawMessages) {
        const item = parseRawEmailToGraphLikeItem(rawMessage, account.email, folder);
        await upsertMessage(env, account.id, folder, item);
        messageCount += 1;
      }
      lastUid = Math.max(lastUid, ...chunk);
    }

    return { messageCount, mailbox, lastUid };
  } finally {
    await client.close();
  }
}

async function createImapClient(hostname, port, readDefaults = {}) {
  const socket = connect(
    { hostname, port },
    { secureTransport: "on" },
  );
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  const textEncoder = new TextEncoder();
  let tagIndex = 1;

  async function readUntil(pattern, options = {}) {
    const label = options.label || "IMAP command";
    const totalTimeoutMs = options.totalTimeoutMs || readDefaults.totalTimeoutMs || DEFAULT_IMAP_COMMAND_TIMEOUT_SECONDS * 1000;
    const idleTimeoutMs = options.idleTimeoutMs || readDefaults.idleTimeoutMs || DEFAULT_IMAP_IDLE_TIMEOUT_SECONDS * 1000;
    const maxBytes = options.maxBytes || DEFAULT_IMAP_BASE_RESPONSE_BYTES;
    const startedAt = Date.now();
    let bytesRead = 0;
    let chunksRead = 0;
    let text = "";
    while (Date.now() - startedAt < totalTimeoutMs) {
      const remainingMs = totalTimeoutMs - (Date.now() - startedAt);
      const { value, done } = await readChunkWithTimeout(
        reader,
        Math.max(1, Math.min(idleTimeoutMs, remainingMs)),
        label,
      );
      if (done) {
        break;
      }
      chunksRead += 1;
      bytesRead += value.byteLength || value.length || 0;
      if (bytesRead > maxBytes) {
        throw new Error(
          "IMAP response exceeded " +
            maxBytes +
            " bytes while reading " +
            label +
            ".",
        );
      }
      text += decoder.decode(value, { stream: true });
      if (pattern.test(text)) {
        return text;
      }
    }
    throw new Error(
      "IMAP response did not complete for " +
        label +
        " after " +
        (Date.now() - startedAt) +
        "ms (" +
        chunksRead +
        " chunks, " +
        bytesRead +
        " bytes).",
    );
  }

  async function writeLine(line) {
    await writer.write(textEncoder.encode(line + "\r\n"));
  }

  return {
    async readGreeting() {
      return await readUntil(/\* OK/i, { label: "IMAP greeting" });
    },
    async command(commandText, expected = "OK", options = {}) {
      const tag = "A" + String(tagIndex++).padStart(4, "0");
      const label = options.label || summarizeImapCommand(commandText);
      await writeLine(tag + " " + commandText);
      const response = await readUntil(
        new RegExp("\\r?\\n" + tag + " (OK|NO|BAD)", "i"),
        { ...options, label },
      );
      const statusMatch = response.match(new RegExp("\\r?\\n" + tag + " (OK|NO|BAD)", "i"));
      const status = statusMatch ? statusMatch[1].toUpperCase() : "";
      if (expected && status !== expected) {
        throw new Error("IMAP command failed: " + summarizeImapResponse(response));
      }
      return response;
    },
    async close() {
      try {
        await writeLine("A9999 LOGOUT");
      } catch {
        // Ignore close failures.
      }
      try {
        writer.releaseLock();
        reader.releaseLock();
      } catch {
        // Ignore lock release failures.
      }
      try {
        await socket.close();
      } catch {
        // Ignore socket close failures.
      }
    },
  };
}

async function readChunkWithTimeout(reader, timeoutMs, label) {
  let timeoutId;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("IMAP read timed out for " + label + " after " + timeoutMs + "ms.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function selectImapMailbox(client, folder) {
  const candidates = folder === "junkemail"
    ? ["Junk", "Junk Email", "Junk E-mail"]
    : ["INBOX"];

  const errors = [];
  for (const mailbox of candidates) {
    try {
      await client.command('SELECT "' + mailbox.replace(/"/g, '\\"') + '"', "OK");
      return mailbox;
    } catch (error) {
      errors.push(mailbox + ": " + summarizeUpstreamError(error));
    }
  }

  throw new Error("Unable to select IMAP folder " + folder + ". " + errors.join(" | "));
}

function makeXoauth2Token(email, accessToken) {
  return btoa("user=" + email + "\x01auth=Bearer " + accessToken + "\x01\x01");
}

function parseImapSearchUids(response) {
  const match = response.match(/\* SEARCH ([\d\s]*)/i);
  if (!match) {
    return [];
  }
  return match[1]
    .trim()
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function extractImapLiteralBodies(response) {
  const bodies = [];
  const literalPattern = /\{(\d+)\}\r?\n/g;
  let match;
  while ((match = literalPattern.exec(response))) {
    const length = Number.parseInt(match[1], 10);
    if (!Number.isInteger(length) || length <= 0) {
      continue;
    }
    const start = match.index + match[0].length;
    bodies.push(response.slice(start, start + length));
    literalPattern.lastIndex = start + length;
  }
  return bodies;
}

function parseRawEmailToGraphLikeItem(rawMessage, accountEmail, folder) {
  const headerEnd = rawMessage.search(/\r?\n\r?\n/);
  const rawHeaders = headerEnd >= 0 ? rawMessage.slice(0, headerEnd) : rawMessage;
  const rawBody = headerEnd >= 0 ? rawMessage.slice(headerEnd).trim() : "";
  const headers = parseEmailHeaders(rawHeaders);
  const from = parseEmailAddress(headers.from || "");
  const date = headers.date ? new Date(headers.date) : new Date();
  const receivedDateTime = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  const subject = decodeMimeWords(headers.subject || "");
  const body = extractEmailBody(rawHeaders, rawBody);
  const messageId = headers["message-id"] || shaLikeId(accountEmail + ":" + folder + ":" + subject + ":" + receivedDateTime);

  return {
    id: "imap:" + messageId,
    internetMessageId: messageId,
    subject,
    from: {
      emailAddress: {
        address: from.address,
        name: from.name,
      },
    },
    receivedDateTime,
    body: {
      contentType: body.contentType,
      content: body.content,
    },
    isRead: true,
    hasAttachments: false,
    webLink: null,
  };
}

function parseEmailHeaders(rawHeaders) {
  const result = {};
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) {
      continue;
    }
    result[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return result;
}

function parseEmailAddress(value) {
  const decoded = decodeMimeWords(value);
  const match = decoded.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/"/g, "").trim(),
      address: match[2].trim(),
    };
  }
  return {
    name: "",
    address: decoded.trim(),
  };
}

function extractEmailBody(rawHeaders, rawBody) {
  const contentType = parseContentType(rawHeaders);
  if (contentType.boundary) {
    const parts = rawBody.split("--" + contentType.boundary);
    const htmlPart = parts.find((part) => /content-type:\s*text\/html/i.test(part));
    const textPart = parts.find((part) => /content-type:\s*text\/plain/i.test(part));
    if (htmlPart) {
      return { contentType: "html", content: decodeEmailPart(htmlPart) };
    }
    if (textPart) {
      return { contentType: "text", content: escapeTextAsHtml(decodeEmailPart(textPart)) };
    }
  }

  if (contentType.value.includes("text/html")) {
    return { contentType: "html", content: decodeBodyByHeaders(rawHeaders, rawBody) };
  }

  return { contentType: "text", content: escapeTextAsHtml(decodeBodyByHeaders(rawHeaders, rawBody)) };
}

function parseContentType(rawHeaders) {
  const headers = parseEmailHeaders(rawHeaders);
  const value = String(headers["content-type"] || "text/plain").toLowerCase();
  const boundaryMatch = String(headers["content-type"] || "").match(/boundary="?([^";]+)"?/i);
  return {
    value,
    boundary: boundaryMatch ? boundaryMatch[1] : "",
  };
}

function decodeEmailPart(part) {
  const splitIndex = part.search(/\r?\n\r?\n/);
  if (splitIndex === -1) {
    return part.trim();
  }
  const headers = part.slice(0, splitIndex);
  const body = part.slice(splitIndex).trim();
  return decodeBodyByHeaders(headers, body);
}

function decodeBodyByHeaders(rawHeaders, body) {
  const headers = parseEmailHeaders(rawHeaders);
  const encoding = String(headers["content-transfer-encoding"] || "").toLowerCase();
  if (encoding.includes("base64")) {
    try {
      return new TextDecoder().decode(base64ToUint8(body.replace(/\s+/g, "")));
    } catch {
      return body;
    }
  }
  if (encoding.includes("quoted-printable")) {
    return decodeQuotedPrintable(body);
  }
  return body;
}

function decodeMimeWords(value) {
  return String(value).replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_match, charset, encoding, text) => {
    try {
      const bytes = encoding.toUpperCase() === "B"
        ? base64ToUint8(text)
        : quotedPrintableToBytes(text.replace(/_/g, " "));
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return text;
    }
  });
}

function decodeQuotedPrintable(value) {
  try {
    return new TextDecoder().decode(quotedPrintableToBytes(value));
  } catch {
    return value;
  }
}

function quotedPrintableToBytes(value) {
  const normalized = String(value)
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  return Uint8Array.from(normalized, (char) => char.charCodeAt(0));
}

function escapeTextAsHtml(value) {
  return "<pre style=\"white-space:pre-wrap;font-family:inherit\">" + escapeHtml(value) + "</pre>";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function formatImapSearchDate(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return date.getUTCDate() + "-" + months[date.getUTCMonth()] + "-" + date.getUTCFullYear();
}

function shaLikeId(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return "generated-" + hash.toString(16);
}

function summarizeImapCommand(commandText) {
  const text = String(commandText || "");
  if (/^AUTHENTICATE\s+XOAUTH2/i.test(text)) {
    return "AUTHENTICATE XOAUTH2";
  }
  return text.replace(/\s+/g, " ").slice(0, 120);
}

function summarizeImapResponse(response) {
  return response.replace(/\s+/g, " ").slice(-600);
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

function getRetentionDays(env) {
  return clampInt(env.MAIL_RETENTION_DAYS, DEFAULT_RETENTION_DAYS, 1, 3650);
}

function getSessionTtlHours(env) {
  return clampInt(env.SESSION_TTL_HOURS, DEFAULT_SESSION_TTL_HOURS, 1, 24 * 30);
}

function getSyncPageSize(env) {
  return clampInt(env.SYNC_PAGE_SIZE, DEFAULT_SYNC_PAGE_SIZE, 1, 100);
}

function getMaxSyncPages(env) {
  return clampInt(env.MAX_SYNC_PAGES, DEFAULT_MAX_SYNC_PAGES, 1, 500);
}

function getSyncConcurrency(env) {
  return clampInt(env.SYNC_CONCURRENCY, 3, 1, 10);
}

function getAutoSyncStaleMinutes(env) {
  return clampInt(env.AUTO_SYNC_STALE_MINUTES, DEFAULT_AUTO_SYNC_STALE_MINUTES, 5, 24 * 60);
}

function getTransientRetryMinutes(env) {
  return clampInt(env.TRANSIENT_RETRY_MINUTES, DEFAULT_TRANSIENT_RETRY_MINUTES, 5, 24 * 60);
}

function getQueuedStaleMinutes(env) {
  return clampInt(env.QUEUED_STALE_MINUTES, DEFAULT_QUEUED_STALE_MINUTES, 5, 24 * 60);
}

function getRunningStaleMinutes(env) {
  return clampInt(env.RUNNING_STALE_MINUTES, DEFAULT_RUNNING_STALE_MINUTES, 15, 24 * 60);
}

function getMaxSyncAccountsPerRun(env) {
  return clampInt(env.MAX_SYNC_ACCOUNTS_PER_RUN, DEFAULT_MAX_SYNC_ACCOUNTS_PER_RUN, 1, 25);
}

function getSyncRunRetentionDays(env) {
  return clampInt(env.SYNC_RUN_RETENTION_DAYS, DEFAULT_SYNC_RUN_RETENTION_DAYS, 1, 365);
}

function getImapFetchBatchSize(env) {
  return clampInt(env.IMAP_FETCH_BATCH_SIZE, DEFAULT_IMAP_FETCH_BATCH_SIZE, 1, 10);
}

function getImapBodyPeekBytes(env) {
  return clampInt(env.IMAP_BODY_PEEK_BYTES, DEFAULT_IMAP_BODY_PEEK_BYTES, 64 * 1024, 8 * 1024 * 1024);
}

function getImapCommandTimeoutSeconds(env) {
  return clampInt(env.IMAP_COMMAND_TIMEOUT_SECONDS, DEFAULT_IMAP_COMMAND_TIMEOUT_SECONDS, 10, 120);
}

function getImapIdleTimeoutSeconds(env) {
  return clampInt(env.IMAP_IDLE_TIMEOUT_SECONDS, DEFAULT_IMAP_IDLE_TIMEOUT_SECONDS, 3, 60);
}

function getImapFetchMaxResponseBytes(bodyPeekBytes, batchSize) {
  return DEFAULT_IMAP_BASE_RESPONSE_BYTES + bodyPeekBytes * Math.max(1, batchSize);
}

function getSyncFolders(env) {
  const raw = typeof env.SYNC_FOLDERS === "string" ? env.SYNC_FOLDERS : "";
  const folders = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return folders.length ? folders : DEFAULT_SYNC_FOLDERS;
}

function clampInt(value, fallback, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function minutesSince(value, now = new Date()) {
  const time = Date.parse(value || "");
  if (Number.isNaN(time)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, (now.getTime() - time) / 60000);
}

function minutesAgoIso(now, minutes) {
  return new Date(now.getTime() - minutes * 60000).toISOString();
}

function isTransientSyncError(error) {
  const message = String(error || "").toLowerCase();
  return [
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
  ].some((pattern) => message.includes(pattern));
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(runners);
  return results;
}

function normalizeGroupName(value) {
  const input = typeof value === "string" ? value.trim() : "";
  return input || "默认分组";
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600 * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(text) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function encryptText(plainText, secret) {
  if (!secret) {
    throw new HttpError(500, "TOKEN_ENCRYPTION_SECRET is not configured.");
  }

  const key = await getAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plainText),
  );

  return uint8ToBase64(iv) + "." + uint8ToBase64(new Uint8Array(encrypted));
}

async function decryptText(payload, secret) {
  if (!secret) {
    throw new HttpError(500, "TOKEN_ENCRYPTION_SECRET is not configured.");
  }

  const [ivEncoded, dataEncoded] = String(payload).split(".");
  if (!ivEncoded || !dataEncoded) {
    throw new Error("Encrypted token format is invalid.");
  }

  const key = await getAesKey(secret);
  const iv = base64ToUint8(ivEncoded);
  const data = base64ToUint8(dataEncoded);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  return new TextDecoder().decode(decrypted);
}

async function getAesKey(secret) {
  if (aesKeyCache.has(secret)) {
    return aesKeyCache.get(secret);
  }

  const material = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const keyPromise = crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  aesKeyCache.set(secret, keyPromise);
  return await keyPromise;
}

async function getSessionHash(token, env) {
  if (!env.SESSION_SECRET) {
    throw new HttpError(500, "SESSION_SECRET is not configured.");
  }
  return await sha256Hex(env.SESSION_SECRET + ":" + token);
}

function uint8ToBase64(value) {
  let binary = "";
  for (const item of value) {
    binary += String.fromCharCode(item);
  }
  return btoa(binary);
}

function base64ToUint8(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function sanitizeKeyPart(value) {
  return encodeURIComponent(String(value).replace(/\//g, "_"));
}

function safeHeaderFilename(value) {
  return String(value).replace(/"/g, "");
}

function maskToken(token) {
  if (!token || token.length < 12) {
    return "***";
  }
  return token.slice(0, 6) + "..." + token.slice(-4);
}

function summarizeUpstreamError(error) {
  const message = error && error.message ? String(error.message) : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 600);
}

function summarizeSyncFailure(error, graphError = null) {
  const imapError = summarizeUpstreamError(error);
  if (!graphError) {
    return imapError;
  }
  return ("Graph failed: " + graphError + " | IMAP failed: " + imapError).slice(0, 600);
}

function logInfo(event, detail) {
  console.log(
    JSON.stringify({
      level: "info",
      event,
      ...detail,
      at: new Date().toISOString(),
    }),
  );
}
