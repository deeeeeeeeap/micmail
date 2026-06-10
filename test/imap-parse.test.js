import assert from "node:assert/strict";
import test from "node:test";
import {
  extractImapLiteralBodies,
  formatImapSearchDate,
  makeXoauth2Token,
  parseImapSearchUids,
} from "../src/lib/imap-parse.js";

test("parseImapSearchUids extracts numeric UIDs from a SEARCH line", () => {
  assert.deepEqual(parseImapSearchUids("* SEARCH 1 5 9\r\n"), [1, 5, 9]);
});

test("parseImapSearchUids merges multiple SEARCH lines", () => {
  assert.deepEqual(
    parseImapSearchUids("* SEARCH 1 2\r\n* SEARCH 3 4\r\nA0001 OK SEARCH completed\r\n"),
    [1, 2, 3, 4],
  );
});

test("parseImapSearchUids returns an empty array for empty SEARCH results", () => {
  assert.deepEqual(parseImapSearchUids("* SEARCH\r\nA0001 OK done\r\n"), []);
  assert.deepEqual(parseImapSearchUids("* SEARCH \r\nA0001 OK done\r\n"), []);
});

test("extractImapLiteralBodies counts literal sizes in bytes, not characters", () => {
  // body1 contains CJK characters: 18 UTF-16 code units but 26 UTF-8 bytes.
  // A character-based implementation desynchronizes on {N} and corrupts both bodies.
  const body1 = "Subject: a\r\n\r\n你好世界";
  const body2 = "Subject: b\r\n\r\nplain ascii body";
  const n1 = new TextEncoder().encode(body1).length;
  const n2 = new TextEncoder().encode(body2).length;
  assert.notEqual(n1, body1.length);

  const response =
    "* 1 FETCH (UID 1 BODY[] {" + n1 + "}\r\n" + body1 + ")\r\n" +
    "* 2 FETCH (UID 2 BODY[] {" + n2 + "}\r\n" + body2 + ")\r\n" +
    "A0001 OK done\r\n";

  const bodies = extractImapLiteralBodies(response);

  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], body1);
  assert.equal(bodies[1], body2);
});

test("extractImapLiteralBodies handles plain ASCII literals", () => {
  const body = "Subject: hi\r\n\r\nhello";
  const response = "* 1 FETCH (UID 7 BODY[] {" + body.length + "}\r\n" + body + ")\r\nA0002 OK done\r\n";
  assert.deepEqual(extractImapLiteralBodies(response), [body]);
});

test("formatImapSearchDate renders UTC dates as d-Mon-yyyy", () => {
  assert.equal(formatImapSearchDate(new Date(Date.UTC(2026, 0, 5))), "5-Jan-2026");
  assert.equal(formatImapSearchDate(new Date(Date.UTC(2025, 11, 31))), "31-Dec-2025");
});

test("makeXoauth2Token base64-encodes the XOAUTH2 SASL structure", () => {
  const token = makeXoauth2Token("user@example.com", "tok-123");
  const decoded = atob(token);

  assert.equal(decoded, "user=user@example.com\x01auth=Bearer tok-123\x01\x01");
  assert.ok(decoded.includes("user=user@example.com\x01auth=Bearer tok-123"));
});
