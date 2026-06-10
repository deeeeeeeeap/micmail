import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { APP_SCRIPT } from "../src/ui/app.js";
import { isTransientSyncError as backendIsTransientSyncError } from "../src/lib/sync-policy.js";
import { escapeHtml as backendEscapeHtml } from "../src/lib/mime.js";

function loadUiHelpers() {
  const script = APP_SCRIPT.replace(
    /\nbootstrap\(\);\s*$/,
    "\nglobalThis.__ui = { isTransientSyncError, escapeHtml };",
  );
  const context = {
    globalThis: {},
    URLSearchParams,
  };
  vm.runInNewContext(script, context);
  return context.globalThis.__ui;
}

test("frontend helpers can be extracted from APP_SCRIPT", () => {
  const ui = loadUiHelpers();
  assert.equal(typeof ui.isTransientSyncError, "function");
  assert.equal(typeof ui.escapeHtml, "function");
});

test("frontend isTransientSyncError matches the backend for string inputs", () => {
  const ui = loadUiHelpers();
  const samples = [
    "429 too many requests",
    "rate limit",
    "sync budget reached",
    "invalid_grant",
    "imap response did not complete",
    "",
  ];

  for (const sample of samples) {
    assert.equal(
      ui.isTransientSyncError(sample),
      backendIsTransientSyncError(sample),
      "isTransientSyncError parity for " + JSON.stringify(sample),
    );
  }

  assert.equal(ui.isTransientSyncError("invalid_grant"), false);
  assert.equal(ui.isTransientSyncError("sync budget reached"), true);
});

test("frontend escapeHtml matches the backend escapeHtml", () => {
  const ui = loadUiHelpers();
  const samples = ['<a href="x">&\'</a>', "", "中文 <b>&amp;</b>"];

  for (const sample of samples) {
    assert.equal(
      ui.escapeHtml(sample),
      backendEscapeHtml(sample),
      "escapeHtml parity for " + JSON.stringify(sample),
    );
  }

  assert.equal(
    backendEscapeHtml('<a href="x">&\'</a>'),
    "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
  );
});
