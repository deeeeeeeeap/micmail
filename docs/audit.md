# MicMail 审计与重构记录

## 本轮已纳入改造

- `POST /api/auth/login` 按客户端 IP 限流：失败记录写入 D1 `login_throttle` 表，默认 15 分钟窗口内失败 8 次后返回 429，可用 `LOGIN_MAX_FAILURES` / `LOGIN_WINDOW_MINUTES` 调整；建议另在 Cloudflare Dashboard 配 WAF Rate Limiting 作为第一道防线。
- 新增 `message_counters(account_id, folder, message_count)` 预聚合计数表，由 `trg_messages_counter_insert/delete/move` 三个 SQLite 触发器自动维护；无关键词、无日期筛选时 `/api/dashboard` 与 `/api/messages` 的 total 改读计数表，不再 `COUNT(*)` 全表扫描，保护 D1 免费版每日行读取配额；带 `keyword` 或 `dateFrom`/`dateTo` 时仍走 `COUNT`。
- 前端自动刷新间隔从 30 秒改为 3 分钟，页面隐藏时暂停。
- 新增内部路由 `POST /api/internal/sync/account`（`x-micmail-internal` 头鉴权，token 由 `SESSION_SECRET` 派生，仅 Worker 自调用）。配置 `PUBLIC_BASE_URL` 后，cron 和「同步全部」把每个账号扇出为独立 invocation，各自拥有独立的 50 子请求预算；`SYNC_FANOUT_CONCURRENCY` 控制扇出并发（默认 4）。未配置时 cron 回退进程内串行，手动「同步全部」改用请求自身 origin 扇出。
- 新增 `SYNC_OPS_BUDGET`（默认 35）同步操作预算守卫（Graph 请求 + D1 写 + R2 操作的粗略计数）：预算耗尽时保存游标、账号置为 `pending_retry`（错误文案含 `sync budget`，前端识别为瞬态、显示等待重试），下轮 cron 自动续传；Graph 路径每翻一页 checkpoint 游标。
- 消息唯一键改为 `UNIQUE(account_id, graph_message_id)`（显式索引 `idx_messages_account_message_key`），修复跨账号相同 Graph message id 互相覆盖。新装环境由 `schema.sql` 直接建立；老环境需手动执行 `docs/migrations/0002-message-key-rebuild.sql`（先备份）。Worker 运行时自动探测索引存在与否并选择对应 `ON CONFLICT` 目标（探测结果缓存 5 分钟），新代码部署到未迁移老库也能正常工作，迁移后无需重新部署。
- IMAP 解析修复：literal `{N}` 按字节切分（修复非 ASCII 邮件错位）；正文按 Content-Type charset 解码（支持 gb2312 等）；嵌套 multipart 递归提取正文。
- 免费版默认参数调整：`SYNC_PAGE_SIZE` 50→20、`MAX_SYNC_ACCOUNTS_PER_RUN` 8→3；新增 `SYNC_OPS_BUDGET=35`、`PUBLIC_BASE_URL=""`（配置扇出后账号数可调回 8 甚至更高）。
- `src/worker.js` 拆分出 `src/lib/{config,util,sync-policy,throttle,graph,imap,imap-parse,mime}.js`；删除遗留的 `strip.py`。
- D1/R2 调用合并（`src/lib/db-batch.js`）：利用 `env.DB.batch()`「整批 1 个子请求 + 原子事务」的特性，把同步页内邮件 upsert、无附件邮件的附件清理、过期归档清理、删账号/删邮件、账号认领、仪表盘聚合查询、定时维护 SQL、冷启动 DDL 全部批量化；R2 删除并发执行（并发 6）。典型场景子请求数：同步一页 20 封无附件邮件 62→5、清理 100 封过期邮件 401+→2+附件数、一次仪表盘轮询 4→1、冷启动 ensureSchema ≈15→3。批量 upsert 保留 legacy/composite 双模式探测与整批重试。
- 前端渲染指纹：静默轮询（3 分钟自动刷新、visibilitychange 补偿）在数据无变化时跳过整页 innerHTML 重建与事件重绑，正文 iframe 不再被重置（按 message id 去重挂载）；表单草稿不参与指纹，输入焦点不被打断。
- `/api/health` 不再依赖数据库，schema 损坏时也返回 ok。
- 账号邮箱改重复时返回 409 而非 500；同步中 HTML 转纯文本最多处理前 512KB。
- 前端保持 Worker-only 零构建部署，同时拆分为 `src/ui.js`、`src/ui/app.js`、`src/ui/styles.js`。
- 新增 `/api/dashboard` 聚合接口，减少后台首页账号与邮件列表的串行请求。
- 新增 `/api/sync/runs`，用于查看最近同步记录、错误原因和耗时相关字段。
- `schema.sql` 与 `src/lib/schema.js` 的性能索引保持一致，避免新环境初始化时缺索引。
- 默认关键词搜索不再扫描正文；需要正文搜索时显式传 `searchBody=1`，避免首页检索触发高成本 D1 LIKE 扫描。
- 附件同步改为按 `graph_attachment_id` 做差异更新，未变化附件不再重复删除 R2、下载 Graph binary、写入 R2。
- Graph 同步失败后仅在 token refresh 不是明确授权/失效错误时尝试 IMAP fallback，减少无效 IMAP 重试。
- 定时清理 stale sync run 时同步修正卡住的账号同步状态，避免 UI 长期显示 queued/running。
- `wrangler.jsonc` 启用 Workers observability，便于线上排查同步耗时和失败分布。
- 响应增加基础安全头，跨域 API 不再默认返回 `Access-Control-Allow-Origin: *`。
- 前端删除浏览器原生 `prompt/confirm` 交互，改为站内 Modal。

## 主要风险点

- Microsoft refresh token 仍是系统核心凭据；必须只通过 Worker secret 加密后落 D1，不要写入日志、README、提交记录或前端缓存。
- Graph 失败后会 fallback 到 IMAP；IMAP 行为受 Outlook 状态、账号权限和 Cloudflare socket 限制影响，需要继续观察失败账号的 sync_runs。
- 邮件 HTML 通过 sandbox iframe 展示；后续若放宽 iframe 权限，必须重新审查 XSS 风险。
- 存量部署在执行 `0002-message-key-rebuild.sql` 之前仍是全局唯一键模型（运行时已自动兼容，但跨账号覆盖的风险在迁移前依然存在），建议尽快备份后执行迁移。
- 当前前端仍是原生 DOM 字符串渲染；无构建依赖、部署简单，但大型交互继续增长时需要保持模块边界。

## 后续可扩展方向

- 增加分组批量移动、重命名、删除空分组。
- 增加账号级“暂停同步/恢复同步”和失败账号一键重试。
- 增加邮件分页、日期范围筛选和附件筛选。
- 增加只读审计页：账号健康度、最近错误、同步耗时分布。
- 增加 Cloudflare Tail/D1 查询故障排查文档。
- CSP 收紧：去掉 `unsafe-inline`，前端脚本/样式改为可哈希或外链形式。
- 用 `wrangler d1 migrations` 把手动迁移工程化为版本化迁移管理。
- SESSION_SECRET / TOKEN_ENCRYPTION_SECRET 的版本化轮换机制（多版本共存、平滑切换）。
- TypeScript 或 JSDoc 类型化，并接入 CI 做类型与 lint 检查。
- Graph/IMAP 双轨同步用 `internet_message_id` 做跨来源去重，避免同一封邮件两条记录。
