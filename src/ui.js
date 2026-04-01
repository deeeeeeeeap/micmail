export const APP_HTML = String.raw`<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cloud Mail Archive</title>
    <style>
      :root {
        --bg: #f3efe7;
        --paper: #fffaf3;
        --ink: #14213d;
        --muted: #5c667a;
        --line: #e4dac8;
        --brand: #0d6e6e;
        --brand-strong: #084c4c;
        --accent: #c76d3a;
        --danger: #b42318;
        --success: #067647;
        --shadow: 0 24px 60px rgba(20, 33, 61, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Segoe UI", "PingFang SC", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(199, 109, 58, 0.18), transparent 28%),
          linear-gradient(135deg, #efe4d2 0%, var(--bg) 50%, #e9f1ef 100%);
        color: var(--ink);
        min-height: 100vh;
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      button {
        cursor: pointer;
      }

      .shell {
        width: min(1440px, calc(100vw - 32px));
        margin: 16px auto;
        background: rgba(255, 250, 243, 0.9);
        backdrop-filter: blur(18px);
        border: 1px solid rgba(228, 218, 200, 0.8);
        border-radius: 28px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      .hero {
        padding: 28px 32px 20px;
        border-bottom: 1px solid var(--line);
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
      }

      .hero h1,
      .hero h2,
      .hero p {
        margin: 0;
      }

      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--accent);
        margin-bottom: 10px;
      }

      .hero h1 {
        font-size: 30px;
        line-height: 1.1;
      }

      .hero p {
        margin-top: 8px;
        color: var(--muted);
        max-width: 620px;
      }

      .hero-actions,
      .toolbar,
      .form-row,
      .statusbar {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .app-grid {
        display: grid;
        grid-template-columns: 320px 1.15fr 1fr;
        min-height: 78vh;
      }

      .panel {
        min-width: 0;
        border-right: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.45);
      }

      .panel:last-child {
        border-right: none;
      }

      .panel-head {
        padding: 20px 20px 14px;
        border-bottom: 1px solid var(--line);
      }

      .panel-head h3 {
        margin: 0;
        font-size: 15px;
      }

      .panel-head p {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 13px;
      }

      .panel-body {
        padding: 16px 20px 24px;
      }

      .card,
      .message-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.84);
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .metric {
        padding: 14px;
      }

      .metric span {
        display: block;
        font-size: 12px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .metric strong {
        display: block;
        margin-top: 8px;
        font-size: 26px;
      }

      .stack {
        display: grid;
        gap: 12px;
      }

      label {
        display: grid;
        gap: 6px;
        font-size: 13px;
        color: var(--muted);
      }

      input,
      select,
      textarea {
        width: 100%;
        border: 1px solid #d8ccb7;
        background: white;
        padding: 12px 14px;
        border-radius: 14px;
        outline: none;
      }

      textarea {
        min-height: 110px;
        resize: vertical;
      }

      input:focus,
      select:focus,
      textarea:focus {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px rgba(13, 110, 110, 0.12);
      }

      .btn {
        border: none;
        border-radius: 999px;
        padding: 11px 16px;
        background: #dfe9e5;
        color: var(--ink);
      }

      .btn.primary {
        background: linear-gradient(135deg, var(--brand) 0%, var(--brand-strong) 100%);
        color: white;
      }

      .btn.secondary {
        background: rgba(13, 110, 110, 0.09);
        color: var(--brand-strong);
      }

      .btn.warn {
        background: rgba(180, 35, 24, 0.1);
        color: var(--danger);
      }

      .btn.small {
        padding: 8px 12px;
        font-size: 13px;
      }

      .account-list,
      .message-list,
      .attachment-list {
        display: grid;
        gap: 10px;
      }

      .account-item,
      .message-item {
        padding: 14px;
      }

      .account-item.active,
      .message-item.active {
        border-color: rgba(13, 110, 110, 0.45);
        box-shadow: inset 0 0 0 1px rgba(13, 110, 110, 0.22);
      }

      .account-top,
      .message-top,
      .detail-meta,
      .detail-actions {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }

      .account-email,
      .message-subject {
        font-weight: 700;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        background: rgba(13, 110, 110, 0.09);
        color: var(--brand-strong);
      }

      .status-pill.error {
        background: rgba(180, 35, 24, 0.09);
        color: var(--danger);
      }

      .message-preview,
      .muted,
      .account-meta,
      .detail-hint {
        color: var(--muted);
        font-size: 13px;
      }

      .message-item {
        cursor: pointer;
      }

      .message-item.unread .message-subject {
        color: var(--brand-strong);
      }

      .message-item.unread::before {
        content: "";
        display: block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
        margin-bottom: 8px;
      }

      .detail-wrap {
        display: grid;
        gap: 16px;
      }

      .detail-frame {
        width: 100%;
        min-height: 380px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: white;
      }

      .empty {
        padding: 22px;
        border: 1px dashed #d8ccb7;
        border-radius: 18px;
        color: var(--muted);
        text-align: center;
        background: rgba(255, 255, 255, 0.55);
      }

      .notice {
        margin-top: 12px;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(13, 110, 110, 0.1);
        color: var(--brand-strong);
      }

      .notice.error {
        background: rgba(180, 35, 24, 0.1);
        color: var(--danger);
      }

      .login-shell {
        width: min(560px, calc(100vw - 24px));
        margin: 8vh auto;
        background: rgba(255, 250, 243, 0.95);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      .login-shell .hero {
        display: block;
      }

      .code {
        font-family: Consolas, monospace;
      }

      @media (max-width: 1180px) {
        .app-grid {
          grid-template-columns: 1fr;
        }

        .panel {
          border-right: none;
          border-bottom: 1px solid var(--line);
        }

        .panel:last-child {
          border-bottom: none;
        }
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
      const state = {
        authenticated: false,
        checking: true,
        busy: false,
        notice: null,
        accounts: [],
        messages: [],
        selectedMessage: null,
        detail: null,
        stats: { total: 0 },
        filters: { accountId: "", folder: "", keyword: "" }
      };

      async function api(path, options) {
        const response = await fetch(path, Object.assign({
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin"
        }, options || {}));

        const data = await response.json().catch(function () {
          return { success: false, error: "响应不是有效 JSON" };
        });

        if (response.status === 401) {
          state.authenticated = false;
          state.accounts = [];
          state.messages = [];
          state.detail = null;
          render();
          throw new Error(data.error || "需要重新登录");
        }

        if (!response.ok || !data.success) {
          throw new Error(data.error || "请求失败");
        }

        return data.data;
      }

      function setNotice(message, type) {
        state.notice = message ? { message: message, type: type || "info" } : null;
        render();
      }

      function escapeHtml(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function formatDate(value) {
        if (!value) return "未同步";
        const date = new Date(value);
        return date.toLocaleString("zh-CN");
      }

      function shortText(value, length) {
        const input = String(value || "").trim();
        return input.length > length ? input.slice(0, length) + "..." : input;
      }

      function activeAccount() {
        if (!state.filters.accountId) return null;
        return state.accounts.find(function (item) {
          return String(item.id) === String(state.filters.accountId);
        }) || null;
      }

      function selectedMessageRow() {
        if (!state.selectedMessage) return null;
        return state.messages.find(function (item) {
          return item.id === state.selectedMessage;
        }) || null;
      }

      async function bootstrap() {
        render();
        try {
          const session = await api("/api/auth/session", { method: "GET" });
          state.authenticated = !!session.authenticated;
          state.checking = false;
          if (state.authenticated) {
            await refreshDashboard();
          } else {
            render();
          }
        } catch (error) {
          state.checking = false;
          setNotice(error.message, "error");
        }
      }

      async function refreshDashboard() {
        const accounts = await api("/api/accounts", { method: "GET" });
        state.accounts = accounts;
        if (!state.filters.accountId && accounts.length) {
          state.filters.accountId = String(accounts[0].id);
        }
        await loadMessages();
      }

      async function loadMessages() {
        const params = new URLSearchParams();
        if (state.filters.accountId) params.set("accountId", state.filters.accountId);
        if (state.filters.folder) params.set("folder", state.filters.folder);
        if (state.filters.keyword) params.set("keyword", state.filters.keyword);
        params.set("page", "1");
        params.set("pageSize", "25");

        const data = await api("/api/messages?" + params.toString(), { method: "GET" });
        state.messages = data.items || [];
        state.stats.total = data.total || 0;

        if (!state.messages.length) {
          state.selectedMessage = null;
          state.detail = null;
        } else if (!selectedMessageRow()) {
          state.selectedMessage = state.messages[0].id;
          await loadMessageDetail(state.selectedMessage);
          return;
        }

        render();
      }

      async function loadMessageDetail(messageId) {
        state.selectedMessage = messageId;
        render();
        const detail = await api("/api/messages/" + messageId, { method: "GET" });
        state.detail = detail;
        render();
        mountMessageFrame();
      }

      function mountMessageFrame() {
        const frame = document.getElementById("mail-frame");
        if (!frame || !state.detail) return;
        frame.srcdoc = state.detail.body_html || "<div style='font-family:sans-serif;padding:16px;color:#666'>这封邮件没有 HTML 正文。</div>";
      }

      async function handleLogin(event) {
        event.preventDefault();
        const password = document.getElementById("login-password").value.trim();
        if (!password) {
          setNotice("请输入后台登录密码。", "error");
          return;
        }

        try {
          await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ password: password })
          });
          state.authenticated = true;
          state.notice = null;
          await refreshDashboard();
        } catch (error) {
          setNotice(error.message, "error");
        }
      }

      async function handleLogout() {
        try {
          await api("/api/auth/logout", { method: "POST", body: "{}" });
        } catch (error) {
          console.error(error);
        }
        state.authenticated = false;
        state.accounts = [];
        state.messages = [];
        state.detail = null;
        state.selectedMessage = null;
        render();
      }

      async function handleAddAccount(event) {
        event.preventDefault();
        const email = document.getElementById("account-email").value.trim();
        const clientId = document.getElementById("account-client-id").value.trim();
        const refreshToken = document.getElementById("account-refresh-token").value.trim();

        if (!clientId || !refreshToken) {
          setNotice("Client ID 和 Refresh Token 不能为空。", "error");
          return;
        }

        try {
          setNotice("正在验证并保存邮箱账号...");
          await api("/api/accounts", {
            method: "POST",
            body: JSON.stringify({ email: email, clientId: clientId, refreshToken: refreshToken })
          });
          document.getElementById("account-form").reset();
          await refreshDashboard();
          setNotice("邮箱账号已保存。");
        } catch (error) {
          setNotice(error.message, "error");
        }
      }

      function parseBulkAccounts(input) {
        const lines = String(input || "")
          .split(/\r?\n/)
          .map(function (line) { return line.trim(); })
          .filter(Boolean);

        return lines.map(function (line, index) {
          const parts = line.split("----");
          if (parts.length < 4) {
            throw new Error("第 " + (index + 1) + " 行格式错误，必须是 邮箱----密码----ClientID----RefreshToken");
          }

          const email = (parts[0] || "").trim();
          const clientId = (parts[2] || "").trim();
          const refreshToken = parts.slice(3).join("----").trim();

          if (!email || !clientId || !refreshToken) {
            throw new Error("第 " + (index + 1) + " 行缺少邮箱、ClientID 或 RefreshToken");
          }

          return {
            email: email,
            clientId: clientId,
            refreshToken: refreshToken
          };
        });
      }

      async function handleBulkImport(event) {
        event.preventDefault();
        const raw = document.getElementById("bulk-account-input").value.trim();
        if (!raw) {
          setNotice("请先粘贴批量账号文本。", "error");
          return;
        }

        let accounts;
        try {
          accounts = parseBulkAccounts(raw);
        } catch (error) {
          setNotice(error.message, "error");
          return;
        }

        let successCount = 0;
        const failures = [];
        setNotice("正在批量导入 " + accounts.length + " 个账号，请稍候...");

        for (const account of accounts) {
          try {
            await api("/api/accounts", {
              method: "POST",
              body: JSON.stringify(account)
            });
            successCount += 1;
          } catch (error) {
            failures.push(account.email + ": " + error.message);
          }
        }

        await refreshDashboard();
        document.getElementById("bulk-account-input").value = "";
        document.getElementById("bulk-account-file").value = "";

        if (failures.length) {
          setNotice(
            "批量导入完成，成功 " + successCount + " 个，失败 " + failures.length + " 个。首个错误: " + failures[0],
            "error"
          );
          return;
        }

        setNotice("批量导入完成，共成功导入 " + successCount + " 个账号。");
      }

      function handleBulkFileSelect(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function () {
          document.getElementById("bulk-account-input").value = String(reader.result || "");
        };
        reader.onerror = function () {
          setNotice("读取批量导入文件失败。", "error");
        };
        reader.readAsText(file, "UTF-8");
      }

      async function handleSyncAll() {
        try {
          setNotice("正在执行全量同步，耗时取决于邮箱和附件数量...");
          await api("/api/sync/run", { method: "POST", body: "{}" });
          await refreshDashboard();
          setNotice("全量同步已完成。");
        } catch (error) {
          setNotice(error.message, "error");
        }
      }

      async function handleSyncAccount(accountId) {
        try {
          setNotice("正在同步所选账号...");
          await api("/api/accounts/" + accountId + "/sync", { method: "POST", body: "{}" });
          await refreshDashboard();
          setNotice("账号同步已完成。");
        } catch (error) {
          setNotice(error.message, "error");
        }
      }

      async function handleDeleteAccount(accountId) {
        if (!confirm("确认删除这个邮箱账号以及它的归档数据？")) return;
        try {
          await api("/api/accounts/" + accountId, { method: "DELETE" });
          if (String(state.filters.accountId) === String(accountId)) {
            state.filters.accountId = "";
          }
          await refreshDashboard();
          setNotice("账号和归档数据已删除。");
        } catch (error) {
          setNotice(error.message, "error");
        }
      }

      async function handleDeleteMessage(messageId) {
        if (!confirm("确认删除这封归档邮件？这不会删除 Outlook 源邮箱中的邮件。")) return;
        try {
          await api("/api/messages/" + messageId, { method: "DELETE" });
          state.detail = null;
          state.selectedMessage = null;
          await loadMessages();
          setNotice("归档邮件已删除。");
        } catch (error) {
          setNotice(error.message, "error");
        }
      }

      async function handleMarkRead(messageId, isRead) {
        try {
          await api("/api/messages/" + messageId + "/read", {
            method: "POST",
            body: JSON.stringify({ isRead: isRead })
          });
          await loadMessages();
          if (messageId === state.selectedMessage) {
            await loadMessageDetail(messageId);
          }
          setNotice(isRead ? "已标记为已读。" : "已标记为未读。");
        } catch (error) {
          setNotice(error.message, "error");
        }
      }

      async function handleFilter(event) {
        event.preventDefault();
        state.filters.accountId = document.getElementById("filter-account").value;
        state.filters.folder = document.getElementById("filter-folder").value;
        state.filters.keyword = document.getElementById("filter-keyword").value.trim();
        await loadMessages();
      }

      function renderLogin() {
        return ''
          + '<div class="login-shell">'
          + '  <section class="hero">'
          + '    <div class="eyebrow">Cloudflare Worker Mail Archive</div>'
          + '    <h1>登录后台后管理归档邮箱</h1>'
          + '    <p>这个版本已经不是本地 Express 代理。它会把邮箱账号保存到 D1，把附件放到 R2，并通过定时任务持续归档 Outlook 邮件。</p>'
          + '  </section>'
          + '  <section class="panel-body">'
          + '    <form id="login-form" class="stack">'
          + '      <label>后台密码<input id="login-password" type="password" placeholder="输入 ADMIN_PASSWORD" autocomplete="current-password" /></label>'
          + '      <button class="btn primary" type="submit">进入后台</button>'
          + '    </form>'
          + (state.notice ? '<div class="notice ' + (state.notice.type === "error" ? 'error' : '') + '">' + escapeHtml(state.notice.message) + '</div>' : '')
          + '  </section>'
          + '</div>';
      }

      function renderDashboard() {
        const accountItems = state.accounts.map(function (account) {
          const isActive = String(account.id) === String(state.filters.accountId);
          const statusClass = account.last_sync_status === "error" ? "status-pill error" : "status-pill";
          return ''
            + '<div class="account-item card ' + (isActive ? 'active' : '') + '">'
            + '  <div class="account-top">'
            + '    <div>'
            + '      <div class="account-email">' + escapeHtml(account.email) + '</div>'
            + '      <div class="account-meta">Client ID: <span class="code">' + escapeHtml(shortText(account.client_id, 20)) + '</span></div>'
            + '    </div>'
            + '    <span class="' + statusClass + '">' + escapeHtml(account.last_sync_status || "idle") + '</span>'
            + '  </div>'
            + '  <div class="account-meta">最近同步: ' + escapeHtml(formatDate(account.last_sync_at)) + '</div>'
            + (account.last_sync_error ? '<div class="account-meta">错误: ' + escapeHtml(shortText(account.last_sync_error, 120)) + '</div>' : '')
            + '  <div class="toolbar" style="margin-top:12px">'
            + '    <button class="btn small secondary" data-select-account="' + account.id + '">查看归档</button>'
            + '    <button class="btn small primary" data-sync-account="' + account.id + '">同步</button>'
            + '    <button class="btn small warn" data-delete-account="' + account.id + '">删除</button>'
            + '  </div>'
            + '</div>';
        }).join("");

        const messageItems = state.messages.map(function (message) {
          const isActive = message.id === state.selectedMessage;
          return ''
            + '<div class="message-item message-card ' + (isActive ? 'active ' : '') + (message.is_read ? '' : 'unread') + '" data-open-message="' + message.id + '">'
            + '  <div class="message-top">'
            + '    <div class="message-subject">' + escapeHtml(message.subject || "(无主题)") + '</div>'
            + '    <div class="muted">' + escapeHtml(formatDate(message.received_at)) + '</div>'
            + '  </div>'
            + '  <div class="muted">' + escapeHtml(message.account_email || "") + ' · ' + escapeHtml(message.folder || "") + '</div>'
            + '  <div class="message-preview">' + escapeHtml(shortText(message.preview || "", 160)) + '</div>'
            + '  <div class="toolbar" style="margin-top:12px">'
            + '    <button class="btn small secondary" data-toggle-read="' + message.id + '" data-target-read="' + (message.is_read ? '0' : '1') + '">' + (message.is_read ? '标记未读' : '标记已读') + '</button>'
            + '    <button class="btn small warn" data-delete-message="' + message.id + '">删除归档</button>'
            + '  </div>'
            + '</div>';
        }).join("");

        const detail = state.detail;
        const attachments = detail && detail.attachments && detail.attachments.length
          ? detail.attachments.map(function (attachment) {
              const downloadable = attachment.storage_status === "stored";
              return ''
                + '<div class="card" style="padding:12px 14px">'
                + '  <div class="message-top">'
                + '    <div>'
                + '      <div class="message-subject">' + escapeHtml(attachment.name || "(未命名附件)") + '</div>'
                + '      <div class="muted">' + escapeHtml(attachment.content_type || attachment.kind || "unknown") + ' · ' + escapeHtml(String(attachment.size || 0)) + ' bytes</div>'
                + '    </div>'
                + (downloadable ? '<a class="btn small secondary" href="/api/messages/' + detail.id + '/attachments/' + attachment.id + '">下载</a>' : '<span class="status-pill">仅元数据</span>')
                + '  </div>'
                + '</div>';
            }).join("")
          : '<div class="empty">这封邮件没有归档附件。</div>';

        const detailHtml = detail
          ? ''
            + '<div class="detail-wrap">'
            + '  <div class="detail-meta">'
            + '    <div>'
            + '      <h2 style="margin:0">' + escapeHtml(detail.subject || "(无主题)") + '</h2>'
            + '      <div class="muted">来自 ' + escapeHtml(detail.from_name || detail.from_address || "未知发件人") + ' · ' + escapeHtml(detail.account_email || "") + '</div>'
            + '      <div class="muted">收到时间 ' + escapeHtml(formatDate(detail.received_at)) + '</div>'
            + '    </div>'
            + '    <div class="detail-actions">'
            + '      <button class="btn small secondary" data-toggle-read="' + detail.id + '" data-target-read="' + (detail.is_read ? '0' : '1') + '">' + (detail.is_read ? '标记未读' : '标记已读') + '</button>'
            + '      <button class="btn small warn" data-delete-message="' + detail.id + '">删除归档</button>'
            + '      ' + (detail.web_link ? '<a class="btn small primary" target="_blank" rel="noreferrer" href="' + escapeHtml(detail.web_link) + '">在 Outlook 打开</a>' : '')
            + '    </div>'
            + '  </div>'
            + '  <div class="detail-hint">正文使用 sandbox iframe 展示，避免直接执行邮件中的脚本。</div>'
            + '  <iframe id="mail-frame" class="detail-frame" sandbox=""></iframe>'
            + '  <div><h3 style="margin:0 0 10px">附件</h3><div class="attachment-list">' + attachments + '</div></div>'
            + '  <div><h3 style="margin:0 0 10px">纯文本预览</h3><div class="card" style="padding:16px; white-space:pre-wrap">' + escapeHtml(detail.body_text || "没有可用的纯文本正文。") + '</div></div>'
            + '</div>'
          : '<div class="empty">选择一封邮件后，这里会显示正文、附件和元数据。</div>';

        return ''
          + '<div class="shell">'
          + '  <section class="hero">'
          + '    <div>'
          + '      <div class="eyebrow">Cloudflare Worker Archive</div>'
          + '      <h1>Microsoft 邮件归档后台</h1>'
          + '      <p>账号写入 D1，附件写入 R2，定时任务用 Microsoft Graph 增量拉取邮件。删除归档不会删除源邮箱中的邮件。</p>'
          + '    </div>'
          + '    <div class="hero-actions">'
          + '      <button class="btn secondary" id="sync-all-btn">立即同步全部账号</button>'
          + '      <button class="btn warn" id="logout-btn">退出登录</button>'
          + '    </div>'
          + '  </section>'
          + '  <section class="panel-body">'
          + '    <div class="metric-grid">'
          + '      <div class="metric card"><span>邮箱账号</span><strong>' + escapeHtml(String(state.accounts.length)) + '</strong></div>'
          + '      <div class="metric card"><span>当前结果</span><strong>' + escapeHtml(String(state.messages.length)) + '</strong></div>'
          + '      <div class="metric card"><span>匹配总数</span><strong>' + escapeHtml(String(state.stats.total || 0)) + '</strong></div>'
          + '    </div>'
          + (state.notice ? '<div class="notice ' + (state.notice.type === "error" ? 'error' : '') + '">' + escapeHtml(state.notice.message) + '</div>' : '')
          + '  </section>'
          + '  <section class="app-grid">'
          + '    <div class="panel">'
          + '      <div class="panel-head"><h3>邮箱账号</h3><p>保存 Microsoft Graph 凭据并触发单账号同步。</p></div>'
          + '      <div class="panel-body stack">'
          + '        <form id="account-form" class="stack card" style="padding:14px">'
          + '          <label>邮箱地址（可选）<input id="account-email" placeholder="如果留空，会尝试从 Graph 自动识别" /></label>'
          + '          <label>Client ID<input id="account-client-id" required placeholder="Azure App Client ID" /></label>'
          + '          <label>Refresh Token<textarea id="account-refresh-token" required placeholder="粘贴 refresh token"></textarea></label>'
          + '          <button class="btn primary" type="submit">保存账号</button>'
          + '        </form>'
          + '        <form id="bulk-account-form" class="stack card" style="padding:14px">'
          + '          <div class="message-top"><div class="message-subject">批量导入</div><div class="muted">格式: 邮箱----密码----ClientID----RefreshToken</div></div>'
          + '          <label>选择 TXT 文件<input id="bulk-account-file" type="file" accept=".txt,.csv,text/plain" /></label>'
          + '          <label>批量文本<textarea id="bulk-account-input" placeholder="每行一个账号，示例：&#10;user@example.com----password----client-id----refresh-token"></textarea></label>'
          + '          <div class="muted">第二段密码会被忽略，仅使用邮箱、ClientID 和 RefreshToken。</div>'
          + '          <button class="btn primary" type="submit">批量导入账号</button>'
          + '        </form>'
          + '        <div class="account-list">' + (accountItems || '<div class="empty">还没有已保存的邮箱账号。</div>') + '</div>'
          + '      </div>'
          + '    </div>'
          + '    <div class="panel">'
          + '      <div class="panel-head"><h3>归档检索</h3><p>查询 D1 中的邮件元数据和正文归档。</p></div>'
          + '      <div class="panel-body stack">'
          + '        <form id="filter-form" class="stack card" style="padding:14px">'
          + '          <div class="form-row">'
          + '            <label style="flex:1">账号<select id="filter-account"><option value="">全部</option>' + state.accounts.map(function (account) { return '<option value="' + account.id + '"' + (String(account.id) === String(state.filters.accountId) ? ' selected' : '') + '>' + escapeHtml(account.email) + '</option>'; }).join("") + '</select></label>'
          + '            <label style="width:150px">文件夹<select id="filter-folder"><option value="">全部</option><option value="inbox"' + (state.filters.folder === "inbox" ? ' selected' : '') + '>inbox</option><option value="junkemail"' + (state.filters.folder === "junkemail" ? ' selected' : '') + '>junkemail</option></select></label>'
          + '          </div>'
          + '          <label>关键词<input id="filter-keyword" value="' + escapeHtml(state.filters.keyword || "") + '" placeholder="按主题、发件人或正文搜索" /></label>'
          + '          <button class="btn primary" type="submit">查询归档</button>'
          + '        </form>'
          + '        <div class="message-list">' + (messageItems || '<div class="empty">当前条件下没有匹配的归档邮件。</div>') + '</div>'
          + '      </div>'
          + '    </div>'
          + '    <div class="panel">'
          + '      <div class="panel-head"><h3>邮件详情</h3><p>完整正文、附件和邮件元数据。</p></div>'
          + '      <div class="panel-body">' + detailHtml + '</div>'
          + '    </div>'
          + '  </section>'
          + '</div>';
      }

      function render() {
        const app = document.getElementById("app");
        if (state.checking) {
          app.innerHTML = '<div class="login-shell"><section class="hero"><div class="eyebrow">Loading</div><h1>正在检查登录状态</h1><p>请稍候，正在连接 Worker API。</p></section></div>';
        } else if (!state.authenticated) {
          app.innerHTML = renderLogin();
        } else {
          app.innerHTML = renderDashboard();
          mountMessageFrame();
        }
        bindEvents();
      }

      function bindEvents() {
        const loginForm = document.getElementById("login-form");
        if (loginForm) loginForm.onsubmit = handleLogin;

        const accountForm = document.getElementById("account-form");
        if (accountForm) accountForm.onsubmit = handleAddAccount;

        const bulkAccountForm = document.getElementById("bulk-account-form");
        if (bulkAccountForm) bulkAccountForm.onsubmit = handleBulkImport;

        const bulkAccountFile = document.getElementById("bulk-account-file");
        if (bulkAccountFile) bulkAccountFile.onchange = handleBulkFileSelect;

        const filterForm = document.getElementById("filter-form");
        if (filterForm) filterForm.onsubmit = handleFilter;

        const syncAllBtn = document.getElementById("sync-all-btn");
        if (syncAllBtn) syncAllBtn.onclick = handleSyncAll;

        const logoutBtn = document.getElementById("logout-btn");
        if (logoutBtn) logoutBtn.onclick = handleLogout;

        Array.from(document.querySelectorAll("[data-select-account]")).forEach(function (button) {
          button.onclick = async function () {
            state.filters.accountId = String(button.getAttribute("data-select-account"));
            await loadMessages();
          };
        });

        Array.from(document.querySelectorAll("[data-sync-account]")).forEach(function (button) {
          button.onclick = async function () {
            await handleSyncAccount(button.getAttribute("data-sync-account"));
          };
        });

        Array.from(document.querySelectorAll("[data-delete-account]")).forEach(function (button) {
          button.onclick = async function () {
            await handleDeleteAccount(button.getAttribute("data-delete-account"));
          };
        });

        Array.from(document.querySelectorAll("[data-open-message]")).forEach(function (item) {
          item.onclick = async function (event) {
            if (event.target.closest("button")) return;
            await loadMessageDetail(Number(item.getAttribute("data-open-message")));
          };
        });

        Array.from(document.querySelectorAll("[data-delete-message]")).forEach(function (button) {
          button.onclick = async function () {
            await handleDeleteMessage(Number(button.getAttribute("data-delete-message")));
          };
        });

        Array.from(document.querySelectorAll("[data-toggle-read]")).forEach(function (button) {
          button.onclick = async function () {
            await handleMarkRead(
              Number(button.getAttribute("data-toggle-read")),
              button.getAttribute("data-target-read") === "1"
            );
          };
        });
      }

      bootstrap();
    </script>
  </body>
</html>`;
