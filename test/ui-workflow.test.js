import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { APP_HTML } from "../src/ui.js";
import { APP_SCRIPT } from "../src/ui/app.js";

function loadUiHelpers() {
  const script = APP_SCRIPT.replace(
    /\nbootstrap\(\);\s*$/,
    "\nglobalThis.__ui = { state, dashboardParams, syncStatusInfo, syncRunStatusInfo, renderDetail, applyDashboardData };",
  );
  const context = {
    globalThis: {},
    URLSearchParams,
  };
  vm.runInNewContext(script, context);
  return context.globalThis.__ui;
}

test("APP_HTML exposes the expected shell without a build step", () => {
  assert.match(APP_HTML, /<html lang="zh-CN">/);
  assert.match(APP_HTML, /<meta name="app-version" content="3\.0\.0" \/>/);
  assert.match(APP_HTML, /<div id="app"><\/div>/);
  assert.match(APP_HTML, /bootstrap\(\);/);
});

test("dashboardParams prefers selected account over group and keeps pagination", () => {
  const ui = loadUiHelpers();
  ui.state.filters = { accountId: "7", folder: "inbox", group: "默认分组", keyword: "code" };
  ui.state.pagination = { page: 3, pageSize: 25 };

  const params = ui.dashboardParams();

  assert.equal(params.get("accountId"), "7");
  assert.equal(params.has("group"), false);
  assert.equal(params.get("folder"), "inbox");
  assert.equal(params.get("keyword"), "code");
  assert.equal(params.get("page"), "3");
  assert.equal(params.get("pageSize"), "25");
});

test("sync status helpers map raw backend states to readable labels", () => {
  const ui = loadUiHelpers();

  assert.equal(ui.syncStatusInfo({ last_sync_status: "idle" }).label, "未同步");
  assert.equal(ui.syncStatusInfo({ last_sync_status: "pending_retry" }).label, "等待重试");
  assert.equal(ui.syncRunStatusInfo("queued").label, "已排队");
  assert.equal(ui.syncRunStatusInfo("error").label, "失败");
});

test("renderDetail shows a loading state instead of stale message content", () => {
  const ui = loadUiHelpers();
  ui.state.detail = { subject: "旧邮件" };
  ui.state.detailLoadingId = 42;

  const markup = ui.renderDetail();

  assert.match(markup, /正在加载邮件/);
  assert.doesNotMatch(markup, /旧邮件/);
});

test("applyDashboardData clamps an out-of-range mail page and requests a refetch", () => {
  const ui = loadUiHelpers();
  ui.state.pagination = { page: 5, pageSize: 25 };

  const changed = ui.applyDashboardData({
    accounts: [],
    groups: [],
    messages: { page: 5, pageSize: 25, total: 30, items: [] },
    sync: {},
  });

  assert.equal(changed, true);
  assert.equal(ui.state.pagination.page, 2);
});
