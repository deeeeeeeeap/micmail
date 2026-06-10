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
  group_name TEXT NOT NULL DEFAULT '默认分组',
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

CREATE INDEX IF NOT EXISTS idx_mail_accounts_group_name
ON mail_accounts(group_name);

CREATE INDEX IF NOT EXISTS idx_mail_accounts_status_sync
ON mail_accounts(status, last_sync_status, last_sync_at, updated_at);

-- Messages are keyed per account: UNIQUE(account_id, graph_message_id) via
-- idx_messages_account_message_key. Existing deployments created before this
-- key existed must run docs/migrations/0002-message-key-rebuild.sql.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  graph_message_id TEXT NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_account_message_key
ON messages(account_id, graph_message_id);

CREATE INDEX IF NOT EXISTS idx_messages_account_id
ON messages(account_id);

CREATE INDEX IF NOT EXISTS idx_messages_folder
ON messages(folder);

CREATE INDEX IF NOT EXISTS idx_messages_received_at
ON messages(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_received_id
ON messages(received_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_messages_account_received
ON messages(account_id, received_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_messages_folder_received
ON messages(folder, received_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_messages_account_folder_received
ON messages(account_id, folder, received_at DESC, id DESC);

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

CREATE INDEX IF NOT EXISTS idx_sync_runs_account_started
ON sync_runs(account_id, started_at DESC);

-- Pre-aggregated message counts per (account, folder). The dashboard reads
-- these instead of running COUNT(*) scans, keeping the D1 free-tier daily
-- row-read budget intact under 24/7 UI polling.
CREATE TABLE IF NOT EXISTS message_counters (
  account_id INTEGER NOT NULL,
  folder TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, folder)
);

CREATE TABLE IF NOT EXISTS login_throttle (
  ip TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_failure_at TEXT
);

CREATE TRIGGER IF NOT EXISTS trg_messages_counter_insert
AFTER INSERT ON messages
BEGIN
  INSERT INTO message_counters (account_id, folder, message_count)
  VALUES (NEW.account_id, NEW.folder, 1)
  ON CONFLICT(account_id, folder) DO UPDATE SET message_count = message_count + 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_counter_delete
AFTER DELETE ON messages
BEGIN
  UPDATE message_counters
  SET message_count = CASE WHEN message_count > 0 THEN message_count - 1 ELSE 0 END
  WHERE account_id = OLD.account_id AND folder = OLD.folder;
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_counter_move
AFTER UPDATE OF account_id, folder ON messages
WHEN OLD.account_id != NEW.account_id OR OLD.folder != NEW.folder
BEGIN
  UPDATE message_counters
  SET message_count = CASE WHEN message_count > 0 THEN message_count - 1 ELSE 0 END
  WHERE account_id = OLD.account_id AND folder = OLD.folder;
  INSERT INTO message_counters (account_id, folder, message_count)
  VALUES (NEW.account_id, NEW.folder, 1)
  ON CONFLICT(account_id, folder) DO UPDATE SET message_count = message_count + 1;
END;
