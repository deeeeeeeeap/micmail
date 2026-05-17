import { HttpError } from "./http.js";

const PERFORMANCE_INDEX_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_mail_accounts_group_name ON mail_accounts(group_name)",
  "CREATE INDEX IF NOT EXISTS idx_mail_accounts_status_sync ON mail_accounts(status, last_sync_status, last_sync_at, updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_messages_received_id ON messages(received_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS idx_messages_account_received ON messages(account_id, received_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS idx_messages_folder_received ON messages(folder, received_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS idx_messages_account_folder_received ON messages(account_id, folder, received_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS idx_sync_runs_account_started ON sync_runs(account_id, started_at DESC)",
];

let schemaPromise;

export async function ensureSchema(env) {
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

  await ensureMailAccountColumns(env);
  await ensurePerformanceIndexes(env);
}

async function ensureMailAccountColumns(env) {
  const columnsResult = await env.DB.prepare("PRAGMA table_info(mail_accounts)").all();
  const columns = new Set((columnsResult.results ?? []).map((row) => row.name));
  if (!columns.has("group_name")) {
    await env.DB.prepare(
      "ALTER TABLE mail_accounts ADD COLUMN group_name TEXT NOT NULL DEFAULT '默认分组'",
    ).run();
  }
}

async function ensurePerformanceIndexes(env) {
  for (const sql of PERFORMANCE_INDEX_SQL) {
    await env.DB.prepare(sql).run();
  }
}
