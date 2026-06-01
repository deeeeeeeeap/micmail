import assert from "node:assert/strict";
import test from "node:test";
import {
  makeAttachmentContentDisposition,
  redactSensitiveText,
  redactSensitiveValue,
  safeHeaderFilename,
} from "../src/lib/safety.js";

test("safeHeaderFilename removes header-breaking characters", () => {
  assert.equal(safeHeaderFilename("a\r\nSet-Cookie: x=y\".txt"), "aSet-Cookie: x=y.txt");
});

test("makeAttachmentContentDisposition emits safe ASCII fallback and UTF-8 filename", () => {
  const header = makeAttachmentContentDisposition("验证码.txt");
  assert.match(header, /^attachment; filename="___.txt"; filename\*=UTF-8''/);
  assert.match(header, /%E9%AA%8C%E8%AF%81%E7%A0%81\.txt$/);
});

test("redactSensitiveText redacts bearer, JWT, and Microsoft refresh-token shaped values", () => {
  const text = [
    "Bearer abcdefghijklmnopqrstuvwxyz0123456789",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnopqrstuvwxyz012345.abcdefghijklmnopqrstuvwxyz012345",
    "M.C509_BAY.0.U.-" + "A".repeat(90),
  ].join(" ");
  const redacted = redactSensitiveText(text);
  assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuvwxyz0123456789/);
  assert.doesNotMatch(redacted, /M\.C509_BAY/);
  assert.match(redacted, /Bearer \*\*\*/);
});

test("redactSensitiveValue redacts sensitive object keys recursively", () => {
  assert.deepEqual(redactSensitiveValue({
    email: "user@example.com",
    nested: { refreshToken: "secret-value" },
  }), {
    email: "user@example.com",
    nested: { refreshToken: "***" },
  });
});
