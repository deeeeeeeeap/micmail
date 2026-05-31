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
    bulkFormOpen: false,
    quickSyncEmail: ""
  },
  autoSyncing: false,
  syncingAll: false,
  syncingAccountId: "",
  loadingDashboard: false,
  lastAutoSyncAt: 0
};

let autoRefreshTimer = null;
let toastTimer = null;
let filterDebounceTimer = null;
let dashboardInFlight = null;
let dashboardQueuedOptions = null;
const scheduledRefreshTimers = new Set();
const detailCache = new Map();

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
  if (status === "success") return { className: "status-dot success", label: "正常", errorPrefix: "提示" };
  if (status === "queued") return { className: "status-dot waiting", label: "已排队", errorPrefix: "提示" };
  if (status === "running") return { className: "status-dot waiting", label: "同步中", errorPrefix: "提示" };
  if (status === "pending_retry") return { className: "status-dot waiting", label: "等待重试", errorPrefix: "原因" };
  if (status === "error") return { className: "status-dot error", label: "异常", errorPrefix: "错误" };
  return { className: "status-dot", label: status, errorPrefix: "提示" };
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

  const quickSyncEmail = document.getElementById("quick-sync-email");
  if (quickSyncEmail) state.ui.quickSyncEmail = quickSyncEmail.value;
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
  const requestedOptions = options || {};
  if (dashboardInFlight) {
    dashboardQueuedOptions = Object.assign({}, dashboardQueuedOptions || {}, requestedOptions, { skipAutoSync: true });
    return await dashboardInFlight;
  }

  state.loadingDashboard = true;
  if (!requestedOptions.silent) render();

  dashboardInFlight = (async function () {
    try {
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
      if (!requestedOptions.skipAutoSync) maybeAutoSync();
    } finally {
      state.loadingDashboard = false;
      render();
    }
  })();

  try {
    return await dashboardInFlight;
  } finally {
    dashboardInFlight = null;
    const queuedOptions = dashboardQueuedOptions;
    dashboardQueuedOptions = null;
    if (queuedOptions) {
      refreshDashboard(queuedOptions).catch(function (error) {
        showToast(error.message, "error");
      });
    }
  }
}

