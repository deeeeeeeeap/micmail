import { redactSensitiveText, redactSensitiveValue } from "./safety.js";

const encoder = new TextEncoder();

export function clampInt(value, fallback, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function minutesSince(value, now = new Date()) {
  const time = Date.parse(value || "");
  if (Number.isNaN(time)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, (now.getTime() - time) / 60000);
}

export function minutesAgoIso(now, minutes) {
  return new Date(now.getTime() - minutes * 60000).toISOString();
}

export function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600 * 1000);
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

export function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(text) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function constantTimeStringEquals(actual, expected) {
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const actualBytes = new Uint8Array(actualHash);
  const expectedBytes = new Uint8Array(expectedHash);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(actualBytes, expectedBytes);
  }
  let diff = actualBytes.length ^ expectedBytes.length;
  for (let index = 0; index < actualBytes.length; index += 1) {
    diff |= actualBytes[index] ^ expectedBytes[index];
  }
  return diff === 0;
}

export async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(runners);
  return results;
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function maskEmail(email) {
  const value = String(email || "");
  const at = value.indexOf("@");
  if (at <= 0) return value ? "***" : "";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return local.slice(0, Math.min(2, local.length)) + "***@" + domain;
}

export function maskLogEmails(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((item) => maskLogEmails(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        maskLogEmails(entryValue, entryKey),
      ]),
    );
  }
  if (typeof value === "string" && key.toLowerCase().includes("email")) {
    return maskEmail(value);
  }
  return value;
}

export function summarizeUpstreamError(error) {
  const message = error && error.message ? String(error.message) : String(error);
  return redactSensitiveText(message).replace(/\s+/g, " ").trim().slice(0, 600);
}

export function logInfo(event, detail) {
  console.log(
    JSON.stringify({
      level: "info",
      event,
      ...maskLogEmails(redactSensitiveValue(detail)),
      at: new Date().toISOString(),
    }),
  );
}
