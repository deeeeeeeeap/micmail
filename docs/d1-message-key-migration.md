# D1 消息唯一键迁移

迁移脚本已提供：`docs/migrations/0002-message-key-rebuild.sql`。本文说明背景和执行步骤。

## 背景

早期版本的 `messages.graph_message_id` 是全局唯一键。更合理的模型是同一账号内唯一：

```sql
UNIQUE(account_id, graph_message_id)
```

这样可以避免不同邮箱账号出现相同 Graph message id 时互相覆盖或阻塞。

当前状态：

- 新装环境：`schema.sql` 已直接采用新键（显式唯一索引 `idx_messages_account_message_key`），无需任何额外操作。
- 在旧版 schema 上初始化过的存量环境：需要手动执行本迁移。

## 为什么需要手动执行

D1/SQLite 不能直接删除表内联 `UNIQUE` 约束，必须重建 `messages` 表。迁移脚本会重建表、建立 `idx_messages_account_message_key`、重建计数触发器并重算 `message_counters`。这个操作会移动归档邮件数据，必须先备份远端 D1，建议在维护窗口执行。

## 执行步骤

以下命令中的 `micmail` 是数据库名，如果你的数据库名不同请替换。

1. 备份远端 D1：

   ```bash
   npx wrangler d1 export micmail --remote --output=backup-before-message-key.sql
   ```

2. 检查是否存在同账号重复（应返回 0 行）：

   ```sql
   SELECT account_id, graph_message_id, COUNT(*) AS c
   FROM messages
   GROUP BY account_id, graph_message_id
   HAVING c > 1;
   ```

3. 执行迁移：

   ```bash
   npx wrangler d1 execute micmail --remote --file=./docs/migrations/0002-message-key-rebuild.sql
   ```

4. 验证新索引已存在：

   ```sql
   SELECT name FROM sqlite_schema
   WHERE type = 'index' AND name = 'idx_messages_account_message_key';
   ```

   应返回一行。也可以用 `PRAGMA index_list('messages');` 确认列表中包含 `idx_messages_account_message_key` 且为 unique。

5. 无需重新部署：Worker 运行时会自动探测该索引是否存在，并据此选择 `ON CONFLICT` 目标（探测结果缓存 5 分钟）。也就是说：

   - 新代码部署到尚未迁移的老库上可以正常工作（继续使用全局键作为冲突目标）；
   - 迁移完成后，最多约 5 分钟内 Worker 自动切换为 `ON CONFLICT(account_id, graph_message_id)`。
