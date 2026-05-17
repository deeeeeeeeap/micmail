# MicMail 审计与重构记录

## 本轮已纳入改造

- 前端保持 Worker-only 零构建部署，同时拆分为 `src/ui.js`、`src/ui/app.js`、`src/ui/styles.js`。
- 新增 `/api/dashboard` 聚合接口，减少后台首页账号与邮件列表的串行请求。
- 新增 `/api/sync/runs`，用于查看最近同步记录、错误原因和耗时相关字段。
- `schema.sql` 与 `src/schema.js` 的性能索引保持一致，避免新环境初始化时缺索引。
- 响应增加基础安全头，跨域 API 不再默认返回 `Access-Control-Allow-Origin: *`。
- 前端删除浏览器原生 `prompt/confirm` 交互，改为站内 Modal。

## 主要风险点

- Microsoft refresh token 仍是系统核心凭据；必须只通过 Worker secret 加密后落 D1，不要写入日志、README、提交记录或前端缓存。
- Graph 失败后会 fallback 到 IMAP；IMAP 行为受 Outlook 状态、账号权限和 Cloudflare socket 限制影响，需要继续观察失败账号的 sync_runs。
- 邮件 HTML 通过 sandbox iframe 展示；后续若放宽 iframe 权限，必须重新审查 XSS 风险。
- 当前前端仍是原生 DOM 字符串渲染；无构建依赖、部署简单，但大型交互继续增长时需要保持模块边界。

## 后续可扩展方向

- 增加分组批量移动、重命名、删除空分组。
- 增加账号级“暂停同步/恢复同步”和失败账号一键重试。
- 增加邮件分页、日期范围筛选和附件筛选。
- 增加只读审计页：账号健康度、最近错误、同步耗时分布。
- 增加 Cloudflare Tail/D1 查询故障排查文档。
