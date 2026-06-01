import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { APP_SCRIPT } from "../src/ui/app.js";

function loadBulkParser() {
  const script = APP_SCRIPT.replace(/\nbootstrap\(\);\s*$/, "\nglobalThis.__parseBulkAccounts = parseBulkAccounts;");
  const context = { globalThis: {} };
  vm.runInNewContext(script, context);
  return context.globalThis.__parseBulkAccounts;
}

test("parseBulkAccounts keeps existing dash-delimited format", () => {
  const parseBulkAccounts = loadBulkParser();
  assert.deepEqual(toPlain(parseBulkAccounts("a@example.com----pw----client-id----refresh-token----openai")), [{
    email: "a@example.com",
    clientId: "client-id",
    refreshToken: "refresh-token",
    groupName: "openai",
  }]);
});

test("parseBulkAccounts supports JSON Lines when refresh token may contain delimiters", () => {
  const parseBulkAccounts = loadBulkParser();
  assert.deepEqual(toPlain(parseBulkAccounts(JSON.stringify({
    email: "a@example.com",
    clientId: "client-id",
    refreshToken: "token----with----delimiter",
    groupName: "openai",
  }))), [{
    email: "a@example.com",
    clientId: "client-id",
    refreshToken: "token----with----delimiter",
    groupName: "openai",
  }]);
});

test("parseBulkAccounts refuses ambiguous dash-delimited rows", () => {
  const parseBulkAccounts = loadBulkParser();
  assert.throws(
    () => parseBulkAccounts("a@example.com----pw----client-id----token----with----delimiter"),
    /JSON Lines/,
  );
});

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}
