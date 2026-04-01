export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS mail_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_sync_at TEXT,
  last_sync_status TEXT NOT NULL DEFAULT 'idle',
  last_sync_error TEXT,
  delta_links_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mail_accounts_status
ON mail_accounts(status);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  graph_message_id TEXT NOT NULL UNIQUE,
  internet_message_id TEXT,
  folder TEXT NOT NULL,
  subject TEXT,
  from_name TEXT,
  from_address TEXT,
  received_at TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  body_content_type TEXT,
  body_html TEXT,
  body_text TEXT,
  web_link TEXT,
  synced_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_account_id
ON messages(account_id);

CREATE INDEX IF NOT EXISTS idx_messages_folder
ON messages(folder);

CREATE INDEX IF NOT EXISTS idx_messages_received_at
ON messages(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_expires_at
ON messages(expires_at);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  graph_attachment_id TEXT NOT NULL,
  name TEXT,
  content_type TEXT,
  kind TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  storage_status TEXT NOT NULL DEFAULT 'stored',
  r2_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, graph_attachment_id)
);

CREATE INDEX IF NOT EXISTS idx_attachments_message_id
ON attachments(message_id);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  status TEXT NOT NULL,
  folder_scope TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  error_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_account_id
ON sync_runs(account_id);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at
ON sync_runs(started_at DESC);
`;
