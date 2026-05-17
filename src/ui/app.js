export const APP_SCRIPT = String.raw`
const state = {
  authenticated: false,
  checking: true,
  busy: false,
  activeView: "mail",
  toast: null,
  modal: null,
  accounts: [],
  groups: [],
  messages: [],
  syncRuns: [],
  sync: {},
  selectedMessage: null,
  detail: null,
  stats: { total: 0 },
  filters: { accountId: "", folder: "", group: "", keyword: "" },
  drafts: {
    account: { email: "", groupName: "", clientId: "", refreshToken: "" },
    bulkInput: ""
  },
  ui: {
    accountFormOpen: false,
    bulkFormOpen: false
  },
  autoSyncing: false,
  lastAutoSyncAt: 0,
  lastAutoRefreshAt: null
};

let autoRefreshTimer = null;
let toastTimer = null;

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
    if (url.protocol === "http:" || url.protocol === "https:") return escapeHtml(url.href);
  } catch (_error) {
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

function normalizeAccountGroup(account) {
  return account && account.group_name ? account.group_name : "默认分组";
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
    return Number(item.id) === Number(state.selectedMessage);
  }) || null;
}

function visibleAccounts() {
  return state.accounts.filter(function (account) {
    return !state.filters.group || normalizeAccountGroup(account) === state.filters.group;
  });
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
  if (status === "success") return { className: "pill success", label: "正常", errorPrefix: "提示" };
  if (status === "queued") return { className: "pill waiting", label: "已排队", errorPrefix: "提示" };
  if (status === "running") return { className: "pill waiting", label: "同步中", errorPrefix: "提示" };
  if (status === "pending_retry") return { className: "pill waiting", label: "等待重试", errorPrefix: "原因" };
  if (status === "error") return { className: "pill error", label: "异常", errorPrefix: "错误" };
  return { className: "pill", label: status, errorPrefix: "提示" };
}

function showToast(message, type) {
  state.toast = message ? { message: message, type: type || "info" } : null;
  clearTimeout(toastTimer);
  if (message) {
    toastTimer = setTimeout(function () {
      state.toast = null;
      render();
    }, 4200);
  }
  render();
}

function openModal(config) {
  state.modal = config;
  render();
}

function closeModal() {
  state.modal = null;
  render();
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
  if (bulkInput) state.drafts.bulkInput = bulkInput.value;

  const accountCard = document.getElementById("account-form-card");
  if (accountCard) state.ui.accountFormOpen = accountCard.open;

  const bulkCard = document.getElementById("bulk-account-card");
  if (bulkCard) state.ui.bulkFormOpen = bulkCard.open;
}

function sanitizeFilters() {
  const selectedAccount = activeAccount();
  if (state.filters.accountId && !selectedAccount) state.filters.accountId = "";

  const groupNames = state.groups.filter(function (group) {
    return group.name;
  }).map(function (group) {
    return group.name;
  });
  if (state.filters.group && groupNames.indexOf(state.filters.group) === -1) state.filters.group = "";
  if (selectedAccount) state.filters.group = normalizeAccountGroup(selectedAccount);
}

function dashboardParams() {
  const params = new URLSearchParams();
  if (state.filters.accountId) params.set("accountId", state.filters.accountId);
  if (state.filters.folder) params.set("folder", state.filters.folder);
  if (state.filters.group) params.set("group", state.filters.group);
  if (state.filters.keyword) params.set("keyword", state.filters.keyword);
  params.set("page", "1");
  params.set("pageSize", "25");
  return params;
}

async function refreshDashboard(options) {
  const data = await api("/api/dashboard?" + dashboardParams().toString(), { method: "GET" });
  state.accounts = data.accounts || [];
  state.groups = data.groups || [];
  state.messages = data.messages && data.messages.items ? data.messages.items : [];
  state.stats.total = data.messages ? data.messages.total || 0 : 0;
  state.sync = data.sync || {};
  sanitizeFilters();

  if (!state.messages.length) {
    state.selectedMessage = null;
    state.detail = null;
  } else if (!selectedMessageRow()) {
    state.selectedMessage = state.messages[0].id;
    await loadMessageDetail(state.selectedMessage, { silent: true });
  }

  if (state.activeView === "sync") await loadSyncRuns({ silent: true });
  render();
  if (!options || !options.skipAutoSync) maybeAutoSync();
}

async function loadMessageDetail(messageId, options) {
  state.selectedMessage = Number(messageId);
  if (!options || !options.silent) render();
  const detail = await api("/api/messages/" + encodeURIComponent(messageId), { method: "GET" });
  state.detail = detail;
  render();
  mountMessageFrame();
}

async function loadSyncRuns(options) {
  const params = new URLSearchParams();
  if (state.filters.accountId) params.set("accountId", state.filters.accountId);
  params.set("limit", "40");
  const data = await api("/api/sync/runs?" + params.toString(), { method: "GET" });
  state.syncRuns = data.items || [];
  if (!options || !options.silent) render();
}

function mountMessageFrame() {
  const frame = document.getElementById("mail-frame");
  if (!frame || !state.detail) return;
  const content = state.detail.body_content_type === "html"
    ? state.detail.body_html || ""
    : "<pre style=\"white-space:pre-wrap;font-family:inherit\">" + escapeHtml(state.detail.body_text || "") + "</pre>";
  frame.srcdoc = content;
}

function startAutoRefresh() {
  if (autoRefreshTimer) return;
  autoRefreshTimer = setInterval(function () {
    refreshDashboard({ skipAutoSync: true }).catch(function (error) {
      console.warn("auto refresh failed", error);
    });
  }, 30000);
}

function stopAutoRefresh() {
  if (!autoRefreshTimer) return;
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

async function maybeAutoSync() {
  if (!state.authenticated || state.busy || state.autoSyncing) return;
  if (Date.now() - state.lastAutoSyncAt < 5 * 60 * 1000) return;
  if (!state.accounts.some(shouldRequestAutoSync)) return;

  state.autoSyncing = true;
  state.lastAutoSyncAt = Date.now();
  render();
  try {
    await api("/api/sync/auto", { method: "POST", body: "{}" });
    setTimeout(function () { refreshDashboard({ skipAutoSync: true }); }, 5000);
    setTimeout(function () { refreshDashboard({ skipAutoSync: true }); }, 20000);
  } catch (error) {
    showToast("自动同步启动失败: " + error.message, "error");
  } finally {
    state.autoSyncing = false;
    render();
  }
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
    showToast(error.message, "error");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (state.busy) return;
  const password = document.getElementById("login-password").value.trim();
  if (!password) {
    showToast("请输入后台密码", "error");
    return;
  }

  state.busy = true;
  render();
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password: password }) });
    state.authenticated = true;
    state.checking = false;
    startAutoRefresh();
    await refreshDashboard();
    showToast("已进入后台");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.busy = false;
    render();
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
    showToast("Client ID 和 Refresh Token 必填", "error");
    return;
  }

  state.busy = true;
  render();
  try {
    await api("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ email: email, clientId: clientId, refreshToken: refreshToken, groupName: groupName })
    });
    state.drafts.account = { email: "", groupName: "", clientId: "", refreshToken: "" };
    await refreshDashboard();
    showToast("账号已保存");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.busy = false;
    render();
  }
}

function parseBulkAccounts(input) {
  const lines = String(input || "").split(/\r?\n/).map(function (line) {
    return line.trim();
  }).filter(Boolean);

  return lines.map(function (line, index) {
    const parts = line.split("----");
    if (parts.length < 4) throw new Error("第 " + (index + 1) + " 行格式错误，必须是 邮箱----密码----ClientID----RefreshToken");
    const email = (parts[0] || "").trim();
    const clientId = (parts[2] || "").trim();
    const refreshToken = parts.length > 4 ? (parts[3] || "").trim() : parts.slice(3).join("----").trim();
    const groupName = (parts[5] || parts[4] || "").trim();
    if (!email || !clientId || !refreshToken) throw new Error("第 " + (index + 1) + " 行缺少邮箱、ClientID 或 RefreshToken");
    return { email: email, clientId: clientId, refreshToken: refreshToken, groupName: groupName };
  });
}

async function handleBulkImport(event) {
  event.preventDefault();
  if (state.busy) return;
  const raw = document.getElementById("bulk-account-input").value.trim();
  if (!raw) {
    showToast("请粘贴批量账号文本", "error");
    return;
  }

  let accounts;
  try {
    accounts = parseBulkAccounts(raw);
  } catch (error) {
    showToast(error.message, "error");
    return;
  }

  state.busy = true;
  render();
  const failures = [];
  let success = 0;
  for (const account of accounts) {
    try {
      await api("/api/accounts", { method: "POST", body: JSON.stringify(account) });
      success += 1;
    } catch (error) {
      failures.push(account.email + ": " + error.message);
    }
  }
  state.busy = false;
  if (!failures.length) state.drafts.bulkInput = "";
  await refreshDashboard();
  showToast("批量导入完成，成功 " + success + " 个，失败 " + failures.length + " 个" + (failures[0] ? "。首个错误: " + failures[0] : ""), failures.length ? "error" : "info");
}

function handleBulkFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    state.drafts.bulkInput = String(reader.result || "");
    const input = document.getElementById("bulk-account-input");
    if (input) input.value = state.drafts.bulkInput;
  };
  reader.onerror = function () {
    showToast("读取批量导入文件失败", "error");
  };
  reader.readAsText(file, "UTF-8");
}

async function handleSyncAll() {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    const result = await api("/api/sync/run", { method: "POST", body: "{}" });
    await refreshDashboard();
    showToast("已提交后台同步，本批排队 " + (result.queued || 0) + " 个账号");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.busy = false;
    render();
  }
}

async function handleSyncAccount(accountId) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    const result = await api("/api/accounts/" + encodeURIComponent(accountId) + "/sync", { method: "POST", body: "{}" });
    await refreshDashboard();
    showToast(result.status === "queued" ? "账号已加入后台同步队列" : "账号同步已完成");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.busy = false;
    render();
  }
}

function requestSetGroup(accountId) {
  const account = state.accounts.find(function (item) {
    return String(item.id) === String(accountId);
  });
  if (!account) return;
  openModal({
    kind: "input",
    title: "修改分组",
    description: "为 " + account.email + " 设置新的分组名称。",
    value: normalizeAccountGroup(account),
    confirmText: "保存分组",
    onConfirm: async function (value) {
      await api("/api/accounts/" + encodeURIComponent(accountId), {
        method: "PATCH",
        body: JSON.stringify({ groupName: String(value || "").trim() || "默认分组" })
      });
      await refreshDashboard();
      showToast("分组已更新");
    }
  });
}

function requestDeleteAccount(accountId) {
  const account = state.accounts.find(function (item) {
    return String(item.id) === String(accountId);
  });
  if (!account) return;
  openModal({
    kind: "confirm",
    title: "删除账号",
    description: "确认删除 " + account.email + " 以及它的归档数据？源邮箱不会被删除。",
    confirmText: "删除",
    danger: true,
    onConfirm: async function () {
      await api("/api/accounts/" + encodeURIComponent(accountId), { method: "DELETE" });
      if (String(state.filters.accountId) === String(accountId)) state.filters.accountId = "";
      await refreshDashboard();
      showToast("账号已删除");
    }
  });
}

function requestDeleteMessage(messageId) {
  openModal({
    kind: "confirm",
    title: "删除归档邮件",
    description: "只删除本系统中的归档副本，不会删除 Outlook 源邮件。",
    confirmText: "删除",
    danger: true,
    onConfirm: async function () {
      await api("/api/messages/" + encodeURIComponent(messageId), { method: "DELETE" });
      await refreshDashboard();
      showToast("归档邮件已删除");
    }
  });
}

async function handleMarkRead(messageId, isRead) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    await api("/api/messages/" + encodeURIComponent(messageId) + "/read", {
      method: "POST",
      body: JSON.stringify({ isRead: isRead })
    });
    if (state.detail && Number(state.detail.id) === Number(messageId)) state.detail.is_read = isRead ? 1 : 0;
    state.messages = state.messages.map(function (item) {
      return Number(item.id) === Number(messageId) ? Object.assign({}, item, { is_read: isRead ? 1 : 0 }) : item;
    });
    showToast(isRead ? "已标记为已读" : "已标记为未读");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.busy = false;
    render();
  }
}

async function handleFilter(event) {
  event.preventDefault();
  state.filters.accountId = document.getElementById("filter-account").value;
  state.filters.folder = document.getElementById("filter-folder").value;
  state.filters.group = document.getElementById("filter-group").value;
  state.filters.keyword = document.getElementById("filter-keyword").value.trim();
  await refreshDashboard({ skipAutoSync: true });
}

async function handleSelectGroup(groupName) {
  state.filters.group = groupName || "";
  state.filters.accountId = "";
  await refreshDashboard({ skipAutoSync: true });
}

function setView(view) {
  state.activeView = view;
  if (view === "sync") {
    loadSyncRuns().catch(function (error) {
      showToast(error.message, "error");
    });
  } else {
    render();
  }
}

function renderLogin() {
  const disabled = state.busy ? " disabled" : "";
  return ""
    + "<main class=\"login-shell\">"
    + "  <section class=\"hero\">"
    + "    <div>"
    + "      <p class=\"eyebrow\">MicMail Archive</p>"
    + "      <h1>登录后台，管理你的邮箱归档。</h1>"
    + "      <p>账号写入 D1，附件写入 R2；通过 Microsoft Graph / IMAP OAuth2 后台同步。</p>"
    + "    </div>"
    + "  </section>"
    + "  <form id=\"login-form\" class=\"card login-card stack\">"
    + "    <label>后台密码<input id=\"login-password\" type=\"password\" autocomplete=\"current-password\" placeholder=\"输入 ADMIN_PASSWORD\"" + disabled + " /></label>"
    + "    <button class=\"btn primary\" type=\"submit\"" + disabled + ">" + (state.busy ? "正在登录..." : "进入后台") + "</button>"
    + "  </form>"
    + "</main>";
}

function renderMetric(label, value, hint) {
  return "<div class=\"metric\"><div class=\"metric-label\"><span>" + escapeHtml(label) + "</span></div><strong>" + escapeHtml(value) + "</strong><small>" + escapeHtml(hint || "") + "</small></div>";
}

function renderAccount(account) {
  const isActive = String(account.id) === String(state.filters.accountId);
  const statusInfo = syncStatusInfo(account);
  return ""
    + "<article class=\"account-item " + (isActive ? "active" : "") + "\">"
    + "  <div class=\"item-top\">"
    + "    <div><div class=\"email\">" + escapeHtml(account.email) + "</div><div class=\"meta\">Client ID: " + escapeHtml(shortText(account.client_id, 22)) + "</div></div>"
    + "    <span class=\"" + statusInfo.className + "\">" + escapeHtml(statusInfo.label) + "</span>"
    + "  </div>"
    + "  <div class=\"meta\">分组 <span class=\"pill\">" + escapeHtml(normalizeAccountGroup(account)) + "</span> · 最近同步 " + escapeHtml(formatDate(account.last_sync_at)) + "</div>"
    + (account.last_sync_error ? "<div class=\"meta\">" + statusInfo.errorPrefix + ": " + escapeHtml(shortText(account.last_sync_error, 140)) + "</div>" : "")
    + "  <div class=\"actions\" style=\"margin-top:12px\">"
    + "    <button class=\"btn small\" data-select-account=\"" + escapeHtml(account.id) + "\">查看归档</button>"
    + "    <button class=\"btn small primary\" data-sync-account=\"" + escapeHtml(account.id) + "\">同步</button>"
    + "    <button class=\"btn small\" data-set-group=\"" + escapeHtml(account.id) + "\">分组</button>"
    + "    <button class=\"btn small danger\" data-delete-account=\"" + escapeHtml(account.id) + "\">删除</button>"
    + "  </div>"
    + "</article>";
}

function renderGroup(group) {
  const isActive = state.filters.group === group.name;
  const attention = group.attentionCount
    ? "<span class=\"pill waiting\">" + escapeHtml(group.attentionCount) + " 个需关注</span>"
    : "<span class=\"pill success\">正常</span>";
  return ""
    + "<button type=\"button\" class=\"group-item " + (isActive ? "active" : "") + "\" data-select-group=\"" + escapeHtml(group.name) + "\">"
    + "  <span class=\"item-top\"><strong>" + escapeHtml(group.label || group.name || "全部分组") + "</strong>" + attention + "</span>"
    + "  <span class=\"meta\">" + escapeHtml(group.accountCount || 0) + " 个账号 · " + (isActive ? "当前查询" : "点击查看") + "</span>"
    + "</button>";
}

function renderMessage(message) {
  const isActive = Number(message.id) === Number(state.selectedMessage);
  return ""
    + "<article class=\"message-item " + (isActive ? "active" : "") + "\" data-open-message=\"" + escapeHtml(message.id) + "\" tabindex=\"0\" role=\"button\">"
    + "  <div class=\"message-top\"><div class=\"subject\">" + escapeHtml(message.subject || "(无主题)") + "</div><div class=\"meta\">" + escapeHtml(formatDate(message.received_at)) + "</div></div>"
    + "  <div class=\"meta\">" + escapeHtml(message.account_email || "") + " · " + escapeHtml(message.folder || "") + (message.is_read ? "" : " · 未读") + "</div>"
    + "  <div class=\"preview\">" + escapeHtml(shortText(message.preview || "", 150)) + "</div>"
    + "  <div class=\"actions\" style=\"margin-top:12px\">"
    + "    <button class=\"btn small\" data-toggle-read=\"" + escapeHtml(message.id) + "\" data-target-read=\"" + (message.is_read ? "0" : "1") + "\">" + (message.is_read ? "标记未读" : "标记已读") + "</button>"
    + "    <button class=\"btn small danger\" data-delete-message=\"" + escapeHtml(message.id) + "\">删除归档</button>"
    + "  </div>"
    + "</article>";
}

function renderDetail() {
  const detail = state.detail;
  if (!detail) return "<div class=\"empty\">选择一封邮件后，这里会显示正文、附件和元数据。</div>";
  const attachments = detail.attachments && detail.attachments.length
    ? detail.attachments.map(function (attachment) {
        const downloadable = attachment.storage_status === "stored";
        return "<div class=\"card soft-card\"><div class=\"item-top\"><div><div class=\"subject\">" + escapeHtml(attachment.name || "(未命名附件)") + "</div><div class=\"meta\">" + escapeHtml(attachment.content_type || attachment.kind || "unknown") + " · " + escapeHtml(String(attachment.size || 0)) + " bytes</div></div>" + (downloadable ? "<a class=\"btn small\" href=\"/api/messages/" + encodeURIComponent(detail.id) + "/attachments/" + encodeURIComponent(attachment.id) + "\">下载</a>" : "<span class=\"pill\">仅元数据</span>") + "</div></div>";
      }).join("")
    : "<div class=\"empty\">这封邮件没有归档附件。</div>";
  return ""
    + "<div class=\"detail-wrap\">"
    + "  <div class=\"detail-top\"><div><h2 class=\"detail-title\">" + escapeHtml(detail.subject || "(无主题)") + "</h2><div class=\"meta\">来自 " + escapeHtml(detail.from_name || detail.from_address || "未知发件人") + " · " + escapeHtml(detail.account_email || "") + "</div><div class=\"meta\">收到时间 " + escapeHtml(formatDate(detail.received_at)) + "</div></div></div>"
    + "  <div class=\"actions\">"
    + "    <button class=\"btn small\" data-toggle-read=\"" + escapeHtml(detail.id) + "\" data-target-read=\"" + (detail.is_read ? "0" : "1") + "\">" + (detail.is_read ? "标记未读" : "标记已读") + "</button>"
    + "    <button class=\"btn small danger\" data-delete-message=\"" + escapeHtml(detail.id) + "\">删除归档</button>"
    + (safeHref(detail.web_link) ? "    <a class=\"btn small primary\" target=\"_blank\" rel=\"noreferrer\" href=\"" + safeHref(detail.web_link) + "\">在 Outlook 打开</a>" : "")
    + "  </div>"
    + "  <div class=\"table-note\">正文使用 sandbox iframe 展示，避免直接执行邮件中的脚本。</div>"
    + "  <iframe id=\"mail-frame\" class=\"detail-frame\" sandbox=\"\"></iframe>"
    + "  <section><h3>附件</h3><div class=\"stack\">" + attachments + "</div></section>"
    + "  <section><h3>纯文本预览</h3><div class=\"card soft-card\" style=\"white-space:pre-wrap\">" + escapeHtml(detail.body_text || "没有可用的纯文本正文。") + "</div></section>"
    + "</div>";
}

function renderSyncRun(run) {
  const statusClass = run.status === "success" ? "success" : run.status === "running" ? "waiting" : "error";
  return ""
    + "<article class=\"sync-item\">"
    + "  <div class=\"item-top\"><div><strong>" + escapeHtml(run.account_email || "系统任务") + "</strong><div class=\"meta\">" + escapeHtml(formatDate(run.started_at)) + " → " + escapeHtml(formatDate(run.finished_at)) + "</div></div><span class=\"pill " + statusClass + "\">" + escapeHtml(run.status) + "</span></div>"
    + "  <div class=\"meta\">邮件 " + escapeHtml(String(run.message_count || 0)) + " · 附件 " + escapeHtml(String(run.attachment_count || 0)) + " · " + escapeHtml(run.folder_scope || "-") + "</div>"
    + (run.error_text ? "<div class=\"meta\">错误: " + escapeHtml(shortText(run.error_text, 180)) + "</div>" : "")
    + "</article>";
}

function renderDashboard() {
  const disabled = state.busy ? " disabled" : "";
  const groups = state.groups.length ? state.groups : [{ name: "", label: "全部分组", accountCount: state.accounts.length, attentionCount: 0 }];
  const accountDraft = state.drafts.account;
  const accountFormOpen = state.ui.accountFormOpen ? " open" : "";
  const bulkFormOpen = state.ui.bulkFormOpen ? " open" : "";
  const accounts = visibleAccounts();
  const accountOptions = visibleAccounts();
  const groupOptions = groups.filter(function (group) { return group.name; });
  const syncHint = state.autoSyncing ? "自动同步正在排队" : "每 30 秒自动刷新状态，临时失败会避让重试";

  return ""
    + "<nav class=\"navbar\"><div class=\"navbar-inner\"><div class=\"brand\"><div class=\"brand-icon\">✉</div><div><h1 class=\"brand-title\">MicMail</h1><div class=\"brand-subtitle\">Cloudflare Mail Archive</div></div></div><div class=\"nav-pills\"><button class=\"nav-pill " + (state.activeView === "mail" ? "active" : "") + "\" data-view=\"mail\">邮件归档</button><button class=\"nav-pill " + (state.activeView === "sync" ? "active" : "") + "\" data-view=\"sync\">同步记录</button><button class=\"nav-pill " + (state.activeView === "settings" ? "active" : "") + "\" data-view=\"settings\">账号设置</button></div><button class=\"btn danger\" id=\"logout-btn\">退出</button></div></nav>"
    + "<main class=\"shell\">"
    + "  <section class=\"hero\"><div><p class=\"eyebrow\">Worker-only archive console</p><h1>更快、更清晰的邮箱归档后台。</h1><p>借鉴 Apple 风格的轻量界面：账号、分组、归档、同步状态在一个工作台里完成。</p></div><div class=\"hero-actions\"><button class=\"btn primary\" data-sync-all" + disabled + ">后台同步一批账号</button><button class=\"btn\" data-refresh-dashboard>刷新状态</button></div></section>"
    + "  <section class=\"metrics\">"
    + renderMetric("邮箱账号", String(state.accounts.length), syncHint)
    + renderMetric("当前结果", String(state.messages.length), "匹配总数 " + String(state.stats.total || 0))
    + renderMetric("成功账号", String(state.sync.successCount || 0), "最近同步 " + formatDate(state.sync.latestSyncAt))
    + renderMetric("需关注", String(state.sync.attentionCount || 0), "错误/等待重试账号")
    + "  </section>"
    + (state.activeView === "mail" ? renderMailWorkspace(accountOptions, groupOptions, accounts, groups, disabled) : "")
    + (state.activeView === "sync" ? renderSyncWorkspace(disabled) : "")
    + (state.activeView === "settings" ? renderSettingsWorkspace(accountDraft, accountFormOpen, bulkFormOpen, disabled) : "")
    + "</main>";
}

function renderMailWorkspace(accountOptions, groupOptions, accounts, groups, disabled) {
  return ""
    + "<section class=\"workspace\">"
    + "  <div class=\"panel\"><div class=\"panel-head\"><h2>账号与分组</h2><p>点击分组查询全组邮件，点击账号查询单账号邮件。</p></div><div class=\"panel-body\"><div class=\"group-list\">" + groups.map(renderGroup).join("") + "</div><div class=\"account-list\">" + (accounts.map(renderAccount).join("") || "<div class=\"empty\">当前分组没有账号。</div>") + "</div></div></div>"
    + "  <div class=\"panel\"><div class=\"panel-head\"><h2>归档检索</h2><p>D1 中的邮件元数据和正文归档。</p></div><div class=\"panel-body\"><form id=\"filter-form\" class=\"card soft-card stack\"><div class=\"form-row\"><label style=\"flex:1\">账号<select id=\"filter-account\"" + disabled + "><option value=\"\">" + (state.filters.group ? "全组账号" : "全部账号") + "</option>" + accountOptions.map(function (account) { return "<option value=\"" + escapeHtml(account.id) + "\"" + (String(account.id) === String(state.filters.accountId) ? " selected" : "") + ">" + escapeHtml(account.email) + "</option>"; }).join("") + "</select></label><label style=\"width:150px\">文件夹<select id=\"filter-folder\"" + disabled + "><option value=\"\">全部</option><option value=\"inbox\"" + (state.filters.folder === "inbox" ? " selected" : "") + ">inbox</option><option value=\"junkemail\"" + (state.filters.folder === "junkemail" ? " selected" : "") + ">junkemail</option></select></label></div><label>分组<select id=\"filter-group\"" + disabled + "><option value=\"\">全部分组</option>" + groupOptions.map(function (group) { return "<option value=\"" + escapeHtml(group.name) + "\"" + (state.filters.group === group.name ? " selected" : "") + ">" + escapeHtml(group.label || group.name) + "</option>"; }).join("") + "</select></label><label>关键词<input id=\"filter-keyword\" value=\"" + escapeHtml(state.filters.keyword || "") + "\" placeholder=\"按主题、发件人或正文搜索\"" + disabled + " /></label><button class=\"btn primary\" type=\"submit\"" + disabled + ">查询归档</button></form><div class=\"message-list\">" + (state.messages.map(renderMessage).join("") || "<div class=\"empty\">当前条件下没有匹配的归档邮件。</div>") + "</div></div></div>"
    + "  <div class=\"panel\"><div class=\"panel-head\"><h2>邮件详情</h2><p>完整正文、附件和元数据。</p></div><div class=\"panel-body\">" + renderDetail() + "</div></div>"
    + "</section>";
}

function renderSyncWorkspace(disabled) {
  return ""
    + "<section class=\"workspace\" style=\"grid-template-columns:1fr\">"
    + "  <div class=\"panel\"><div class=\"panel-head\"><h2>同步记录</h2><p>最近同步任务、错误原因和归档数量。</p></div><div class=\"panel-body\"><div class=\"toolbar\"><button class=\"btn primary\" data-sync-all" + disabled + ">后台同步一批账号</button><button class=\"btn\" data-load-sync-runs>刷新记录</button></div><div class=\"sync-list\">" + (state.syncRuns.map(renderSyncRun).join("") || "<div class=\"empty\">暂无同步记录。</div>") + "</div></div></div>"
    + "</section>";
}

function renderSettingsWorkspace(accountDraft, accountFormOpen, bulkFormOpen, disabled) {
  return ""
    + "<section class=\"workspace\" style=\"grid-template-columns:minmax(320px, 0.9fr) 1fr\">"
    + "  <div class=\"panel\"><div class=\"panel-head\"><h2>导入账号</h2><p>保存 OAuth refresh token，支持单个或批量导入。</p></div><div class=\"panel-body stack\"><details id=\"account-form-card\" class=\"card\"" + accountFormOpen + "><summary>保存单个账号</summary><form id=\"account-form\" class=\"collapsible-body\"><label>邮箱地址（可选）<input id=\"account-email\" value=\"" + escapeHtml(accountDraft.email) + "\" placeholder=\"留空时尝试用 Graph 识别\"" + disabled + " /></label><label>分组<input id=\"account-group\" value=\"" + escapeHtml(accountDraft.groupName) + "\" placeholder=\"默认分组 / openai / 项目A\"" + disabled + " /></label><label>Client ID<input id=\"account-client-id\" required value=\"" + escapeHtml(accountDraft.clientId) + "\" placeholder=\"Azure App Client ID\"" + disabled + " /></label><label>Refresh Token<textarea id=\"account-refresh-token\" required placeholder=\"粘贴 refresh token\"" + disabled + ">" + escapeHtml(accountDraft.refreshToken) + "</textarea></label><button class=\"btn primary\" type=\"submit\"" + disabled + ">保存账号</button></form></details><details id=\"bulk-account-card\" class=\"card\"" + bulkFormOpen + "><summary>批量导入账号</summary><form id=\"bulk-account-form\" class=\"collapsible-body\"><div class=\"muted\">格式：邮箱----密码----ClientID----RefreshToken----分组</div><label>选择 TXT/CSV 文件<input id=\"bulk-account-file\" type=\"file\" accept=\".txt,.csv,text/plain\"" + disabled + " /></label><label>批量文本<textarea id=\"bulk-account-input\" placeholder=\"每行一个账号\" " + disabled + ">" + escapeHtml(state.drafts.bulkInput) + "</textarea></label><button class=\"btn primary\" type=\"submit\"" + disabled + ">批量导入</button></form></details></div></div>"
    + "  <div class=\"panel\"><div class=\"panel-head\"><h2>账号列表</h2><p>管理分组、同步和删除。</p></div><div class=\"panel-body\"><div class=\"account-list\">" + (state.accounts.map(renderAccount).join("") || "<div class=\"empty\">还没有已保存账号。</div>") + "</div></div></div>"
    + "</section>";
}

function renderToast() {
  if (!state.toast) return "";
  return "<div class=\"toast-container\"><div class=\"toast " + (state.toast.type === "error" ? "error" : "") + "\">" + escapeHtml(state.toast.message) + "</div></div>";
}

function renderModal() {
  if (!state.modal) return "";
  const modal = state.modal;
  const input = modal.kind === "input"
    ? "<label>分组名称<input id=\"modal-input\" value=\"" + escapeHtml(modal.value || "") + "\" /></label>"
    : "";
  return ""
    + "<div class=\"modal-backdrop\"><div class=\"modal-card\"><h3>" + escapeHtml(modal.title || "确认操作") + "</h3><p>" + escapeHtml(modal.description || "") + "</p>" + input + "<div class=\"actions\"><button class=\"btn\" data-modal-cancel>取消</button><button class=\"btn " + (modal.danger ? "danger" : "primary") + "\" data-modal-confirm>" + escapeHtml(modal.confirmText || "确认") + "</button></div></div></div>";
}

function render() {
  captureUiState();
  const app = document.getElementById("app");
  if (state.checking) {
    app.innerHTML = "<main class=\"login-shell\"><section class=\"hero\"><div><p class=\"eyebrow\">Loading</p><h1>正在检查登录状态</h1><p>请稍候，正在连接 Worker API。</p></div></section></main>" + renderToast();
  } else if (!state.authenticated) {
    app.innerHTML = renderLogin() + renderToast();
  } else {
    app.innerHTML = renderDashboard() + renderToast() + renderModal();
    mountMessageFrame();
  }
  bindEvents();
}

function bindEvents() {
  const loginForm = document.getElementById("login-form");
  if (loginForm) loginForm.onsubmit = handleLogin;
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.onclick = handleLogout;
  const accountForm = document.getElementById("account-form");
  if (accountForm) accountForm.onsubmit = handleAddAccount;
  const bulkForm = document.getElementById("bulk-account-form");
  if (bulkForm) bulkForm.onsubmit = handleBulkImport;
  const bulkFile = document.getElementById("bulk-account-file");
  if (bulkFile) bulkFile.onchange = handleBulkFileSelect;
  const filterForm = document.getElementById("filter-form");
  if (filterForm) filterForm.onsubmit = handleFilter;
  const filterGroup = document.getElementById("filter-group");
  if (filterGroup) filterGroup.onchange = function () {
    const accountSelect = document.getElementById("filter-account");
    if (accountSelect) accountSelect.value = "";
  };
  Array.from(document.querySelectorAll("[data-view]")).forEach(function (button) {
    button.onclick = function () { setView(button.getAttribute("data-view")); };
  });
  Array.from(document.querySelectorAll("[data-refresh-dashboard]")).forEach(function (button) {
    button.onclick = function () { refreshDashboard({ skipAutoSync: true }).catch(function (error) { showToast(error.message, "error"); }); };
  });
  Array.from(document.querySelectorAll("[data-load-sync-runs]")).forEach(function (button) {
    button.onclick = function () { loadSyncRuns().catch(function (error) { showToast(error.message, "error"); }); };
  });
  Array.from(document.querySelectorAll("[data-sync-all]")).forEach(function (button) {
    button.onclick = handleSyncAll;
  });
  Array.from(document.querySelectorAll("[data-select-group]")).forEach(function (button) {
    button.onclick = function () { handleSelectGroup(button.getAttribute("data-select-group") || ""); };
  });
  Array.from(document.querySelectorAll("[data-select-account]")).forEach(function (button) {
    button.onclick = function () {
      state.filters.accountId = String(button.getAttribute("data-select-account"));
      const account = activeAccount();
      state.filters.group = account ? normalizeAccountGroup(account) : "";
      refreshDashboard({ skipAutoSync: true }).catch(function (error) { showToast(error.message, "error"); });
    };
  });
  Array.from(document.querySelectorAll("[data-sync-account]")).forEach(function (button) {
    button.onclick = function () { handleSyncAccount(button.getAttribute("data-sync-account")); };
  });
  Array.from(document.querySelectorAll("[data-set-group]")).forEach(function (button) {
    button.onclick = function () { requestSetGroup(button.getAttribute("data-set-group")); };
  });
  Array.from(document.querySelectorAll("[data-delete-account]")).forEach(function (button) {
    button.onclick = function () { requestDeleteAccount(button.getAttribute("data-delete-account")); };
  });
  Array.from(document.querySelectorAll("[data-open-message]")).forEach(function (item) {
    item.onclick = function (event) {
      if (event.target.closest("button")) return;
      loadMessageDetail(Number(item.getAttribute("data-open-message"))).catch(function (error) { showToast(error.message, "error"); });
    };
    item.onkeydown = function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      loadMessageDetail(Number(item.getAttribute("data-open-message"))).catch(function (error) { showToast(error.message, "error"); });
    };
  });
  Array.from(document.querySelectorAll("[data-delete-message]")).forEach(function (button) {
    button.onclick = function () { requestDeleteMessage(Number(button.getAttribute("data-delete-message"))); };
  });
  Array.from(document.querySelectorAll("[data-toggle-read]")).forEach(function (button) {
    button.onclick = function () {
      handleMarkRead(Number(button.getAttribute("data-toggle-read")), button.getAttribute("data-target-read") === "1");
    };
  });
  const modalCancel = document.querySelector("[data-modal-cancel]");
  if (modalCancel) modalCancel.onclick = closeModal;
  const modalConfirm = document.querySelector("[data-modal-confirm]");
  if (modalConfirm) modalConfirm.onclick = async function () {
    if (!state.modal || !state.modal.onConfirm) return closeModal();
    const modal = state.modal;
    const input = document.getElementById("modal-input");
    try {
      state.busy = true;
      closeModal();
      await modal.onConfirm(input ? input.value : undefined);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      state.busy = false;
      render();
    }
  };
}

bootstrap();
`;
