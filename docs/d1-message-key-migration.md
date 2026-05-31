# D1 message key migration plan

## 背景

当前 `messages.graph_message_id` 是全局唯一键。更合理的模型是同一账号内唯一：

```sql
UNIQUE(account_id, graph_message_id)
```

这样可以避免不同邮箱账号出现相同 Graph message id 时互相覆盖或阻塞。

## 为什么不自动迁移

D1/SQLite 不能直接删除表内联 `UNIQUE` 约束，需要重建 `messages` 表。这个操作会移动归档邮件数据，必须先备份远端 D1，再在维护窗口执行。

## 建议步骤

1. 备份远端 D1：

   ```bash
   npx wrangler d1 export micmail --remote --output=backup-before-message-key.sql
   ```

2. 检查是否存在同账号重复：

   ```sql
   SELECT account_id, graph_message_id, COUNT(*) AS count
   FROM messages
   GROUP BY account_id, graph_message_id
   HAVING count > 1;
   ```

3. 在确认无重复后，按以下方向重建表：

   ```sql
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
     updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(account_id, graph_message_id)
   );

   INSERT INTO messages_new
   SELECT * FROM messages;

   DROP TABLE messages;
   ALTER TABLE messages_new RENAME TO messages;

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

   PRAGMA foreign_keys=on;
   ```

4. 迁移完成后，再把 `upsertMessage()` 的冲突目标从 `graph_message_id` 改为 `(account_id, graph_message_id)`。
