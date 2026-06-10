import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeBodyByHeaders,
  decodeMimeWords,
  decodeQuotedPrintable,
  extractEmailBody,
  htmlToText,
  parseEmailHeaders,
  parseRawEmailToGraphLikeItem,
} from "../src/lib/mime.js";

test("parseEmailHeaders merges folded continuation lines and lowercases keys", () => {
  const headers = parseEmailHeaders(
    "Subject: first part\r\n second part\r\n\tthird part\r\nFROM: Alice <alice@example.com>\r\nX-Mixed-CASE: value",
  );

  assert.equal(headers.subject, "first part second part third part");
  assert.equal(headers.from, "Alice <alice@example.com>");
  assert.equal(headers["x-mixed-case"], "value");
  assert.equal("Subject" in headers, false);
});

test("decodeMimeWords decodes B and Q encoded words", () => {
  assert.equal(decodeMimeWords("=?UTF-8?B?5L2g5aW9?= world"), "你好 world");
  assert.equal(decodeMimeWords("=?UTF-8?Q?caf=C3=A9_au_lait?="), "café au lait");
  assert.equal(decodeMimeWords("=?utf-8?q?hello_world?="), "hello world");
});

test("decodeQuotedPrintable decodes UTF-8 hex escapes and removes soft line breaks", () => {
  assert.equal(decodeQuotedPrintable("=E4=BD=A0=E5=A5=BD"), "你好");
  assert.equal(decodeQuotedPrintable("first=\r\nsecond"), "firstsecond");
  assert.equal(decodeQuotedPrintable("first=\nsecond"), "firstsecond");
});

test("extractEmailBody prefers the html part of a multipart/alternative message", () => {
  const rawHeaders = 'Content-Type: multipart/alternative; boundary="BOUND1"';
  const rawBody =
    "--BOUND1\r\n" +
    "Content-Type: text/plain; charset=utf-8\r\n" +
    "\r\n" +
    "plain text body\r\n" +
    "--BOUND1\r\n" +
    "Content-Type: text/html; charset=utf-8\r\n" +
    "\r\n" +
    "<p>html body</p>\r\n" +
    "--BOUND1--\r\n";

  const body = extractEmailBody(rawHeaders, rawBody);

  assert.equal(body.contentType, "html");
  assert.equal(body.content, "<p>html body</p>");
});

test("extractEmailBody recurses into nested multiparts with different boundaries", () => {
  const rawHeaders = 'Content-Type: multipart/mixed; boundary="OUTER"';
  const rawBody =
    "--OUTER\r\n" +
    'Content-Type: multipart/alternative; boundary="INNER"\r\n' +
    "\r\n" +
    "--INNER\r\n" +
    "Content-Type: text/plain; charset=utf-8\r\n" +
    "\r\n" +
    "inner plain\r\n" +
    "--INNER\r\n" +
    "Content-Type: text/html; charset=utf-8\r\n" +
    "\r\n" +
    "<div>inner html</div>\r\n" +
    "--INNER--\r\n" +
    "--OUTER--\r\n";

  const body = extractEmailBody(rawHeaders, rawBody);

  assert.equal(body.contentType, "html");
  assert.equal(body.content, "<div>inner html</div>");
});

test("decodeBodyByHeaders decodes base64 bodies using the declared gb2312 charset", () => {
  const rawHeaders =
    "Content-Type: text/plain; charset=gb2312\r\nContent-Transfer-Encoding: base64";
  // GBK bytes for "你好" are C4 E3 BA C3, base64 "xOO6ww==".
  assert.equal(decodeBodyByHeaders(rawHeaders, "xOO6ww=="), "你好");
});

test("htmlToText strips style/script/tags, decodes entities, and collapses whitespace", () => {
  const html =
    "<html><head><style>.a { color: red }</style>" +
    '<script>var markup = "<b>ignored</b>";</script></head>' +
    "<body><h1>Title</h1><p>Hello&nbsp;&amp;   world</p>" +
    "<p>&lt;tag&gt; &#39;quoted&#39; &quot;q2&quot;</p></body></html>";

  assert.equal(htmlToText(html), "Title Hello & world <tag> 'quoted' \"q2\"");
});

test("parseRawEmailToGraphLikeItem builds a Graph-like item from a raw plain-text email", () => {
  const rawMessage =
    'From: "Alice" <alice@example.com>\r\n' +
    "Subject: =?UTF-8?B?5L2g5aW9?=\r\n" +
    "Date: Mon, 05 Jan 2026 12:00:00 +0000\r\n" +
    "Message-ID: <msg-1@example.com>\r\n" +
    "\r\n" +
    "hello body";

  const item = parseRawEmailToGraphLikeItem(rawMessage, "owner@example.com", "inbox");

  assert.equal(item.id, "imap:<msg-1@example.com>");
  assert.equal(item.internetMessageId, "<msg-1@example.com>");
  assert.equal(item.subject, "你好");
  assert.equal(item.from.emailAddress.address, "alice@example.com");
  assert.equal(item.from.emailAddress.name, "Alice");
  assert.equal(item.receivedDateTime, "2026-01-05T12:00:00.000Z");
  assert.equal(item.isRead, true);
  assert.equal(item.body.contentType, "text");
  assert.match(item.body.content, /^<pre [^>]*>hello body<\/pre>$/);
});
