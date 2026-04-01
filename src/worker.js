import { APP_HTML } from "./ui.js";
const SESSION_COOKIE = "mail_admin_session";
const DEFAULT_SESSION_TTL_HOURS = 12;
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_SYNC_PAGE_SIZE = 50;
const DEFAULT_MAX_SYNC_PAGES = 40;
const DEFAULT_SYNC_FOLDERS = ["inbox", "junkemail"];
const encoder = new TextEncoder();

let schemaPromise;
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

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/" || path === "/index.html") {
    return new Response(APP_HTML, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store",
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

  if (path === "/api/accounts" && request.method === "POST") {
    return await createAccountRoute(request, env);
  }

  if (path === "/api/sync/run" && request.method === "POST") {
    return await syncAllAccountsRoute(env);
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
    return await syncSingleAccountRoute(env, Number(accountSyncMatch[1]));
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
  const result = await env.DB.prepare(
    `SELECT id, email, client_id, status, last_sync_at, last_sync_status, last_sync_error,
            created_at, updated_at
     FROM mail_accounts
     ORDER BY updated_at DESC, id DESC`,
  ).all();

  return jsonResponse({ success: true, data: result.results ?? [] });
}

async function createAccountRoute(request, env) {
  const body = await readJson(request);
  const clientId = requireString(body.clientId, "clientId");
  const refreshToken = requireString(body.refreshToken, "refreshToken");
  const emailInput = typeof body.email === "string" ? body.email.trim() : "";

  let accessToken;
  let profile;
  try {
    const verified = await verifyMicrosoftAccount(env, clientId, refreshToken);
    accessToken = verified.accessToken;
    profile = verified.profile;
  } catch (error) {
    throw new HttpError(400, "Microsoft account validation failed: " + summarizeUpstreamError(error));
  }
  const email = emailInput || profile.mail || profile.userPrincipalName;

  if (!email) {
    throw new HttpError(400, "Unable to determine account email.");
  }

  const encryptedRefreshToken = await encryptText(refreshToken, env.TOKEN_ENCRYPTION_SECRET);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO mail_accounts (
      email, client_id, refresh_token_encrypted, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      client_id = excluded.client_id,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      status = 'active',
      last_sync_error = NULL,
      updated_at = excluded.updated_at`,
  )
    .bind(email, clientId, encryptedRefreshToken, now, now)
    .run();

  const account = await getAccountByEmail(env, email);

  return jsonResponse({
    success: true,
    data: {
      account,
      validatedAs: {
        displayName: profile.displayName ?? null,
        userPrincipalName: profile.userPrincipalName ?? null,
      },
      tokenPreview: maskToken(accessToken),
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
  let clientId = existing.client_id;
  let encryptedRefreshToken = existing.refresh_token_encrypted;

  if (body.clientId || body.refreshToken) {
    clientId = requireString(body.clientId ?? existing.client_id, "clientId");
    const refreshToken = requireString(body.refreshToken, "refreshToken");
    try {
      await verifyMicrosoftAccount(env, clientId, refreshToken);
    } catch (error) {
      throw new HttpError(400, "Microsoft account validation failed: " + summarizeUpstreamError(error));
    }
    encryptedRefreshToken = await encryptText(refreshToken, env.TOKEN_ENCRYPTION_SECRET);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE mail_accounts
     SET email = ?, client_id = ?, refresh_token_encrypted = ?, status = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(email, clientId, encryptedRefreshToken, status, now, accountId)
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

async function syncSingleAccountRoute(env, accountId) {
  const account = await getAccountById(env, accountId, true);
  if (!account) {
    throw new HttpError(404, "Account not found.");
  }

  const result = await syncAccount(env, account);
  return jsonResponse({ success: true, data: result });
}

async function syncAllAccountsRoute(env) {
  const results = await syncAllAccounts(env);
  return jsonResponse({ success: true, data: results });
}

async function listMessagesRoute(url, env) {
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
     ORDER BY datetime(m.received_at) DESC, m.id DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...params, pageSize, offset)
    .all();

  return jsonResponse({
    success: true,
    data: {
      page,
      pageSize,
      total: totalRow?.total ?? 0,
      items: rows.results ?? [],
    },
  });
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
  await syncAllAccounts(env);
  logInfo("scheduled_complete", { cron });
}

async function syncAllAccounts(env) {
  const accounts = await env.DB.prepare(
    `SELECT *
     FROM mail_accounts
     WHERE status = 'active'
     ORDER BY id ASC`,
  ).all();

  const results = [];
  for (const account of accounts.results ?? []) {
    results.push(await syncAccount(env, account));
  }
  return results;
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

  let messageCount = 0;
  let attachmentCount = 0;
  const cursorMap = parseJsonObject(account.delta_links_json);

  try {
    const refreshToken = await decryptText(
      account.refresh_token_encrypted,
      env.TOKEN_ENCRYPTION_SECRET,
    );
    const accessToken = await refreshAccessToken(env, account.client_id, refreshToken);

    for (const folder of folderList) {
      const syncResult = await syncFolderMessages(env, account, accessToken, folder, cursorMap);
      cursorMap[folder] = syncResult.cursor;
      messageCount += syncResult.messageCount;
      attachmentCount += syncResult.attachmentCount;
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
      messageCount,
      attachmentCount,
    });

    return {
      accountId: account.id,
      email: account.email,
      status: "success",
      messageCount,
      attachmentCount,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE mail_accounts
       SET last_sync_at = ?, last_sync_status = 'error', last_sync_error = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(finishedAt, error.message, finishedAt, account.id)
      .run();

    await env.DB.prepare(
      `UPDATE sync_runs
       SET status = 'error', finished_at = ?, message_count = ?, attachment_count = ?, error_text = ?
       WHERE id = ?`,
    )
      .bind(finishedAt, messageCount, attachmentCount, error.message, syncRun.meta.last_row_id)
      .run();

    logInfo("sync_error", {
      accountId: account.id,
      email: account.email,
      error: error.message,
    });

    return {
      accountId: account.id,
      email: account.email,
      status: "error",
      messageCount,
      attachmentCount,
      error: error.message,
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

async function verifyMicrosoftAccount(env, clientId, refreshToken) {
  const accessToken = await refreshAccessToken(env, clientId, refreshToken);
  const profile = await graphFetchJson(
    "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName",
    accessToken,
  );
  return { accessToken, profile };
}

async function refreshAccessToken(env, clientId, refreshToken) {
  const tenantId = env.MICROSOFT_TENANT_ID || "common";
  const url =
    "https://login.microsoftonline.com/" +
    encodeURIComponent(tenantId) +
    "/oauth2/v2.0/token";
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("scope", "https://graph.microsoft.com/.default offline_access");

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

function requireString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "Missing required field: " + fieldName);
  }
  return value.trim();
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON request body.");
  }
}

async function ensureSchema(env) {
  if (!env.DB) {
    throw new HttpError(500, "D1 binding `DB` is not configured.");
  }

  if (!schemaPromise) {
    schemaPromise = verifySchema(env).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return await schemaPromise;
}

async function verifySchema(env) {
  const result = await env.DB.prepare(
    `SELECT name
     FROM sqlite_schema
     WHERE type = 'table'
       AND name IN ('admin_sessions', 'mail_accounts', 'messages', 'attachments', 'sync_runs')
     ORDER BY name`,
  ).all();

  const tableNames = new Set((result.results ?? []).map((row) => row.name));
  const requiredTables = [
    "admin_sessions",
    "mail_accounts",
    "messages",
    "attachments",
    "sync_runs",
  ];
  const missing = requiredTables.filter((name) => !tableNames.has(name));

  if (missing.length) {
    throw new HttpError(
      500,
      "Database schema is incomplete. Missing tables: " +
        missing.join(", ") +
        ". Execute schema.sql in D1.",
    );
  }
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function handleError(error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : "Internal server error.";
  if (!(error instanceof HttpError)) {
    console.error(error);
  } else {
    console.error("http_error", status, message);
  }
  return jsonResponse({ success: false, error: message }, status);
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  };
}

async function getAccountById(env, accountId, includeSecrets = false) {
  const columns = includeSecrets
    ? "*"
    : "id, email, client_id, status, last_sync_at, last_sync_status, last_sync_error, created_at, updated_at";
  return await env.DB.prepare(
    "SELECT " + columns + " FROM mail_accounts WHERE id = ?",
  )
    .bind(accountId)
    .first();
}

async function getAccountByEmail(env, email) {
  return await env.DB.prepare(
    `SELECT id, email, client_id, status, last_sync_at, last_sync_status, last_sync_error,
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
