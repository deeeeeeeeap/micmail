# MicMail

中文 | [English](#english)

MicMail 已从原来的本地 `Express + index.html` 邮件查看器，重构为可部署在 **Cloudflare Workers** 上的归档系统。

它现在包含：

- Worker 托管的管理后台
- D1 保存会话、邮箱账号、邮件元数据和正文
- R2 保存附件二进制文件
- 基于 Microsoft Graph `refresh_token` 的邮箱同步
- Cloudflare Cron 定时归档
- 管理员密码登录 + HttpOnly Session Cookie

## 中文说明

### 项目结构

- [src/worker.js](/D:/下载/Compressed/Microsoft-Email-retrieva-main/src/worker.js)
  Worker 主入口，负责页面输出、认证、账号管理、邮件归档 API、定时同步、D1/R2 操作。
- [src/ui.js](/D:/下载/Compressed/Microsoft-Email-retrieva-main/src/ui.js)
  直接由 Worker 返回的单页管理后台。
- [schema.sql](/D:/下载/Compressed/Microsoft-Email-retrieva-main/schema.sql)
  D1 数据表结构：会话、邮箱账号、邮件、附件、同步记录。
- [wrangler.jsonc](/D:/下载/Compressed/Microsoft-Email-retrieva-main/wrangler.jsonc)
  Worker 配置、D1/R2 绑定、Cron、环境变量。

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
  - `ADMIN_PASSWORD`
  - `SESSION_SECRET`
  - `TOKEN_ENCRYPTION_SECRET`

可选：

- `MICROSOFT_TENANT_ID`
  默认值为 `common`

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

2. 创建 D1 / R2，并修改 [wrangler.jsonc](/D:/下载/Compressed/Microsoft-Email-retrieva-main/wrangler.jsonc) 中的真实绑定信息

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

### 默认 API

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/accounts`
- `POST /api/accounts`
- `PATCH /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `POST /api/accounts/:id/sync`
- `POST /api/sync/run`
- `GET /api/messages`
- `GET /api/messages/:id`
- `POST /api/messages/:id/read`
- `DELETE /api/messages/:id`
- `GET /api/messages/:id/attachments/:attachmentId`

### 保留策略

默认保留 90 天，由 `MAIL_RETENTION_DAYS` 控制。过期邮件及其 R2 附件对象会在定时任务中自动清理。

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
  Main Worker entry handling UI delivery, auth, account management, archive APIs, scheduled sync, and D1/R2 access.
- `src/ui.js`
  Single-page admin UI served directly by the Worker.
- `schema.sql`
  D1 schema for sessions, accounts, messages, attachments, and sync runs.
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
  - `ADMIN_PASSWORD`
  - `SESSION_SECRET`
  - `TOKEN_ENCRYPTION_SECRET`

Optional:

- `MICROSOFT_TENANT_ID`
  Defaults to `common`

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

2. Create D1 / R2 resources and update `wrangler.jsonc`

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

### Default API Surface

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/accounts`
- `POST /api/accounts`
- `PATCH /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `POST /api/accounts/:id/sync`
- `POST /api/sync/run`
- `GET /api/messages`
- `GET /api/messages/:id`
- `POST /api/messages/:id/read`
- `DELETE /api/messages/:id`
- `GET /api/messages/:id/attachments/:attachmentId`

### Retention

Default retention is 90 days, controlled by `MAIL_RETENTION_DAYS`. Expired messages and their R2 objects are removed during scheduled maintenance.

### Notes

- This version is an archive console, not a live two-way Outlook client
- Delete and read operations only affect the archived copy
- Only `fileAttachment` binaries are stored in R2; other attachment types are kept as metadata only
