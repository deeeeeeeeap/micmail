import { minutesAgoIso } from "./util.js";

/**
 * Pure decision helper for login throttling.
 * `row` is the persisted throttle row for one client IP (or null/undefined):
 *   { window_started_at, failure_count }
 */
export function evaluateLoginThrottle(row, now, options) {
  const maxFailures = options.maxFailures;
  const windowMinutes = options.windowMinutes;
  if (!row) {
    return { blocked: false, retryAfterMinutes: 0 };
  }

  const windowStart = Date.parse(row.window_started_at || "");
  if (Number.isNaN(windowStart)) {
    return { blocked: false, retryAfterMinutes: 0 };
  }

  const windowAgeMinutes = (now.getTime() - windowStart) / 60000;
  if (windowAgeMinutes >= windowMinutes) {
    return { blocked: false, retryAfterMinutes: 0 };
  }

  if (Number(row.failure_count || 0) >= maxFailures) {
    return {
      blocked: true,
      retryAfterMinutes: Math.max(1, Math.ceil(windowMinutes - windowAgeMinutes)),
    };
  }

  return { blocked: false, retryAfterMinutes: 0 };
}

export function loginThrottleWindowCutoff(now, windowMinutes) {
  return minutesAgoIso(now, windowMinutes);
}
