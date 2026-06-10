export function makeXoauth2Token(email, accessToken) {
  return btoa("user=" + email + "\x01auth=Bearer " + accessToken + "\x01\x01");
}

export function parseImapSearchUids(response) {
  const ids = [];
  const pattern = /\* SEARCH ([\d\s]*)/gi;
  let match;
  while ((match = pattern.exec(response)) !== null) {
    const values = match[1].trim().split(/\s+/);
    for (const value of values) {
      const id = Number.parseInt(value, 10);
      if (Number.isInteger(id) && id > 0) ids.push(id);
    }
  }
  return ids;
}

/**
 * Extracts IMAP literal bodies ({N} counts BYTES, not UTF-16 code units).
 * Works on the byte representation so multi-byte message bodies do not
 * desynchronize literal boundaries.
 */
export function extractImapLiteralBodies(response) {
  const bytes = new TextEncoder().encode(String(response || ""));
  const decoder = new TextDecoder();
  const bodies = [];
  let i = 0;

  while (i < bytes.length) {
    if (bytes[i] !== 0x7b /* "{" */) {
      i += 1;
      continue;
    }

    let j = i + 1;
    let digits = "";
    while (j < bytes.length && bytes[j] >= 0x30 && bytes[j] <= 0x39) {
      digits += String.fromCharCode(bytes[j]);
      j += 1;
    }
    if (!digits || j >= bytes.length || bytes[j] !== 0x7d /* "}" */) {
      i += 1;
      continue;
    }
    j += 1;
    if (bytes[j] === 0x0d /* "\r" */) j += 1;
    if (bytes[j] !== 0x0a /* "\n" */) {
      i += 1;
      continue;
    }
    j += 1;

    const length = Number.parseInt(digits, 10);
    if (!Number.isInteger(length) || length <= 0) {
      i = j;
      continue;
    }

    bodies.push(decoder.decode(bytes.subarray(j, j + length)));
    i = j + length;
  }

  return bodies;
}

export function formatImapSearchDate(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return date.getUTCDate() + "-" + months[date.getUTCMonth()] + "-" + date.getUTCFullYear();
}

export function summarizeImapCommand(commandText) {
  const text = String(commandText || "");
  if (/^AUTHENTICATE\s+XOAUTH2/i.test(text)) {
    return "AUTHENTICATE XOAUTH2";
  }
  return text.replace(/\s+/g, " ").slice(0, 120);
}

export function summarizeImapResponse(response) {
  return response.replace(/\s+/g, " ").slice(-600);
}
