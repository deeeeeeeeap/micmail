export const APP_HTML = String.raw`<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cloud Mail Archive</title>
    <style>
      :root {
        --bg: #f6f1e8;
        --paper: #fffdf8;
        --paper-soft: #fbf6ee;
        --ink: #13213b;
        --muted: #6d7890;
        --line: #e7ddce;
        --brand: #08736f;
        --brand-strong: #05524f;
        --brand-soft: #e3f3f0;
        --accent: #c86f3d;
        --danger: #b42318;
        --success: #067647;
        --shadow: 0 26px 80px rgba(31, 43, 69, 0.14);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
        background:
          radial-gradient(circle at 10% 0%, rgba(199, 109, 58, 0.18), transparent 28%),
          radial-gradient(circle at 92% 12%, rgba(8, 115, 111, 0.16), transparent 30%),
          linear-gradient(135deg, #efe4d2 0%, var(--bg) 52%, #edf5f2 100%);
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

      button:disabled,
      input:disabled,
      select:disabled,
      textarea:disabled {
        cursor: not-allowed;
        opacity: 0.58;
      }

      .shell {
        width: min(1760px, calc(100vw - 28px));
        margin: 14px auto;
        background: rgba(255, 253, 248, 0.94);
        backdrop-filter: blur(18px);
        border: 1px solid rgba(228, 218, 200, 0.8);
        border-radius: 30px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      .hero {
        padding: 24px 30px 18px;
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
        font-size: clamp(26px, 2.2vw, 40px);
        line-height: 1.1;
        letter-spacing: -0.03em;
      }

      .hero p {
        margin-top: 8px;
        color: var(--muted);
        max-width: 720px;
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
        grid-template-columns: minmax(360px, 0.92fr) minmax(470px, 1.12fr) minmax(500px, 1.2fr);
        min-height: 78vh;
      }

      .panel {
        min-width: 0;
        border-right: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.5);
        display: flex;
        flex-direction: column;
        overflow: visible;
      }

      .panel:last-child {
        border-right: none;
      }

      .panel-head {
        padding: 22px 24px 16px;
        border-bottom: 1px solid var(--line);
        background: rgba(255, 253, 248, 0.84);
        position: sticky;
        top: 0;
        z-index: 1;
      }

      .panel-head h3 {
        margin: 0;
        font-size: 18px;
        letter-spacing: -0.01em;
      }

      .panel-head p {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 13px;
      }

      .panel-body {
        padding: 18px 24px 26px;
        overflow: visible;
        min-width: 0;
        min-height: 0;
      }

      .card,
      .message-card {
        border: 1px solid var(--line);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.88);
        box-shadow: 0 12px 36px rgba(31, 43, 69, 0.06);
      }

      form.card {
        overflow: hidden;
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

      .panel-body::-webkit-scrollbar,
      .detail-frame::-webkit-scrollbar {
        width: 10px;
      }

      .panel-body::-webkit-scrollbar-thumb,
      .detail-frame::-webkit-scrollbar-thumb {
        background: rgba(109, 120, 144, 0.36);
        border-radius: 999px;
        border: 3px solid transparent;
        background-clip: content-box;
      }

      .collapsible-card {
        padding: 0;
        overflow: hidden;
      }

      .collapsible-card summary {
        list-style: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 16px 18px;
        cursor: pointer;
        user-select: none;
      }

      .collapsible-card summary::-webkit-details-marker {
        display: none;
      }

      .collapsible-card summary::after {
        content: "展开";
        flex: 0 0 auto;
        color: var(--brand-strong);
        background: var(--brand-soft);
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
      }

      .collapsible-card[open] summary::after {
        content: "收起";
      }

      .card-title {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      .card-title strong {
        font-size: 15px;
        overflow-wrap: anywhere;
      }

      .card-title span {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.35;
      }

      .collapsible-body {
        display: grid;
        gap: 12px;
        padding: 0 18px 18px;
      }

      .account-actions,
      .message-actions {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }

      .message-actions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .account-actions .btn,
      .message-actions .btn {
        width: 100%;
        padding-left: 10px;
        padding-right: 10px;
        white-space: nowrap;
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
        min-width: 0;
        border: 1px solid #d8ccb7;
        background: white;
        padding: 12px 16px;
        border-radius: 16px;
        outline: none;
        color: var(--ink);
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
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        max-width: 100%;
        white-space: nowrap;
        transition: transform 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
      }

      .btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 24px rgba(8, 115, 111, 0.12);
      }

      .btn:disabled:hover {
        transform: none;
        box-shadow: none;
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

      form .btn.primary {
        width: 100%;
        min-height: 48px;
      }

      .account-list,
      .message-list,
      .attachment-list {
        display: grid;
        gap: 10px;
      }

      .account-item,
      .message-item {
        padding: 16px;
        overflow: hidden;
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

      .detail-meta {
        align-items: flex-start;
      }

      .detail-heading {
        flex: 1 1 340px;
        min-width: 0;
      }

      .detail-title {
        margin: 0;
        line-height: 1.18;
        letter-spacing: -0.02em;
        overflow-wrap: anywhere;
      }

      .detail-actions {
        justify-content: flex-end;
      }

      .account-email,
      .message-subject {
        font-weight: 700;
        overflow-wrap: anywhere;
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
        max-width: 100%;
      }

      .status-pill.error {
        background: rgba(180, 35, 24, 0.09);
        color: var(--danger);
      }

      .status-pill.waiting {
        background: rgba(200, 111, 61, 0.13);
        color: var(--accent);
      }

      .status-pill.success {
        background: rgba(6, 118, 71, 0.1);
        color: var(--success);
      }

      .message-preview,
      .muted,
      .account-meta,
      .detail-hint {
        color: var(--muted);
        font-size: 13px;
        overflow-wrap: anywhere;
      }

      .message-item {
        cursor: pointer;
        transition: border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
      }

      .message-item:hover {
        transform: translateY(-1px);
        border-color: rgba(8, 115, 111, 0.28);
        box-shadow: 0 16px 34px rgba(31, 43, 69, 0.08);
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
        min-height: 460px;
        max-height: 58vh;
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

      .sync-note {
        margin-top: 10px;
        color: var(--muted);
        font-size: 13px;
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

      @media (min-width: 1181px) and (max-width: 1500px) {
        .shell {
          width: min(100vw - 16px, 1480px);
        }

        .app-grid {
          grid-template-columns: minmax(330px, 0.92fr) minmax(430px, 1.08fr) minmax(420px, 1fr);
        }

        .hero {
          padding-left: 22px;
          padding-right: 22px;
        }

        .panel-head,
        .panel-body {
          padding-left: 16px;
          padding-right: 16px;
        }
      }

      @media (max-width: 720px) {
        .shell {
          width: calc(100vw - 12px);
          margin: 6px auto;
          border-radius: 20px;
        }

        .hero,
        .panel-head,
        .panel-body {
          padding-left: 16px;
          padding-right: 16px;
        }

        .hero {
          flex-direction: column;
        }

        .hero-actions,
        .toolbar,
        .form-row,
        .detail-actions,
        .account-actions,
        .message-actions {
          width: 100%;
        }

        .hero-actions .btn,
        .toolbar .btn {
          flex: 1 1 140px;
        }

        .metric-grid {
          grid-template-columns: 1fr;
        }

        .account-actions {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .message-actions {
          grid-template-columns: 1fr;
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
        filters: { accountId: "", folder: "", group: "", keyword: "" },
        syncingAll: false,
        drafts: {
          account: { email: "", groupName: "", clientId: "", refreshToken: "" },
          bulkInput: ""
        },
        ui: {
          accountFormOpen: true,
          bulkFormOpen: false
        },
        skipNextCapture: false,
        autoSyncing: false,
        lastAutoSyncAt: 0,
        lastAutoRefreshAt: null,
        autoSyncMessage: ""
      };

      let autoRefreshTimer = null;

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
          stopAutoRefresh();
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

      function safeHref(value) {
        try {
          const url = new URL(String(value || ""), window.location.origin);
          if (url.protocol === "http:" || url.protocol === "https:") {
            return escapeHtml(url.href);
          }
        } catch (error) {
          return "";
        }
        return "";
      }

      function formatDate(value) {
        if (!value) return "未同步";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "时间未知";
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

      function accountGroups() {
        const seen = {};
        return state.accounts
          .map(function (account) { return account.group_name || "默认分组"; })
          .filter(function (group) {
            if (seen[group]) return false;
            seen[group] = true;
            return true;
          })
          .sort();
      }

      function isTransientSyncError(error) {
        const message = String(error || "").toLowerCase();
        return [
          "too many",
          "429",
          "rate limit",
          "throttl",
          "temporar",
          "try again",
          "timeout",
          "timed out",
          "network",
          "socket",
          "connection",
          "server busy",
          "service unavailable",
          "503",
          "504",
          "imap response did not complete"
        ].some(function (pattern) {
          return message.indexOf(pattern) !== -1;
        });
      }

      function minutesSince(value) {
        const time = Date.parse(value || "");
        if (Number.isNaN(time)) return Infinity;
        return Math.max(0, (Date.now() - time) / 60000);
      }

      function shouldRequestAutoSync(account) {
        const status = account.last_sync_status || "idle";
        if (status === "running" || status === "queued") return false;
        if (!account.last_sync_at) return true;
        if (status === "pending_retry" || (status === "error" && isTransientSyncError(account.last_sync_error))) {
          return minutesSince(account.last_sync_at) >= 10;
        }
        if (status === "error") return false;
        return minutesSince(account.last_sync_at) >= 30;
      }

      function syncStatusInfo(account) {
        const rawStatus = account.last_sync_status || "idle";
        const transientError = rawStatus === "error" && isTransientSyncError(account.last_sync_error);
        const status = transientError ? "pending_retry" : rawStatus;
        if (status === "success") return { className: "status-pill success", label: "正常", errorPrefix: "提示" };
        if (status === "running") return { className: "status-pill waiting", label: "同步中", errorPrefix: "提示" };
        if (status === "pending_retry") return { className: "status-pill waiting", label: "等待重试", errorPrefix: "原因" };
        if (status === "error") return { className: "status-pill error", label: "error", errorPrefix: "错误" };
        return { className: "status-pill", label: status, errorPrefix: "提示" };
      }

      function startAutoRefresh() {
        if (autoRefreshTimer) return;
        autoRefreshTimer = setInterval(refreshDashboardInBackground, 30000);
      }

      function stopAutoRefresh() {
        if (!autoRefreshTimer) return;
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
      }

      async function refreshDashboardInBackground() {
        if (!state.authenticated || state.busy) return;
        try {
          await refreshDashboard({ skipAutoSync: true });
          state.lastAutoRefreshAt = new Date().toISOString();
        } catch (error) {
          console.warn("auto refresh failed", error);
        }
      }

      async function maybeAutoSync(reason) {
        if (!state.authenticated || state.busy || state.autoSyncing) return;
        if (Date.now() - state.lastAutoSyncAt < 5 * 60 * 1000) return;
        if (!state.accounts.some(shouldRequestAutoSync)) return;

        state.autoSyncing = true;
        state.lastAutoSyncAt = Date.now();
        state.autoSyncMessage = "后台自动同步已启动，失败账号会按退避时间重试。";
        render();

        try {
          const result = await api("/api/sync/auto", { method: "POST", body: "{}" });
          state.autoSyncMessage = result.queued
            ? "后台正在自动同步 " + result.queued + " 个需要更新的账号。"
            : "自动刷新已开启，当前没有需要同步的账号。";
          setTimeout(refreshDashboardInBackground, 5000);
          setTimeout(refreshDashboardInBackground, 20000);
          setTimeout(refreshDashboardInBackground, 60000);
        } catch (error) {
          state.autoSyncMessage = "自动同步启动失败: " + error.message;
        } finally {
          state.autoSyncing = false;
          render();
        }
      }

      function captureUiState() {
        const accountForm = document.getElementById("account-form");
        if (accountForm) {
          state.drafts.account.email = document.getElementById("account-email").value;
          state.drafts.account.groupName = document.getElementById("account-group").value;
          state.drafts.account.clientId = document.getElementById("account-client-id").value;
          state.drafts.account.refreshToken = document.getElementById("account-refresh-token").value;
        }

        const bulkInput = document.getElementById("bulk-account-input");
        if (bulkInput) {
          state.drafts.bulkInput = bulkInput.value;
        }

        const accountCard = document.getElementById("account-form-card");
        if (accountCard) {
          state.ui.accountFormOpen = accountCard.open;
        }

        const bulkCard = document.getElementById("bulk-account-card");
        if (bulkCard) {
          state.ui.bulkFormOpen = bulkCard.open;
        }
      }

      function resetAccountDraft() {
        state.drafts.account = { email: "", groupName: "", clientId: "", refreshToken: "" };
        state.skipNextCapture = true;
      }

      function resetBulkDraft() {
        state.drafts.bulkInput = "";
        state.skipNextCapture = true;
      }

      function disabledAttr() {
        return state.busy ? " disabled" : "";
      }

      async function bootstrap() {
        render();
        try {
          const session = await api("/api/auth/session", { method: "GET" });
          state.authenticated = !!session.authenticated;
          state.checking = false;
          if (state.authenticated) {
            startAutoRefresh();
            await refreshDashboard();
          } else {
            stopAutoRefresh();
            render();
          }
        } catch (error) {
          state.checking = false;
          setNotice(error.message, "error");
        }
      }

      async function refreshDashboard(options) {
        const accounts = await api("/api/accounts", { method: "GET" });
        state.accounts = accounts;
        if (!state.filters.accountId && accounts.length) {
          state.filters.accountId = String(accounts[0].id);
        }
        await loadMessages();
        if (!options || !options.skipAutoSync) {
          maybeAutoSync("refresh");
        }
      }

      async function loadMessages() {
        const params = new URLSearchParams();
        if (state.filters.accountId) params.set("accountId", state.filters.accountId);
        if (state.filters.folder) params.set("folder", state.filters.folder);
        if (state.filters.group) params.set("group", state.filters.group);
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
        if (state.busy) return;
        const password = document.getElementById("login-password").value.trim();
        if (!password) {
          setNotice("请输入后台登录密码。", "error");
          return;
        }

        state.busy = true;
        state.notice = { message: "正在登录...", type: "info" };
        render();
        try {
          await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ password: password })
          });
          state.authenticated = true;
          state.notice = null;
          state.busy = false;
          startAutoRefresh();
          await refreshDashboard();
        } catch (error) {
          state.busy = false;
          setNotice(error.message, "error");
          return;
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
        stopAutoRefresh();
        render();
      }

      async function handleAddAccount(event) {
        event.preventDefault();
        if (state.busy) return;
        const email = document.getElementById("account-email").value.trim();
        const clientId = document.getElementById("account-client-id").value.trim();
        const refreshToken = document.getElementById("account-refresh-token").value.trim();
        const groupName = document.getElementById("account-group").value.trim();
        state.drafts.account = { email: email, clientId: clientId, refreshToken: refreshToken, groupName: groupName };

        if (!clientId || !refreshToken) {
          setNotice("Client ID 和 Refresh Token 不能为空。", "error");
          return;
        }

        state.busy = true;
        try {
          setNotice("正在验证并保存邮箱账号...");
          await api("/api/accounts", {
            method: "POST",
            body: JSON.stringify({ email: email, clientId: clientId, refreshToken: refreshToken, groupName: groupName })
          });
          await refreshDashboard();
          resetAccountDraft();
          state.busy = false;
          setNotice("邮箱账号已保存。");
        } catch (error) {
          state.busy = false;
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
          const refreshToken = parts.length > 4 ? (parts[3] || "").trim() : parts.slice(3).join("----").trim();
          const groupName = (parts[5] || parts[4] || "").trim();

          if (!email || !clientId || !refreshToken) {
            throw new Error("第 " + (index + 1) + " 行缺少邮箱、ClientID 或 RefreshToken");
          }

          return {
            email: email,
            clientId: clientId,
            refreshToken: refreshToken,
            groupName: groupName
          };
        });
      }

      async function handleBulkImport(event) {
        event.preventDefault();
        if (state.busy) return;
        const raw = document.getElementById("bulk-account-input").value.trim();
        state.drafts.bulkInput = raw;
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
        state.busy = true;
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

        if (failures.length) {
          state.busy = false;
          setNotice(
            "批量导入完成，成功 " + successCount + " 个，失败 " + failures.length + " 个。首个错误: " + failures[0],
            "error"
          );
          return;
        }

        resetBulkDraft();
        state.busy = false;
        setNotice("批量导入完成，共成功导入 " + successCount + " 个账号。");
      }

      function handleBulkFileSelect(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function () {
          state.drafts.bulkInput = String(reader.result || "");
          document.getElementById("bulk-account-input").value = state.drafts.bulkInput;
        };
        reader.onerror = function () {
          setNotice("读取批量导入文件失败。", "error");
        };
        reader.readAsText(file, "UTF-8");
      }

      async function handleSyncAll() {
        if (state.syncingAll || state.busy) return;
        state.syncingAll = true;
        state.busy = true;
        try {
          setNotice("已提交全部账号后台同步，页面不会再长时间卡住。稍后会自动刷新状态...");
          await api("/api/sync/run", { method: "POST", body: "{}" });
          render();
          setTimeout(refreshDashboard, 3000);
          setTimeout(refreshDashboard, 10000);
          setNotice("全部账号同步已在后台启动。");
        } catch (error) {
          setNotice(error.message, "error");
        } finally {
          state.syncingAll = false;
          state.busy = false;
          render();
        }
      }

      async function handleSyncAccount(accountId) {
        if (state.busy) return;
        state.busy = true;
        try {
          setNotice("正在同步所选账号...");
          await api("/api/accounts/" + accountId + "/sync", { method: "POST", body: "{}" });
          await refreshDashboard();
          state.busy = false;
          setNotice("账号同步已完成。");
        } catch (error) {
          state.busy = false;
          setNotice(error.message, "error");
        }
      }

      async function handleDeleteAccount(accountId) {
        if (state.busy) return;
        if (!confirm("确认删除这个邮箱账号以及它的归档数据？")) return;
        state.busy = true;
        try {
          await api("/api/accounts/" + accountId, { method: "DELETE" });
          if (String(state.filters.accountId) === String(accountId)) {
            state.filters.accountId = "";
          }
          await refreshDashboard();
          state.busy = false;
          setNotice("账号和归档数据已删除。");
        } catch (error) {
          state.busy = false;
          setNotice(error.message, "error");
        }
      }

      async function handleDeleteMessage(messageId) {
        if (state.busy) return;
        if (!confirm("确认删除这封归档邮件？这不会删除 Outlook 源邮箱中的邮件。")) return;
        state.busy = true;
        try {
          await api("/api/messages/" + messageId, { method: "DELETE" });
          state.detail = null;
          state.selectedMessage = null;
          await loadMessages();
          state.busy = false;
          setNotice("归档邮件已删除。");
        } catch (error) {
          state.busy = false;
          setNotice(error.message, "error");
        }
      }

      async function handleMarkRead(messageId, isRead) {
        if (state.busy) return;
        state.busy = true;
        try {
          await api("/api/messages/" + messageId + "/read", {
            method: "POST",
            body: JSON.stringify({ isRead: isRead })
          });
          await loadMessages();
          if (messageId === state.selectedMessage) {
            await loadMessageDetail(messageId);
          }
          state.busy = false;
          setNotice(isRead ? "已标记为已读。" : "已标记为未读。");
        } catch (error) {
          state.busy = false;
          setNotice(error.message, "error");
        }
      }

      async function handleFilter(event) {
        event.preventDefault();
        if (state.busy) return;
        state.filters.accountId = document.getElementById("filter-account").value;
        state.filters.folder = document.getElementById("filter-folder").value;
        state.filters.group = document.getElementById("filter-group").value;
        state.filters.keyword = document.getElementById("filter-keyword").value.trim();
        await loadMessages();
      }

      async function handleSetGroup(accountId) {
        if (state.busy) return;
        const account = state.accounts.find(function (item) {
          return String(item.id) === String(accountId);
        });
        if (!account) return;
        const groupName = prompt("请输入分组名称", account.group_name || "默认分组");
        if (groupName === null) return;
        state.busy = true;
        try {
          await api("/api/accounts/" + accountId, {
            method: "PATCH",
            body: JSON.stringify({ groupName: groupName.trim() || "默认分组" })
          });
          await refreshDashboard();
          state.busy = false;
          setNotice("分组已更新。");
        } catch (error) {
          state.busy = false;
          setNotice(error.message, "error");
        }
      }

      function renderLogin() {
        const disabled = disabledAttr();
        return ''
          + '<div class="login-shell">'
          + '  <section class="hero">'
          + '    <div class="eyebrow">Cloudflare Worker Mail Archive</div>'
          + '    <h1>登录后台后管理归档邮箱</h1>'
          + '    <p>这个版本已经不是本地 Express 代理。它会把邮箱账号保存到 D1，把附件放到 R2，并通过定时任务持续归档 Outlook 邮件。</p>'
          + '  </section>'
          + '  <section class="panel-body">'
          + '    <form id="login-form" class="stack">'
          + '      <label>后台密码<input id="login-password" type="password" placeholder="输入 ADMIN_PASSWORD" autocomplete="current-password"' + disabled + ' /></label>'
          + '      <button class="btn primary" type="submit"' + disabled + '>' + (state.busy ? '正在登录...' : '进入后台') + '</button>'
          + '    </form>'
          + (state.notice ? '<div class="notice ' + (state.notice.type === "error" ? 'error' : '') + '">' + escapeHtml(state.notice.message) + '</div>' : '')
          + '  </section>'
          + '</div>';
      }

      function renderDashboard() {
        const groups = accountGroups();
        const disabled = disabledAttr();
        const accountDraft = state.drafts.account;
        const accountFormOpen = state.ui.accountFormOpen ? " open" : "";
        const bulkFormOpen = state.ui.bulkFormOpen ? " open" : "";
        const accountItems = state.accounts.map(function (account) {
          const isActive = String(account.id) === String(state.filters.accountId);
          const statusInfo = syncStatusInfo(account);
          return ''
            + '<div class="account-item card ' + (isActive ? 'active' : '') + '">'
            + '  <div class="account-top">'
            + '    <div>'
            + '      <div class="account-email">' + escapeHtml(account.email) + '</div>'
            + '      <div class="account-meta">Client ID: <span class="code">' + escapeHtml(shortText(account.client_id, 20)) + '</span></div>'
            + '      <div class="account-meta">分组: <span class="status-pill">' + escapeHtml(account.group_name || "默认分组") + '</span></div>'
            + '    </div>'
            + '    <span class="' + statusInfo.className + '">' + escapeHtml(statusInfo.label) + '</span>'
            + '  </div>'
            + '  <div class="account-meta">最近同步: ' + escapeHtml(formatDate(account.last_sync_at)) + '</div>'
            + (account.last_sync_error ? '<div class="account-meta">' + statusInfo.errorPrefix + ': ' + escapeHtml(shortText(account.last_sync_error, 120)) + '</div>' : '')
            + '  <div class="account-actions">'
            + '    <button type="button" class="btn small secondary" data-select-account="' + escapeHtml(account.id) + '"' + disabled + '>查看归档</button>'
            + '    <button type="button" class="btn small primary" data-sync-account="' + escapeHtml(account.id) + '"' + disabled + '>同步</button>'
            + '    <button type="button" class="btn small secondary" data-set-group="' + escapeHtml(account.id) + '"' + disabled + '>分组</button>'
            + '    <button type="button" class="btn small warn" data-delete-account="' + escapeHtml(account.id) + '"' + disabled + '>删除</button>'
            + '  </div>'
            + '</div>';
        }).join("");

        const messageItems = state.messages.map(function (message) {
          const isActive = message.id === state.selectedMessage;
          return ''
            + '<div class="message-item message-card ' + (isActive ? 'active ' : '') + (message.is_read ? '' : 'unread') + '" data-open-message="' + escapeHtml(message.id) + '" tabindex="0" role="button">'
            + '  <div class="message-top">'
            + '    <div class="message-subject">' + escapeHtml(message.subject || "(无主题)") + '</div>'
            + '    <div class="muted">' + escapeHtml(formatDate(message.received_at)) + '</div>'
            + '  </div>'
            + '  <div class="muted">' + escapeHtml(message.account_email || "") + ' · ' + escapeHtml(message.folder || "") + '</div>'
            + '  <div class="message-preview">' + escapeHtml(shortText(message.preview || "", 160)) + '</div>'
            + '  <div class="message-actions">'
            + '    <button type="button" class="btn small secondary" data-toggle-read="' + escapeHtml(message.id) + '" data-target-read="' + (message.is_read ? '0' : '1') + '"' + disabled + '>' + (message.is_read ? '标记未读' : '标记已读') + '</button>'
            + '    <button type="button" class="btn small warn" data-delete-message="' + escapeHtml(message.id) + '"' + disabled + '>删除归档</button>'
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
                + (downloadable ? '<a class="btn small secondary" href="/api/messages/' + encodeURIComponent(detail.id) + '/attachments/' + encodeURIComponent(attachment.id) + '">下载</a>' : '<span class="status-pill">仅元数据</span>')
                + '  </div>'
                + '</div>';
            }).join("")
          : '<div class="empty">这封邮件没有归档附件。</div>';

        const detailHtml = detail
          ? ''
            + '<div class="detail-wrap">'
            + '  <div class="detail-meta">'
            + '    <div class="detail-heading">'
            + '      <h2 class="detail-title">' + escapeHtml(detail.subject || "(无主题)") + '</h2>'
            + '      <div class="muted">来自 ' + escapeHtml(detail.from_name || detail.from_address || "未知发件人") + ' · ' + escapeHtml(detail.account_email || "") + '</div>'
            + '      <div class="muted">收到时间 ' + escapeHtml(formatDate(detail.received_at)) + '</div>'
            + '    </div>'
            + '    <div class="detail-actions">'
            + '      <button type="button" class="btn small secondary" data-toggle-read="' + escapeHtml(detail.id) + '" data-target-read="' + (detail.is_read ? '0' : '1') + '"' + disabled + '>' + (detail.is_read ? '标记未读' : '标记已读') + '</button>'
            + '      <button type="button" class="btn small warn" data-delete-message="' + escapeHtml(detail.id) + '"' + disabled + '>删除归档</button>'
            + '      ' + (safeHref(detail.web_link) ? '<a class="btn small primary" target="_blank" rel="noreferrer" href="' + safeHref(detail.web_link) + '">在 Outlook 打开</a>' : '')
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
          + '      <p>账号写入 D1，附件写入 R2；优先 Graph，失败后自动使用 IMAP OAuth2 增量收信。删除归档不会删除源邮箱中的邮件。</p>'
          + '    </div>'
          + '    <div class="hero-actions">'
          + '      <button type="button" class="btn secondary" id="sync-all-btn"' + disabled + '>' + (state.syncingAll ? '正在启动同步...' : '一键后台同步全部') + '</button>'
          + '      <button type="button" class="btn warn" id="logout-btn"' + (state.busy ? ' disabled' : '') + '>退出登录</button>'
          + '    </div>'
          + '  </section>'
          + '  <section class="panel-body">'
          + '    <div class="metric-grid">'
          + '      <div class="metric card"><span>邮箱账号</span><strong>' + escapeHtml(String(state.accounts.length)) + '</strong></div>'
          + '      <div class="metric card"><span>当前结果</span><strong>' + escapeHtml(String(state.messages.length)) + '</strong></div>'
          + '      <div class="metric card"><span>匹配总数</span><strong>' + escapeHtml(String(state.stats.total || 0)) + '</strong></div>'
          + '    </div>'
          + '    <div class="sync-note">' + escapeHtml(state.autoSyncMessage || "已开启后台自动刷新：每 30 秒刷新状态；临时失败会自动退避重试。") + '</div>'
          + (state.notice ? '<div class="notice ' + (state.notice.type === "error" ? 'error' : '') + '">' + escapeHtml(state.notice.message) + '</div>' : '')
          + '  </section>'
          + '  <section class="app-grid">'
          + '    <div class="panel">'
          + '      <div class="panel-head"><h3>邮箱账号</h3><p>保存 OAuth 凭据、设置分组，并触发单账号同步。</p></div>'
          + '      <div class="panel-body stack">'
          + '        <details id="account-form-card" class="card collapsible-card"' + accountFormOpen + '>'
          + '          <summary><span class="card-title"><strong>保存单个账号</strong><span>粘贴邮箱 OAuth refresh token，保存后可立即同步。</span></span></summary>'
          + '          <form id="account-form" class="collapsible-body">'
          + '          <label>邮箱地址（可选）<input id="account-email" value="' + escapeHtml(accountDraft.email) + '" placeholder="如果留空，会尝试从 Graph 自动识别"' + disabled + ' /></label>'
          + '          <label>分组<input id="account-group" value="' + escapeHtml(accountDraft.groupName) + '" placeholder="默认分组 / 项目A / 客户B"' + disabled + ' /></label>'
          + '          <label>Client ID<input id="account-client-id" required value="' + escapeHtml(accountDraft.clientId) + '" placeholder="Azure App Client ID"' + disabled + ' /></label>'
          + '          <label>Refresh Token<textarea id="account-refresh-token" required placeholder="粘贴 refresh token"' + disabled + '>' + escapeHtml(accountDraft.refreshToken) + '</textarea></label>'
          + '          <button class="btn primary" type="submit"' + disabled + '>' + (state.busy ? '处理中...' : '保存账号') + '</button>'
          + '          </form>'
          + '        </details>'
          + '        <details id="bulk-account-card" class="card collapsible-card"' + bulkFormOpen + '>'
          + '          <summary><span class="card-title"><strong>批量导入账号</strong><span>支持 TXT / CSV 或直接粘贴，一行一个账号。</span></span></summary>'
          + '          <form id="bulk-account-form" class="collapsible-body">'
          + '          <div class="muted">格式: 邮箱----密码----ClientID----RefreshToken----分组</div>'
          + '          <label>选择 TXT 文件<input id="bulk-account-file" type="file" accept=".txt,.csv,text/plain"' + disabled + ' /></label>'
          + '          <label>批量文本<textarea id="bulk-account-input" placeholder="每行一个账号，示例：&#10;user@example.com----password----client-id----refresh-token"' + disabled + '>' + escapeHtml(state.drafts.bulkInput) + '</textarea></label>'
          + '          <div class="muted">第二段密码会被忽略；第 5/6 段可作为分组，不填为默认分组。</div>'
          + '          <button class="btn primary" type="submit"' + disabled + '>' + (state.busy ? '处理中...' : '批量导入账号') + '</button>'
          + '          </form>'
          + '        </details>'
          + '        <div class="account-list">' + (accountItems || '<div class="empty">还没有已保存的邮箱账号。</div>') + '</div>'
          + '      </div>'
          + '    </div>'
          + '    <div class="panel">'
          + '      <div class="panel-head"><h3>归档检索</h3><p>查询 D1 中的邮件元数据和正文归档。</p></div>'
          + '      <div class="panel-body stack">'
          + '        <form id="filter-form" class="stack card" style="padding:14px">'
          + '          <div class="form-row">'
          + '            <label style="flex:1">账号<select id="filter-account"' + disabled + '><option value="">全部</option>' + state.accounts.map(function (account) { return '<option value="' + escapeHtml(account.id) + '"' + (String(account.id) === String(state.filters.accountId) ? ' selected' : '') + '>' + escapeHtml(account.email) + '</option>'; }).join("") + '</select></label>'
          + '            <label style="width:150px">文件夹<select id="filter-folder"' + disabled + '><option value="">全部</option><option value="inbox"' + (state.filters.folder === "inbox" ? ' selected' : '') + '>inbox</option><option value="junkemail"' + (state.filters.folder === "junkemail" ? ' selected' : '') + '>junkemail</option></select></label>'
          + '          </div>'
          + '          <label>分组<select id="filter-group"' + disabled + '><option value="">全部分组</option>' + groups.map(function (group) { return '<option value="' + escapeHtml(group) + '"' + (state.filters.group === group ? ' selected' : '') + '>' + escapeHtml(group) + '</option>'; }).join("") + '</select></label>'
          + '          <label>关键词<input id="filter-keyword" value="' + escapeHtml(state.filters.keyword || "") + '" placeholder="按主题、发件人或正文搜索"' + disabled + ' /></label>'
          + '          <button class="btn primary" type="submit"' + disabled + '>查询归档</button>'
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
        if (state.skipNextCapture) {
          state.skipNextCapture = false;
        } else {
          captureUiState();
        }
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

        Array.from(document.querySelectorAll("[data-set-group]")).forEach(function (button) {
          button.onclick = async function () {
            await handleSetGroup(button.getAttribute("data-set-group"));
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
          item.onkeydown = async function (event) {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
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
