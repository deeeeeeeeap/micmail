import { base64ToUint8 } from "./crypto.js";
import { MAX_HTML_TEXT_EXTRACTION_BYTES } from "./config.js";

const MAX_MULTIPART_DEPTH = 5;

export function parseRawEmailToGraphLikeItem(rawMessage, accountEmail, folder) {
  const headerEnd = rawMessage.search(/\r?\n\r?\n/);
  const rawHeaders = headerEnd >= 0 ? rawMessage.slice(0, headerEnd) : rawMessage;
  const rawBody = headerEnd >= 0 ? rawMessage.slice(headerEnd).trim() : "";
  const headers = parseEmailHeaders(rawHeaders);
  const from = parseEmailAddress(headers.from || "");
  const date = headers.date ? new Date(headers.date) : new Date();
  const receivedDateTime = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  const subject = decodeMimeWords(headers.subject || "");
  const body = extractEmailBody(rawHeaders, rawBody);
  const messageId = headers["message-id"] || shaLikeId(accountEmail + ":" + folder + ":" + subject + ":" + receivedDateTime);

  return {
    id: "imap:" + messageId,
    internetMessageId: messageId,
    subject,
    from: {
      emailAddress: {
        address: from.address,
        name: from.name,
      },
    },
    receivedDateTime,
    body: {
      contentType: body.contentType,
      content: body.content,
    },
    isRead: true,
    hasAttachments: false,
    webLink: null,
  };
}

export function parseEmailHeaders(rawHeaders) {
  const result = {};
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) {
      continue;
    }
    result[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return result;
}

export function parseEmailAddress(value) {
  const decoded = decodeMimeWords(value);
  const match = decoded.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/"/g, "").trim(),
      address: match[2].trim(),
    };
  }
  return {
    name: "",
    address: decoded.trim(),
  };
}

export function extractEmailBody(rawHeaders, rawBody) {
  const leaves = collectLeafParts(rawHeaders, rawBody, 0);
  const htmlLeaf = leaves.find((leaf) => leaf.contentType.includes("text/html"));
  if (htmlLeaf) {
    return { contentType: "html", content: decodeBodyByHeaders(htmlLeaf.rawHeaders, htmlLeaf.rawBody) };
  }
  const textLeaf = leaves.find((leaf) => leaf.contentType.includes("text/plain"));
  if (textLeaf) {
    return {
      contentType: "text",
      content: escapeTextAsHtml(decodeBodyByHeaders(textLeaf.rawHeaders, textLeaf.rawBody)),
    };
  }

  const contentType = parseContentType(rawHeaders);
  if (contentType.value.includes("text/html")) {
    return { contentType: "html", content: decodeBodyByHeaders(rawHeaders, rawBody) };
  }
  return { contentType: "text", content: escapeTextAsHtml(decodeBodyByHeaders(rawHeaders, rawBody)) };
}

function collectLeafParts(rawHeaders, rawBody, depth) {
  const contentType = parseContentType(rawHeaders);
  if (!contentType.boundary || depth >= MAX_MULTIPART_DEPTH) {
    return [{ contentType: contentType.value, rawHeaders, rawBody }];
  }

  const leaves = [];
  const segments = rawBody.split("--" + contentType.boundary);
  for (const segment of segments) {
    const trimmed = segment.replace(/^\r?\n/, "");
    if (!trimmed || trimmed === "--" || trimmed.startsWith("--\r") || trimmed.startsWith("--\n")) {
      continue;
    }
    const splitIndex = trimmed.search(/\r?\n\r?\n/);
    const partHeaders = splitIndex === -1 ? trimmed : trimmed.slice(0, splitIndex);
    const partBody = splitIndex === -1 ? "" : trimmed.slice(splitIndex).replace(/^\r?\n\r?\n/, "").trim();
    leaves.push(...collectLeafParts(partHeaders, partBody, depth + 1));
  }
  return leaves.length ? leaves : [{ contentType: contentType.value, rawHeaders, rawBody }];
}

export function parseContentType(rawHeaders) {
  const headers = parseEmailHeaders(rawHeaders);
  const rawValue = String(headers["content-type"] || "text/plain");
  const value = rawValue.toLowerCase();
  const boundaryMatch = rawValue.match(/boundary="?([^";]+)"?/i);
  const charsetMatch = rawValue.match(/charset="?([^";]+)"?/i);
  return {
    value,
    boundary: boundaryMatch ? boundaryMatch[1] : "",
    charset: charsetMatch ? charsetMatch[1].trim().toLowerCase() : "",
  };
}

export function decodeBodyByHeaders(rawHeaders, body) {
  const headers = parseEmailHeaders(rawHeaders);
  const encoding = String(headers["content-transfer-encoding"] || "").toLowerCase();
  const charset = parseContentType(rawHeaders).charset || "utf-8";
  if (encoding.includes("base64")) {
    try {
      return decodeWithCharset(base64ToUint8(body.replace(/\s+/g, "")), charset);
    } catch {
      return body;
    }
  }
  if (encoding.includes("quoted-printable")) {
    try {
      return decodeWithCharset(quotedPrintableToBytes(body), charset);
    } catch {
      return body;
    }
  }
  if (charset && charset !== "utf-8" && charset !== "us-ascii") {
    try {
      return decodeWithCharset(latin1ToBytes(body), charset);
    } catch {
      return body;
    }
  }
  return body;
}

function decodeWithCharset(bytes, charset) {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function latin1ToBytes(value) {
  return Uint8Array.from(String(value), (char) => char.charCodeAt(0) & 0xff);
}

export function decodeMimeWords(value) {
  return String(value).replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_match, charset, encoding, text) => {
    try {
      const bytes = encoding.toUpperCase() === "B"
        ? base64ToUint8(text)
        : quotedPrintableToBytes(text.replace(/_/g, " "));
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return text;
    }
  });
}

export function decodeQuotedPrintable(value) {
  try {
    return new TextDecoder().decode(quotedPrintableToBytes(value));
  } catch {
    return value;
  }
}

export function quotedPrintableToBytes(value) {
  const normalized = String(value)
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  return Uint8Array.from(normalized, (char) => char.charCodeAt(0));
}

export function escapeTextAsHtml(value) {
  return "<pre style=\"white-space:pre-wrap;font-family:inherit\">" + escapeHtml(value) + "</pre>";
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function htmlToText(html) {
  return String(html || "")
    .slice(0, MAX_HTML_TEXT_EXTRACTION_BYTES)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function shaLikeId(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return "generated-" + hash.toString(16);
}
