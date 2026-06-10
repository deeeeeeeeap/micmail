import { connect } from "cloudflare:sockets";
import {
  DEFAULT_IMAP_BASE_RESPONSE_BYTES,
  DEFAULT_IMAP_COMMAND_TIMEOUT_SECONDS,
  DEFAULT_IMAP_IDLE_TIMEOUT_SECONDS,
} from "./config.js";
import { summarizeImapCommand, summarizeImapResponse } from "./imap-parse.js";
import { summarizeUpstreamError } from "./util.js";

export async function createImapClient(hostname, port, readDefaults = {}) {
  const socket = connect(
    { hostname, port },
    { secureTransport: "on" },
  );
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  const textEncoder = new TextEncoder();
  let tagIndex = 1;

  async function readUntil(pattern, options = {}) {
    const label = options.label || "IMAP command";
    const totalTimeoutMs = options.totalTimeoutMs || readDefaults.totalTimeoutMs || DEFAULT_IMAP_COMMAND_TIMEOUT_SECONDS * 1000;
    const idleTimeoutMs = options.idleTimeoutMs || readDefaults.idleTimeoutMs || DEFAULT_IMAP_IDLE_TIMEOUT_SECONDS * 1000;
    const maxBytes = options.maxBytes || DEFAULT_IMAP_BASE_RESPONSE_BYTES;
    const startedAt = Date.now();
    let bytesRead = 0;
    let chunksRead = 0;
    let text = "";
    while (Date.now() - startedAt < totalTimeoutMs) {
      const remainingMs = totalTimeoutMs - (Date.now() - startedAt);
      const { value, done } = await readChunkWithTimeout(
        reader,
        Math.max(1, Math.min(idleTimeoutMs, remainingMs)),
        label,
      );
      if (done) {
        break;
      }
      chunksRead += 1;
      bytesRead += value.byteLength || value.length || 0;
      if (bytesRead > maxBytes) {
        throw new Error(
          "IMAP response exceeded " +
            maxBytes +
            " bytes while reading " +
            label +
            ".",
        );
      }
      text += decoder.decode(value, { stream: true });
      if (pattern.test(text)) {
        return text;
      }
    }
    throw new Error(
      "IMAP response did not complete for " +
        label +
        " after " +
        (Date.now() - startedAt) +
        "ms (" +
        chunksRead +
        " chunks, " +
        bytesRead +
        " bytes).",
    );
  }

  async function writeLine(line) {
    await writer.write(textEncoder.encode(line + "\r\n"));
  }

  return {
    async readGreeting() {
      return await readUntil(/\* OK/i, { label: "IMAP greeting" });
    },
    async command(commandText, expected = "OK", options = {}) {
      const tag = "A" + String(tagIndex++).padStart(4, "0");
      const label = options.label || summarizeImapCommand(commandText);
      await writeLine(tag + " " + commandText);
      const response = await readUntil(
        new RegExp("\\r?\\n" + tag + " (OK|NO|BAD)", "i"),
        { ...options, label },
      );
      const statusMatch = response.match(new RegExp("\\r?\\n" + tag + " (OK|NO|BAD)", "i"));
      const status = statusMatch ? statusMatch[1].toUpperCase() : "";
      if (expected && status !== expected) {
        throw new Error("IMAP command failed: " + summarizeImapResponse(response));
      }
      return response;
    },
    async close() {
      try {
        await writeLine("A9999 LOGOUT");
      } catch {
        // Ignore close failures.
      }
      try {
        writer.releaseLock();
        reader.releaseLock();
      } catch {
        // Ignore lock release failures.
      }
      try {
        await socket.close();
      } catch {
        // Ignore socket close failures.
      }
    },
  };
}

async function readChunkWithTimeout(reader, timeoutMs, label) {
  let timeoutId;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("IMAP read timed out for " + label + " after " + timeoutMs + "ms.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function selectImapMailbox(client, folder) {
  const candidates = folder === "junkemail"
    ? ["Junk", "Junk Email", "Junk E-mail"]
    : ["INBOX"];

  const errors = [];
  for (const mailbox of candidates) {
    try {
      await client.command('SELECT "' + mailbox.replace(/"/g, '\\"') + '"', "OK");
      return mailbox;
    } catch (error) {
      errors.push(mailbox + ": " + summarizeUpstreamError(error));
    }
  }

  throw new Error("Unable to select IMAP folder " + folder + ". " + errors.join(" | "));
}
