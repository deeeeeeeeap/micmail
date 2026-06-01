const CONTROL_HEADER_CHARS = /[\x00-\x1F\x7F]/g;
const TOKEN_KEYS = /token|secret|password|cookie|authorization/i;

export function safeHeaderFilename(value, fallback = "attachment.bin") {
  const cleaned = String(value || fallback)
    .replace(CONTROL_HEADER_CHARS, "")
    .replace(/["\\]/g, "")
    .trim()
    .slice(0, 200);
  return cleaned || fallback;
}

export function makeAttachmentContentDisposition(filename) {
  const safeName = safeHeaderFilename(filename);
  const asciiName = safeName.replace(/[^\x20-\x7E]/g, "_") || "attachment.bin";
  return "attachment; filename=\"" + asciiName + "\"; filename*=UTF-8''" + encodeRfc5987Value(safeName);
}

export function redactSensitiveText(value) {
  return String(value || "")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "***")
    .replace(/\bM\.C[A-Za-z0-9_.*!$-]{80,}\b/g, "***")
    .replace(/((?:access|refresh|id)_?token["'\s:=]+)["']?[^"',\s;}]+/gi, "$1***");
}

export function redactSensitiveValue(value, key = "") {
  if (TOKEN_KEYS.test(key)) return "***";
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactSensitiveValue(entryValue, entryKey),
    ]));
  }
  return value;
}

function encodeRfc5987Value(value) {
  return encodeURIComponent(value)
    .replace(/['()]/g, (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase())
    .replace(/\*/g, "%2A");
}
