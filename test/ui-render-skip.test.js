import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { APP_SCRIPT } from "../src/ui/app.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseDashboard() {
  return {
    accounts: [
      {
        id: 1,
        email: "a@example.com",
        group_name: "默认分组",
        status: "active",
        last_sync_status: "success",
        last_sync_error: null,
        last_sync_at: "2026-06-01T00:00:00Z",
        client_id: "client-1",
        updated_at: "2026-06-01T00:00:00Z",
      },
    ],
    groups: [
      { name: "默认分组", label: "默认分组", accountCount: 1, attentionCount: 0 },
    ],
    messages: {
      page: 1,
      pageSize: 25,
      total: 2,
      items: [
        {
          id: 11,
          subject: "你好",
          preview: "正文预览",
          from_name: "发件人",
          from_address: "sender@example.com",
          account_email: "a@example.com",
          folder: "inbox",
          received_at: "2026-06-01T01:00:00Z",
          is_read: 0,
        },
        {
          id: 12,
          subject: "第二封",
          preview: "另一封预览",
          from_name: "发件人",
          from_address: "sender@example.com",
          account_email: "a@example.com",
          folder: "inbox",
          received_at: "2026-06-01T00:30:00Z",
          is_read: 1,
        },
      ],
    },
    sync: { latestSyncAt: "2026-06-01T00:00:00Z", activeCount: 0, attentionCount: 0 },
  };
}

function createFakeDocument() {
  let appWrites = 0;
  let frameWrites = 0;
  const appElement = {
    _html: "",
    get innerHTML() {
      return this._html;
    },
    set innerHTML(value) {
      this._html = String(value);
      appWrites += 1;
    },
  };
  const frameElement = {
    _srcdoc: "",
    get srcdoc() {
      return this._srcdoc;
    },
    set srcdoc(value) {
      this._srcdoc = String(value);
      frameWrites += 1;
    },
  };
  const doc = {
    activeElement: null,
    visibilityState: "visible",
    getElementById(id) {
      if (id === "app") return appElement;
      if (id === "mail-frame") return frameElement;
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    contains() {
      return false;
    },
  };
  return {
    document: doc,
    appWrites: () => appWrites,
    frameWrites: () => frameWrites,
  };
}

function createUi() {
  const fake = createFakeDocument();
  const routes = {
    dashboard: () => {
      throw new Error("dashboard route not configured");
    },
    detail: (id) => ({
      id,
      subject: "你好",
      from_name: "发件人",
      from_address: "sender@example.com",
      account_email: "a@example.com",
      received_at: "2026-06-01T01:00:00Z",
      is_read: 0,
      body_content_type: "text",
      body_text: "hello world",
      attachments: [],
      web_link: "",
    }),
    syncRuns: () => ({ items: [] }),
  };
  async function fetchStub(path) {
    let payload;
    if (path.startsWith("/api/dashboard")) payload = routes.dashboard();
    else if (path.startsWith("/api/messages/")) payload = routes.detail(Number(decodeURIComponent(path.split("/").pop())));
    else if (path.startsWith("/api/sync/runs")) payload = routes.syncRuns();
    else throw new Error("unexpected fetch: " + path);
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: clone(payload) }),
    };
  }
  const script = APP_SCRIPT.replace(
    /\nbootstrap\(\);\s*$/,
    "\nglobalThis.__ui = { state, render, refreshDashboard, mountMessageFrame, computeRenderFingerprint };",
  );
  const context = {
    globalThis: {},
    URLSearchParams,
    URL,
    document: fake.document,
    window: { location: { origin: "https://example.com" } },
    fetch: fetchStub,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    console: { log() {}, warn() {}, error() {} },
  };
  vm.runInNewContext(script, context);
  const ui = context.globalThis.__ui;
  ui.state.checking = false;
  ui.state.authenticated = true;
  return { ui, routes, appWrites: fake.appWrites, frameWrites: fake.frameWrites };
}

test("silent refresh with unchanged data skips re-render and iframe remount", async () => {
  const { ui, routes, appWrites, frameWrites } = createUi();
  routes.dashboard = () => baseDashboard();

  await ui.refreshDashboard({ skipAutoSync: true });
  const writesAfterFirst = appWrites();
  const frameAfterFirst = frameWrites();
  assert.ok(writesAfterFirst > 0, "initial refresh must render");
  assert.ok(frameAfterFirst > 0, "initial refresh must mount the mail frame");
  assert.equal(ui.state.selectedMessage, 11);

  await ui.refreshDashboard({ skipAutoSync: true, silent: true });

  assert.equal(appWrites(), writesAfterFirst, "identical silent refresh must not rebuild innerHTML");
  assert.equal(frameWrites(), frameAfterFirst, "identical silent refresh must not reset iframe srcdoc");
});

test("silent refresh re-renders when a new message arrives", async () => {
  const { ui, routes, appWrites } = createUi();
  routes.dashboard = () => baseDashboard();
  await ui.refreshDashboard({ skipAutoSync: true });
  const writesBefore = appWrites();

  const changed = baseDashboard();
  changed.messages.items.unshift({
    id: 13,
    subject: "新邮件",
    preview: "新内容",
    from_name: "发件人",
    from_address: "sender@example.com",
    account_email: "a@example.com",
    folder: "inbox",
    received_at: "2026-06-01T02:00:00Z",
    is_read: 0,
  });
  changed.messages.total = 3;
  routes.dashboard = () => changed;

  await ui.refreshDashboard({ skipAutoSync: true, silent: true });

  assert.ok(appWrites() > writesBefore, "new message id must trigger a re-render");
});

