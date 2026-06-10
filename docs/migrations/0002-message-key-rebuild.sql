-- Migration: rebuild `messages` so the unique key is (account_id, graph_message_id)
-- instead of a global UNIQUE(graph_message_id).
--
-- WHY: with a global key, two accounts archiving the same Message-ID (common for
-- IMAP-derived ids and possible for shared mail) silently steal each other's rows.
--
-- BEFORE RUNNING:
--   1. Back up the remote database:
--      npx wrangler d1 export micmail --remote --output=backup-before-message-key.sql
--   2. Verify there are no same-account duplicates (should return 0 rows):
--      SELECT account_id, graph_message_id, COUNT(*) AS c
--      FROM messages GROUP BY account_id, graph_message_id HAVING c > 1;
--
-- RUN:
--   npx wrangler d1 execute micmail --remote --file=./docs/migrations/0002-message-key-rebuild.sql
--
-- The worker detects the new key automatically (within ~5 minutes for warm
-- isolates) and switches its upsert conflict target. No code redeploy is
-- required if you are already on the version that ships this file.

PRAGMA foreign_keys=off;

CREATE TABLE messages_new (
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

INSERT INTO messages_new (
  id, account_id, graph_message_id, internet_message_id, folder, subject,
  from_name, from_address, received_at, is_read, has_attachments,
  body_content_type, body_html, body_text, web_link, synced_at, expires_at,
  created_at, updated_at
)
SELECT
  id, account_id, graph_message_id, internet_message_id, folder, subject,
  from_name, from_address, received_at, is_read, has_attachments,
  body_content_type, body_html, body_text, web_link, synced_at, expires_at,
  created_at, updated_at
FROM messages;

DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

-- The new per-account unique key. The worker looks for this exact index name
-- to decide which ON CONFLICT target to use.
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

-- DROP TABLE removed the counter triggers attached to the old table; recreate them.
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

-- Rebuild counters from scratch so they match the migrated table exactly.
DELETE FROM message_counters;
INSERT INTO message_counters (account_id, folder, message_count)
SELECT account_id, folder, COUNT(*)
FROM messages
GROUP BY account_id, folder;

PRAGMA foreign_keys=on;