async function loadMessageDetail(messageId, options) {
  state.selectedMessage = Number(messageId);
  if (!options || !options.silent) render();
  if (detailCache.has(Number(messageId))) {
    state.detail = detailCache.get(Number(messageId));
    render();
    mountMessageFrame();
    return;
  }
  const detail = await api("/api/messages/" + encodeURIComponent(messageId), { method: "GET" });
  state.detail = detail;
  detailCache.set(Number(messageId), detail);
  if (detailCache.size > 30) {
    detailCache.delete(detailCache.keys().next().value);
  }
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

function scheduleDashboardRefresh(delayMs, options) {
  const timer = setTimeout(function () {
    scheduledRefreshTimers.delete(timer);
    refreshDashboard(Object.assign({ skipAutoSync: true, silent: true }, options || {})).catch(function (error) {
      showToast(error.message, "error");
    });
  }, delayMs);
  scheduledRefreshTimers.add(timer);
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
    scheduleDashboardRefresh(5000);
    scheduleDashboardRefresh(20000);
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
  detailCache.clear();
  scheduledRefreshTimers.forEach(clearTimeout);
  scheduledRefreshTimers.clear();
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
  if (state.syncingAll) return;
  state.syncingAll = true;
  render();
  try {
    const result = await api("/api/sync/run", { method: "POST", body: "{}" });
    scheduleDashboardRefresh(1800);
    scheduleDashboardRefresh(8000);
    showToast("已提交后台同步，本批排队 " + (result.queued || 0) + " 个账号");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.syncingAll = false;
    render();
  }
}

async function handleSyncAccount(accountId) {
  if (!accountId || state.syncingAccountId) return;
  state.syncingAccountId = String(accountId);
  markAccountSyncQueued(accountId);
  render();
  try {
    const result = await api("/api/accounts/" + encodeURIComponent(accountId) + "/sync", { method: "POST", body: "{}" });
    scheduleDashboardRefresh(1800);
    scheduleDashboardRefresh(8000);
    scheduleDashboardRefresh(20000);
    showToast((result.status === "queued" || result.status === "running") ? "账号已加入后台同步队列" : "账号同步已完成");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.syncingAccountId = "";
    render();
  }
}

async function handleQuickSyncAccount() {
  if (state.syncingAccountId) return;
  const input = document.getElementById("quick-sync-email");
  const value = input ? input.value.trim().toLowerCase() : "";
  const selected = value
    ? state.accounts.find(function (account) { return account.email.toLowerCase() === value; })
    : activeAccount();
  if (!selected) {
    showToast(value ? "没有找到这个邮箱账号" : "请先输入或选择要同步的邮箱", "error");
    return;
  }

  state.ui.quickSyncEmail = selected.email;
  state.activeView = "mail";
  state.filters.group = normalizeAccountGroup(selected);
  state.filters.accountId = String(selected.id);
  await handleSyncAccount(selected.id);
  refreshDashboard({ skipAutoSync: true, silent: true }).catch(function (error) {
    showToast(error.message, "error");
  });
}

function markAccountSyncQueued(accountId) {
  const now = new Date().toISOString();
  state.accounts = state.accounts.map(function (account) {
    return String(account.id) === String(accountId)
      ? Object.assign({}, account, { last_sync_status: "queued", last_sync_error: null, updated_at: now })
      : account;
  });
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
      detailCache.delete(Number(messageId));
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
    if (detailCache.has(Number(messageId))) {
      const cached = detailCache.get(Number(messageId));
      detailCache.set(Number(messageId), Object.assign({}, cached, { is_read: isRead ? 1 : 0 }));
    }
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
  await applyFilterControls(false);
}

async function applyFilterControls(clearAccount) {
  clearTimeout(filterDebounceTimer);
  state.filters.accountId = clearAccount ? "" : document.getElementById("filter-account").value;
  state.filters.folder = document.getElementById("filter-folder").value;
  state.filters.group = document.getElementById("filter-group").value;
  state.filters.keyword = document.getElementById("filter-keyword").value.trim();
  state.activeView = "mail";
  await refreshDashboard({ skipAutoSync: true });
}

function debounceFilterRefresh() {
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(function () {
    applyFilterControls(false).catch(function (error) {
      showToast(error.message, "error");
    });
  }, 450);
}

async function handleSelectGroup(groupName) {
  state.activeView = "mail";
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
    + "  <section class=\"login-panel\">"
    + "    <div class=\"login-brand\"><div class=\"brand-mark\">M</div><div><h1>MicMail</h1><p>Cloudflare Mail Archive</p></div></div>"
    + "    <div class=\"login-copy\"><p class=\"eyebrow\">Archive Console</p><h2>登录后台，进入邮箱归档工作台。</h2><p>用一个轻量 Worker 管理账号、分组、同步和归档邮件。</p></div>"
    + "    <form id=\"login-form\" class=\"login-form\">"
    + "      <label>后台密码<input id=\"login-password\" type=\"password\" autocomplete=\"current-password\" placeholder=\"输入 ADMIN_PASSWORD\"" + disabled + " /></label>"
    + "      <button class=\"btn primary\" type=\"submit\"" + disabled + ">" + (state.busy ? "正在登录..." : "进入后台") + "</button>"
    + "    </form>"
    + "  </section>"
    + "</main>";
}

function renderStatusLabel(info) {
  return "<span class=\"status-label\"><span class=\"" + info.className + "\"></span>" + escapeHtml(info.label) + "</span>";
}

function renderSidebar(groups) {
  const navItems = [
    { key: "mail", label: "邮件归档" },
    { key: "settings", label: "账号管理" },
    { key: "sync", label: "同步记录" }
  ];
  const groupItems = groups.map(function (group) {
    const isActive = state.activeView === "mail" && state.filters.group === group.name;
    const alert = group.attentionCount
      ? "<span class=\"side-alert\" title=\"需关注 " + escapeHtml(group.attentionCount) + " 个账号\">" + escapeHtml(group.attentionCount > 9 ? "9+" : group.attentionCount) + "</span>"
      : "";
    return ""
      + "<button type=\"button\" class=\"side-group " + (isActive ? "active" : "") + "\" data-select-group=\"" + escapeHtml(group.name) + "\">"
      + "  <span><strong>" + escapeHtml(group.label || group.name || "全部分组") + "</strong><small>" + escapeHtml(group.accountCount || 0) + " 个账号</small></span>"
      + alert
      + "</button>";
  }).join("");

  return ""
    + "<aside class=\"app-sidebar\">"
    + "  <div class=\"sidebar-brand\"><div class=\"brand-mark\">M</div><div><strong>MicMail</strong><span>Mail Archive</span></div></div>"
    + "  <nav class=\"side-nav\">" + navItems.map(function (item) { return "<button type=\"button\" class=\"side-nav-item " + (state.activeView === item.key ? "active" : "") + "\" data-view=\"" + item.key + "\">" + item.label + "</button>"; }).join("") + "</nav>"
    + "  <div class=\"side-section\"><div class=\"side-section-title\">分组</div><div class=\"side-group-list\">" + groupItems + "</div></div>"
    + "  <div class=\"sidebar-context\"><span>" + escapeHtml(String(state.accounts.length)) + " 个账号</span><span>" + escapeHtml(String(state.sync.attentionCount || 0)) + " 个需关注</span></div>"
    + "</aside>";
}

function renderTopbar(groupOptions, accountOptions, disabled) {
  const syncAllDisabled = state.syncingAll ? " disabled" : disabled;
  const quickSyncDisabled = state.syncingAccountId ? " disabled" : disabled;
  return ""
    + "<header class=\"app-topbar\">"
    + "  <form id=\"filter-form\" class=\"topbar-filter\">"
    + "    <label class=\"search-field\"><span>搜索</span><input id=\"filter-keyword\" value=\"" + escapeHtml(state.filters.keyword || "") + "\" placeholder=\"搜索主题或发件人\"" + disabled + " /></label>"
    + "    <label><span>分组</span><select id=\"filter-group\"" + disabled + "><option value=\"\">全部分组</option>" + groupOptions.map(function (group) { return "<option value=\"" + escapeHtml(group.name) + "\"" + (state.filters.group === group.name ? " selected" : "") + ">" + escapeHtml(group.label || group.name) + "</option>"; }).join("") + "</select></label>"
    + "    <label><span>账号</span><select id=\"filter-account\"" + disabled + "><option value=\"\">" + (state.filters.group ? "全组账号" : "全部账号") + "</option>" + accountOptions.map(function (account) { return "<option value=\"" + escapeHtml(account.id) + "\"" + (String(account.id) === String(state.filters.accountId) ? " selected" : "") + ">" + escapeHtml(account.email) + "</option>"; }).join("") + "</select></label>"
    + "    <label><span>文件夹</span><select id=\"filter-folder\"" + disabled + "><option value=\"\">全部</option><option value=\"inbox\"" + (state.filters.folder === "inbox" ? " selected" : "") + ">inbox</option><option value=\"junkemail\"" + (state.filters.folder === "junkemail" ? " selected" : "") + ">junkemail</option></select></label>"
    + "    <button class=\"btn primary\" type=\"submit\"" + disabled + ">" + (state.loadingDashboard ? "查询中" : "查询") + "</button>"
    + "  </form>"
    + "  <div class=\"topbar-actions\">"
    + "    <div class=\"quick-sync\"><input id=\"quick-sync-email\" list=\"account-email-options\" value=\"" + escapeHtml(state.ui.quickSyncEmail || "") + "\" placeholder=\"输入邮箱同步\"" + quickSyncDisabled + " /><datalist id=\"account-email-options\">" + state.accounts.map(function (account) { return "<option value=\"" + escapeHtml(account.email) + "\"></option>"; }).join("") + "</datalist><button class=\"btn primary\" data-quick-sync-account" + quickSyncDisabled + ">" + (state.syncingAccountId ? "同步中" : "同步账号") + "</button></div>"
    + "    <span class=\"sync-summary\">最近同步 " + escapeHtml(formatDate(state.sync.latestSyncAt)) + "</span>"
    + "    <button class=\"btn text\" data-sync-all" + syncAllDisabled + ">" + (state.syncingAll || state.autoSyncing ? "排队中" : "同步一批") + "</button>"
    + "    <button class=\"btn text\" data-refresh-dashboard" + (state.loadingDashboard ? " disabled" : "") + ">刷新</button>"
    + "    <button class=\"btn text danger-text\" id=\"logout-btn\">退出</button>"
    + "  </div>"
    + "</header>";
}

function renderMailWorkspace() {
  const resultLabel = state.stats.total || state.messages.length;
  return ""
    + "<main class=\"mail-workspace\">"
    + "  <section class=\"mail-list-pane\">"
    + "    <div class=\"pane-head\"><div><h2>邮件列表</h2><p>当前结果 " + escapeHtml(String(state.messages.length)) + " / 匹配 " + escapeHtml(String(resultLabel)) + "</p></div></div>"
    + "    <div class=\"mail-list\">" + (state.messages.map(renderMessage).join("") || "<div class=\"empty\">当前条件下没有匹配的归档邮件。</div>") + "</div>"
    + "  </section>"
    + "  <section class=\"mail-detail-pane\">"
    + renderDetail()
    + "  </section>"
    + "</main>";
}

function renderMessage(message) {
  const isActive = Number(message.id) === Number(state.selectedMessage);
  const unread = message.is_read ? "" : "<span class=\"unread-dot\" title=\"未读\"></span>";
  return ""
    + "<article class=\"mail-row " + (isActive ? "active" : "") + "\" data-open-message=\"" + escapeHtml(message.id) + "\" tabindex=\"0\" role=\"button\">"
    + "  <div class=\"mail-row-main\"><div class=\"mail-subject\">" + unread + "<span>" + escapeHtml(message.subject || "(无主题)") + "</span></div><time>" + escapeHtml(formatDate(message.received_at)) + "</time></div>"
    + "  <div class=\"mail-row-meta\"><span>" + escapeHtml(message.from_name || message.from_address || "未知发件人") + "</span><span>" + escapeHtml(message.account_email || "") + "</span><span>" + escapeHtml(message.folder || "") + "</span></div>"
    + "  <div class=\"mail-row-bottom\"><p>" + escapeHtml(shortText(message.preview || "", 140)) + "</p><div class=\"row-actions\"><button class=\"link-btn\" data-toggle-read=\"" + escapeHtml(message.id) + "\" data-target-read=\"" + (message.is_read ? "0" : "1") + "\">" + (message.is_read ? "标记未读" : "标记已读") + "</button><button class=\"link-btn danger-text\" data-delete-message=\"" + escapeHtml(message.id) + "\">删除</button></div></div>"
    + "</article>";
}

function renderDetail() {
  const detail = state.detail;
  if (!detail) return "<div class=\"empty detail-empty\">选择一封邮件后，这里会显示正文、附件和元数据。</div>";
  const attachments = detail.attachments && detail.attachments.length
    ? detail.attachments.map(function (attachment) {
        const downloadable = attachment.storage_status === "stored";
        return "<div class=\"attachment-row\"><div><strong>" + escapeHtml(attachment.name || "(未命名附件)") + "</strong><span>" + escapeHtml(attachment.content_type || attachment.kind || "unknown") + " · " + escapeHtml(String(attachment.size || 0)) + " bytes</span></div>" + (downloadable ? "<a class=\"link-btn\" href=\"/api/messages/" + encodeURIComponent(detail.id) + "/attachments/" + encodeURIComponent(attachment.id) + "\">下载</a>" : "<span class=\"muted\">仅元数据</span>") + "</div>";
      }).join("")
    : "<div class=\"empty compact\">这封邮件没有归档附件。</div>";
  return ""
    + "<div class=\"detail-wrap\">"
    + "  <header class=\"detail-head\"><div><h2>" + escapeHtml(detail.subject || "(无主题)") + "</h2><p>来自 " + escapeHtml(detail.from_name || detail.from_address || "未知发件人") + " · " + escapeHtml(detail.account_email || "") + "</p><p>收到时间 " + escapeHtml(formatDate(detail.received_at)) + "</p></div></header>"
    + "  <div class=\"detail-actions\">"
    + "    <button class=\"link-btn\" data-toggle-read=\"" + escapeHtml(detail.id) + "\" data-target-read=\"" + (detail.is_read ? "0" : "1") + "\">" + (detail.is_read ? "标记未读" : "标记已读") + "</button>"
    + "    <button class=\"link-btn danger-text\" data-delete-message=\"" + escapeHtml(detail.id) + "\">删除归档</button>"
    + (safeHref(detail.web_link) ? "    <a class=\"link-btn primary-link\" target=\"_blank\" rel=\"noreferrer\" href=\"" + safeHref(detail.web_link) + "\">在 Outlook 打开</a>" : "")
    + "  </div>"
    + "  <div class=\"frame-note\">正文使用 sandbox iframe 展示，避免执行邮件中的脚本。</div>"
    + "  <iframe id=\"mail-frame\" class=\"detail-frame\" sandbox=\"\"></iframe>"
    + "  <section class=\"detail-section\"><h3>附件</h3><div class=\"attachment-list\">" + attachments + "</div></section>"
    + "  <section class=\"detail-section\"><h3>纯文本预览</h3><div class=\"plain-preview\">" + escapeHtml(detail.body_text || "没有可用的纯文本正文。") + "</div></section>"
    + "</div>";
}

function renderSyncWorkspace(disabled) {
  const syncAllDisabled = state.syncingAll ? " disabled" : disabled;
  return ""
    + "<main class=\"content-view\">"
    + "  <div class=\"view-head\"><div><h2>同步记录</h2><p>最近同步任务、错误原因和归档数量。</p></div><div class=\"view-actions\"><button class=\"btn primary\" data-sync-all" + syncAllDisabled + ">" + (state.syncingAll ? "同步排队中" : "同步一批账号") + "</button><button class=\"btn text\" data-load-sync-runs>刷新记录</button></div></div>"
    + "  <div class=\"sync-list\">" + (state.syncRuns.map(renderSyncRun).join("") || "<div class=\"empty\">暂无同步记录。</div>") + "</div>"
    + "</main>";
}

function renderSyncRun(run) {
  const statusClass = run.status === "success" ? "success" : run.status === "running" ? "waiting" : "error";
  return ""
    + "<article class=\"sync-row\">"
    + "  <div class=\"sync-row-main\"><div><strong>" + escapeHtml(run.account_email || "系统任务") + "</strong><span>" + escapeHtml(formatDate(run.started_at)) + " → " + escapeHtml(formatDate(run.finished_at)) + "</span></div><span class=\"status-label\"><span class=\"status-dot " + statusClass + "\"></span>" + escapeHtml(run.status) + "</span></div>"
    + "  <div class=\"sync-row-meta\">邮件 " + escapeHtml(String(run.message_count || 0)) + " · 附件 " + escapeHtml(String(run.attachment_count || 0)) + " · " + escapeHtml(run.folder_scope || "-") + "</div>"
    + (run.error_text ? "<div class=\"sync-error\">错误: " + escapeHtml(shortText(run.error_text, 220)) + "</div>" : "")
    + "</article>";
}

function renderAccountManagement(accountDraft, accountFormOpen, bulkFormOpen, disabled) {
  const syncAllDisabled = state.syncingAll ? " disabled" : disabled;
  return ""
    + "<main class=\"content-view\">"
    + "  <div class=\"view-head\"><div><h2>账号管理</h2><p>维护 OAuth refresh token、分组和同步状态。</p></div><div class=\"view-actions\"><button class=\"btn primary\" data-sync-all" + syncAllDisabled + ">" + (state.syncingAll ? "同步排队中" : "同步一批账号") + "</button></div></div>"
    + "  <section class=\"management-tools\">"
    + "    <details id=\"account-form-card\"" + accountFormOpen + "><summary>添加单个账号</summary><form id=\"account-form\" class=\"tool-form\"><label>邮箱地址（可选）<input id=\"account-email\" value=\"" + escapeHtml(accountDraft.email) + "\" placeholder=\"留空时尝试用 Graph 识别\"" + disabled + " /></label><label>分组<input id=\"account-group\" value=\"" + escapeHtml(accountDraft.groupName) + "\" placeholder=\"默认分组 / openai / 项目A\"" + disabled + " /></label><label>Client ID<input id=\"account-client-id\" required value=\"" + escapeHtml(accountDraft.clientId) + "\" placeholder=\"Azure App Client ID\"" + disabled + " /></label><label>Refresh Token<textarea id=\"account-refresh-token\" required placeholder=\"粘贴 refresh token\"" + disabled + ">" + escapeHtml(accountDraft.refreshToken) + "</textarea></label><button class=\"btn primary\" type=\"submit\"" + disabled + ">保存账号</button></form></details>"
    + "    <details id=\"bulk-account-card\"" + bulkFormOpen + "><summary>批量导入账号</summary><form id=\"bulk-account-form\" class=\"tool-form\"><p class=\"muted\">格式：邮箱----密码----ClientID----RefreshToken----分组</p><label>选择 TXT/CSV 文件<input id=\"bulk-account-file\" type=\"file\" accept=\".txt,.csv,text/plain\"" + disabled + " /></label><label>批量文本<textarea id=\"bulk-account-input\" placeholder=\"每行一个账号\" " + disabled + ">" + escapeHtml(state.drafts.bulkInput) + "</textarea></label><button class=\"btn primary\" type=\"submit\"" + disabled + ">批量导入</button></form></details>"
    + "  </section>"
    + "  <section class=\"account-manage-list\">" + (state.accounts.map(renderAccount).join("") || "<div class=\"empty\">还没有已保存账号。</div>") + "</section>"
    + "</main>";
}

function renderAccount(account) {
  const isActive = String(account.id) === String(state.filters.accountId);
  const statusInfo = syncStatusInfo(account);
  const syncDisabled = state.syncingAccountId && String(state.syncingAccountId) !== String(account.id) ? " disabled" : "";
  return ""
    + "<article class=\"account-row " + (isActive ? "active" : "") + "\">"
    + "  <div class=\"account-row-main\"><div><strong>" + escapeHtml(account.email) + "</strong><span>Client ID: " + escapeHtml(shortText(account.client_id, 30)) + "</span></div>" + renderStatusLabel(statusInfo) + "</div>"
    + "  <div class=\"account-row-meta\"><span>分组 " + escapeHtml(normalizeAccountGroup(account)) + "</span><span>最近同步 " + escapeHtml(formatDate(account.last_sync_at)) + "</span></div>"
    + (account.last_sync_error ? "<div class=\"account-error\">" + statusInfo.errorPrefix + ": " + escapeHtml(shortText(account.last_sync_error, 180)) + "</div>" : "")
    + "  <div class=\"row-actions\"><button class=\"link-btn\" data-select-account=\"" + escapeHtml(account.id) + "\">查看邮件</button><button class=\"link-btn primary-link\" data-sync-account=\"" + escapeHtml(account.id) + "\"" + syncDisabled + ">" + (String(state.syncingAccountId) === String(account.id) ? "同步中" : "同步") + "</button><button class=\"link-btn\" data-set-group=\"" + escapeHtml(account.id) + "\">分组</button><button class=\"link-btn danger-text\" data-delete-account=\"" + escapeHtml(account.id) + "\">删除</button></div>"
    + "</article>";
}

function renderDashboard() {
  const disabled = state.busy ? " disabled" : "";
  const groups = state.groups.length ? state.groups : [{ name: "", label: "全部分组", accountCount: state.accounts.length, attentionCount: 0 }];
  const groupOptions = groups.filter(function (group) { return group.name; });
  const accountOptions = visibleAccounts();
  const content = state.activeView === "mail"
    ? renderMailWorkspace()
    : state.activeView === "sync"
      ? renderSyncWorkspace(disabled)
      : renderAccountManagement(state.drafts.account, state.ui.accountFormOpen ? " open" : "", state.ui.bulkFormOpen ? " open" : "", disabled);
  return ""
    + "<div class=\"app-shell\">"
    + renderSidebar(groups)
    + "<section class=\"app-main\">"
    + renderTopbar(groupOptions, accountOptions, disabled)
    + content
    + "</section>"
    + "</div>";
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
    + "<div class=\"modal-backdrop\"><div class=\"modal-card\"><h3>" + escapeHtml(modal.title || "确认操作") + "</h3><p>" + escapeHtml(modal.description || "") + "</p>" + input + "<div class=\"actions\"><button class=\"btn text\" data-modal-cancel>取消</button><button class=\"btn " + (modal.danger ? "danger" : "primary") + "\" data-modal-confirm>" + escapeHtml(modal.confirmText || "确认") + "</button></div></div></div>";
}

function render() {
  captureUiState();
  const app = document.getElementById("app");
  if (state.checking) {
    app.innerHTML = "<main class=\"login-shell\"><section class=\"login-panel\"><div class=\"login-brand\"><div class=\"brand-mark\">M</div><div><h1>MicMail</h1><p>正在检查登录状态</p></div></div><p class=\"muted\">请稍候，正在连接 Worker API。</p></section></main>" + renderToast();
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
  const filterKeyword = document.getElementById("filter-keyword");
  if (filterKeyword) filterKeyword.oninput = debounceFilterRefresh;
  const filterGroup = document.getElementById("filter-group");
  if (filterGroup) filterGroup.onchange = function () {
    const accountSelect = document.getElementById("filter-account");
    if (accountSelect) accountSelect.value = "";
    applyFilterControls(true).catch(function (error) { showToast(error.message, "error"); });
  };
  const filterAccount = document.getElementById("filter-account");
  if (filterAccount) filterAccount.onchange = function () {
    applyFilterControls(false).catch(function (error) { showToast(error.message, "error"); });
  };
  const filterFolder = document.getElementById("filter-folder");
  if (filterFolder) filterFolder.onchange = function () {
    applyFilterControls(false).catch(function (error) { showToast(error.message, "error"); });
  };
  const quickSync = document.querySelector("[data-quick-sync-account]");
  if (quickSync) quickSync.onclick = handleQuickSyncAccount;
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
      state.activeView = "mail";
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
      if (event.target.closest("button") || event.target.closest("a")) return;
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