test("silent refresh re-renders when an account sync status changes", async () => {
  const { ui, routes, appWrites } = createUi();
  routes.dashboard = () => baseDashboard();
  await ui.refreshDashboard({ skipAutoSync: true });
  const writesBefore = appWrites();

  const changed = baseDashboard();
  changed.accounts[0].last_sync_status = "error";
  changed.accounts[0].last_sync_error = "invalid_grant: refresh token expired";
  routes.dashboard = () => changed;

  await ui.refreshDashboard({ skipAutoSync: true, silent: true });

  assert.ok(appWrites() > writesBefore, "account status change must trigger a re-render");
});

test("silent refresh re-renders when total count changes", async () => {
  const { ui, routes, appWrites } = createUi();
  routes.dashboard = () => baseDashboard();
  await ui.refreshDashboard({ skipAutoSync: true });
  const writesBefore = appWrites();

  const changed = baseDashboard();
  changed.messages.total = 7;
  routes.dashboard = () => changed;

  await ui.refreshDashboard({ skipAutoSync: true, silent: true });

  assert.ok(appWrites() > writesBefore, "total change must trigger a re-render");
  assert.equal(ui.state.stats.total, 7);
});

test("silent refresh re-renders and clears selection when the list becomes empty", async () => {
  const { ui, routes, appWrites } = createUi();
  routes.dashboard = () => baseDashboard();
  await ui.refreshDashboard({ skipAutoSync: true });
  const writesBefore = appWrites();

  const emptied = baseDashboard();
  emptied.messages.items = [];
  emptied.messages.total = 0;
  routes.dashboard = () => emptied;

  await ui.refreshDashboard({ skipAutoSync: true, silent: true });

  assert.ok(appWrites() > writesBefore, "emptied list must trigger a re-render");
  assert.equal(ui.state.selectedMessage, null);
  assert.equal(ui.state.detail, null);
});

test("non-silent refresh always renders even with identical data", async () => {
  const { ui, routes, appWrites } = createUi();
  routes.dashboard = () => baseDashboard();

  await ui.refreshDashboard({ skipAutoSync: true });
  const writesAfterFirst = appWrites();

  await ui.refreshDashboard({ skipAutoSync: true });

  assert.ok(appWrites() > writesAfterFirst, "non-silent refresh must render unconditionally");
});

test("the very first silent refresh renders because no fingerprint was recorded", async () => {
  const { ui, routes, appWrites } = createUi();
  routes.dashboard = () => baseDashboard();

  await ui.refreshDashboard({ skipAutoSync: true, silent: true });

  assert.ok(appWrites() > 0, "first silent refresh without a prior render must still render");
});

test("form drafts are excluded from the fingerprint so typing never forces a rebuild", async () => {
  const { ui, routes, appWrites } = createUi();
  routes.dashboard = () => baseDashboard();
  await ui.refreshDashboard({ skipAutoSync: true });
  const writesBefore = appWrites();

  ui.state.drafts.bulkInput = "用户正在粘贴的批量文本";
  ui.state.drafts.account.email = "typing@example.com";

  await ui.refreshDashboard({ skipAutoSync: true, silent: true });

  assert.equal(appWrites(), writesBefore, "draft edits alone must not trigger a silent re-render");
});

test("fingerprint comparison is value-based, not reference-based", async () => {
  const { ui, routes } = createUi();
  routes.dashboard = () => baseDashboard();
  await ui.refreshDashboard({ skipAutoSync: true });

  const first = ui.computeRenderFingerprint();
  ui.state.accounts = clone(ui.state.accounts);
  ui.state.messages = clone(ui.state.messages);
  ui.state.groups = clone(ui.state.groups);
  ui.state.sync = clone(ui.state.sync);
  assert.equal(ui.computeRenderFingerprint(), first);

  ui.state.accounts[0].last_sync_status = "error";
  assert.notEqual(ui.computeRenderFingerprint(), first);
});

test("mountMessageFrame skips duplicate mounts but remounts after a real render", () => {
  const { ui, frameWrites } = createUi();
  ui.state.detail = { id: 5, body_content_type: "html", body_html: "<p>正文</p>" };
  ui.state.selectedMessage = 5;

  ui.mountMessageFrame();
  assert.equal(frameWrites(), 1, "first mount must set srcdoc");

  ui.mountMessageFrame();
  assert.equal(frameWrites(), 1, "same message must not reset srcdoc");

  ui.render();
  assert.equal(frameWrites(), 2, "render rebuilds the iframe element, so it must remount");

  ui.mountMessageFrame();
  assert.equal(frameWrites(), 2, "redundant mount after render must be skipped");

  ui.state.detail = { id: 6, body_content_type: "text", body_text: "新正文" };
  ui.mountMessageFrame();
  assert.equal(frameWrites(), 3, "a different message id must remount the frame");
});
