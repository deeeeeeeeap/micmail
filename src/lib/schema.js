import { HttpError } from "./http.js";

const COMPOSITE_MESSAGE_KEY_INDEX = "idx_messages_account_message_key";
const MESSAGE_KEY_MODE_TTL_MS = 5 * 60 * 1000;

const PERFORMANCE_INDEX_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_mail_accounts_group_name ON mail_accounts(group_name)",
  "CREATE INDEX IF NOT EXISTS idx_mail_accounts_status_sync ON mail_accounts(status, last_sync_status, last_sync_at, updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_messages_received_id ON messages(received_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS idx_messages_account_received ON messages(account_id, received_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS idx_messages_folder_received ON messages(folder, received_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS idx_messages_account_folder_received ON messages(account_id, folder, received_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS idx_sync_runs_account_started ON sync_runs(account_id, started_at DESC)",
];

const AUXILIARY_TABLE_SQL = [
  `CREATE TABLE IF NOT EXISTS message_counters (
    account_id INTEGER NOT NULL,
    folder TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, folder)
  )`,
  `CREATE TABLE IF NOT EXISTS login_throttle (
    ip TEXT PRIMARY KEY,
    window_started_at TEXT NOT NULL,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_failure_at TEXT
  )`,
];

const COUNTER_TRIGGER_SQL = [
  `CREATE TRIGGER IF NOT EXISTS trg_messages_counter_insert
   AFTER INSERT ON messages
   BEGIN
     INSERT INTO message_counters (account_id, folder, message_count)
     VALUES (NEW.account_id, NEW.folder, 1)
     ON CONFLICT(account_id, folder) DO UPDATE SET message_count = message_count + 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_messages_counter_delete
   AFTER DELETE ON messages
   BEGIN
     UPDATE message_counters
     SET message_count = CASE WHEN message_count > 0 THEN message_count - 1 ELSE 0 END
     WHERE account_id = OLD.account_id AND folder = OLD.folder;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_messages_counter_move
   AFTER UPDATE OF account_id, folder ON messages
   WHEN OLD.account_id != NEW.account_id OR OLD.folder != NEW.folder
   BEGIN
     UPDATE message_counters
     SET message_count = CASE WHEN message_count > 0 THEN message_count - 1 ELSE 0 END
     WHERE account_id = OLD.account_id AND folder = OLD.folder;
     INSERT INTO message_counters (account_id, folder, message_count)
     VALUES (NEW.account_id, NEW.folder, 1)
     ON CONFLICT(account_id, folder) DO UPDATE SET message_count = message_count + 1;
   END`,
];

let schemaPromise;
let messageKeyModeCache = { mode: null, checkedAt: 0 };

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

/**
 * Returns "composite" when messages are keyed by UNIQUE(account_id, graph_message_id)
 * (after the documented rebuild migration), otherwise "legacy" for the historical
 * global UNIQUE(graph_message_id) schema. Cached with a short TTL so deployments
 * migrated while isolates are warm converge without a restart.
 */
export async function getMessageKeyMode(env) {
  const now = Date.now();
  if (messageKeyModeCache.mode && now - messageKeyModeCache.checkedAt < MESSAGE_KEY_MODE_TTL_MS) {
    return messageKeyModeCache.mode;
  }

  const row = await env.DB.prepare(
    "SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?",
  )
    .bind(COMPOSITE_MESSAGE_KEY_INDEX)
    .first();

  messageKeyModeCache = { mode: row ? "composite" : "legacy", checkedAt: now };
  return messageKeyModeCache.mode;
}

export function invalidateMessageKeyMode() {
  messageKeyModeCache = { mode: null, checkedAt: 0 };
}

// Cold-start bootstrap in <=4 D1 round trips on the typical path: table check,
// column check, then one batch with every idempotent DDL plus the counter probe.
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
  await ensureSchemaObjects(env);
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

async function ensureSchemaObjects(env) {
  // One batch (1 subrequest, atomic) for all idempotent DDL; the trailing
  // SELECT probes message_counters so seeding stays gated on an empty table.
  const statements = [
    ...PERFORMANCE_INDEX_SQL,
    ...AUXILIARY_TABLE_SQL,
    ...COUNTER_TRIGGER_SQL,
    "SELECT 1 AS present FROM message_counters LIMIT 1",
  ].map((sql) => env.DB.prepare(sql));

  const results = await env.DB.batch(statements);
  const probe = results[results.length - 1];
  if (!(probe.results ?? []).length) {
    await env.DB.prepare(
      `INSERT INTO message_counters (account_id, folder, message_count)
       SELECT account_id, folder, COUNT(*)
       FROM messages
       GROUP BY account_id, folder
       ON CONFLICT(account_id, folder) DO NOTHING`,
    ).run();
  }
}
