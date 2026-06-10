import { HttpError } from "./http.js";
import { addDays, clampInt } from "./util.js";
import { htmlToText } from "./mime.js";

const MESSAGE_UPSERT_COLUMNS = `(
      account_id, graph_message_id, internet_message_id, folder, subject, from_name, from_address,
      received_at, is_read, has_attachments, body_content_type, body_html, body_text,
      web_link, synced_at, expires_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const MESSAGE_UPSERT_UPDATES = `
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
      updated_at = excluded.updated_at
    RETURNING id`;

export const LEGACY_MESSAGE_UPSERT_SQL = `INSERT INTO messages ${MESSAGE_UPSERT_COLUMNS}
    ON CONFLICT(graph_message_id) DO UPDATE SET
      account_id = excluded.account_id,${MESSAGE_UPSERT_UPDATES}`;

export const COMPOSITE_MESSAGE_UPSERT_SQL = `INSERT INTO messages ${MESSAGE_UPSERT_COLUMNS}
    ON CONFLICT(account_id, graph_message_id) DO UPDATE SET${MESSAGE_UPSERT_UPDATES}`;

export function messageUpsertSqlForMode(mode) {
  return mode === "composite" ? COMPOSITE_MESSAGE_UPSERT_SQL : LEGACY_MESSAGE_UPSERT_SQL;
}

export function buildMessageUpsertParams(accountId, folder, item, options) {
  const now = options?.now instanceof Date ? options.now : new Date();
  const retentionDays = Number(options?.retentionDays || 0);
  const receivedAt = item.receivedDateTime || now.toISOString();
  const bodyHtml = item.body?.content || "";
  const bodyContentType = item.body?.contentType || null;
  const syncedAt = now.toISOString();
  const expiresAt = addDays(new Date(receivedAt), retentionDays).toISOString();
  const fromAddress = item.from?.emailAddress?.address || "";
  const fromName = item.from?.emailAddress?.name || "";

  return [
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
  ];
}

export function extractBatchReturnedIds(results) {
  return (results ?? []).map((result) => {
    const id = result?.results?.[0]?.id;
    return id == null ? null : id;
  });
}

export function buildInPlaceholders(count) {
  return Array.from({ length: count }, () => "?").join(", ");
}

export function buildMessagesQueryPlan(url) {
  const page = clampInt(url.searchParams.get("page"), 1, 1, 100000);
  const pageSize = clampInt(url.searchParams.get("pageSize"), 25, 1, 100);
  const offset = (page - 1) * pageSize;
  const filters = [];
  const params = [];

  let accountIdFilter = null;
  const accountId = url.searchParams.get("accountId");
  if (accountId) {
    const parsedAccountId = Number(accountId);
    if (!Number.isInteger(parsedAccountId) || parsedAccountId < 1) {
      throw new HttpError(400, "Invalid accountId.");
    }
    accountIdFilter = parsedAccountId;
    filters.push("m.account_id = ?");
    params.push(parsedAccountId);
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

  const keyword = (url.searchParams.get("keyword") || "").trim();
  if (keyword) {
    const like = "%" + keyword + "%";
    const searchBody = url.searchParams.get("searchBody") === "1";
    filters.push(searchBody
      ? "(m.subject LIKE ? OR m.from_name LIKE ? OR m.from_address LIKE ? OR m.body_text LIKE ?)"
      : "(m.subject LIKE ? OR m.from_name LIKE ? OR m.from_address LIKE ?)");
    params.push(like, like, like);
    if (searchBody) {
      params.push(like);
    }
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

  // The default dashboard view (no keyword/date filters) reads pre-aggregated
  // counters instead of COUNT(*) so the 24/7 polling UI does not burn the
  // D1 free-tier daily row-read budget scanning the messages table.
  const canUseCounters = !keyword && !dateFrom && !dateTo;
  let total;
  if (canUseCounters) {
    const counterFilters = [];
    const counterParams = [];
    if (accountIdFilter) {
      counterFilters.push("c.account_id = ?");
      counterParams.push(accountIdFilter);
    }
    if (folder) {
      counterFilters.push("c.folder = ?");
      counterParams.push(folder);
    }
    if (groupName) {
      counterFilters.push("a.group_name = ?");
      counterParams.push(groupName);
    }
    const counterWhere = counterFilters.length ? "WHERE " + counterFilters.join(" AND ") : "";
    total = {
      sql: `SELECT SUM(c.message_count) AS total
       FROM message_counters c
       JOIN mail_accounts a ON a.id = c.account_id
       ${counterWhere}`,
      params: counterParams,
    };
  } else {
    total = {
      sql: `SELECT COUNT(*) AS total
       FROM messages m
       JOIN mail_accounts a ON a.id = m.account_id
       ${whereClause}`,
      params: [...params],
    };
  }

  const items = {
    sql: `SELECT
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
    params: [...params, pageSize, offset],
  };

  return { page, pageSize, total, items };
}

export function buildMessagesPayload(plan, totalResult, itemsResult) {
  return {
    page: plan.page,
    pageSize: plan.pageSize,
    total: Number(totalResult?.results?.[0]?.total || 0),
    items: itemsResult?.results ?? [],
  };
}
