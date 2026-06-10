import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/lib/http.js";
import {
  COMPOSITE_MESSAGE_UPSERT_SQL,
  LEGACY_MESSAGE_UPSERT_SQL,
  buildInPlaceholders,
  buildMessageUpsertParams,
  buildMessagesPayload,
  buildMessagesQueryPlan,
  extractBatchReturnedIds,
  messageUpsertSqlForMode,
} from "../src/lib/db-batch.js";

const NOW = new Date("2026-06-10T12:00:00.000Z");

function makeUrl(query = "") {
  return new URL("https://example.com/api/messages" + query);
}

test("messageUpsertSqlForMode picks the conflict target per key mode", () => {
  assert.equal(messageUpsertSqlForMode("composite"), COMPOSITE_MESSAGE_UPSERT_SQL);
  assert.equal(messageUpsertSqlForMode("legacy"), LEGACY_MESSAGE_UPSERT_SQL);
  assert.equal(messageUpsertSqlForMode(undefined), LEGACY_MESSAGE_UPSERT_SQL);

  assert.match(COMPOSITE_MESSAGE_UPSERT_SQL, /ON CONFLICT\(account_id, graph_message_id\)/);
  assert.match(LEGACY_MESSAGE_UPSERT_SQL, /ON CONFLICT\(graph_message_id\)/);
  assert.match(COMPOSITE_MESSAGE_UPSERT_SQL, /RETURNING id$/);
  assert.match(LEGACY_MESSAGE_UPSERT_SQL, /RETURNING id$/);
});

test("buildMessageUpsertParams maps a full Graph item in column order", () => {
  const item = {
    id: "graph-1",
    internetMessageId: "<mid@example.com>",
    subject: "Hello",
    from: { emailAddress: { name: "Alice", address: "alice@example.com" } },
    receivedDateTime: "2026-06-01T00:00:00.000Z",
    isRead: true,
    hasAttachments: true,
    body: { contentType: "html", content: "<p>Hi &amp; bye</p>" },
    webLink: "https://outlook.example.com/1",
  };

  const params = buildMessageUpsertParams(7, "inbox", item, { now: NOW, retentionDays: 90 });

  assert.equal(params.length, 17);
  assert.deepEqual(params, [
    7,
    "graph-1",
    "<mid@example.com>",
    "inbox",
    "Hello",
    "Alice",
    "alice@example.com",
    "2026-06-01T00:00:00.000Z",
    1,
    1,
    "html",
    "<p>Hi &amp; bye</p>",
    "Hi & bye",
    "https://outlook.example.com/1",
    NOW.toISOString(),
    new Date("2026-08-30T00:00:00.000Z").toISOString(),
    NOW.toISOString(),
  ]);
});

test("buildMessageUpsertParams applies defaults for sparse items", () => {
  const params = buildMessageUpsertParams(3, "junkemail", { id: "graph-2" }, {
    now: NOW,
    retentionDays: 1,
  });

  assert.equal(params[1], "graph-2");
  assert.equal(params[2], null);
  assert.equal(params[4], "");
  assert.equal(params[5], "");
  assert.equal(params[6], "");
  assert.equal(params[7], NOW.toISOString());
  assert.equal(params[8], 0);
  assert.equal(params[9], 0);
  assert.equal(params[10], null);
  assert.equal(params[11], "");
  assert.equal(params[12], "");
  assert.equal(params[13], null);
  assert.equal(params[15], new Date("2026-06-11T12:00:00.000Z").toISOString());
});

test("extractBatchReturnedIds reads RETURNING rows in batch order", () => {
  const ids = extractBatchReturnedIds([
    { results: [{ id: 5 }] },
    { results: [] },
    { results: [{ id: 9 }] },
    {},
  ]);
  assert.deepEqual(ids, [5, null, 9, null]);
  assert.deepEqual(extractBatchReturnedIds(undefined), []);
});

test("buildInPlaceholders renders an IN() binding list", () => {
  assert.equal(buildInPlaceholders(1), "?");
  assert.equal(buildInPlaceholders(3), "?, ?, ?");
  assert.equal(buildInPlaceholders(0), "");
});

test("buildMessagesQueryPlan uses message_counters when no keyword/date filter", () => {
  const plan = buildMessagesQueryPlan(makeUrl("?accountId=4&folder=inbox&group=team"));

  assert.equal(plan.page, 1);
  assert.equal(plan.pageSize, 25);
  assert.match(plan.total.sql, /FROM message_counters c/);
  assert.deepEqual(plan.total.params, [4, "inbox", "team"]);
  assert.match(plan.items.sql, /LIMIT \? OFFSET \?/);
  assert.deepEqual(plan.items.params, [4, "inbox", "team", 25, 0]);
});

test("buildMessagesQueryPlan falls back to COUNT(*) for keyword and date filters", () => {
  const plan = buildMessagesQueryPlan(
    makeUrl("?keyword=report&searchBody=1&dateFrom=2026-01-01&page=3&pageSize=10"),
  );

  assert.match(plan.total.sql, /SELECT COUNT\(\*\) AS total/);
  assert.equal(plan.total.params.length, 5);
  assert.deepEqual(plan.total.params.slice(0, 4), [
    "%report%",
    "%report%",
    "%report%",
    "%report%",
  ]);
  assert.equal(plan.total.params[4], "2026-01-01");
  assert.deepEqual(plan.items.params, [...plan.total.params, 10, 20]);
});

test("buildMessagesQueryPlan keeps keyword search without body to three LIKE params", () => {
  const plan = buildMessagesQueryPlan(makeUrl("?keyword=x"));
  assert.deepEqual(plan.total.params, ["%x%", "%x%", "%x%"]);
  assert.match(plan.total.sql, /m\.subject LIKE \? OR m\.from_name LIKE \? OR m\.from_address LIKE \?/);
  assert.doesNotMatch(plan.total.sql, /body_text LIKE/);
});

test("buildMessagesQueryPlan rejects an invalid accountId with HTTP 400", () => {
  assert.throws(
    () => buildMessagesQueryPlan(makeUrl("?accountId=abc")),
    (error) => error instanceof HttpError && error.status === 400,
  );
  assert.throws(
    () => buildMessagesQueryPlan(makeUrl("?accountId=0")),
    (error) => error instanceof HttpError && error.status === 400,
  );
});

test("buildMessagesPayload assembles totals and rows from batch results", () => {
  const plan = buildMessagesQueryPlan(makeUrl("?page=2&pageSize=50"));
  const payload = buildMessagesPayload(
    plan,
    { results: [{ total: 123 }] },
    { results: [{ id: 1 }, { id: 2 }] },
  );

  assert.deepEqual(payload, {
    page: 2,
    pageSize: 50,
    total: 123,
    items: [{ id: 1 }, { id: 2 }],
  });

  assert.deepEqual(buildMessagesPayload(plan, { results: [] }, undefined), {
    page: 2,
    pageSize: 50,
    total: 0,
    items: [],
  });
});
