# MicMail

中文 | [English](#english)

- Worker 托管的管理后台
- D1 保存会话、邮箱账号、邮件元数据和正文
- R2 保存附件二进制文件
- 基于 Microsoft Graph `refresh_token` 的邮箱同步
- Cloudflare Cron 定时归档
- 管理员密码登录 + HttpOnly Session Cookie

## 中文说明

### 项目结构

- `src/worker.js`
  Worker 主入口：路由分发、认证、账号管理、邮件归档 API、定时同步编排、D1/R2 操作。
- `src/lib/`
  按职责拆分的模块：
  - `config.js` 全部环境变量的读取与默认值
  - `util.js` 通用工具（时间、并发、哈希、错误摘要等）
  - `http.js` 响应封装、错误处理、安全头
  - `crypto.js` `refresh_token` 加解密
  - `schema.js` D1 表结构初始化与消息键模式探测
  - `safety.js` 附件下载文件名与敏感信息脱敏
  - `sync-policy.js` 同步状态与瞬态错误判定策略
  - `throttle.js` 登录限流窗口计算
  - `graph.js` Microsoft Graph token 刷新与 API 调用
  - `imap.js` IMAP fallback 客户端
  - `imap-parse.js` IMAP 响应解析（literal 按字节切分）
  - `mime.js` 原始邮件 MIME 解析（charset 解码、嵌套 multipart）与 HTML 转纯文本
- `src/ui.js`、`src/ui/app.js`、`src/ui/styles.js`
  零构建管理后台：HTML 组装、浏览器端逻辑、样式，全部由 Worker 直接返回，无需前端构建步骤。
- `schema.sql`
  D1 数据表结构：会话、邮箱账号、邮件、附件、同步记录、消息计数表、登录限流表及计数触发器。
- `docs/migrations/`
  存量数据库需要手动执行的迁移脚本。
- `wrangler.jsonc`
  Worker 配置、D1/R2 绑定、Cron、默认环境变量。

### 主要能力

- 将邮箱账号保存到 D1，而不是浏览器本地缓存
- 对 `refresh_token` 做加密后再落库
- 支持单账号手动同步和全部账号同步
- 使用 Microsoft Graph delta 接口做增量归档
- 归档邮件 HTML、纯文本、元数据和附件
- 按账号、文件夹、关键词检索归档邮件
- 从 R2 下载归档附件
- 在归档侧标记已读/未读
- 删除归档记录而不影响 Outlook 源邮箱

### 部署前需要准备

你至少需要在 Cloudflare 上配置：

- `D1` 绑定：`DB`
- `R2` 绑定：`ATTACHMENTS`
- Secrets：
  - `ADMIN_PASSWORD` 管理后台登录密码
  - `SESSION_SECRET` 会话签名密钥，同时用于派生内部同步扇出 token
  - `TOKEN_ENCRYPTION_SECRET` `refresh_token` 加密密钥

这三个值必须用 Cloudflare Dashboard 的 `Secrets` 配置，不要写成明文 `Variables`。

其它可选变量见下方「环境变量」一节。

本地开发可先复制：

```bash
Copy-Item .dev.vars.example .dev.vars
```

然后填写本地变量。

### 快速开始

1. 安装依赖

   ```bash
   npm install
   ```

2. 创建自己的 D1 / R2 资源，并替换 `wrangler.jsonc` 中的绑定信息。仓库内的 `database_id` 和 `bucket_name` 是示例资源，不能直接使用；`database_name` 改了之后，后续命令里的数据库名也要相应调整。

3. 初始化远程 D1 表结构

   ```bash
   npx wrangler d1 execute DB --file=./schema.sql --remote
   ```

4. 设置 Secrets

   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put TOKEN_ENCRYPTION_SECRET
   ```

5. 本地调试

   ```bash
   npx wrangler d1 execute DB --file=./schema.sql --local
   npm run dev
   ```

6. 正式部署

   ```bash
   npm run deploy
   ```

### 环境变量

`wrangler.jsonc` 的 `vars` 提供大部分默认值；标注「未预置」的变量没有出现在 `wrangler.jsonc` 中，需要时自行加入 `vars` 或在 Dashboard 配置。默认值以 `src/lib/config.js` 为准：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MICROSOFT_TENANT_ID` | `common` | Microsoft OAuth tenant（未预置） |
| `MAIL_RETENTION_DAYS` | `90` | 归档保留天数，过期邮件和附件自动清理 |
| `SESSION_TTL_HOURS` | `12` | 管理后台会话有效期（小时） |
| `SYNC_PAGE_SIZE` | `20` | Graph 单页拉取的邮件数 |
| `MAX_SYNC_PAGES` | `40` | 单账号单次同步最多翻页数 |
| `SYNC_OPS_BUDGET` | `35` | 单次同步调用的操作预算（Graph 请求 + D1 写 + R2 操作的粗略计数），耗尽后保存游标、下轮续传 |
| `SYNC_CONCURRENCY` | `1` | 进程内（非扇出）同步的账号并发数 |
| `SYNC_FANOUT_CONCURRENCY` | `4` | 同步扇出时并发触发的子调用数（未预置） |
| `SYNC_FOLDERS` | `inbox,junkemail` | 参与同步的文件夹列表 |
| `AUTO_SYNC_STALE_MINUTES` | `30` | 距上次成功同步超过该分钟数的账号才会被自动同步 |
| `TRANSIENT_RETRY_MINUTES` | `10` | 瞬态失败账号的自动重试间隔（分钟） |
| `QUEUED_STALE_MINUTES` | `10` | `queued` 超过该分钟数视为卡住并被定时任务修正（未预置） |
| `RUNNING_STALE_MINUTES` | `60` | `running` 超过该分钟数视为卡住并被定时任务修正（未预置） |
| `MAX_SYNC_ACCOUNTS_PER_RUN` | `3` | 单轮 cron 处理的账号上限（启用扇出后可调大） |
| `SYNC_RUN_RETENTION_DAYS` | `14` | 同步记录保留天数 |
| `PUBLIC_BASE_URL` | 空 | Worker 公网地址（如 `https://micmail.example.workers.dev`），配置后启用同步扇出 |
| `LOGIN_MAX_FAILURES` | `8` | 登录限流：窗口内允许的最大失败次数（未预置） |
| `LOGIN_WINDOW_MINUTES` | `15` | 登录限流窗口长度（分钟）（未预置） |
| `IMAP_FETCH_BATCH_SIZE` | `1` | IMAP 单批 FETCH 的邮件数 |
| `IMAP_BODY_PEEK_BYTES` | `2097152` | IMAP 单封正文最多读取的字节数 |
| `IMAP_COMMAND_TIMEOUT_SECONDS` | `60` | IMAP 命令超时（秒） |
| `IMAP_IDLE_TIMEOUT_SECONDS` | `30` | IMAP 读空闲超时（秒） |

### 默认 API

- `GET /api/health`（无需登录，不依赖数据库，schema 损坏时也返回 ok）
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/dashboard`
- `GET /api/accounts`
- `POST /api/accounts`
- `PATCH /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `POST /api/accounts/:id/sync`
- `POST /api/sync/run`
- `POST /api/sync/auto`
- `GET /api/sync/runs`
- `GET /api/messages`
- `GET /api/messages/:id`
- `POST /api/messages/:id/read`
- `DELETE /api/messages/:id`
- `GET /api/messages/:id/attachments/:attachmentId`
- `POST /api/internal/sync/account`（内部接口：同步扇出时由 Worker 自调用，凭 `x-micmail-internal` 请求头鉴权，token 由 `SESSION_SECRET` 派生，外部无法伪造；不要当作公开 API 使用）

管理后台首页优先调用 `GET /api/dashboard` 聚合接口加载数据，其余路由用于精确操作。

### 登录安全

- `POST /api/auth/login` 按客户端 IP 限流：失败记录保存在 D1 `login_throttle` 表，默认 15 分钟窗口内失败 8 次后返回 `429`；窗口过期或登录成功后自动重置。
- 阈值可用 `LOGIN_MAX_FAILURES` / `LOGIN_WINDOW_MINUTES` 调整。
- 建议同时在 Cloudflare Dashboard 给 `/api/auth/login` 配置一条 WAF Rate Limiting 规则作为第一道防线，把暴力破解流量挡在 Worker 之外。

### 免费版（Workers Free Plan）调优

免费版主要有两条限制会影响归档系统：

1. 每次 Worker 调用约 50 个子请求，Graph 请求、D1 查询、R2 操作都计入。
2. D1 免费版每天约 500 万行读取。

针对子请求限制：

- D1 写读尽量走 `env.DB.batch()`：一批不管多少条语句只算 1 个子请求且原子执行。同步一页邮件的全部 upsert、清理、仪表盘聚合查询、定时维护 SQL 都已批量化（一次仪表盘轮询只消耗 1 个 D1 子请求）。
- `SYNC_OPS_BUDGET`（默认 35）是单次同步调用的操作预算。预算耗尽时保存增量游标、把账号置为 `pending_retry`（错误文案含 `sync budget`，前端识别为瞬态、显示等待重试），下一轮 cron 自动续传；Graph 路径每翻一页都会 checkpoint 游标，中断不丢进度。
- 配置 `PUBLIC_BASE_URL` 后，cron 和「同步全部」会把每个账号扇出为独立的 Worker 调用（走 `POST /api/internal/sync/account`），每个调用拥有独立的子请求预算；`SYNC_FANOUT_CONCURRENCY`（默认 4）控制扇出并发。未配置时 cron 回退为进程内串行同步；手动触发的「同步全部」会改用当前请求自身的 origin 扇出。

针对 D1 行读取配额：

- `message_counters` 计数表由三个 SQLite 触发器自动维护。无关键词、无日期筛选时，`/api/dashboard` 与 `/api/messages` 的 total 直接读计数表，不再做 `COUNT(*)` 全表扫描；带 `keyword` 或 `dateFrom`/`dateTo` 时仍走 `COUNT`。
- 前端自动刷新间隔为 3 分钟，页面隐藏时暂停；数据无变化的轮询不会重建页面 DOM，正在阅读的邮件正文不会被打断。

推荐配置：

- 免费版：把 `PUBLIC_BASE_URL` 设为 Worker 的公网地址（如 `https://micmail.xxx.workers.dev`），之后可以把 `MAX_SYNC_ACCOUNTS_PER_RUN` 从 3 调回 8 甚至更高。
- 付费版：可调大 `SYNC_OPS_BUDGET` 和 `SYNC_PAGE_SIZE`，减少续传轮数。

### 升级既有部署

1. 部署新代码即可：Worker 会自动在现有 D1 上创建 `login_throttle`、`message_counters` 表和计数触发器，无需手动建表。
2. 推荐执行消息键迁移，把消息唯一键从全局 `graph_message_id` 改为 `(account_id, graph_message_id)`，修复跨账号覆盖问题。先备份：

   ```bash
   npx wrangler d1 export micmail --remote --output=backup-before-message-key.sql
   ```

   再执行迁移：

   ```bash
   npx wrangler d1 execute micmail --remote --file=./docs/migrations/0002-message-key-rebuild.sql
   ```

   迁移后 Worker 会在约 5 分钟内自动探测到新索引并切换冲突目标，无需重新部署。详细步骤见 `docs/d1-message-key-migration.md`；数据库名不是 `micmail` 时请替换。
3. 注意默认参数变化：`SYNC_PAGE_SIZE` 由 50 降为 20，`MAX_SYNC_ACCOUNTS_PER_RUN` 由 8 降为 3。配置 `PUBLIC_BASE_URL` 启用扇出后可以调回原值或更高。

### 保留策略

默认保留 90 天，由 `MAIL_RETENTION_DAYS` 控制。过期邮件及其 R2 附件对象会在定时任务中自动清理。

### 搜索说明

默认关键词搜索只匹配主题和发件人字段，避免在邮件正文上做高成本 LIKE 扫描。需要正文搜索时，可在 `/api/messages` 或 `/api/dashboard` 查询参数中加 `searchBody=1`。

### 说明

- 当前版本定位是“归档后台”，不是 Outlook 的实时双向客户端
- 删除和已读接口只作用于归档副本，不回写源邮箱
- 目前只有 `fileAttachment` 会归档真实二进制文件，其它附件类型只保存元数据

---

## English

MicMail has been migrated from a local `Express + index.html` mail viewer into a **Cloudflare Workers** mail archive system.

It now includes:

- A Worker-hosted admin UI
- D1 for sessions, mailbox accounts, message metadata, and archived bodies
- R2 for attachment binaries
- Microsoft Graph sync via `refresh_token`
- Scheduled archive sync with Cloudflare Cron
- Admin password login with HttpOnly session cookies

### Project Layout

- `src/worker.js`
  Main Worker entry: routing, auth, account management, archive APIs, scheduled sync orchestration, and D1/R2 access.
- `src/lib/`
  Modules split by responsibility:
  - `config.js` all environment variable readers and defaults
  - `util.js` shared helpers (time, concurrency, hashing, error summaries)
  - `http.js` response helpers, error handling, security headers
  - `crypto.js` `refresh_token` encryption/decryption
  - `schema.js` D1 schema bootstrap and message-key mode detection
  - `safety.js` attachment download filenames and sensitive-value redaction
  - `sync-policy.js` sync state and transient-error policies
  - `throttle.js` login throttle window math
  - `graph.js` Microsoft Graph token refresh and API calls
  - `imap.js` IMAP fallback client
  - `imap-parse.js` IMAP response parsing (byte-accurate literal slicing)
  - `mime.js` raw email MIME parsing (charset decoding, nested multipart) and HTML-to-text
- `src/ui.js`, `src/ui/app.js`, `src/ui/styles.js`
  Zero-build admin UI: HTML assembly, browser app logic, and styles, all served directly by the Worker with no frontend build step.
- `schema.sql`
  D1 schema: sessions, accounts, messages, attachments, sync runs, message counters, login throttle, and counter triggers.
- `docs/migrations/`
  Migration scripts that existing databases must run manually.
- `wrangler.jsonc`
  Worker configuration, bindings, cron trigger, and default vars.

### Features

- Save mailbox accounts in D1 instead of browser local storage
- Encrypt `refresh_token` before persistence
- Trigger sync for one account or all accounts
- Use Microsoft Graph delta endpoints for incremental archive sync
- Archive message HTML, text, metadata, and attachments
- Search archived mail by account, folder, and keyword
- Download archived attachments from R2
- Mark archived messages as read/unread locally
- Delete archive records without touching the Outlook source mailbox

### Required Cloudflare Configuration

- D1 binding: `DB`
- R2 binding: `ATTACHMENTS`
- Secrets:
  - `ADMIN_PASSWORD` admin login password
  - `SESSION_SECRET` session signing key, also used to derive the internal sync fan-out token
  - `TOKEN_ENCRYPTION_SECRET` `refresh_token` encryption key

Use Cloudflare Dashboard `Secrets`, not plain text `Variables`, for these three values.

See the "Environment Variables" section below for the optional vars.

For local development:

```bash
Copy-Item .dev.vars.example .dev.vars
```

Then fill the values.

### Quick Start

1. Install dependencies

   ```bash
   npm install
   ```

2. Create your own D1 / R2 resources and update the bindings in `wrangler.jsonc`. The `database_id` and `bucket_name` in this repository are sample resources and will not work as-is; if you change `database_name`, adjust the database name in later commands too.

3. Initialize the remote D1 schema

   ```bash
   npx wrangler d1 execute DB --file=./schema.sql --remote
   ```

4. Set Worker secrets

   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put TOKEN_ENCRYPTION_SECRET
   ```

5. Run locally

   ```bash
   npx wrangler d1 execute DB --file=./schema.sql --local
   npm run dev
   ```

6. Deploy

   ```bash
   npm run deploy
   ```

### Environment Variables

`wrangler.jsonc` ships defaults for most vars; entries marked "not preset" are absent from `wrangler.jsonc` and can be added to `vars` or set in the Dashboard when needed. Defaults below follow `src/lib/config.js`:

| Variable | Default | Description |
| --- | --- | --- |
| `MICROSOFT_TENANT_ID` | `common` | Microsoft OAuth tenant (not preset) |
| `MAIL_RETENTION_DAYS` | `90` | Archive retention in days; expired mail and attachments are cleaned up automatically |
| `SESSION_TTL_HOURS` | `12` | Admin session lifetime in hours |
| `SYNC_PAGE_SIZE` | `20` | Messages fetched per Graph page |
| `MAX_SYNC_PAGES` | `40` | Max pages per account per sync run |
| `SYNC_OPS_BUDGET` | `35` | Per-invocation sync operation budget (rough count of Graph requests + D1 writes + R2 ops); when exhausted the cursor is saved and sync resumes next run |
| `SYNC_CONCURRENCY` | `1` | Account concurrency for in-process (non-fan-out) sync |
| `SYNC_FANOUT_CONCURRENCY` | `4` | Concurrent child invocations during sync fan-out (not preset) |
| `SYNC_FOLDERS` | `inbox,junkemail` | Folders included in sync |
| `AUTO_SYNC_STALE_MINUTES` | `30` | Accounts are auto-synced only if the last successful sync is older than this |
| `TRANSIENT_RETRY_MINUTES` | `10` | Retry interval for transiently failed accounts (minutes) |
| `QUEUED_STALE_MINUTES` | `10` | `queued` runs older than this are treated as stuck and repaired by maintenance (not preset) |
| `RUNNING_STALE_MINUTES` | `60` | `running` runs older than this are treated as stuck and repaired by maintenance (not preset) |
| `MAX_SYNC_ACCOUNTS_PER_RUN` | `3` | Max accounts handled per cron run (raise it once fan-out is enabled) |
| `SYNC_RUN_RETENTION_DAYS` | `14` | Sync run history retention in days |
| `PUBLIC_BASE_URL` | empty | Public origin of this Worker (e.g. `https://micmail.example.workers.dev`); setting it enables sync fan-out |
| `LOGIN_MAX_FAILURES` | `8` | Login throttle: max failures allowed per window (not preset) |
| `LOGIN_WINDOW_MINUTES` | `15` | Login throttle window length in minutes (not preset) |
| `IMAP_FETCH_BATCH_SIZE` | `1` | Messages per IMAP FETCH batch |
| `IMAP_BODY_PEEK_BYTES` | `2097152` | Max bytes read per IMAP message body |
| `IMAP_COMMAND_TIMEOUT_SECONDS` | `60` | IMAP command timeout in seconds |
| `IMAP_IDLE_TIMEOUT_SECONDS` | `30` | IMAP read idle timeout in seconds |

### Default API Surface

- `GET /api/health` (no login required, no database dependency; returns ok even with a broken schema)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/dashboard`
- `GET /api/accounts`
- `POST /api/accounts`
- `PATCH /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `POST /api/accounts/:id/sync`
- `POST /api/sync/run`
- `POST /api/sync/auto`
- `GET /api/sync/runs`
- `GET /api/messages`
- `GET /api/messages/:id`
- `POST /api/messages/:id/read`
- `DELETE /api/messages/:id`
- `GET /api/messages/:id/attachments/:attachmentId`
- `POST /api/internal/sync/account` (internal: called by the Worker itself during sync fan-out, authenticated via the `x-micmail-internal` header whose token is derived from `SESSION_SECRET` and cannot be forged externally; do not use it as a public API)

The admin UI prefers `GET /api/dashboard` for initial data loading and uses the other routes for targeted actions.

### Login Security

- `POST /api/auth/login` is throttled per client IP: failures are recorded in the D1 `login_throttle` table, and by default 8 failures within a 15-minute window return `429`; the record resets when the window expires or a login succeeds.
- Tune the thresholds with `LOGIN_MAX_FAILURES` / `LOGIN_WINDOW_MINUTES`.
- Additionally, configure a WAF Rate Limiting rule for `/api/auth/login` in the Cloudflare Dashboard as the first line of defense, so brute-force traffic is blocked before it reaches the Worker.

### Free Plan Tuning (Workers Free Plan)

Two free-plan limits matter most for an archive system:

1. Roughly 50 subrequests per Worker invocation; Graph requests, D1 queries, and R2 operations all count.
2. About 5 million D1 row reads per day on the free tier.

Against the subrequest limit:

- D1 reads and writes go through `env.DB.batch()` wherever possible: one batch counts as a single subrequest and runs atomically, no matter how many statements it contains. Per-page message upserts, cleanups, the dashboard aggregate query, and scheduled maintenance SQL are all batched (one dashboard poll costs a single D1 subrequest).
- `SYNC_OPS_BUDGET` (default 35) is the per-invocation sync operation budget. When it runs out, the delta cursor is saved and the account is set to `pending_retry` (the error text contains `sync budget`, which the UI treats as transient and shows as waiting to retry); the next cron run resumes automatically. The Graph path checkpoints the cursor after every page, so interruptions lose no progress.
- With `PUBLIC_BASE_URL` configured, cron and "sync all" fan each account out into its own Worker invocation (via `POST /api/internal/sync/account`), each with a fresh subrequest budget; `SYNC_FANOUT_CONCURRENCY` (default 4) controls the fan-out concurrency. Without it, cron falls back to in-process serial sync, while a manually triggered "sync all" fans out using the origin of the incoming request.

Against the D1 row-read budget:

- The `message_counters` table is maintained automatically by three SQLite triggers. Without a keyword or date filter, `/api/dashboard` and `/api/messages` read totals from the counter table instead of running `COUNT(*)` table scans; queries with `keyword` or `dateFrom`/`dateTo` still use `COUNT`.
- The UI auto-refresh interval is 3 minutes and pauses while the page is hidden; polls that bring no data changes skip the DOM rebuild entirely, so an open message body is never interrupted.

Recommended configuration:

- Free plan: set `PUBLIC_BASE_URL` to the public origin of your Worker (e.g. `https://micmail.xxx.workers.dev`), then raise `MAX_SYNC_ACCOUNTS_PER_RUN` from 3 back to 8 or higher.
- Paid plan: raise `SYNC_OPS_BUDGET` and `SYNC_PAGE_SIZE` to reduce the number of resume rounds.

### Upgrading an Existing Deployment

1. Deploying the new code is enough for the base upgrade: the Worker automatically creates the `login_throttle` and `message_counters` tables plus the counter triggers on an existing D1 database.
2. Recommended: run the message key migration, which changes the unique key from a global `graph_message_id` to `(account_id, graph_message_id)` and fixes cross-account overwrites. Back up first:

   ```bash
   npx wrangler d1 export micmail --remote --output=backup-before-message-key.sql
   ```

   Then run the migration:

   ```bash
   npx wrangler d1 execute micmail --remote --file=./docs/migrations/0002-message-key-rebuild.sql
   ```

   After the migration the Worker detects the new index within about 5 minutes and switches its conflict target automatically; no redeploy is needed. See `docs/d1-message-key-migration.md` for details, and replace `micmail` if your database name differs.
3. Note the default changes: `SYNC_PAGE_SIZE` dropped from 50 to 20 and `MAX_SYNC_ACCOUNTS_PER_RUN` from 8 to 3. Once fan-out is enabled via `PUBLIC_BASE_URL`, you can raise them back or higher.

### Retention

Default retention is 90 days, controlled by `MAIL_RETENTION_DAYS`. Expired messages and their R2 objects are removed during scheduled maintenance.

### Search behavior

Keyword search matches subject and sender fields by default to avoid expensive D1 `LIKE` scans over archived bodies. Add `searchBody=1` to `/api/messages` or `/api/dashboard` when body search is explicitly needed.

### Notes

- This version is an archive console, not a live two-way Outlook client
- Delete and read operations only affect the archived copy
- Only `fileAttachment` binaries are stored in R2; other attachment types are kept as metadata only
