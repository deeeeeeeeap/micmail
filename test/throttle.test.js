import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLoginThrottle } from "../src/lib/throttle.js";

const NOW = new Date("2026-06-10T12:00:00.000Z");
const OPTIONS = { maxFailures: 5, windowMinutes: 15 };

function minutesAgoIso(minutes) {
  return new Date(NOW.getTime() - minutes * 60000).toISOString();
}

test("evaluateLoginThrottle does not block when there is no throttle row", () => {
  assert.deepEqual(evaluateLoginThrottle(null, NOW, OPTIONS), {
    blocked: false,
    retryAfterMinutes: 0,
  });
});

test("evaluateLoginThrottle blocks when failures reach the limit inside the window", () => {
  const result = evaluateLoginThrottle(
    { window_started_at: minutesAgoIso(5), failure_count: 5 },
    NOW,
    OPTIONS,
  );

  assert.equal(result.blocked, true);
  assert.ok(result.retryAfterMinutes >= 1);
  assert.equal(result.retryAfterMinutes, 10);
});

test("evaluateLoginThrottle does not block once the window has expired", () => {
  const result = evaluateLoginThrottle(
    { window_started_at: minutesAgoIso(20), failure_count: 99 },
    NOW,
    OPTIONS,
  );

  assert.deepEqual(result, { blocked: false, retryAfterMinutes: 0 });
});

test("evaluateLoginThrottle does not block below the failure threshold", () => {
  const result = evaluateLoginThrottle(
    { window_started_at: minutesAgoIso(5), failure_count: 4 },
    NOW,
    OPTIONS,
  );

  assert.deepEqual(result, { blocked: false, retryAfterMinutes: 0 });
});

test("evaluateLoginThrottle ignores rows with an unparseable window start", () => {
  assert.deepEqual(
    evaluateLoginThrottle({ window_started_at: "not-a-date", failure_count: 99 }, NOW, OPTIONS),
    { blocked: false, retryAfterMinutes: 0 },
  );
  assert.deepEqual(evaluateLoginThrottle({ failure_count: 99 }, NOW, OPTIONS), {
    blocked: false,
    retryAfterMinutes: 0,
  });
});
